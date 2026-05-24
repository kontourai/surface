import type {
  AttestationGapType,
  AttestationValidityItem,
  AttestationValidityProjection,
  Claim,
  Evidence,
  EvidenceGap,
  TrustReport,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";

export interface TrustTraceAnalysis {
  attestationValidity: AttestationValidityProjection;
  evidenceGaps: EvidenceGap[];
}

export function analyzeTrustTraces(report: TrustReport): TrustTraceAnalysis {
  const claimsById = new Map(report.claims.map((claim) => [claim.id, claim]));
  const policiesById = new Map(report.policies.map((policy) => [policy.id, policy]));
  const attestationValidity = buildAttestationValidityProjection(report, claimsById, policiesById);
  return {
    attestationValidity,
    evidenceGaps: sortGaps(buildAttestationGaps(attestationValidity, claimsById)),
  };
}

function buildAttestationValidityProjection(
  report: TrustReport,
  claimsById: Map<string, Claim>,
  policiesById: Map<string, VerificationPolicy>,
): AttestationValidityProjection {
  const items = report.evidence
    .filter(isAttestationEvidence)
    .map((evidence) => buildAttestationValidityItem({
      evidence,
      claim: claimsById.get(evidence.claimId),
      events: report.events,
      policy: policyForClaim(claimsById.get(evidence.claimId), policiesById),
      generatedAt: report.generatedAt,
    }))
    .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  return {
    totalAttestations: items.length,
    validAttestations: items.filter((item) => item.status === "valid").length,
    weakAttestations: items.filter((item) => item.status === "weak").length,
    invalidAttestations: items.filter((item) => item.status === "invalid").length,
    items,
  };
}

function buildAttestationValidityItem(input: {
  evidence: Evidence;
  claim?: Claim;
  events: VerificationEvent[];
  policy?: VerificationPolicy;
  generatedAt: string;
}): AttestationValidityItem {
  const actorRef = actorRefForEvidence(input.evidence);
  const validUntil = stringMetadata(input.evidence.metadata, "validUntil");
  const revokedAt = stringMetadata(input.evidence.metadata, "revokedAt");
  const integrityRef = input.evidence.integrityRef ?? stringMetadata(input.evidence.metadata, "contentHash");
  const gaps: AttestationGapType[] = [];

  if (!actorRef) gaps.push("attestation_actor_missing");
  if (!hasIdentityProof(input.evidence)) gaps.push("attestation_identity_unverified");
  if (!hasAuthoritySource(input.evidence, input.policy, actorRef)) gaps.push("attestation_authority_unverified");
  if (!integrityRef) gaps.push("attestation_integrity_missing");
  if (isBefore(validUntil, input.generatedAt)) gaps.push("attestation_expired");
  if (revokedAt) gaps.push("attestation_revoked");

  const status: AttestationValidityItem["status"] =
    gaps.includes("attestation_actor_missing") ||
    gaps.includes("attestation_expired") ||
    gaps.includes("attestation_revoked")
      ? "invalid"
      : gaps.length === 0 ? "valid" : "weak";

  const item: AttestationValidityItem = {
    evidenceId: input.evidence.id,
    claimId: input.evidence.claimId,
    requiredAuthority: input.policy?.reviewAuthority,
    status,
    gaps,
  };
  if (actorRef) item.actorRef = actorRef;
  if (validUntil) item.validUntil = validUntil;
  if (revokedAt) item.revokedAt = revokedAt;
  if (integrityRef) item.integrityRef = integrityRef;
  return item;
}

function buildAttestationGaps(
  projection: AttestationValidityProjection,
  claimsById: Map<string, Claim>,
): EvidenceGap[] {
  return projection.items.flatMap((item) => {
    const claim = claimsById.get(item.claimId);
    return item.gaps.map((gapType) => {
      const gap: EvidenceGap = {
        claimId: item.claimId,
        surface: claim?.surface ?? "unknown",
        impactLevel: claim?.impactLevel ?? "medium",
        gapType,
        message: attestationGapMessage(gapType, item),
        evidenceIds: [item.evidenceId],
      };
      if (claim?.verificationPolicyId) gap.policyId = claim.verificationPolicyId;
      return gap;
    });
  });
}

function isAttestationEvidence(evidence: Evidence): boolean {
  return evidence.method === "attestation" || evidence.evidenceType === "attestation" || evidence.evidenceType === "human_attestation";
}

function actorRefForEvidence(evidence: Evidence): string | undefined {
  const actor = evidence.metadata?.actor;
  if (typeof actor === "object" && actor !== null && typeof (actor as Record<string, unknown>).id === "string") {
    return (actor as Record<string, unknown>).id as string;
  }
  return evidence.collectedBy || undefined;
}

function hasIdentityProof(evidence: Evidence): boolean {
  return hasMetadataKey(evidence.metadata, "identityProof") || hasNestedActorKey(evidence.metadata, "identityProof");
}

function hasAuthoritySource(evidence: Evidence, policy: VerificationPolicy | undefined, actorRef: string | undefined): boolean {
  if (!policy) return hasMetadataKey(evidence.metadata, "authoritySource") || hasNestedActorKey(evidence.metadata, "authoritySource");
  if (hasMetadataKey(evidence.metadata, "authoritySource") || hasNestedActorKey(evidence.metadata, "authoritySource")) return true;
  return Boolean(actorRef && policy.reviewAuthority === actorRef);
}

function hasMetadataKey(metadata: Record<string, unknown> | undefined, key: string): boolean {
  return metadata?.[key] !== undefined && metadata[key] !== null;
}

function hasNestedActorKey(metadata: Record<string, unknown> | undefined, key: string): boolean {
  const actor = metadata?.actor;
  return typeof actor === "object" && actor !== null && (actor as Record<string, unknown>)[key] !== undefined;
}

function policyForClaim(claim: Claim | undefined, policiesById: Map<string, VerificationPolicy>): VerificationPolicy | undefined {
  if (!claim?.verificationPolicyId) return undefined;
  return policiesById.get(claim.verificationPolicyId);
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function isBefore(value: string | undefined, comparedTo: string): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  const comparedTimestamp = Date.parse(comparedTo);
  return Number.isFinite(timestamp) && Number.isFinite(comparedTimestamp) && timestamp < comparedTimestamp;
}

function attestationGapMessage(type: AttestationGapType, item: AttestationValidityItem): string {
  switch (type) {
    case "attestation_actor_missing":
      return `Attestation ${item.evidenceId} has no actor reference.`;
    case "attestation_identity_unverified":
      return `Attestation ${item.evidenceId} has no identity evidence for actor ${item.actorRef ?? "unknown"}.`;
    case "attestation_authority_unverified":
      return `Attestation ${item.evidenceId} has no authority source satisfying ${item.requiredAuthority ?? "the policy"}.`;
    case "attestation_integrity_missing":
      return `Attestation ${item.evidenceId} has no integrity reference or content hash.`;
    case "attestation_expired":
      return `Attestation ${item.evidenceId} expired before the report was generated.`;
    case "attestation_revoked":
      return `Attestation ${item.evidenceId} was revoked.`;
  }
}

function sortGaps(gaps: EvidenceGap[]): EvidenceGap[] {
  return gaps.sort((a, b) => (
    a.claimId.localeCompare(b.claimId) ||
    String(a.gapType).localeCompare(String(b.gapType)) ||
    a.message.localeCompare(b.message)
  ));
}
