import type {
  Claim,
  DerivationCheckpoint,
  DerivedReportClaim,
  FreshnessTransitionEvent,
  TransparencyGap,
  TransparencyGapType,
  TrustBundle,
  TrustReport,
  TrustReportSummary,
  TrustStatus,
} from "./types.js";
import { deriveTrustSnapshot } from "./trust-snapshot.js";
import type { SnapshotEventProbe } from "./trust-snapshot.js";
import { statusFunctionVersion } from "./status.js";

const STATUSES: TrustStatus[] = ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected", "revoked"];
const TRANSPARENCY_GAP_TYPES: TransparencyGapType[] = [
  "contradiction",
  "provenance_gap",
  "policy_violation",
  "freshness_breach",
  "corroboration_absent",
  "unsupported_inference",
];

export interface BuildTrustReportOptions {
  /** The evaluation instant for time-based freshness. Defaults to wall clock. */
  now?: Date;
  id?: string;
  /**
   * Optional checkpoint enabling cost-bounded re-derivation. When supplied,
   * derivation still produces an identical report for the same `now` (the
   * status function is pure), but the checkpoint is validated for consistency
   * and surfaced so callers can chain derivations. Re-derivation is bounded by
   * the event tail newer than the checkpoint's high-water mark; time-based
   * freshness is always re-applied against `now`.
   */
  since?: DerivationCheckpoint;
  /**
   * Instrumentation hook (testing/observability): invoked once per claim with
   * how many of that claim's events were actually folded. Lets callers prove a
   * checkpointed derivation consumed only the event tail (often zero events).
   */
  instrument?: (probe: SnapshotEventProbe) => void;
}

export function buildTrustReport(input: TrustBundle, options: BuildTrustReportOptions = {}): TrustReport {
  const now = options.now ?? new Date();
  const snapshot = deriveTrustSnapshot(input, { now, since: options.since, instrument: options.instrument });

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
    statusFunctionVersion,
  };
}

/**
 * Freeze a derivation checkpoint from a report. The checkpoint is the immutable
 * inquiry record AND the performance lever for `buildTrustReport(bundle, { now,
 * since })`: subsequent derivations only need to fold events newer than its
 * `throughEventCreatedAt`.
 */
export function checkpointFromReport(report: TrustReport): DerivationCheckpoint {
  const statusByClaimId: Record<string, TrustStatus> = {};
  const expiresAtByClaimId: Record<string, string> = {};
  for (const claim of report.claims) {
    statusByClaimId[claim.id] = claim.status;
    if (claim.freshness?.expiresAt) expiresAtByClaimId[claim.id] = claim.freshness.expiresAt;
  }
  // Record both a global and a per-claim high-water mark. The per-claim mark is
  // what makes tail detection correct under out-of-order arrival; the global
  // mark is kept for backward compatibility / coarse diagnostics.
  let throughEventCreatedAt: string | null = null;
  const throughEventCreatedAtByClaimId: Record<string, string | null> = {};
  for (const claim of report.claims) throughEventCreatedAtByClaimId[claim.id] = null;
  for (const event of report.events) {
    if (throughEventCreatedAt === null || Date.parse(event.createdAt) > Date.parse(throughEventCreatedAt)) {
      throughEventCreatedAt = event.createdAt;
    }
    const prior = throughEventCreatedAtByClaimId[event.claimId];
    if (prior === undefined || prior === null || Date.parse(event.createdAt) > Date.parse(prior)) {
      throughEventCreatedAtByClaimId[event.claimId] = event.createdAt;
    }
  }
  return {
    asOf: report.generatedAt,
    statusByClaimId,
    expiresAtByClaimId: Object.keys(expiresAtByClaimId).length > 0 ? expiresAtByClaimId : undefined,
    throughEventCreatedAt,
    throughEventCreatedAtByClaimId,
    statusFunctionVersion: report.statusFunctionVersion,
  };
}

/**
 * Diff two derivations (prior checkpoint → later report) and emit a
 * FreshnessTransitionEvent for each claim whose time-based freshness flipped.
 * This is the "fresh→stale without polling" signal downstream planes consume.
 */
export function diffFreshness(prior: DerivationCheckpoint, next: TrustReport): FreshnessTransitionEvent[] {
  const transitions: FreshnessTransitionEvent[] = [];
  const wasStale = (status: TrustStatus | undefined): boolean => status === "stale";
  for (const claim of next.claims) {
    const before = prior.statusByClaimId[claim.id];
    if (before === undefined) continue;
    const fromStale = wasStale(before);
    const toStale = claim.status === "stale";
    if (fromStale === toStale) continue;
    const event: FreshnessTransitionEvent = {
      claimId: claim.id,
      from: fromStale ? "stale" : "fresh",
      to: toStale ? "stale" : "fresh",
      asOf: claim.freshness?.asOf ?? next.generatedAt,
      statusFunctionVersion: next.statusFunctionVersion,
    };
    if (claim.freshness?.expiresAt) event.expiresAt = claim.freshness.expiresAt;
    transitions.push(event);
  }
  return transitions;
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
