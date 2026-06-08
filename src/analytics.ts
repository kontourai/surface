import type {
  Claim,
  ClaimQueueItem,
  EvidenceGap,
  AuthorityTrace,
  AuthorityTraceItem,
  AuthorityTraceProjection,
  TransparencyGap,
  TransparencyGapQueueItem,
  TransparencyGapType,
  ImpactLevel,
  Materiality,
  SurfaceTrustCoverage,
  TrustActionQueues,
  TrustAnalyticsProjection,
  TrustReport,
  TrustStatus,
} from "./types.js";
import { analyzeTrustTraces } from "./trace-analysis.js";

const IMPACT_LEVELS: ImpactLevel[] = ["low", "medium", "high", "critical"];
const MATERIALITY_ORDER: Record<Materiality, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
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
      authorityTrace: report.authorityTrace?.length ?? 0,
      transparencyGaps: report.transparencyGaps.length,
      claimGroups: report.claimGroupRollups.length,
    },
    authorityTrace: buildAuthorityTraceProjection(report.authorityTrace ?? [], report.generatedAt),
    claimGroupRollups: report.claimGroupRollups,
    coverageBySurface: buildCoverageBySurface(report.claims),
    staleClaims: claimItems.filter((item) => item.status === "stale"),
    disputedClaims: claimItems.filter((item) => item.status === "disputed"),
    highImpactUnsupportedClaims: claimItems.filter((item) => {
      return (item.impactLevel === "high" || item.impactLevel === "critical") &&
        (item.status === "unknown" || item.status === "proposed" || item.status === "assumed");
    }),
    transparencyGaps: {
      byType: report.summary.transparencyGapsByType,
      bySeverity: countTransparencyGapsBySeverity(report.transparencyGaps),
      items: sortTransparencyGapItems(transparencyGapItems),
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

function buildAuthorityTraceProjection(authorityTrace: AuthorityTrace[], generatedAt: string): AuthorityTraceProjection {
  const records = authorityTrace.map((trace): AuthorityTraceItem => {
    const status = trace.revokedAt
      ? "revoked"
      : isBefore(trace.validUntil, generatedAt) ? "expired" : "active";
    const item: AuthorityTraceItem = {
      id: trace.id,
      subject: trace.subject,
      actorRef: trace.actorRef,
      authorityType: trace.authorityType,
      authorityRef: trace.authorityRef,
      sourceRef: trace.sourceRef,
      observedAt: trace.observedAt,
      evidenceIds: trace.evidenceIds ?? [],
      claimIds: trace.claimIds ?? [],
      status,
    };
    if (trace.validFrom) item.validFrom = trace.validFrom;
    if (trace.validUntil) item.validUntil = trace.validUntil;
    if (trace.revokedAt) item.revokedAt = trace.revokedAt;
    if (trace.integrityRef) item.integrityRef = trace.integrityRef;
    if (trace.integrityAnchor) item.integrityAnchor = trace.integrityAnchor;
    return item;
  }).sort((a, b) => a.id.localeCompare(b.id));

  return {
    totalRecords: records.length,
    activeRecords: records.filter((item) => item.status === "active").length,
    expiredRecords: records.filter((item) => item.status === "expired").length,
    revokedRecords: records.filter((item) => item.status === "revoked").length,
    records,
  };
}

function isBefore(value: string | undefined, comparedTo: string): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  const comparedTimestamp = Date.parse(comparedTo);
  return Number.isFinite(timestamp) && Number.isFinite(comparedTimestamp) && timestamp < comparedTimestamp;
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
    if (claim.status === "unknown" || claim.status === "proposed" || claim.status === "assumed") item.unsupportedClaims += 1;
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
  if (claim.materiality) item.materiality = claim.materiality;
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
  if (transparencyGap.materiality) item.materiality = transparencyGap.materiality;
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
      const materiality = transparencyGap.materiality ?? claim?.materiality;
      if (materiality) gap.materiality = materiality;
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
    if (
      (item.impactLevel === "high" || item.impactLevel === "critical") &&
      (item.status === "unknown" || item.status === "proposed" || item.status === "assumed")
    ) {
      reviewClaimIds.add(item.claimId);
    }
  }
  for (const transparencyGap of input.transparencyGapItems) {
    if (transparencyGap.severity === "high" || transparencyGap.severity === "critical") reviewClaimIds.add(transparencyGap.claimId);
  }

  return {
    reviewNow: sortClaimItems(input.claimItems.filter((item) => reviewClaimIds.has(item.claimId))),
    reverifyStale: sortClaimItems(input.claimItems.filter((item) => item.status === "stale")),
    resolveConflicts: sortTransparencyGapItems(input.resolveConflicts),
    strengthenEvidence: input.evidenceRequirementGaps,
  };
}

function sortGaps(gaps: EvidenceGap[]): EvidenceGap[] {
  return gaps.sort((a, b) => (
    compareMateriality(a.materiality, b.materiality) ||
    a.claimId.localeCompare(b.claimId) ||
    String(a.gapType).localeCompare(String(b.gapType)) ||
    a.message.localeCompare(b.message)
  ));
}

function sortClaimItems(items: ClaimQueueItem[]): ClaimQueueItem[] {
  return items.sort((a, b) => (
    compareMateriality(a.materiality, b.materiality) ||
    a.claimId.localeCompare(b.claimId)
  ));
}

function sortTransparencyGapItems(items: TransparencyGapQueueItem[]): TransparencyGapQueueItem[] {
  return items.sort((a, b) => (
    compareMateriality(a.materiality, b.materiality) ||
    a.claimId.localeCompare(b.claimId) ||
    a.type.localeCompare(b.type) ||
    a.message.localeCompare(b.message)
  ));
}

function compareMateriality(a: Materiality | undefined, b: Materiality | undefined): number {
  const aOrder = a === undefined ? Number.POSITIVE_INFINITY : MATERIALITY_ORDER[a];
  const bOrder = b === undefined ? Number.POSITIVE_INFINITY : MATERIALITY_ORDER[b];
  return aOrder - bOrder;
}
