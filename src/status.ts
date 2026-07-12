import type { AuthorityTrace, Claim, Evidence, TrustStatus, VerificationEvent, VerificationPolicy } from "./types.js";
import { type ClaimEvidenceEvaluation, evaluateClaimEvidence } from "./claim-evaluation.js";
import { evidenceEntailsClaim, partitionEvidenceBySupport } from "./evidence-support.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";

const TERMINAL_EVENT_STATUSES = new Set<TrustStatus>(["rejected", "disputed", "superseded", "stale", "revoked"]);

export function deriveTrustStatus(input: {
  claim: Claim;
  evidence: Evidence[];
  policy?: VerificationPolicy;
  events: VerificationEvent[];
  now?: Date;
  authorityTrace?: AuthorityTrace[];
  /**
   * The shared claim evidence evaluation for this claim, when the caller has
   * already computed it (the snapshot pipeline does, once, in `foldClaim`).
   * Omitted by standalone callers (`deriveClaimStatus`), in which case the
   * verified-path requirement check computes an evaluation on demand from the
   * entailing evidence. Either way the requirement decision is identical.
   */
  evaluation?: ClaimEvidenceEvaluation;
}): TrustStatus {
  const now = input.now ?? new Date();
  const claimEvents = input.events
    .filter((event) => event.claimId === input.claim.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latestEvent = claimEvents[0];

  // ADR 0003 §8: check for an authority-gated dispute-resolution event.
  // The most-recent resolution event whose actor has an active AuthorityTrace
  // covering the subject supersedes the normal fold — unless newer blocking
  // evidence re-opens the dispute.
  const resolutionEvent = findLatestResolutionEvent(claimEvents, input.authorityTrace ?? []);
  if (resolutionEvent !== undefined) {
    const hasNewerBlockingFailure = input.evidence.some(
      (ev) =>
        ev.passing === false &&
        ev.blocking !== false &&
        Date.parse(ev.observedAt) > Date.parse(resolutionEvent.createdAt),
    );
    if (hasNewerBlockingFailure) {
      return "disputed";
    }
    return resolutionEvent.status;
  }

  // An explicit invalidation event (Hachure schema 4, type: "invalidation") is
  // terminal: it asserts the claim is no longer good. A "revoked" status
  // derives "stale" (event-driven staleness). An invalidation event whose
  // status is not itself a terminal "no-longer-good" status still collapses to
  // "stale". Other terminal statuses pass through unchanged.
  if (latestEvent && latestEvent.type === "invalidation") {
    return TERMINAL_EVENT_STATUSES.has(latestEvent.status) && latestEvent.status !== "revoked"
      ? latestEvent.status
      : "stale";
  }
  if (latestEvent && TERMINAL_EVENT_STATUSES.has(latestEvent.status)) {
    return latestEvent.status === "revoked" ? "stale" : latestEvent.status;
  }

  if (latestEvent?.status === "assumed") {
    return "assumed";
  }

  if (latestEvent?.status === "verified") {
    if (isVerifiedEventStale(latestEvent, input.claim, input.evidence, input.policy, now)) {
      return "stale";
    }

    if (input.policy) {
      const evaluation = input.evaluation ?? evaluateClaimEvidence({
        entailingEvidence: input.evidence.filter(evidenceEntailsClaim),
        policy: input.policy,
      });
      if (evaluation.requirementUnmet) {
        return "proposed";
      }
    }

    const hasBlockingFailure = input.evidence.some((evidence) => evidence.passing === false && evidence.blocking !== false);
    if (hasBlockingFailure) {
      return "disputed";
    }

    return "verified";
  }

  if (input.claim.status === "proposed") {
    return "proposed";
  }

  if (input.claim.status === "assumed") {
    return "assumed";
  }

  if (!input.policy) {
    return input.evidence.length > 0 ? "proposed" : "unknown";
  }

  const evidenceTypes = new Set(input.evidence.map((evidence) => evidence.evidenceType));
  const hasRequiredEvidence = input.policy.requiredEvidence.every((type) => evidenceTypes.has(type));
  return hasRequiredEvidence ? "proposed" : "unknown";
}

/**
 * Re-apply ONLY the time-based staleness of an already-`verified`/`stale` claim
 * against a new `now`, without re-folding the claim's event ledger. Used by the
 * checkpoint (tail-only) derivation path: when a claim has no events newer than
 * the checkpoint high-water mark, its verified/stale boundary is the only status
 * input that can move as the wall clock advances. Returns the re-applied status
 * (`verified` or `stale`); any other prior status passes through unchanged.
 *
 * The governing verified event (anchor for `ttlSeconds` and the policy duration
 * window) is taken from the unchanged ledger. This is identical to what
 * `deriveTrustStatus` would compute for the same `now`, by construction.
 */
export function reapplyVerifiedFreshness(input: {
  priorStatus: TrustStatus;
  claim: Claim;
  evidence: Evidence[];
  events: VerificationEvent[];
  policy?: VerificationPolicy;
  now: Date;
}): TrustStatus {
  if (input.priorStatus !== "verified" && input.priorStatus !== "stale") return input.priorStatus;
  const governing = input.events
    .filter((event) => event.claimId === input.claim.id && event.status === "verified")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (governing === undefined) return input.priorStatus;
  return isVerifiedEventStale(governing, input.claim, input.evidence, input.policy, input.now) ? "stale" : "verified";
}

function isVerifiedEventStale(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
): boolean {
  // Claim-intrinsic validity window (Hachure schema 4) overrides policy timing
  // when present. expiresAt is canonical; ttlSeconds is the relative fallback,
  // resolved against the governing event's verifiedAt (fallback createdAt).
  const intrinsic = claimIntrinsicExpiry(event, claim);
  if (intrinsic !== undefined) {
    return now.getTime() > intrinsic;
  }

  if (!policy) {
    return false;
  }

  if (policy.validityRule.kind === "commit") {
    if (!claim.currentIntegrityRef) {
      return false;
    }
    const eventEvidenceRefs = new Set(
      evidence
        .filter((item) => event.evidenceIds.includes(item.id))
        .map((item) => item.integrityRef)
        .filter((item): item is string => typeof item === "string" && item.length > 0),
    );
    return !eventEvidenceRefs.has(claim.currentIntegrityRef);
  }

  if (policy.validityRule.kind !== "duration") {
    return false;
  }

  const verifiedAt = event.verifiedAt ?? event.createdAt;
  const verifiedTime = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedTime) || typeof policy.validityRule.durationDays !== "number") {
    return false;
  }

  const expiresAt = verifiedTime + policy.validityRule.durationDays * 24 * 60 * 60 * 1000;
  return expiresAt < now.getTime();
}

