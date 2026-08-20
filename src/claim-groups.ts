import type {
  Claim,
  ClaimGroupRollup,
  RequirementRollup,
  ImpactLevel,
  ClaimGroup,
  TrustStatus,
} from "./types.js";
import { aggregateTrustStatuses, isRequirementUnsupportedStatus } from "./status-taxonomy.js";

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
      // `revoked` belongs in the terminal-negative bucket alongside disputed/rejected. Making it
      // dominate the aggregate without classifying it here would have fixed the headline and left
      // the claim invisible in every list — the same defect this change exists to remove.
      disputedClaims: claims.filter((claim) => claim.status === "disputed" || claim.status === "rejected" || claim.status === "revoked").map((claim) => claim.id),
      unsupportedClaims: claims.filter((claim) => isRequirementUnsupportedStatus(claim.status)).map((claim) => claim.id),
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
  const aggregate = aggregateTrustStatuses(statuses);
  if (aggregate === "unknown") return "proposed";
  // An `assumed` aggregate stays `assumed`. It used to return "verified", which made a
  // requirement whose every claim was a disclosed gap or a skipped check indistinguishable
  // from one that was genuinely evidenced — same requirement status, same group status.
  //
  // That upgrade contradicted this package's own waiver semantics: `deriveWaiverValidity` treats
  // an assumed claim with no waiver as never defaulting to a passing verdict. This module never
  // consulted a waiver at all; it upgraded unconditionally.
  //
  // It arrived as collateral of #101: before that refactor this function had its own inline
  // precedence chain that omitted `assumed` entirely, so `assumed` fell through to "verified".
  // #101 introduced the shared aggregateTrustStatuses — which returns "assumed" correctly —
  // and added this line to keep the observable behaviour byte-identical. The refactor was
  // faithful; what it preserved was the defect.
  //
  // Waiver validity is a SIBLING projection, not a status upgrade: `deriveWaiverValidity` is
  // computed alongside these rollups and has the evidence and policy inputs required to decide
  // whether a gap is acceptable. This function has neither. A consumer whose policy accepts an
  // approved waiver composes the two projections; it does not ask this one to pre-absorb the gap.
  return aggregate;
}

function deriveClaimGroupStatus(claimGroup: ClaimGroup, requirements: RequirementRollup[]): TrustStatus {
  const required = requiredRequirements(claimGroup, requirements);
  if (required.length === 0) return requirements.length > 0 ? aggregateTrustStatuses(requirements.map((requirement) => requirement.status)) : "unknown";
  if (claimGroup.rollupPolicy?.mode === "any-required") {
    if (required.some((requirement) => requirement.status === "verified")) return "verified";
    return aggregateTrustStatuses(required.map((requirement) => requirement.status));
  }
  return aggregateTrustStatuses(required.map((requirement) => requirement.status));
}

function requiredRequirements(claimGroup: ClaimGroup, requirements: RequirementRollup[]): RequirementRollup[] {
  const requiredIds = new Set(claimGroup.rollupPolicy?.requiredRequirementIds ?? []);
  const optionalIds = new Set(claimGroup.rollupPolicy?.optionalRequirementIds ?? []);
  if (requiredIds.size > 0) return requirements.filter((requirement) => requiredIds.has(requirement.id));
  return requirements.filter((requirement) => requirement.required && !optionalIds.has(requirement.id));
}

function summarizeRequirements(requirements: RequirementRollup[]): ClaimGroupRollup["summary"] {
  const required = requirements.filter((requirement) => requirement.required);
  const verifiedRequirements = requirements.filter((requirement) => requirement.status === "verified").length;
  return {
    totalRequirements: requirements.length,
    requiredRequirements: required.length,
    verifiedRequirements,
    staleRequirements: requirements.filter((requirement) => requirement.status === "stale" || requirement.status === "superseded").length,
    disputedRequirements: requirements.filter((requirement) => requirement.status === "disputed" || requirement.status === "rejected" || requirement.status === "revoked").length,
    unsupportedRequirements: requirements.filter((requirement) => isRequirementUnsupportedStatus(requirement.status)).length,
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
