import type { ClaimDefinition, SubjectRef, TrustStatus, VerificationEvent } from "./types.js";

/**
 * Claim-subject identity matching — a producer-side concern distinct from
 * `identity.ts`'s cross-producer subject coreference (`buildIdentityIndex`).
 *
 * `identity.ts` answers "do these two subject refs, possibly from different
 * producers, denote the same real-world thing?" This module answers a
 * narrower, more common question: "does this incoming child-row snapshot
 * (freshly re-extracted from a producer's own source of truth) correspond to
 * a subject the producer already has claims about, and what should happen to
 * the claims of a subject that no longer appears?" A producer that re-syncs a
 * repeated-field claim (see CONTEXT.md's "Repeated Field Claim" entry) — a
 * variable-length list of child rows such as schedule entries, line items, or
 * officers — needs to reconcile an incoming list against previously seen rows
 * by a natural key, not by re-running cross-producer coreference.
 *
 * `matchClaimSubjects` is pure, synchronous, and dependency-free: it knows
 * nothing about what a "row" represents, only the natural-key and stable-id
 * functions the caller supplies. `deriveOrphanedSubjectDisposition` is the
 * companion claim-lifecycle hook — it turns `matchClaimSubjects`'s `orphaned`
 * output into Surface's own `VerificationEvent` ledger lines using Surface's
 * native `TrustStatus` taxonomy, so a producer never has to invent its own
 * disposition vocabulary for "this row disappeared, what happens to its
 * claims?"
 *
 * New, minimal surface: this contract has one real reference consumer so far
 * and is newer/less proven than the rest of Surface's API. The shape may
 * evolve based on real usage; keep the committed surface exactly as small as
 * documented here — two functions
 * (`matchClaimSubjects`/`deriveOrphanedSubjectDisposition`) plus the five
 * exported types their signatures require (`ClaimSubjectMatch`,
 * `ClaimSubjectMatchResult`, `MatchClaimSubjectsInput`,
 * `DeriveOrphanedSubjectDispositionInput`, `OrphanedSubjectDispositionStatus`)
 * — so a future revision, if needed, touches the smallest possible footprint.
 * `docs/reference/claim-subject-matching.md` is the committed record of this
 * exact surface.
 */

/**
 * One incoming subject matched to a previously-known existing subject by
 * natural key.
 */
export interface ClaimSubjectMatch<TIncoming, TExisting> {
  /** The existing subject's stable id — PRESERVED across a match. */
  readonly id: string;
  readonly existing: TExisting;
  readonly incoming: TIncoming;
}

export interface ClaimSubjectMatchResult<TIncoming, TExisting> {
  readonly matched: ClaimSubjectMatch<TIncoming, TExisting>[];
  /** Existing subjects with no incoming match — caller decides archive/revoke/delete. */
  readonly orphaned: TExisting[];
  /** Incoming subjects with no existing match — caller decides insert + author a new claim subject. */
  readonly created: TIncoming[];
}

export interface MatchClaimSubjectsInput<TIncoming, TExisting> {
  readonly existing: readonly TExisting[];
  readonly incoming: readonly TIncoming[];
  readonly existingKey: (item: TExisting) => string;
  readonly incomingKey: (item: TIncoming) => string;
  readonly existingId: (item: TExisting) => string;
}

/**
 * Matches an incoming list of child-subject snapshots against a previously
 * known existing list, by a caller-supplied natural key.
 *
 * Generic over the caller's own row shapes: the caller supplies
 * `existingKey`/`incomingKey` (natural-key extraction, e.g. normalized
 * label + start date + end date) and `existingId` (the existing row's stable
 * identifier, e.g. a database primary key). This function does not know or
 * care what a "row" or "subject" represents.
 *
 * Matching is by exact natural-key equality only — no fuzzy matching, no
 * normalization performed here (callers normalize before calling, inside
 * their own `existingKey`/`incomingKey` functions). A key present in both
 * lists is a match; a key present only in `existing` is orphaned; a key
 * present only in `incoming` is created. A changed natural key (a "rename")
 * is therefore represented as one orphan (the old key) plus one creation (the
 * new key) — never as a single updated match — because nothing in a natural
 * key alone can distinguish "this row was renamed" from "this row was
 * deleted and an unrelated new row was added with a similar key." Callers
 * needing rename-aware reconciliation must supply a stable identifier in the
 * natural key itself (which no longer makes it "natural"), or perform their
 * own additional reconciliation pass over the `orphaned`/`created` arrays.
 *
 * A duplicate natural key within `existing` or within `incoming` (a producer
 * data-quality issue, not something this function can rule out) is resolved
 * deterministically, first-in-first-matched, in list order: the first
 * `existing` item claims the first still-unconsumed `incoming` item sharing
 * its key; any surplus on either side falls through to `orphaned`/`created`
 * rather than being silently dropped or arbitrarily paired.
 */
