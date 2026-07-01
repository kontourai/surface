import type { Claim, TransparencyGap, TrustStatus, VerificationPolicy } from "./types.js";

export interface ConflictDerivationInput {
  claims: Array<Claim & { status: TrustStatus }>;
  policyByClaimId: Map<string, VerificationPolicy>;
  canonicalKeyForClaim: (claim: Claim) => string;
  now: Date;
}

export function deriveConflictTransparencyGaps(input: ConflictDerivationInput): TransparencyGap[] {
  const transparencyGaps: TransparencyGap[] = [];
  const createdAt = input.now.toISOString();

  type Group = { policy: VerificationPolicy; subjectKey: string; claims: Array<Claim & { status: TrustStatus }> };
  const groupsByKey = new Map<string, Group>();
  for (const claim of input.claims) {
    const policy = input.policyByClaimId.get(claim.id);
    if (!policy) continue;
    if (!hasIncompatibilityRules(policy)) continue;
    const subjectKey = input.canonicalKeyForClaim(claim);
    const groupKey = `${policy.id}::${subjectKey}`;
    const group = groupsByKey.get(groupKey) ?? { policy, subjectKey, claims: [] };
    group.claims.push(claim);
    groupsByKey.set(groupKey, group);
  }

  for (const group of groupsByKey.values()) {
    if (group.claims.length < 2) continue;
    for (let i = 0; i < group.claims.length; i += 1) {
      for (let j = i + 1; j < group.claims.length; j += 1) {
        const a = group.claims[i];
        const b = group.claims[j];

        for (const pair of group.policy.incompatibleValues ?? []) {
          if (matchValuePair(a.value, b.value, pair.values)) {
            transparencyGaps.push({
              id: `${a.id}.${b.id}.gap.contradiction-values`,
              claimId: a.id,
              type: "contradiction",
              severity: a.impactLevel ?? b.impactLevel ?? group.policy.impactLevel,
              ...materialityFromClaim(a),
              message:
                pair.message ??
                `Claims ${a.id} and ${b.id} hold incompatible values under policy ${group.policy.id}.`,
              policyId: group.policy.id,
              createdAt,
              metadata: { peerClaimId: b.id, subjectKey: group.subjectKey, source: "policy.incompatibleValues" },
            });
          }
        }

        for (const pair of group.policy.incompatibleStatuses ?? []) {
          if (matchStatusPair(a.status, b.status, pair.statuses)) {
            transparencyGaps.push({
              id: `${a.id}.${b.id}.gap.contradiction-statuses`,
              claimId: a.id,
              type: "contradiction",
              severity: a.impactLevel ?? b.impactLevel ?? group.policy.impactLevel,
              ...materialityFromClaim(a),
              message:
                pair.message ??
                `Claims ${a.id} and ${b.id} hold incompatible statuses under policy ${group.policy.id}.`,
              policyId: group.policy.id,
              createdAt,
              metadata: { peerClaimId: b.id, subjectKey: group.subjectKey, source: "policy.incompatibleStatuses" },
            });
          }
        }
      }
    }
  }

  return transparencyGaps;
}

function hasIncompatibilityRules(policy: VerificationPolicy): boolean {
  return (
    (Array.isArray(policy.incompatibleValues) && policy.incompatibleValues.length > 0) ||
    (Array.isArray(policy.incompatibleStatuses) && policy.incompatibleStatuses.length > 0)
  );
}

function matchValuePair(a: unknown, b: unknown, pair: [unknown, unknown]): boolean {
  return (deepEqual(a, pair[0]) && deepEqual(b, pair[1])) || (deepEqual(a, pair[1]) && deepEqual(b, pair[0]));
}

function matchStatusPair(a: TrustStatus, b: TrustStatus, pair: [TrustStatus, TrustStatus]): boolean {
  return (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

function materialityFromClaim(claim: Claim): Pick<TransparencyGap, "materiality"> | Record<string, never> {
  return claim.materiality === undefined ? {} : { materiality: claim.materiality };
}
