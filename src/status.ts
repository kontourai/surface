import type { AuthorityTrace, Claim, Evidence, TrustStatus, VerificationEvent, VerificationPolicy } from "./types.js";
import { evidenceEntailsClaim, partitionEvidenceBySupport } from "./evidence-support.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";

const TERMINAL_EVENT_STATUSES = new Set<TrustStatus>(["rejected", "disputed", "superseded", "stale"]);

export function deriveTrustStatus(input: {
  claim: Claim;
  evidence: Evidence[];
  policy?: VerificationPolicy;
  events: VerificationEvent[];
  now?: Date;
  authorityTrace?: AuthorityTrace[];
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

  if (latestEvent && TERMINAL_EVENT_STATUSES.has(latestEvent.status)) {
    return latestEvent.status;
  }

  if (latestEvent?.status === "assumed") {
    return "assumed";
  }

  if (latestEvent?.status === "verified") {
    if (isVerifiedEventStale(latestEvent, input.claim, input.evidence, input.policy, now)) {
      return "stale";
    }

    if (input.policy) {
      const entailingEvidence = input.evidence.filter(evidenceEntailsClaim);
      const evidenceTypes = new Set(entailingEvidence.map((evidence) => evidence.evidenceType));
      const evidenceMethods = new Set(entailingEvidence.map((evidence) => evidence.method));
      const missingTypes = input.policy.requiredEvidence.filter((type) => !evidenceTypes.has(type));
      const missingMethods = (input.policy.requiredMethods ?? []).filter((method) => !evidenceMethods.has(method));
      if (
        missingTypes.length > 0 ||
        missingMethods.length > 0 ||
        (input.policy.requiresCorroboration && entailingEvidence.length < 2)
      ) {
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

function isVerifiedEventStale(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
): boolean {
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
// ADR 0003 step 2 — versioned pure status function
// ---------------------------------------------------------------------------

/**
 * The version of the status derivation algorithm implemented here.
 * Increment when the algorithm changes so that stored InquiryRecords can be
 * re-evaluated if needed.
 */
export const STATUS_FUNCTION_VERSION = "1";

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
