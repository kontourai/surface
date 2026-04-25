import type { Claim, TrustInput, TrustReport, TrustReportSummary, TrustStatus } from "./types.js";
import { deriveTrustStatus } from "./status.js";

const STATUSES: TrustStatus[] = ["unknown", "proposed", "verified", "stale", "disputed", "superseded", "rejected"];

export function buildTrustReport(input: TrustInput, options: { now?: Date; id?: string } = {}): TrustReport {
  const now = options.now ?? new Date();
  const claims = input.claims.map((claim) => {
    const evidence = input.evidence.filter((item) => item.claimId === claim.id);
    const policy = input.policies.find((item) => item.id === claim.verificationPolicyId || item.claimType === claim.claimType);
    const status = deriveTrustStatus({ claim, evidence, policy, events: input.events, now });
    return { ...claim, status };
  });

  return {
    id: options.id ?? `surface-${now.getTime()}`,
    generatedAt: now.toISOString(),
    source: input.source,
    claims,
    evidence: input.evidence,
    policies: input.policies,
    events: input.events,
    summary: summarizeClaims(claims),
  };
}

export function summarizeClaims(claims: Array<Claim & { status: TrustStatus }>): TrustReportSummary {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<TrustStatus, number>;
  const bySurface: Record<string, number> = {};
  const highImpactUnsupported: string[] = [];
  const staleClaims: string[] = [];
  const disputedClaims: string[] = [];

  for (const claim of claims) {
    byStatus[claim.status] += 1;
    bySurface[claim.surface] = (bySurface[claim.surface] ?? 0) + 1;

    if ((claim.impactLevel === "high" || claim.impactLevel === "critical") && (claim.status === "unknown" || claim.status === "proposed")) {
      highImpactUnsupported.push(claim.id);
    }
    if (claim.status === "stale") staleClaims.push(claim.id);
    if (claim.status === "disputed") disputedClaims.push(claim.id);
  }

  return {
    totalClaims: claims.length,
    byStatus,
    bySurface,
    highImpactUnsupported,
    staleClaims,
    disputedClaims,
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
    `Disputed: ${report.summary.disputedClaims.join(", ") || "none"}`,
  ].join("\n");
}

