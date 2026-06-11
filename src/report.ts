import type {
  Claim,
  TransparencyGap,
  TransparencyGapType,
  TrustBundle,
  TrustReport,
  TrustReportSummary,
  TrustStatus,
} from "./types.js";
import { deriveTrustSnapshot } from "./trust-snapshot.js";

const STATUSES: TrustStatus[] = ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected"];
const TRANSPARENCY_GAP_TYPES: TransparencyGapType[] = [
  "contradiction",
  "provenance_gap",
  "policy_violation",
  "freshness_breach",
  "corroboration_absent",
  "unsupported_inference",
];

export function buildTrustReport(input: TrustBundle, options: { now?: Date; id?: string } = {}): TrustReport {
  const now = options.now ?? new Date();
  const snapshot = deriveTrustSnapshot(input, { now });

  return {
    schemaVersion: input.schemaVersion,
    id: options.id ?? `surface-${now.getTime()}`,
    generatedAt: now.toISOString(),
    source: input.source,
    claims: snapshot.claims,
    evidence: input.evidence,
    policies: input.policies,
    events: input.events,
    identityLinks: input.identityLinks ?? [],
    claimGroups: input.claimGroups ?? [],
    authorityTrace: input.authorityTrace ?? [],
    evidenceRequirementsByClaimId: snapshot.evidenceRequirementsByClaimId,
    transparencyGaps: snapshot.transparencyGaps,
    changeRecords: snapshot.changeRecords,
    subjectGroups: snapshot.subjectGroups,
    claimGroupRollups: snapshot.claimGroupRollups,
    summary: summarizeClaims(snapshot.claims, snapshot.transparencyGaps, snapshot.changeRecords),
  };
}

export function summarizeClaims(
  claims: Array<Claim & { status: TrustStatus }>,
  transparencyGaps: TransparencyGap[] = [],
  changeRecords: Array<{ claimId: string; action: string }> = [],
): TrustReportSummary {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<TrustStatus, number>;
  const bySurface: Record<string, number> = {};
  const sourceQuality: Record<string, number> = {};
  const reviewerAuthority: Record<string, number> = {};
  const evidenceStrength: Record<string, number> = {};
  const extractionConfidences: number[] = [];
  const freshnessAtRisk: string[] = [];
  const conflictedClaims: string[] = [];
  let corroboratedClaims = 0;
  const transparencyGapsByType = Object.fromEntries(TRANSPARENCY_GAP_TYPES.map((type) => [type, 0])) as Record<TransparencyGapType, number>;
  const highImpactUnsupported: string[] = [];
  const staleClaims: string[] = [];
  const disputedClaims: string[] = [];
  const recomputeNeededClaims = [...new Set(changeRecords.filter((record) => record.action === "recompute").map((record) => record.claimId))];

  for (const claim of claims) {
    byStatus[claim.status] += 1;
    bySurface[claim.surface] = (bySurface[claim.surface] ?? 0) + 1;
    const basis = claim.confidenceBasis;
    if (basis?.sourceQuality) sourceQuality[basis.sourceQuality] = (sourceQuality[basis.sourceQuality] ?? 0) + 1;
    if (basis?.reviewerAuthority) reviewerAuthority[basis.reviewerAuthority] = (reviewerAuthority[basis.reviewerAuthority] ?? 0) + 1;
    if (basis?.evidenceStrength) evidenceStrength[basis.evidenceStrength] = (evidenceStrength[basis.evidenceStrength] ?? 0) + 1;
    if (typeof basis?.extractionConfidence === "number") extractionConfidences.push(basis.extractionConfidence);
    if ((basis?.corroborationCount ?? 0) > 0) corroboratedClaims += 1;
    if ((basis?.freshnessRemainingDays ?? 1) <= 0) freshnessAtRisk.push(claim.id);
    if ((basis?.conflictCount ?? 0) > 0) conflictedClaims.push(claim.id);

    if (
      (claim.impactLevel === "high" || claim.impactLevel === "critical") &&
      (claim.status === "unknown" || claim.status === "proposed" || claim.status === "assumed")
    ) {
      highImpactUnsupported.push(claim.id);
    }
    if (claim.status === "stale") staleClaims.push(claim.id);
    if (claim.status === "disputed") disputedClaims.push(claim.id);
  }

  for (const transparencyGap of transparencyGaps) {
    transparencyGapsByType[transparencyGap.type] += 1;
  }

  return {
    totalClaims: claims.length,
    byStatus,
    bySurface,
    confidenceBasis: {
      sourceQuality,
      reviewerAuthority,
      evidenceStrength,
      corroboratedClaims,
      averageExtractionConfidence: extractionConfidences.length > 0
        ? extractionConfidences.reduce((total, value) => total + value, 0) / extractionConfidences.length
        : null,
      freshnessAtRisk,
      conflictedClaims,
    },
    transparencyGapsByType,
    highImpactUnsupported,
    staleClaims,
    disputedClaims,
    recomputeNeededClaims,
  };
}

export function formatTrustReportSummary(report: TrustReport): string {
  const statusSummary = STATUSES
    .filter((status) => report.summary.byStatus[status] > 0)
    .map((status) => `${status}: ${report.summary.byStatus[status]}`)
    .join(", ");
  const surfaceSummary = Object.entries(report.summary.bySurface)
    .map(([surface, count]) => `${surface}: ${count}`)
    .join(", ");

  return [
    `Kontour Surface report ${report.id}`,
    `Source: ${report.source}`,
    `Claims: ${report.summary.totalClaims} (${statusSummary || "none"})`,
    `Surfaces: ${surfaceSummary || "none"}`,
    `High-impact unsupported: ${report.summary.highImpactUnsupported.join(", ") || "none"}`,
    `Stale: ${report.summary.staleClaims.join(", ") || "none"}`,
    `Recompute needed: ${report.summary.recomputeNeededClaims.join(", ") || "none"}`,
    `Disputed: ${report.summary.disputedClaims.join(", ") || "none"}`,
    `Claim groups: ${report.claimGroupRollups.length}`,
    `Transparency gaps: ${report.transparencyGaps.length}`,
  ].join("\n");
}
