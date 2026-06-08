import type { Claim, Evidence, TrustStatus, VerificationEvent, VerificationPolicy } from "./types.js";
import { evidenceEntailsClaim } from "./evidence-support.js";

const TERMINAL_EVENT_STATUSES = new Set<TrustStatus>(["rejected", "disputed", "superseded", "stale"]);

export function deriveTrustStatus(input: {
  claim: Claim;
  evidence: Evidence[];
  policy?: VerificationPolicy;
  events: VerificationEvent[];
  now?: Date;
}): TrustStatus {
  const now = input.now ?? new Date();
  const claimEvents = input.events
    .filter((event) => event.claimId === input.claim.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latestEvent = claimEvents[0];

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
