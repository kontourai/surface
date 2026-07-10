import type { Claim, Evidence, TrustStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Waiver validity — sibling projection to TrustStatus (this plan)
// ---------------------------------------------------------------------------
//
// Surface's core status derivation (`deriveTrustStatus`/`statusFunctionVersion`
// in `status.ts`) has no waiver vocabulary: an `assumed` claim stays `assumed`
// whether or not it carries a waiver. `WaiverValidity` is a separate, additive
// derived projection that reads the already-free-form `claim.metadata.waiver`
// object (no schema change: `metadata` is `{"type":"object"}`, unconstrained)
// plus the claim's already-derived `status`/`evidence`, and produces a flat,
// enum-verdict, versioned answer to "is this claim's waiver valid" — without
// callers re-parsing free-form metadata themselves.
//
// `{reason, approved_by, approved_at}` (snake_case on the wire) is the
// producer shape already shipped by kontourai/flow-agents ADR 0020 §3
// (`record-evidence`/`record-gate-claim` stamp this exact shape onto
// `claim.metadata.waiver` and force the claim's status to `assumed`). This
// module validates that shape and reads it defensively — `claim.metadata` is
// untyped, so nothing about its contents can be assumed.

/**
 * The distinguishable outcomes of waiver validity derivation.
 *
 * - "not-applicable": the claim is not `assumed` and not a waiver-bearing
 *   `stale`/`revoked` claim — waiver validity is not a meaningful question.
 * - "bare-assumed": the claim is `assumed` with no `metadata.waiver` at all —
 *   never defaults to a passing/acceptable verdict (AC5).
 * - "complete-waiver": the claim is `assumed`, `metadata.waiver` is present,
 *   and `reason`/`approved_by`/`approved_at` are all well-formed.
 * - "incomplete-waiver": the claim is `assumed`, `metadata.waiver` is
 *   present, but at least one of `reason`/`approved_by`/`approved_at` is
 *   missing or malformed.
 * - "stale-or-revoked-waiver": the claim's derived status is `stale` or
 *   `revoked` and `metadata.waiver` is (still) present — history of a waiver
 *   attached to a claim that has since gone stale/revoked.
 * - "command-backed-waiver-rejection": the claim is `assumed`, carries a
 *   `metadata.waiver`, and at least one piece of the claim's evidence is
 *   command-backed (ADR 0020 §3: "a command-backed check cannot be waived").
 *   This verdict takes precedence over all others.
 */
export type WaiverVerdict =
  | "not-applicable"
  | "bare-assumed"
  | "complete-waiver"
  | "incomplete-waiver"
  | "stale-or-revoked-waiver"
  | "command-backed-waiver-rejection";

/**
 * Waiver fields read from `claim.metadata.waiver`. Fields are only present
 * when they were readable as non-empty strings on the source object; a
 * missing/malformed field is simply absent here (see `incompleteFields` on
 * `WaiverValidity` for which keys failed validation).
 *
 * Field names mirror the flow-agents ADR 0020 §3 producer shape verbatim:
 * `reason`/`approvedBy`/`approvedAt` are the TS-idiomatic camelCase echo of
 * the wire-format snake_case `reason`/`approved_by`/`approved_at` read from
 * `claim.metadata.waiver`. Surface reads the snake_case source values and
 * never renames them on read — only this projection's output is camelCase.
 */
export interface WaiverFacts {
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * The result shape returned by deriveWaiverValidity.
 *
 * `approverAuthenticated` is always the literal `false` — this is ADR 0020's
 * own disclosed residual: `approved_by` is free text, never cryptographically
 * bound to an identity. It is never omitted and never computed as `true`, so
 * that a "complete-waiver" verdict is never silently read as "approver
 * identity verified."
 */
export interface WaiverValidity {
  verdict: WaiverVerdict;
  approverAuthenticated: false;
  waiver?: WaiverFacts;
  incompleteFields?: Array<"reason" | "approved_by" | "approved_at">;
}

/**
 * The version of the waiver validity derivation algorithm implemented here.
 * Increment when the algorithm changes, mirroring `statusFunctionVersion`'s
 * convention in `status.ts` (ADR 0003 step 2).
 */
export const waiverValidityFunctionVersion = "1";

/**
 * Returns true when a piece of evidence is "command-backed" — i.e. produced
 * by an automated command run rather than a human/manual observation. Used
 * to derive `command-backed-waiver-rejection`: ADR 0020 §3's rule that "a
 * command-backed check cannot be waived."
 *
 * Heuristic (inherited residual, not solved here): `evidenceType ===
 * "test_output"`, or the presence of an `execution` block (populated when
 * evidence was captured from a bash/MCP command run). A producer can evade
 * this heuristic by omitting `execution` or mislabeling `evidenceType` — see
 * ADR 0020's own "evidenceType-laundering route" residual.
 */
export function isCommandBackedEvidence(evidence: Evidence): boolean {
  return evidence.evidenceType === "test_output" || evidence.execution !== undefined;
}

/**
 * Pure, versioned function: given a claim, its already-derived status, and
 * its evidence, return the derived waiver validity verdict.
 *
 * Precedence (first match wins — fold-step comments below mirror `status.ts`'s
 * style):
 *   1. command-backed-waiver-rejection
 *   2. stale-or-revoked-waiver
 *   3. not-applicable
 *   4. bare-assumed
 *   5. incomplete-waiver
 *   6. complete-waiver
 */
export function deriveWaiverValidity(input: {
  claim: Claim;
  status: TrustStatus;
  evidence: Evidence[];
}): WaiverValidity {
  const rawWaiver = readRawWaiver(input.claim);

  // Step 1: a command-backed check cannot be waived (ADR 0020 §3). This wins
  // over every other verdict, including an otherwise-complete waiver.
  if (input.status === "assumed" && rawWaiver !== undefined && input.evidence.some(isCommandBackedEvidence)) {
    return { verdict: "command-backed-waiver-rejection", approverAuthenticated: false };
  }

  // Step 2: a stale/revoked claim that still carries a waiver — the waiver's
  // history is visible but no longer governs an active `assumed` status.
  if ((input.status === "stale" || input.status === "revoked") && rawWaiver !== undefined) {
    return { verdict: "stale-or-revoked-waiver", approverAuthenticated: false };
  }

  // Step 3: not an assumed claim (and not covered by step 2) — waiver
  // validity is not a meaningful question for this claim.
  if (input.status !== "assumed") {
    return { verdict: "not-applicable", approverAuthenticated: false };
  }

  // Step 4: assumed with no waiver attached at all — never defaults to a
  // passing/acceptable verdict.
  if (rawWaiver === undefined) {
    return { verdict: "bare-assumed", approverAuthenticated: false };
  }

  // Step 5: assumed with a waiver present, but malformed/incomplete.
  const { facts, incompleteFields } = validateWaiverShape(rawWaiver);
  if (incompleteFields.length > 0) {
    return {
      verdict: "incomplete-waiver",
      approverAuthenticated: false,
      waiver: facts,
      incompleteFields,
    };
  }

  // Step 6: assumed, waiver present, and every field is well-formed.
  return { verdict: "complete-waiver", approverAuthenticated: false, waiver: facts };
}

/**
 * Reads `claim.metadata.waiver` defensively — `metadata` is untyped
 * (`Record<string, unknown> | undefined`) so nothing about its shape can be
 * assumed. Returns `undefined` when no waiver key is present at all;
 * otherwise returns the raw (possibly malformed) value for downstream
 * validation.
 *
 * Uses `Object.hasOwn` (not `"waiver" in metadata`) so an *inherited-only*
 * `waiver` property (e.g. `Object.create({waiver: {...}})`) is treated
 * identically to a genuinely absent key — the `in` operator walks the
 * prototype chain and would otherwise let a hostile/malformed producer forge
 * a waiver via prototype inheritance rather than an own property on the
 * parsed JSON object.
 */
function readRawWaiver(claim: Claim): unknown | undefined {
  const metadata = claim.metadata;
  if (metadata === undefined || metadata === null || typeof metadata !== "object") {
    return undefined;
  }
  if (!Object.hasOwn(metadata, "waiver")) {
    return undefined;
  }
  return (metadata as Record<string, unknown>).waiver;
}

const WAIVER_KEYS = ["reason", "approved_by", "approved_at"] as const;

// Strict RFC 3339 `date-time` production: full calendar date + time-of-day +
// (fractional seconds)? + (Z | numeric offset). Deliberately NOT `Date.parse`
// — `Date.parse` is an implementation-defined, engine-specific grammar (it
// accepts bare years, bare year-months, space-separated dates, US-locale
// slash dates, free-text English dates, and silently rolls over impossible
// calendar dates like Feb 30 into the following month) which is both looser
// than RFC 3339 and non-deterministic across JS engines. This validator does
// not call `Date`/`Date.parse` anywhere in the accept path.
const RFC3339_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

/**
 * Strict RFC 3339 `date-time` grammar check plus a real calendar-day-count
 * check (rejects e.g. `2026-02-30T00:00:00Z` even though it matches the
 * regex shape). Tolerates a leap second (`:60`) per RFC 3339 grammar, at any
 * minute -- this parser validates RFC 3339 *grammar*, not leap-second
 * placement (a real leap second only ever occurs at 23:59:60 UTC; see the
 * "Leap seconds" note in docs/reference/waiver-validity.md for the disclosed
 * policy). Also range-checks the numeric UTC offset (RFC 3339's
 * `time-numoffset`: offset-hour 00-23, offset-minute 00-59) when one is
 * present -- `Z`/`z` needs no such check. No `Date`/`Date.parse` call —
 * deterministic across JS engines.
 */
function isRfc3339DateTime(value: string): boolean {
  const m = RFC3339_DATE_TIME_RE.exec(value);
  if (!m) return false;
  const [, yStr, moStr, dStr, hStr, miStr, sStr, offSign, offHStr, offMStr] = m;
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const mi = Number(miStr);
  const s = Number(sStr);
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > daysInMonth(y, mo)) return false;
  if (h > 23 || mi > 59 || s > 60) return false; // s===60 tolerates a leap second
  if (offSign !== undefined) {
    // Numeric offset present (not Z/z) -- range-check hh:mm per RFC 3339's
    // time-numoffset production. The regex only checked digit-count shape.
    const offH = Number(offHStr);
    const offM = Number(offMStr);
    if (offH > 23 || offM > 59) return false;
  }
  return true;
}

/**
 * Validates a raw `metadata.waiver` value against the expected shape:
 * `{reason: string (non-empty), approved_by: string (non-empty), approved_at:
 * string (strict RFC 3339 date-time, real calendar date)}`. A non-object
 * `waiver` value fails all three fields. Returns the successfully-read fields
 * (camelCase echo) and the list of field names (snake_case, matching the wire
 * format) that failed validation.
 *
 * Each field is read only when `Object.hasOwn(source, "<field>")` is true —
 * an *inherited-only* `reason`/`approved_by`/`approved_at` (e.g. a value
 * whose prototype, not its own properties, carries the field) is treated
 * identically to a missing field. This keeps prototype-chain values from
 * forging a `complete-waiver` verdict while still accepting genuine own
 * properties on any object shape (plain object, `Object.create(null)`, or a
 * class instance with real own properties).
 */
function validateWaiverShape(rawWaiver: unknown): {
  facts: WaiverFacts;
  incompleteFields: Array<"reason" | "approved_by" | "approved_at">;
} {
  const incompleteFields: Array<"reason" | "approved_by" | "approved_at"> = [];
  const facts: WaiverFacts = {};

  if (rawWaiver === null || typeof rawWaiver !== "object" || Array.isArray(rawWaiver)) {
    return { facts, incompleteFields: [...WAIVER_KEYS] };
  }

  const source = rawWaiver as Record<string, unknown>;

  const reason = Object.hasOwn(source, "reason") ? source.reason : undefined;
  if (typeof reason === "string" && reason.length > 0) {
    facts.reason = reason;
  } else {
    incompleteFields.push("reason");
  }

  const approvedBy = Object.hasOwn(source, "approved_by") ? source.approved_by : undefined;
  if (typeof approvedBy === "string" && approvedBy.length > 0) {
    facts.approvedBy = approvedBy;
  } else {
    incompleteFields.push("approved_by");
  }

  const approvedAt = Object.hasOwn(source, "approved_at") ? source.approved_at : undefined;
  if (typeof approvedAt === "string" && isRfc3339DateTime(approvedAt)) {
    facts.approvedAt = approvedAt;
  } else {
    incompleteFields.push("approved_at");
  }

  return { facts, incompleteFields };
}
