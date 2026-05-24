import type {
  Claim,
  ClaimQueueItem,
  EvidenceGap,
  TransparencyGap,
  TransparencyGapQueueItem,
  TransparencyGapType,
  ImpactLevel,
  SurfaceTrustCoverage,
  TrustActionQueues,
  TrustAnalyticsProjection,
  TrustReport,
  TrustStatus,
} from "./types.js";
import { analyzeTrustTraces } from "./trace-analysis.js";

const IMPACT_LEVELS: ImpactLevel[] = ["low", "medium", "high", "critical"];
const GAP_TRANSPARENCY_GAP_TYPES: TransparencyGapType[] = [
  "provenance_gap",
  "policy_violation",
  "corroboration_absent",
  "unsupported_inference",
  "freshness_breach",
];

export function buildTrustAnalyticsProjection(report: TrustReport): TrustAnalyticsProjection {
  const claimsById = new Map(report.claims.map((claim) => [claim.id, claim]));
  const claimItems = report.claims.map((claim) => claimQueueItem(claim));
  const transparencyGapItems = report.transparencyGaps.map((transparencyGap) => transparencyGapQueueItem(transparencyGap));
  const evidenceGaps = buildEvidenceGaps(report, claimsById);
  const traceAnalysis = analyzeTrustTraces(report);
  const evidenceRequirementGaps = sortGaps([...evidenceGaps, ...traceAnalysis.evidenceGaps]);
  const resolveConflicts = transparencyGapItems.filter((item) => item.type === "contradiction");

  return {
    reportId: report.id,
    generatedAt: report.generatedAt,
    source: report.source,
    totals: {
      claims: report.claims.length,
      evidence: report.evidence.length,
      policies: report.policies.length,
      events: report.events.length,
      transparencyGaps: report.transparencyGaps.length,
      claimGroups: report.claimGroupRollups.length,
    },
    claimGroupRollups: report.claimGroupRollups,
    coverageBySurface: buildCoverageBySurface(report.claims),
    staleClaims: claimItems.filter((item) => item.status === "stale"),
    disputedClaims: claimItems.filter((item) => item.status === "disputed"),
    highImpactUnsupportedClaims: claimItems.filter((item) => {
      return (item.impactLevel === "high" || item.impactLevel === "critical") &&
        (item.status === "unknown" || item.status === "proposed");
    }),
    transparencyGaps: {
      byType: report.summary.transparencyGapsByType,
      bySeverity: countTransparencyGapsBySeverity(report.transparencyGaps),
      items: transparencyGapItems,
    },
    evidenceGaps,
    evidenceRequirementGaps,
    confidenceBasis: report.summary.confidenceBasis,
    actionQueues: buildActionQueues({
      claimItems,
      transparencyGapItems,
      evidenceRequirementGaps,
      resolveConflicts,
    }),
    attestationValidity: traceAnalysis.attestationValidity,
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

function transparencyGapQueueItem(transparencyGap: TransparencyGap): TransparencyGapQueueItem {
  const item: TransparencyGapQueueItem = {
    transparencyGapId: transparencyGap.id,
    claimId: transparencyGap.claimId,
    type: transparencyGap.type,
    severity: transparencyGap.severity,
    message: transparencyGap.message,
    evidenceIds: transparencyGap.evidenceIds ?? [],
  };
  if (transparencyGap.policyId) item.policyId = transparencyGap.policyId;
  return item;
}

function countTransparencyGapsBySeverity(transparencyGaps: TransparencyGap[]): Record<ImpactLevel, number> {
  const counts = Object.fromEntries(IMPACT_LEVELS.map((level) => [level, 0])) as Record<ImpactLevel, number>;
  for (const transparencyGap of transparencyGaps) counts[transparencyGap.severity] += 1;
  return counts;
}

function buildEvidenceGaps(report: TrustReport, claimsById: Map<string, Claim>): EvidenceGap[] {
  const gaps = report.transparencyGaps
    .filter((transparencyGap) => GAP_TRANSPARENCY_GAP_TYPES.includes(transparencyGap.type))
    .map((transparencyGap) => {
      const claim = claimsById.get(transparencyGap.claimId);
      const gap: EvidenceGap = {
        claimId: transparencyGap.claimId,
        surface: claim?.surface ?? "unknown",
        impactLevel: claim?.impactLevel ?? transparencyGap.severity,
        gapType: transparencyGap.type,
        message: transparencyGap.message,
        evidenceIds: transparencyGap.evidenceIds ?? [],
      };
      if (transparencyGap.policyId) gap.policyId = transparencyGap.policyId;
      return gap;
    });
  return sortGaps(gaps);
}

function buildActionQueues(input: {
  claimItems: ClaimQueueItem[];
  transparencyGapItems: TransparencyGapQueueItem[];
  evidenceRequirementGaps: EvidenceGap[];
  resolveConflicts: TransparencyGapQueueItem[];
}): TrustActionQueues {
  const reviewClaimIds = new Set<string>();
  for (const item of input.claimItems) {
    if (item.status === "disputed") reviewClaimIds.add(item.claimId);
    if ((item.impactLevel === "high" || item.impactLevel === "critical") && (item.status === "unknown" || item.status === "proposed")) {
      reviewClaimIds.add(item.claimId);
    }
  }
  for (const transparencyGap of input.transparencyGapItems) {
    if (transparencyGap.severity === "high" || transparencyGap.severity === "critical") reviewClaimIds.add(transparencyGap.claimId);
  }

  return {
    reviewNow: input.claimItems.filter((item) => reviewClaimIds.has(item.claimId)),
    reverifyStale: input.claimItems.filter((item) => item.status === "stale"),
    resolveConflicts: input.resolveConflicts,
    strengthenEvidence: input.evidenceRequirementGaps,
  };
}

function sortGaps(gaps: EvidenceGap[]): EvidenceGap[] {
  return gaps.sort((a, b) => (
    a.claimId.localeCompare(b.claimId) ||
    String(a.gapType).localeCompare(String(b.gapType)) ||
    a.message.localeCompare(b.message)
  ));
}
