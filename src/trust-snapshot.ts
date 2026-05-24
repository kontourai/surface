import type {
  Claim,
  ClaimGroupRollup,
  Evidence,
  EvidenceRequirement,
  SubjectGroup,
  TransparencyGap,
  TransparencyGapType,
  TrustInput,
  TrustStatus,
  VerificationPolicy,
} from "./types.js";
import { deriveClaimGroupRollups } from "./claim-groups.js";
import { applyDerivation } from "./derivation.js";
import { buildIdentityIndex } from "./identity.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import { deriveTrustStatus } from "./status.js";

const TRANSPARENCY_GAP_TYPES: TransparencyGapType[] = [
  "contradiction",
  "provenance_gap",
  "policy_violation",
  "freshness_breach",
  "corroboration_absent",
  "unsupported_inference",
];

export interface TrustSnapshotDerivation {
  claims: Array<Claim & { status: TrustStatus }>;
  evidenceRequirementsByClaimId: Record<string, EvidenceRequirement>;
  transparencyGaps: TransparencyGap[];
  subjectGroups: SubjectGroup[];
  claimGroupRollups: ClaimGroupRollup[];
}

export function deriveTrustSnapshot(input: TrustInput, options: { now?: Date } = {}): TrustSnapshotDerivation {
  const now = options.now ?? new Date();
  const evidenceRequirementsByClaimId: Record<string, EvidenceRequirement> = {};
  const transparencyGaps: TransparencyGap[] = [];
  const identityIndex = buildIdentityIndex(input);
  const policyByClaimId = new Map<string, VerificationPolicy>();

  const ownStatusByClaimId = new Map<string, TrustStatus>();
  const claimsById = new Map<string, Claim>();
  const ownStatuses = input.claims.map((claim) => {
    claimsById.set(claim.id, claim);
    const evidence = input.evidence.filter((item) => item.claimId === claim.id);
    const policy = resolvePolicyForClaim(claim, input.policies);
    if (policy) policyByClaimId.set(claim.id, policy);
    const producerStatus = claim.status;
    const ownStatus = deriveTrustStatus({ claim, evidence, policy, events: input.events, now });
    ownStatusByClaimId.set(claim.id, ownStatus);
    if (policy) {
      evidenceRequirementsByClaimId[claim.id] = evidenceRequirementFromPolicy(policy);
      transparencyGaps.push(...deriveTransparencyGaps({ claim, evidence, policy, status: ownStatus, now }));
    } else if (evidence.length === 0) {
      transparencyGaps.push({
        id: `${claim.id}.gap.provenance-gap`,
        claimId: claim.id,
        type: "provenance_gap",
        severity: claim.impactLevel ?? "medium",
        message: `Claim ${claim.id} has no evidence and no verification policy.`,
        blocking: true,
        createdAt: now.toISOString(),
      });
    }
    return { claim, ownStatus, producerStatus };
  });

  const claims = ownStatuses.map(({ claim, ownStatus, producerStatus }) => {
    const outcome = applyDerivation({ claim, ownStatus, ownStatusByClaimId, claimsById, now });
    transparencyGaps.push(...outcome.transparencyGaps);
    const derived = outcome.status;
    const output: Claim & { status: TrustStatus; producerStatus?: TrustStatus } = {
      ...claim,
      status: derived,
    };
    if (producerStatus !== undefined && producerStatus !== derived) {
      output.producerStatus = producerStatus;
    }
    return output;
  });

  transparencyGaps.push(...deriveIncompatibilityTransparencyGaps({
    claims,
    policyByClaimId,
    canonicalKeyForClaim: (claim) => identityIndex.canonicalKeyForClaim(claim),
    now,
  }));

  return {
    claims,
    evidenceRequirementsByClaimId,
    transparencyGaps,
    subjectGroups: identityIndex.groups,
    claimGroupRollups: deriveClaimGroupRollups({ claimGroups: input.claimGroups, claims }),
  };
}

