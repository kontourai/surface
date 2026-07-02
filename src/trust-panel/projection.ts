import type { Evidence, TransparencyGap, TrustReport, TrustStatus } from "../types.js";

export interface ViewerTrustPanelModel {
  source: string;
  generatedAt: string;
  totalClaims: number;
  statusCounts: Partial<Record<TrustStatus, number>>;
  claims: ViewerTrustPanelClaim[];
}

export interface ViewerTrustPanelClaim {
  id: string;
  title: string;
  subject: string;
  status: TrustStatus;
  facet: string;
  evidence: Evidence[];
  transparencyGaps: TransparencyGap[];
}

export function buildTrustPanelProjection(report: TrustReport, options: { claimId?: string } = {}): ViewerTrustPanelModel {
  const claims = options.claimId
    ? report.claims.filter((claim) => claim.id === options.claimId)
    : report.claims;
  if (options.claimId && claims.length === 0) throw new Error(`Unknown claim: ${options.claimId}`);

  const statusCounts: Partial<Record<TrustStatus, number>> = {};
  for (const claim of claims) {
    statusCounts[claim.status] = (statusCounts[claim.status] ?? 0) + 1;
  }

  return {
    source: report.source,
    generatedAt: report.generatedAt,
    totalClaims: claims.length,
    statusCounts,
    claims: claims.map((claim) => ({
      id: claim.id,
      title: claim.fieldOrBehavior || claim.claimType || claim.id,
      subject: `${claim.subjectType}:${claim.subjectId}`,
      status: claim.status,
      facet: claim.facet ?? "unknown",
      evidence: report.evidence.filter((item) => item.claimId === claim.id),
      transparencyGaps: report.transparencyGaps.filter((item) => item.claimId === claim.id),
    })),
  };
}
