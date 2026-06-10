import { buildTrustAnalyticsProjection } from "../analytics.js";
import { buildDerivationDrilldown } from "../derivation-drilldown.js";
import type { TrustReport } from "../types.js";
import { loadReport, parseQueryArgs, type QueryOptions } from "./shared.js";

export async function runStaleQuery(args: string[]): Promise<void> {
  const report = await loadReport(parseQueryArgs(args));
  console.log(JSON.stringify(buildTrustAnalyticsProjection(report).staleClaims, null, 2));
}

export async function runMissingQuery(args: string[]): Promise<void> {
  const report = await loadReport(parseQueryArgs(args));
  console.log(JSON.stringify(buildTrustAnalyticsProjection(report).evidenceRequirementGaps, null, 2));
}

export async function runPolicyQuery(args: string[]): Promise<void> {
  const options = parseQueryArgs(args);
  const report = await loadReport(options);
  console.log(JSON.stringify(projectPolicyQuery(report, options), null, 2));
}

export async function runGetQuery(args: string[]): Promise<void> {
  const options = parseQueryArgs(args);
  if (!options.claimId) throw new Error("surface get requires --claim-id");
  const report = await loadReport(options);
  console.log(JSON.stringify(projectClaimQuery(report, options.claimId), null, 2));
}

export function projectClaimQuery(report: TrustReport, claimId: string): unknown {
  const claim = report.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Unknown claim: ${claimId}`);
  const policy = claim.verificationPolicyId
    ? report.policies.find((item) => item.id === claim.verificationPolicyId)
    : undefined;
  return {
    claim,
    evidence: report.evidence.filter((item) => item.claimId === claimId),
    authorityTrace: (report.authorityTrace ?? []).filter((item) => item.claimIds?.includes(claimId)),
    events: report.events.filter((item) => item.claimId === claimId),
    policy,
    evidenceRequirement: report.evidenceRequirementsByClaimId[claimId],
    transparencyGaps: report.transparencyGaps.filter((item) => item.claimId === claimId),
    derivation: buildDerivationDrilldown(report, claimId),
  };
}

export function projectPolicyQuery(report: TrustReport, options: QueryOptions): unknown {
  const projection = buildTrustAnalyticsProjection(report);
  const policyId = options.policyId ?? policyIdForClaim(report, options.claimId);
  if (policyId) {
    const policy = report.policies.find((item) => item.id === policyId);
    if (!policy) throw new Error(`Unknown policy: ${policyId}`);
    const claims = report.claims.filter((item) => item.verificationPolicyId === policyId);
    return {
      policy,
      claims,
      gaps: projection.evidenceRequirementGaps.filter((item) => item.policyId === policyId),
      authorityTrace: projection.authorityTrace.records.filter((item) => {
        return claims.some((claim) => item.claimIds.includes(claim.id));
      }),
      transparencyGaps: report.transparencyGaps.filter((item) => item.policyId === policyId),
    };
  }

  return report.policies.map((policy) => ({
    policy,
    claimIds: report.claims.filter((claim) => claim.verificationPolicyId === policy.id).map((claim) => claim.id),
    gapCount: projection.evidenceRequirementGaps.filter((gap) => gap.policyId === policy.id).length,
    transparencyGapCount: report.transparencyGaps.filter((transparencyGap) => transparencyGap.policyId === policy.id).length,
  }));
}

function policyIdForClaim(report: TrustReport, claimId: string | undefined): string | undefined {
  if (!claimId) return undefined;
  const claim = report.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Unknown claim: ${claimId}`);
  return claim.verificationPolicyId;
}
