import type { TrustReport, TrustStatus } from "./types.js";
import { derivationInputIds } from "./derivation.js";

/**
 * Recompute change records for derived claims (issue #16).
 *
 * Surface derives trust statelessly: every `buildTrustReport` re-runs the
 * derivation from scratch, so "re-run a derivation method when inputs change" is
 * a *diff between two derivations*, not a live re-execution. `recomputeChangeRecords`
 * compares a prior report against a newer one and emits a before/after record for
 * each derived claim whose inputs changed, identifying which inputs moved (status
 * and/or value) and how the derived claim's own status and value moved as a result.
 *
 * ## Packaging decision (AC3): this lives in Surface core
 *
 * The recompute diff is a pure function of two reports — no state, no file
 * watcher, no background process — so it belongs in core alongside
 * `diffFreshness` and the derivation kernel. A separate `@kontourai/surface-derive`
 * package is only warranted for the genuinely heavier runtime this issue
 * anticipated: a **stateful watcher** that observes producer inputs and triggers
 * re-derivation, and/or an **arithmetic method executor** that recomputes a
 * derived *value* from its inputs (e.g. actually summing input values for a
 * `method: "sum"` edge). Neither is required to satisfy this issue — value
 * recomputation is producer-owned, and Surface reports value *changes* by diffing
 * the two reports rather than executing the method. That heavier runtime is
 * deferred until a concrete consume-side need appears; the core diff below is the
 * stateless foundation it would build on.
 */

export interface RecomputeInputChange {
  inputClaimId: string;
  /** The input's derived status in the prior report, if it was present. */
  fromStatus?: TrustStatus;
  /** The input's derived status in the newer report, if it is present. */
  toStatus?: TrustStatus;
  /** True when the input's status differs between the two reports. */
  statusChanged: boolean;
  /** True when the input's value differs between the two reports. */
  valueChanged: boolean;
}

/**
 * A before/after recompute record for one derived claim. Unlike
 * {@link DerivationChangeRecord} (an in-derivation audit event with
 * id/reason/action/createdAt), this is a pure comparison result between two
 * reports and carries no audit-log fields.
 */
export interface RecomputeChangeRecord {
  /** The derived claim this record is about. */
  claimId: string;
  /** The direct inputs of this claim that changed (status and/or value). */
  changedInputs: RecomputeInputChange[];
  /** The derived claim's status before / after. */
  fromStatus?: TrustStatus;
  toStatus?: TrustStatus;
  /** True when the derived claim's own status moved. */
  statusChanged: boolean;
  /** True when the derived claim's own value moved. */
  valueChanged: boolean;
  /**
   * The derived claim's value before / after, present only when `valueChanged`.
   * Values are producer-authored; Surface reports the change, it does not
   * recompute the value from the inputs (see the packaging decision above).
   */
  fromValue?: unknown;
  toValue?: unknown;
}

interface ClaimSnapshot {
  status?: TrustStatus;
  value: unknown;
  inputIds: string[];
}

/**
 * Diff two derivations and emit a recompute change record for every derived
 * claim (a claim with derivation inputs) whose direct inputs changed between
 * them. A claim absent from either report is skipped. The result is ordered by
 * claim id for determinism.
 *
 * A derived claim whose inputs changed but whose own status and value did not is
 * still reported (with `statusChanged`/`valueChanged` false) — an *unchanged
 * recompute* — so callers can distinguish "recomputed, no effect" from "not
 * recomputed at all".
 *
 * Precondition for the cascade guarantee: `prior` and `next` are each the output
 * of a full derivation (`buildTrustReport`), so every claim's status/value
 * already reflects the recomputed ceiling. Given that, a multi-depth cascade is
 * captured through direct inputs alone — in `A → B → C`, `B`'s already-recomputed
 * status reflects `A`, so `C`'s record cites the `B` change. This function does
 * not itself re-derive; it diffs two derivations.
 */
export function recomputeChangeRecords(prior: TrustReport, next: TrustReport): RecomputeChangeRecord[] {
  const priorById = snapshotByClaimId(prior);
  const nextById = snapshotByClaimId(next);

  const records: RecomputeChangeRecord[] = [];
  for (const [claimId, nextClaim] of nextById) {
    if (nextClaim.inputIds.length === 0) continue; // not a derived claim
    const priorClaim = priorById.get(claimId);
    if (priorClaim === undefined) continue; // newly added; no prior to diff against

    const changedInputs: RecomputeInputChange[] = [];
    for (const inputId of nextClaim.inputIds) {
      const priorInput = priorById.get(inputId);
      const nextInput = nextById.get(inputId);
      const statusChanged = priorInput?.status !== nextInput?.status;
      const valueChanged = !valuesEqual(priorInput?.value, nextInput?.value);
      if (statusChanged || valueChanged) {
        changedInputs.push({
          inputClaimId: inputId,
          fromStatus: priorInput?.status,
          toStatus: nextInput?.status,
          statusChanged,
          valueChanged,
        });
      }
    }

    if (changedInputs.length === 0) continue; // no input moved → no recompute pressure

    const statusChanged = priorClaim.status !== nextClaim.status;
    const valueChanged = !valuesEqual(priorClaim.value, nextClaim.value);
    const record: RecomputeChangeRecord = {
      claimId,
      changedInputs,
      fromStatus: priorClaim.status,
      toStatus: nextClaim.status,
      statusChanged,
      valueChanged,
    };
    if (valueChanged) {
      record.fromValue = priorClaim.value;
      record.toValue = nextClaim.value;
    }
    records.push(record);
  }

  records.sort((a, b) => a.claimId.localeCompare(b.claimId));
  return records;
}

function snapshotByClaimId(report: TrustReport): Map<string, ClaimSnapshot> {
  const map = new Map<string, ClaimSnapshot>();
  for (const claim of report.claims) {
    map.set(claim.id, {
      status: claim.status,
      value: claim.value,
      inputIds: derivationInputIds(claim),
    });
  }
  return map;
}

/**
 * Structural value comparison for change detection. Claim values are
 * producer-authored `unknown`; a key-stable JSON serialization detects a change
 * for the JSON-native values the Hachure schema admits, and treats two absent
 * values as equal.
 *
 * Hardened against the two ways a naive JSON compare misleads: (1) a value that
 * cannot be serialized (a `BigInt`, a circular reference) makes `JSON.stringify`
 * throw — here that degrades to "changed" for that one claim rather than
 * aborting the whole batch; (2) `NaN`, `Infinity`, and `null` all serialize to
 * `"null"` by default — the replacer tags non-finite numbers and bigints
 * distinctly so a real change between them is not masked.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const sa = safeStableStringify(a);
  const sb = safeStableStringify(b);
  // An unserializable value (undefined result) is conservatively treated as a
  // change: better to over-report a recompute than to silently miss one.
  if (sa === undefined || sb === undefined) return false;
  return sa === sb;
}

function safeStableStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "bigint") return `__bigint__:${val.toString()}`;
      if (typeof val === "number" && !Number.isFinite(val)) return `__num__:${String(val)}`; // NaN, ±Infinity
      if (val && typeof val === "object" && !Array.isArray(val)) {
        return Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)),
        );
      }
      return val;
    });
  } catch {
    return undefined;
  }
}
