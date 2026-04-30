import type { Claim, VerificationPolicy } from "./types.js";

/**
 * Resolves the verification policy for a claim, walking the claim-type family
 * declared by policies via parentType.
 *
 * Resolution order:
 *  1. If the claim sets verificationPolicyId, the policy with that id wins.
 *  2. Else, find a policy whose claimType matches the claim's claimType.
 *  3. Else, climb the parentType chain (built from policies that declare
 *     parentType) and pick the most specific policy whose claimType matches a
 *     reachable ancestor.
 *  4. Else, return undefined.
 *
 * The most specific match wins, so a policy on the exact claim type always
 * beats a policy on its parent.
 *
 * Cycles in parentType chains are detected and broken on the second visit.
 */
export function resolvePolicyForClaim(
  claim: Claim,
  policies: readonly VerificationPolicy[],
): VerificationPolicy | undefined {
  if (claim.verificationPolicyId) {
    const direct = policies.find((policy) => policy.id === claim.verificationPolicyId);
    if (direct) return direct;
  }

  const policiesByClaimType = new Map<string, VerificationPolicy>();
  const parentByClaimType = new Map<string, string>();
  for (const policy of policies) {
    // First policy declared for a claim type wins; later ones do not silently override.
    if (!policiesByClaimType.has(policy.claimType)) {
      policiesByClaimType.set(policy.claimType, policy);
    }
    if (policy.parentType && !parentByClaimType.has(policy.claimType)) {
      parentByClaimType.set(policy.claimType, policy.parentType);
    }
  }

  let current: string | undefined = claim.claimType;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    const found = policiesByClaimType.get(current);
    if (found) return found;
    current = parentByClaimType.get(current);
  }
  return undefined;
}

/**
 * Walks the claim-type chain for a given starting type, returning the
 * sequence from most-specific to most-general. Useful for diagnostics.
 */
export function claimTypeFamily(
  claimType: string,
  policies: readonly VerificationPolicy[],
): string[] {
  const parentByClaimType = new Map<string, string>();
  for (const policy of policies) {
    if (policy.parentType && !parentByClaimType.has(policy.claimType)) {
      parentByClaimType.set(policy.claimType, policy.parentType);
    }
  }
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = claimType;
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = parentByClaimType.get(current);
  }
  return chain;
}