/**
 * Resolve the claim-intrinsic validity window to an absolute expiry epoch (ms),
 * or undefined when the claim declares no intrinsic window (Hachure schema 4).
 *
 * Precedence: `expiresAt` (absolute) wins over `ttlSeconds` (relative). When
 * `ttlSeconds` is used, it is resolved against the governing event's
 * `verifiedAt` (fallback `createdAt`), falling back to the claim's `updatedAt`
 * when no event is supplied.
 */
export function claimIntrinsicExpiry(
  event: VerificationEvent | undefined,
  claim: Claim,
): number | undefined {
  if (typeof claim.expiresAt === "string" && claim.expiresAt.length > 0) {
    const t = Date.parse(claim.expiresAt);
    return Number.isFinite(t) ? t : undefined;
  }
  if (typeof claim.ttlSeconds === "number" && Number.isFinite(claim.ttlSeconds)) {
    const anchorIso = event?.verifiedAt ?? event?.createdAt ?? claim.updatedAt;
    const anchor = Date.parse(anchorIso);
    if (!Number.isFinite(anchor)) return undefined;
    return anchor + claim.ttlSeconds * 1000;
  }
  return undefined;
}


// ---------------------------------------------------------------------------
// ADR 0003 §8 — authority-gated dispute resolution helper
// ---------------------------------------------------------------------------

/**
 * Returns the most-recent dispute-resolution event whose actor has an active
 * AuthorityTrace covering the claim's subject at the given instant.
 * Returns undefined if no such event exists.
 */
function findLatestResolutionEvent(
  claimEventsMostRecentFirst: VerificationEvent[],
  authorityTrace: AuthorityTrace[],
): VerificationEvent | undefined {
  for (const event of claimEventsMostRecentFirst) {
    if (event.resolvesDispute !== true) continue;
    if (isResolutionAuthorized(event, authorityTrace)) return event;
  }
  return undefined;
}