function evidenceRequirementFromPolicy(policy: VerificationPolicy): EvidenceRequirement {
  return {
    requiredEvidenceTypes: policy.requiredEvidence,
    requiredMethods: policy.requiredMethods,
    requiresCorroboration: policy.requiresCorroboration,
    requiredAuthority: policy.reviewAuthority,
    notes: policy.acceptanceCriteria.join("; "),
  };
}

function deriveTransparencyGaps(input: {
  claim: Claim;
  evidence: Evidence[];
  policy: VerificationPolicy;
  status: TrustStatus;
  now: Date;
}): TransparencyGap[] {
  const transparencyGaps: TransparencyGap[] = [];
  const createdAt = input.now.toISOString();
  const evidenceTypes = new Set(input.evidence.map((item) => item.evidenceType));
  const evidenceMethods = new Set(input.evidence.map((item) => item.method));
  const missingEvidence = input.policy.requiredEvidence.filter((type) => !evidenceTypes.has(type));
  const missingMethods = (input.policy.requiredMethods ?? []).filter((method) => !evidenceMethods.has(method));

  if (missingEvidence.length > 0) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.provenance-gap`,
      claimId: input.claim.id,
      type: "provenance_gap",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: `Missing required evidence: ${missingEvidence.join(", ")}.`,
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (missingMethods.length > 0) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.policy-violation`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: `Missing required verification method: ${missingMethods.join(", ")}.`,
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (input.policy.requiresCorroboration && input.evidence.length < 2) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.corroboration-absent`,
      claimId: input.claim.id,
      type: "corroboration_absent",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: "Policy requires corroboration from at least two evidence records.",
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (input.status === "stale") {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.freshness-breach`,
      claimId: input.claim.id,
      type: "freshness_breach",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: "Claim verification is stale under its verification policy.",
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  for (const item of input.evidence.filter((evidence) => evidence.passing === false)) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.evidence-${item.id}`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: "Evidence explicitly reported a non-passing result.",
      evidenceIds: [item.id],
      policyId: input.policy.id,
      blocking: item.blocking !== false,
      createdAt,
    });
  }

  for (const hint of input.evidence.flatMap((item) => transparencyGapHintsFromEvidence(item, input.policy.id, createdAt))) {
    transparencyGaps.push(hint);
  }

  return transparencyGaps;
}

function transparencyGapHintsFromEvidence(evidence: Evidence, policyId: string, createdAt: string): TransparencyGap[] {
  const hints = evidence.metadata?.transparencyGapHints;
  if (!Array.isArray(hints)) return [];

  return hints
    .filter((hint): hint is Record<string, unknown> => typeof hint === "object" && hint !== null)
    .map((hint, index) => ({
      id: typeof hint.id === "string" ? hint.id : `${evidence.claimId}.gap.hint-${index + 1}`,
      claimId: evidence.claimId,
      type: isTransparencyGapType(hint.type) ? hint.type : "unsupported_inference",
      severity: isImpactLevel(hint.severity) ? hint.severity : "medium",
      message: typeof hint.message === "string" ? hint.message : "Evidence contains a transparency-gap hint.",
      evidenceIds: [evidence.id],
      policyId,
      blocking: typeof hint.blocking === "boolean" ? hint.blocking : true,
      createdAt,
      metadata: {
        source: "evidence.metadata.transparencyGapHints",
      },
    }));
}

function isTransparencyGapType(value: unknown): value is TransparencyGapType {
  return typeof value === "string" && TRANSPARENCY_GAP_TYPES.includes(value as TransparencyGapType);
}

function isImpactLevel(value: unknown): value is TransparencyGap["severity"] {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}

function deriveIncompatibilityTransparencyGaps(input: {
  claims: Array<Claim & { status: TrustStatus }>;
  policyByClaimId: Map<string, VerificationPolicy>;
  canonicalKeyForClaim: (claim: Claim) => string;
  now: Date;
}): TransparencyGap[] {
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
