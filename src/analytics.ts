import type {
  AttestationGapType,
  AttestationValidityItem,
  AttestationValidityProjection,
  Claim,
  ClaimQueueItem,
  Evidence,
  EvidenceGap,
  FaultLine,
  FaultLineQueueItem,
  FaultLineType,
  ImpactLevel,
  SurfaceTrustCoverage,
  TrustActionQueues,
  TrustAnalyticsProjection,
  TrustReport,
  TrustStatus,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";

const IMPACT_LEVELS: ImpactLevel[] = ["low", "medium", "high", "critical"];
const GAP_FAULT_LINE_TYPES: FaultLineType[] = [
  "provenance_gap",
  "policy_violation",
  "corroboration_absent",
  "unsupported_inference",
  "freshness_breach",
];

export function buildTrustAnalyticsProjection(report: TrustReport): TrustAnalyticsProjection {
  const policiesById = new Map(report.policies.map((policy) => [policy.id, policy]));
  const claimsById = new Map(report.claims.map((claim) => [claim.id, claim]));
  const claimItems = report.claims.map((claim) => claimQueueItem(claim));
  const faultLineItems = report.faultLines.map((faultLine) => faultLineQueueItem(faultLine));
  const evidenceGaps = buildEvidenceGaps(report, claimsById);
  const attestationValidity = buildAttestationValidityProjection(report, claimsById, policiesById);
  const attestationGaps = buildAttestationGaps(attestationValidity, claimsById);
  const proofRequirementGaps = sortGaps([...evidenceGaps, ...attestationGaps]);
  const resolveConflicts = faultLineItems.filter((item) => item.type === "contradiction");

  return {
    reportId: report.id,
    generatedAt: report.generatedAt,
    source: report.source,
    totals: {
      claims: report.claims.length,
      evidence: report.evidence.length,
      policies: report.policies.length,
      events: report.events.length,
      faultLines: report.faultLines.length,
    },
    coverageBySurface: buildCoverageBySurface(report.claims),
    staleClaims: claimItems.filter((item) => item.status === "stale"),
    disputedClaims: claimItems.filter((item) => item.status === "disputed"),
    highImpactUnsupportedClaims: claimItems.filter((item) => {
      return (item.impactLevel === "high" || item.impactLevel === "critical") &&
        (item.status === "unknown" || item.status === "proposed");
    }),
    faultLines: {
      byType: report.summary.faultLinesByType,
      bySeverity: countFaultLinesBySeverity(report.faultLines),
      items: faultLineItems,
    },
    evidenceGaps,
    proofRequirementGaps,
    confidenceBasis: report.summary.confidenceBasis,
    actionQueues: buildActionQueues({
      claimItems,
      faultLineItems,
      proofRequirementGaps,
      resolveConflicts,
    }),
    attestationValidity,
  };
}

function buildCoverageBySurface(claims: Array<Claim & { status: TrustStatus }>): SurfaceTrustCoverage[] {
  const bySurface = new Map<string, SurfaceTrustCoverage>();

  for (const claim of claims) {
    const item = bySurface.get(claim.surface) ?? {
      surface: claim.surface,
      totalClaims: 0,
      verifiedClaims: 0,
      staleClaims: 0,
      disputedClaims: 0,
      unsupportedClaims: 0,
      verificationCoverage: 0,
    };
    item.totalClaims += 1;
    if (claim.status === "verified") item.verifiedClaims += 1;
    if (claim.status === "stale") item.staleClaims += 1;
    if (claim.status === "disputed") item.disputedClaims += 1;
    if (claim.status === "unknown" || claim.status === "proposed") item.unsupportedClaims += 1;
    bySurface.set(claim.surface, item);
  }

  return [...bySurface.values()]
    .map((item) => ({
      ...item,
      verificationCoverage: item.totalClaims === 0 ? 0 : item.verifiedClaims / item.totalClaims,
    }))
    .sort((a, b) => a.surface.localeCompare(b.surface));
}

function claimQueueItem(claim: Claim & { status: TrustStatus }): ClaimQueueItem {
  const item: ClaimQueueItem = {
    claimId: claim.id,
    surface: claim.surface,
    status: claim.status,
    impactLevel: claim.impactLevel ?? "medium",
    claimType: claim.claimType,
    subject: {
      subjectType: claim.subjectType,
      subjectId: claim.subjectId,
    },
  };
  if (claim.verificationPolicyId) item.policyId = claim.verificationPolicyId;
  return item;
}

function faultLineQueueItem(faultLine: FaultLine): FaultLineQueueItem {
  const item: FaultLineQueueItem = {
    faultLineId: faultLine.id,
    claimId: faultLine.claimId,
    type: faultLine.type,
    severity: faultLine.severity,
    message: faultLine.message,
    evidenceIds: faultLine.evidenceIds ?? [],
  };
  if (faultLine.policyId) item.policyId = faultLine.policyId;
  return item;
}

function countFaultLinesBySeverity(faultLines: FaultLine[]): Record<ImpactLevel, number> {
  const counts = Object.fromEntries(IMPACT_LEVELS.map((level) => [level, 0])) as Record<ImpactLevel, number>;
  for (const faultLine of faultLines) counts[faultLine.severity] += 1;
  return counts;
}

function buildEvidenceGaps(report: TrustReport, claimsById: Map<string, Claim>): EvidenceGap[] {
  const gaps = report.faultLines
    .filter((faultLine) => GAP_FAULT_LINE_TYPES.includes(faultLine.type))
    .map((faultLine) => {
      const claim = claimsById.get(faultLine.claimId);
      const gap: EvidenceGap = {
        claimId: faultLine.claimId,
        surface: claim?.surface ?? "unknown",
        impactLevel: claim?.impactLevel ?? faultLine.severity,
        gapType: faultLine.type,
        message: faultLine.message,
        evidenceIds: faultLine.evidenceIds ?? [],
      };
      if (faultLine.policyId) gap.policyId = faultLine.policyId;
      return gap;
    });
  return sortGaps(gaps);
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

function buildActionQueues(input: {
  claimItems: ClaimQueueItem[];
  faultLineItems: FaultLineQueueItem[];
  proofRequirementGaps: EvidenceGap[];
  resolveConflicts: FaultLineQueueItem[];
}): TrustActionQueues {
  const reviewClaimIds = new Set<string>();
  for (const item of input.claimItems) {
    if (item.status === "disputed") reviewClaimIds.add(item.claimId);
    if ((item.impactLevel === "high" || item.impactLevel === "critical") && (item.status === "unknown" || item.status === "proposed")) {
      reviewClaimIds.add(item.claimId);
    }
  }
  for (const faultLine of input.faultLineItems) {
    if (faultLine.severity === "high" || faultLine.severity === "critical") reviewClaimIds.add(faultLine.claimId);
  }

  return {
    reviewNow: input.claimItems.filter((item) => reviewClaimIds.has(item.claimId)),
    reverifyStale: input.claimItems.filter((item) => item.status === "stale"),
    resolveConflicts: input.resolveConflicts,
    strengthenEvidence: input.proofRequirementGaps,
  };
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
      return `Attestation ${item.evidenceId} has no identity proof for actor ${item.actorRef ?? "unknown"}.`;
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
