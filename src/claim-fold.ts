import type {
  Claim,
  ClaimFreshness,
  Evidence,
  EvidenceRequirement,
  TransparencyGap,
  TransparencyGapType,
  TrustStatus,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";
import { partitionEvidenceBySupport } from "./evidence-support.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import { claimIntrinsicExpiry, deriveTrustStatus, reapplyVerifiedFreshness } from "./status.js";

const TRANSPARENCY_GAP_TYPES: TransparencyGapType[] = [
  "contradiction",
  "provenance_gap",
  "policy_violation",
  "freshness_breach",
  "corroboration_absent",
  "unsupported_inference",
];

export interface ClaimFoldInput {
  claim: Claim;
  evidence: Evidence[];
  policies: VerificationPolicy[];
  events: VerificationEvent[];
  allEvents: VerificationEvent[];
  authorityTrace?: import("./types.js").AuthorityTrace[];
  now: Date;
  checkpointStatus?: TrustStatus;
  checkpointUsable: boolean;
  checkpointSeenClaim: boolean;
  checkpointMark?: number;
}

export interface ClaimFoldResult {
  claim: Claim;
  ownStatus: TrustStatus;
  producerStatus?: TrustStatus;
  policy?: VerificationPolicy;
  evidence: Evidence[];
  entailingEvidence: Evidence[];
  evidenceRequirement?: EvidenceRequirement;
  transparencyGaps: TransparencyGap[];
  eventsFolded: number;
  eventsTotal: number;
  fromCheckpoint: boolean;
  freshnessForStatus(status: TrustStatus): ClaimFreshness;
}

export function foldClaim(input: ClaimFoldInput): ClaimFoldResult {
  const { entailingEvidence } = partitionEvidenceBySupport(input.evidence);
  const policy = resolvePolicyForClaim(input.claim, input.policies);
  const checkpointMark = input.checkpointMark;
  const tailEvents = !input.checkpointUsable || checkpointMark === undefined
    ? input.events
    : input.events.filter((event) => Date.parse(event.createdAt) > checkpointMark);
  const canShortCircuit =
    input.checkpointUsable &&
    input.checkpointSeenClaim &&
    tailEvents.length === 0 &&
    input.checkpointStatus !== undefined;

  let ownStatus: TrustStatus;
  let eventsFolded: number;
  if (canShortCircuit) {
    ownStatus = reapplyVerifiedFreshness({
      priorStatus: input.checkpointStatus as TrustStatus,
      claim: input.claim,
      evidence: entailingEvidence,
      events: input.events,
      policy,
      now: input.now,
    });
    eventsFolded = 0;
  } else {
    ownStatus = deriveTrustStatus({
      claim: input.claim,
      evidence: entailingEvidence,
      policy,
      events: input.events,
      now: input.now,
      authorityTrace: input.authorityTrace,
    });
    eventsFolded = input.events.length;
  }

  return {
    claim: input.claim,
    ownStatus,
    producerStatus: input.claim.status,
    policy,
    evidence: input.evidence,
    entailingEvidence,
    evidenceRequirement: policy ? evidenceRequirementFromPolicy(policy) : undefined,
    transparencyGaps: policy
      ? deriveTransparencyGaps({ claim: input.claim, evidence: input.evidence, entailingEvidence, policy, status: ownStatus, now: input.now })
      : input.evidence.length === 0 ? [noPolicyEvidenceGap(input.claim, input.now)] : [],
    eventsFolded,
    eventsTotal: input.events.length,
    fromCheckpoint: canShortCircuit,
    freshnessForStatus: (status) => freshnessForClaim(input.claim, input.allEvents, status, input.now),
  };
}

function governingVerifiedEvent(claimId: string, events: VerificationEvent[]): VerificationEvent | undefined {
  return events
    .filter((event) => event.claimId === claimId && event.status === "verified")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function freshnessForClaim(claim: Claim, events: VerificationEvent[], status: TrustStatus, now: Date): ClaimFreshness {
  const governing = governingVerifiedEvent(claim.id, events);
  const intrinsic = claimIntrinsicExpiry(governing, claim);
  const freshness: ClaimFreshness = {
    asOf: now.toISOString(),
    stale: status === "stale",
  };
  if (intrinsic !== undefined) {
    freshness.expiresAt = new Date(intrinsic).toISOString();
  }
  return freshness;
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

function noPolicyEvidenceGap(claim: Claim, now: Date): TransparencyGap {
  return {
    id: `${claim.id}.gap.provenance-gap`,
    claimId: claim.id,
    type: "provenance_gap",
    severity: claim.impactLevel ?? "medium",
    ...materialityFromClaim(claim),
    message: `Claim ${claim.id} has no evidence and no verification policy.`,
    blocking: true,
    createdAt: now.toISOString(),
  };
}

function deriveTransparencyGaps(input: {
  claim: Claim;
  evidence: Evidence[];
  entailingEvidence: Evidence[];
  policy: VerificationPolicy;
  status: TrustStatus;
  now: Date;
}): TransparencyGap[] {
  const transparencyGaps: TransparencyGap[] = [];
  const createdAt = input.now.toISOString();
  const evidenceTypes = new Set(input.entailingEvidence.map((item) => item.evidenceType));
  const evidenceMethods = new Set(input.entailingEvidence.map((item) => item.method));
  const missingEvidence = input.policy.requiredEvidence.filter((type) => !evidenceTypes.has(type));
  const missingMethods = (input.policy.requiredMethods ?? []).filter((method) => !evidenceMethods.has(method));
  const citedEvidenceIds = input.evidence
    .filter((item) => !input.entailingEvidence.some((entailing) => entailing.id === item.id))
    .map((item) => item.id);

  if (missingEvidence.length > 0) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.provenance-gap`,
      claimId: input.claim.id,
      type: "provenance_gap",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
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
      ...materialityFromClaim(input.claim),
      message: `Missing required verification method: ${missingMethods.join(", ")}.`,
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (input.policy.requiresCorroboration && input.entailingEvidence.length < 2) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.corroboration-absent`,
      claimId: input.claim.id,
      type: "corroboration_absent",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: "Policy requires corroboration from at least two evidence records.",
      evidenceIds: input.entailingEvidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (
    input.evidence.length > 0 &&
    citedEvidenceIds.length > 0 &&
    (missingEvidence.length > 0 || missingMethods.length > 0 || (input.policy.requiresCorroboration && input.entailingEvidence.length < 2))
  ) {
    const hasProducerUnsupportedInferenceHint = input.evidence.some((item) => {
      const hints = item.metadata?.transparencyGapHints;
      return Array.isArray(hints) && hints.some((hint) => (
        typeof hint === "object" &&
        hint !== null &&
        "type" in hint &&
        hint.type === "unsupported_inference"
      ));
    });

    if (!hasProducerUnsupportedInferenceHint) {
      transparencyGaps.push({
        id: `${input.claim.id}.gap.unsupported-inference`,
        claimId: input.claim.id,
        type: "unsupported_inference",
        severity: input.claim.impactLevel ?? input.policy.impactLevel,
        ...materialityFromClaim(input.claim),
        message: "Linked evidence cites or references the claim but does not entail enough support under policy.",
        evidenceIds: citedEvidenceIds,
        policyId: input.policy.id,
        blocking: true,
        createdAt,
      });
    }
  }

  if (input.status === "stale") {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.freshness-breach`,
      claimId: input.claim.id,
      type: "freshness_breach",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: "Claim verification is stale under its verification policy.",
      evidenceIds: input.entailingEvidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  for (const item of input.entailingEvidence.filter((evidence) => evidence.passing === false)) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.evidence-${item.id}`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: "Evidence explicitly reported a non-passing result.",
      evidenceIds: [item.id],
      policyId: input.policy.id,
      blocking: item.blocking !== false,
      createdAt,
    });
  }

  for (const hint of input.evidence.flatMap((item) => transparencyGapHintsFromEvidence(item, input.claim, input.policy.id, createdAt))) {
    transparencyGaps.push(hint);
  }

  return transparencyGaps;
}

function transparencyGapHintsFromEvidence(evidence: Evidence, claim: Claim, policyId: string, createdAt: string): TransparencyGap[] {
  const hints = evidence.metadata?.transparencyGapHints;
  if (!Array.isArray(hints)) return [];

  return hints
    .filter((hint): hint is Record<string, unknown> => typeof hint === "object" && hint !== null)
    .map((hint, index) => ({
      id: typeof hint.id === "string" ? hint.id : `${evidence.claimId}.gap.hint-${index + 1}`,
      claimId: evidence.claimId,
      type: isTransparencyGapType(hint.type) ? hint.type : "unsupported_inference",
      severity: isImpactLevel(hint.severity) ? hint.severity : "medium",
      ...materialityFromClaim(claim),
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

function materialityFromClaim(claim: Claim): Pick<TransparencyGap, "materiality"> | Record<string, never> {
  return claim.materiality === undefined ? {} : { materiality: claim.materiality };
}