export function matchClaimSubjects<TIncoming, TExisting>(
  input: MatchClaimSubjectsInput<TIncoming, TExisting>,
): ClaimSubjectMatchResult<TIncoming, TExisting> {
  const { existing, incoming, existingKey, incomingKey, existingId } = input;

  const incomingIndicesByKey = new Map<string, number[]>();
  incoming.forEach((item, index) => {
    const key = incomingKey(item);
    const indices = incomingIndicesByKey.get(key);
    if (indices) {
      indices.push(index);
    } else {
      incomingIndicesByKey.set(key, [index]);
    }
  });

  const consumedIncomingIndices = new Set<number>();
  const matched: ClaimSubjectMatch<TIncoming, TExisting>[] = [];
  const orphaned: TExisting[] = [];

  for (const existingItem of existing) {
    const candidateIndices = incomingIndicesByKey.get(existingKey(existingItem));
    const matchIndex = candidateIndices?.find((index) => !consumedIncomingIndices.has(index));
    if (matchIndex === undefined) {
      orphaned.push(existingItem);
      continue;
    }
    consumedIncomingIndices.add(matchIndex);
    matched.push({ id: existingId(existingItem), existing: existingItem, incoming: incoming[matchIndex] as TIncoming });
  }

  const created = incoming.filter((_, index) => !consumedIncomingIndices.has(index));

  return { matched, orphaned, created };
}

/**
 * The subset of `TrustStatus` that is safe to pass as `status` to
 * `deriveOrphanedSubjectDisposition` without also setting
 * `VerificationEvent.type: "invalidation"`.
 *
 * `deriveOrphanedSubjectDisposition` deliberately leaves `VerificationEvent.type`
 * unset. That is only correct because `status.ts`'s `deriveTrustStatus` treats
 * an unset `type` as equivalent to `type: "invalidation"` for exactly the
 * statuses in its own (unexported) `TERMINAL_EVENT_STATUSES` set — currently
 * `"rejected" | "disputed" | "superseded" | "stale" | "revoked"`. For any other
 * `TrustStatus` (`"verified"`, `"assumed"`, `"proposed"`, `"unknown"`), an unset
 * `type` is a silent no-op: the orphaned subject's claim keeps deriving as if
 * nothing happened, instead of landing in a terminal, no-longer-current state.
 * "Verify/assume/propose an orphaned subject away" is not a coherent
 * operation, so this type — and the runtime guard below — refuse it outright
 * rather than accept it and silently do nothing.
 *
 * This list is a literal copy of `status.ts`'s `TERMINAL_EVENT_STATUSES`, not
 * an import of it (that set is intentionally unexported — it is an internal
 * derivation-fold detail, not part of `status.ts`'s public contract). If a
 * future revision to `status.ts` changes what counts as terminal there, this
 * type must be updated in lockstep, or `deriveOrphanedSubjectDisposition`'s
 * unset-`type` assumption silently stops holding for the changed status.
 */
export type OrphanedSubjectDispositionStatus = Extract<
  TrustStatus,
  "rejected" | "disputed" | "superseded" | "stale" | "revoked"
>;

const TERMINAL_DISPOSITION_STATUSES = new Set<OrphanedSubjectDispositionStatus>([
  "rejected",
  "disputed",
  "superseded",
  "stale",
  "revoked",
]);

export interface DeriveOrphanedSubjectDispositionInput {
  readonly orphanedSubjects: readonly SubjectRef[];
  readonly claims: readonly ClaimDefinition[];
  readonly status: OrphanedSubjectDispositionStatus;
  readonly actor: string;
  readonly method: string;
  readonly now?: Date;
}

/**
 * Bridges `matchClaimSubjects`'s `orphaned` output to claim lifecycle: for
 * every claim whose (`subjectType`, `subjectId`) matches one of
 * `orphanedSubjects`, emits one `VerificationEvent` carrying the caller's
 * `status` (native `TrustStatus` taxonomy — no new status invented; callers
 * typically pass `"revoked"`), `actor`, and `method`. The caller appends the
 * returned events to its own event ledger; Surface's normal claim-status
 * derivation (`deriveTrustStatus`/`deriveClaimStatus`) takes it from there.
 *
 * The `orphaned` array from `matchClaimSubjects` is `TExisting[]`, not
 * `SubjectRef[]` — the caller maps its own existing-row shape to
 * `{ subjectType, subjectId }` before calling this function, exactly as it
 * already must when authoring claims for those rows.
 */
export function deriveOrphanedSubjectDisposition(
  input: DeriveOrphanedSubjectDispositionInput,
): VerificationEvent[] {
  // Defense in depth beyond the type-level narrowing above: a caller using
  // `as` to bypass TypeScript, or calling from plain JS, can still pass any
  // TrustStatus. Failing loudly here is strictly better than the silent
  // no-op an out-of-range status would otherwise produce once these events
  // reach deriveTrustStatus.
  if (!TERMINAL_DISPOSITION_STATUSES.has(input.status)) {
    throw new Error(
      `deriveOrphanedSubjectDisposition: status "${input.status}" is not a terminal status ` +
        `(expected one of ${[...TERMINAL_DISPOSITION_STATUSES].join(", ")}) — an unset ` +
        `VerificationEvent.type only reaches a terminal claim status for this subset; ` +
        `other statuses would silently no-op.`,
    );
  }

  const orphanedSubjectKeys = new Set(input.orphanedSubjects.map(subjectRefKey));
  const createdAt = (input.now ?? new Date()).toISOString();

  return input.claims
    .filter((claim) => orphanedSubjectKeys.has(subjectRefKey({ subjectType: claim.subjectType, subjectId: claim.subjectId })))
    .map((claim) => ({
      id: `event.orphaned-subject.${claim.id}.${createdAt}`,
      claimId: claim.id,
      status: input.status,
      actor: input.actor,
      method: input.method,
      evidenceIds: [],
      createdAt,
    }));
}

function subjectRefKey(ref: SubjectRef): string {
  return `${ref.subjectType}::${ref.subjectId}`;
}