function isResolutionAuthorized(
  event: VerificationEvent,
  authorityTrace: AuthorityTrace[],
): boolean {
  if (authorityTrace.length === 0) return false;
  return authorityTrace.some((trace) => {
    // Actor must match
    if (trace.actorRef !== event.actor) return false;
    // The trace must be active at the time of the decision (use event.createdAt as the moment)
    const atDecision = event.createdAt;
    if (trace.revokedAt && trace.revokedAt <= atDecision) return false;
    if (trace.validFrom && trace.validFrom > atDecision) return false;
    if (trace.validUntil && trace.validUntil < atDecision) return false;
    // AuthorityRef must match if the event specifies one
    if (event.authorityRef !== undefined && trace.authorityRef !== event.authorityRef) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// requiresActiveAuthority helper — exported for use in inquiry evaluation
// ---------------------------------------------------------------------------

/**
 * Outcome of an active-authority check for a single actor.
 * - "active": at least one AuthorityTrace covers the actor and is currently valid.
 * - "no-trace": no AuthorityTrace record exists for this actor.
 * - "expired": a trace was found but validUntil is in the past at `now`.
 * - "revoked": a trace was found but revokedAt is before or at `now`.
 */
export type AuthorityCheckResult = "active" | "no-trace" | "expired" | "revoked";

/**
 * Check whether `actorRef` has at least one AuthorityTrace that is active at
 * `now`.  Returns the first problem encountered when no trace is valid.
 *
 * Precedence of failure reasons: revoked > expired > no-trace.
 */
export function checkAuthorityActive(
  actorRef: string,
  authorityTrace: AuthorityTrace[],
  now: Date,
): AuthorityCheckResult {
  const actorTraces = authorityTrace.filter((t) => t.actorRef === actorRef);
  if (actorTraces.length === 0) return "no-trace";

  const nowIso = now.toISOString();
  let sawRevoked = false;
  let sawExpired = false;

  for (const trace of actorTraces) {
    if (trace.revokedAt && trace.revokedAt <= nowIso) {
      sawRevoked = true;
      continue;
    }
    if (trace.validUntil && trace.validUntil < nowIso) {
      sawExpired = true;
      continue;
    }
    if (trace.validFrom && trace.validFrom > nowIso) {
      // Not yet valid — treat as expired for UI purposes
      sawExpired = true;
      continue;
    }
    // This trace is active
    return "active";
  }

  if (sawRevoked) return "revoked";
  if (sawExpired) return "expired";
  return "no-trace";
}

// ---------------------------------------------------------------------------
// ADR 0003 step 2 — versioned pure status function
// ---------------------------------------------------------------------------

/**
 * The version of the status derivation algorithm implemented here.
 * Increment when the algorithm changes so that stored InquiryRecords can be
 * re-evaluated if needed.
 */
export const statusFunctionVersion = "2";

/**
 * The result shape returned by deriveClaimStatus.
 */
export interface ClaimStatusResult {
  status: TrustStatus;
  policyId: string | undefined;
}

/**
 * Pure, versioned function: given a claim and the surrounding bundle data,
 * return the derived status.  This is the canonical implementation of
 *   status = f(claim, events, policy, now)
 * as specified in ADR 0003 §7.
 *
 * Unlike deriveTrustStatus (which takes a pre-resolved single policy),
 * deriveClaimStatus accepts the full policies array and resolves the policy
 * internally — making it self-contained and usable outside the snapshot pipeline.
 */
export function deriveClaimStatus(args: {
  claim: Claim;
  evidence: Evidence[];
  events: VerificationEvent[];
  policies: VerificationPolicy[];
  now?: Date;
  authorityTrace?: AuthorityTrace[];
}): ClaimStatusResult {
  const now = args.now ?? new Date();
  const policy = resolvePolicyForClaim(args.claim, args.policies);
  const { entailingEvidence } = partitionEvidenceBySupport(args.evidence);
  const status = deriveTrustStatus({
    claim: args.claim,
    evidence: entailingEvidence,
    policy,
    events: args.events,
    now,
    authorityTrace: args.authorityTrace,
  });
  return { status, policyId: policy?.id };
}
