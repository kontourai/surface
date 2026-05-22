import type {
  Claim,
  ClaimGroupRollup,
  RequirementRollup,
  ImpactLevel,
  ClaimGroup,
  TrustStatus,
} from "./types.js";

export function deriveClaimGroupRollups(input: {
  claimGroups?: ClaimGroup[];
  claims: Array<Claim & { status: TrustStatus }>;
}): ClaimGroupRollup[] {
  const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
  return (input.claimGroups ?? []).map((claimGroup) => deriveClaimGroupRollup(claimGroup, claimsById));
}

function deriveClaimGroupRollup(
  claimGroup: ClaimGroup,
  claimsById: Map<string, Claim & { status: TrustStatus }>,
): ClaimGroupRollup {
  const requirements = normalizedRequirements(claimGroup).map((requirement) => {
    const claimIds = unique(requirement.claimIds);
    const claims = claimIds.map((id) => claimsById.get(id)).filter((claim): claim is Claim & { status: TrustStatus } => Boolean(claim));
    const missingClaimIds = claimIds.filter((id) => !claimsById.has(id));
    const rollup: RequirementRollup = {
      id: requirement.id,
      title: requirement.title,
      claimIds,
      required: requirement.required !== false,
      severity: requirement.severity ?? maxImpact(claims.map((claim) => claim.impactLevel ?? "medium")),
      status: deriveRequirementStatus(claims, missingClaimIds),
      verifiedClaims: claims.filter((claim) => claim.status === "verified").map((claim) => claim.id),
      staleClaims: claims.filter((claim) => claim.status === "stale" || claim.status === "superseded").map((claim) => claim.id),
      disputedClaims: claims.filter((claim) => claim.status === "disputed" || claim.status === "rejected").map((claim) => claim.id),
      unsupportedClaims: claims
        .filter((claim) => claim.status === "unknown" || claim.status === "proposed")
        .map((claim) => claim.id),
      missingClaimIds,
    };
    if (requirement.validationStrategy) rollup.validationStrategy = requirement.validationStrategy;
    if (requirement.metadata) rollup.metadata = requirement.metadata;
    return rollup;
  });

  const rollupClaims = unique([
    ...(claimGroup.claimIds ?? []),
    ...requirements.flatMap((requirement) => requirement.claimIds),
  ]);
  const status = deriveClaimGroupStatus(claimGroup, requirements);
  const summary = summarizeRequirements(requirements);
  const rollup: ClaimGroupRollup = {
    id: claimGroup.id,
    title: claimGroup.title,
    kind: claimGroup.kind,
    status,
    claimIds: rollupClaims,
    requirements,
    summary,
  };
  if (claimGroup.description) rollup.description = claimGroup.description;
  if (claimGroup.metadata) rollup.metadata = claimGroup.metadata;
  return rollup;
}

function normalizedRequirements(claimGroup: ClaimGroup): NonNullable<ClaimGroup["requirements"]> {
  if (claimGroup.requirements && claimGroup.requirements.length > 0) return claimGroup.requirements;
  if (!claimGroup.claimIds || claimGroup.claimIds.length === 0) return [];
  return [{
    id: `${claimGroup.id}.claims`,
    title: claimGroup.title,
    claimIds: claimGroup.claimIds,
    required: true,
  }];
}

function deriveRequirementStatus(
  claims: Array<Claim & { status: TrustStatus }>,
  missingClaimIds: string[],
): TrustStatus {
  if (missingClaimIds.length > 0 || claims.length === 0) return "unknown";
  const statuses = claims.map((claim) => claim.status);
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "disputed")) return "disputed";
  if (statuses.some((status) => status === "stale" || status === "superseded")) return "stale";
  if (statuses.some((status) => status === "unknown" || status === "proposed")) return "proposed";
  return "verified";
}

function deriveClaimGroupStatus(claimGroup: ClaimGroup, requirements: RequirementRollup[]): TrustStatus {
  const required = requiredRequirements(claimGroup, requirements);
  if (required.length === 0) return requirements.length > 0 ? aggregateStatuses(requirements.map((requirement) => requirement.status)) : "unknown";
  if (claimGroup.rollupPolicy?.mode === "any-required") {
    if (required.some((requirement) => requirement.status === "verified")) return "verified";
    return aggregateStatuses(required.map((requirement) => requirement.status));
  }
  return aggregateStatuses(required.map((requirement) => requirement.status));
}

function requiredRequirements(claimGroup: ClaimGroup, requirements: RequirementRollup[]): RequirementRollup[] {
  const requiredIds = new Set(claimGroup.rollupPolicy?.requiredRequirementIds ?? []);
  const optionalIds = new Set(claimGroup.rollupPolicy?.optionalRequirementIds ?? []);
  if (requiredIds.size > 0) return requirements.filter((requirement) => requiredIds.has(requirement.id));
  return requirements.filter((requirement) => requirement.required && !optionalIds.has(requirement.id));
}

function aggregateStatuses(statuses: TrustStatus[]): TrustStatus {
  if (statuses.length === 0) return "unknown";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "disputed")) return "disputed";
  if (statuses.some((status) => status === "stale" || status === "superseded")) return "stale";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  if (statuses.some((status) => status === "proposed")) return "proposed";
  return "verified";
}

function summarizeRequirements(requirements: RequirementRollup[]): ClaimGroupRollup["summary"] {
  const required = requirements.filter((requirement) => requirement.required);
  const verifiedRequirements = requirements.filter((requirement) => requirement.status === "verified").length;
  return {
    totalRequirements: requirements.length,
    requiredRequirements: required.length,
    verifiedRequirements,
    staleRequirements: requirements.filter((requirement) => requirement.status === "stale" || requirement.status === "superseded").length,
    disputedRequirements: requirements.filter((requirement) => requirement.status === "disputed" || requirement.status === "rejected").length,
    unsupportedRequirements: requirements.filter((requirement) => requirement.status === "unknown" || requirement.status === "proposed").length,
    missingClaims: requirements.reduce((total, requirement) => total + requirement.missingClaimIds.length, 0),
    verificationCoverage: requirements.length === 0 ? 0 : verifiedRequirements / requirements.length,
  };
}

function maxImpact(levels: ImpactLevel[]): ImpactLevel {
  const rank: Record<ImpactLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  return levels.reduce((max, level) => rank[level] > rank[max] ? level : max, "medium");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
