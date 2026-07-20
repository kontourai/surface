import type { Evidence } from "./types.js";
import {
  restoreReviewedExtractionEvidence,
  type ReviewedExtractionEvidenceInput,
  type ReviewedExtractionProvenanceGap,
} from "./reviewed-extraction-evidence.js";

export interface ReviewedGroundingPolicy {
  id: string;
  action: string;
  requiredClaimIds: string[];
  requireExactLocator?: boolean;
  requirePreparedArtifact?: boolean;
  requireAcceptedReview?: boolean;
  requireValidatedStructure?: boolean;
  requireCurrentSource?: boolean;
}

export interface ReviewedExtractionSourceState {
  evidenceId: string;
  status: "current" | "drifted" | "unknown";
  expectedSnapshotRef: string;
  observedSnapshotRef?: string;
  observedAt: string;
  extractedValueChanged?: boolean;
}

export type ReviewedGroundingPolicyGap =
  | { kind: "missing-reviewed-evidence"; claimId: string }
  | { kind: "evidence-not-entailing"; claimId: string; evidenceId: string }
  | { kind: "missing-exact-locator"; claimId: string; evidenceId: string }
  | { kind: "missing-prepared-artifact"; claimId: string; evidenceId: string }
  | { kind: "review-not-accepted"; claimId: string; evidenceId: string; reviewDecisionName?: string }
  | { kind: "structure-not-validated"; claimId: string; evidenceId: string; structuralTrust: string }
  | { kind: "source-not-current"; claimId: string; evidenceId: string; status: "drifted" | "unknown" }
  | { kind: "source-state-incoherent"; claimId: string; evidenceId: string }
  | { kind: "invalid-reviewed-evidence"; claimId: string; evidenceId: string }
  | { kind: "profile-gap"; claimId: string; evidenceId: string; gap: ReviewedExtractionProvenanceGap };

export interface ReviewedGroundingDimension {
  claimId: string;
  evidenceId: string;
  reviewItemName?: string;
  reviewDecisionName?: string;
  candidateConfidence: number;
  reviewDisposition: string;
  structuralTrust: ReviewedExtractionEvidenceInput["structuralTrust"];
  typeOrigin: "explicit" | "inferred";
  exactLocator?: string;
  preparedArtifact: { status: "available" | "missing" | "unavailable"; integrityRef?: string };
  sourceState: ReviewedExtractionSourceState;
}

export interface ReviewedGroundingPolicyDecision {
  policyId: string;
  action: string;
  outcome: "allowed" | "refused";
  evaluatedClaimIds: string[];
  evidenceIds: string[];
  reviewItemNames: string[];
  reviewDecisionNames: string[];
  dimensions: ReviewedGroundingDimension[];
  gaps: ReviewedGroundingPolicyGap[];
}

export function evaluateReviewedGroundingPolicy(input: {
  policy: ReviewedGroundingPolicy;
  evidence: readonly Evidence[];
  sourceStates?: readonly ReviewedExtractionSourceState[];
}): ReviewedGroundingPolicyDecision {
  const dimensions: ReviewedGroundingDimension[] = [];
  const gaps: ReviewedGroundingPolicyGap[] = [];
  const sourceStates = new Map((input.sourceStates ?? []).map((state) => [state.evidenceId, state]));

  for (const claimId of input.policy.requiredClaimIds) {
    const candidates = input.evidence.filter((item) => item.claimId === claimId && isReviewedExtractionEvidence(item));
    if (candidates.length === 0) {
      gaps.push({ kind: "missing-reviewed-evidence", claimId });
      continue;
    }
    for (const evidence of candidates) {
      const result = evaluateEvidence(input.policy, claimId, evidence, sourceStates.get(evidence.id));
      if (result.dimension) dimensions.push(result.dimension);
      gaps.push(...result.gaps);
    }
  }

  return {
    policyId: input.policy.id,
    action: input.policy.action,
    outcome: gaps.length === 0 ? "allowed" : "refused",
    evaluatedClaimIds: [...input.policy.requiredClaimIds],
    evidenceIds: dimensions.map((item) => item.evidenceId),
    reviewItemNames: dimensions.flatMap((item) => item.reviewItemName ? [item.reviewItemName] : []),
    reviewDecisionNames: dimensions.flatMap((item) => item.reviewDecisionName ? [item.reviewDecisionName] : []),
    dimensions,
    gaps,
  };
}

function evaluateEvidence(policy: ReviewedGroundingPolicy, claimId: string, evidence: Evidence, suppliedSourceState?: ReviewedExtractionSourceState): {
  dimension?: ReviewedGroundingDimension;
  gaps: ReviewedGroundingPolicyGap[];
} {
  let reviewed: ReviewedExtractionEvidenceInput;
  try { reviewed = restoreReviewedExtractionEvidence(evidence); }
  catch { return { gaps: [{ kind: "invalid-reviewed-evidence", claimId, evidenceId: evidence.id }] }; }
  const proposal = reviewed.importRecord.spec.envelope.result.proposals[reviewed.proposalIndex]!;
  const artifact = reviewed.importRecord.spec.envelope.result.preparedArtifact;
  const artifactState = reviewed.importRecord.spec.envelope.result.preparedArtifactState;
  const artifactAvailable = artifact !== undefined && (artifactState === undefined || artifactState.status === "available");
  const expectedSnapshotRef = reviewed.importRecord.spec.envelope.source.snapshotRef ?? reviewed.importRecord.spec.envelope.source.ref;
  const sourceState = suppliedSourceState ?? { evidenceId: evidence.id, status: "unknown", expectedSnapshotRef, observedAt: evidence.observedAt };
  const dimension = buildDimension(claimId, evidence, reviewed, sourceState, artifactAvailable);
  return { dimension, gaps: evaluateEvidenceGaps(policy, evidence, reviewed, dimension, artifactAvailable, sourceStateCoherent(sourceState, expectedSnapshotRef)) };
}

function buildDimension(claimId: string, evidence: Evidence, reviewed: ReviewedExtractionEvidenceInput, sourceState: ReviewedExtractionSourceState, artifactAvailable: boolean): ReviewedGroundingDimension {
  const proposal = reviewed.importRecord.spec.envelope.result.proposals[reviewed.proposalIndex]!;
  const reviewItemName = reviewed.reviewItem?.metadata.name;
  const reviewDecisionName = reviewed.reviewDecision?.metadata.name;
  return {
    claimId, evidenceId: evidence.id,
    ...(reviewItemName ? { reviewItemName } : {}), ...(reviewDecisionName ? { reviewDecisionName } : {}),
    candidateConfidence: proposal.confidence,
    reviewDisposition: reviewed.reviewDecision?.spec.resolution ?? reviewed.reviewDecision?.spec.status ?? "not-reviewed",
    structuralTrust: reviewed.structuralTrust, typeOrigin: proposal.inferenceType ?? "inferred",
    ...(evidence.sourceLocator ? { exactLocator: evidence.sourceLocator } : {}),
    preparedArtifact: artifactAvailable
      ? { status: "available", ...(evidence.integrityRef ? { integrityRef: evidence.integrityRef } : {}) }
      : { status: reviewed.importRecord.spec.envelope.result.preparedArtifact ? "unavailable" : "missing" },
    sourceState,
  };
}

function evaluateEvidenceGaps(policy: ReviewedGroundingPolicy, evidence: Evidence, reviewed: ReviewedExtractionEvidenceInput, dimension: ReviewedGroundingDimension, artifactAvailable: boolean, coherentSourceState: boolean): ReviewedGroundingPolicyGap[] {
  const gaps: ReviewedGroundingPolicyGap[] = [];
  const base = { claimId: dimension.claimId, evidenceId: evidence.id };
  const accepted = reviewed.reviewDecision?.spec.status === "verified" && (reviewed.reviewDecision.spec.resolution === undefined || reviewed.reviewDecision.spec.resolution === "accepted");
  if (evidence.supportStrength !== "entails" || evidence.passing !== true || evidence.blocking !== false) gaps.push({ kind: "evidence-not-entailing", ...base });
  if (policy.requireExactLocator && !evidence.sourceLocator) gaps.push({ kind: "missing-exact-locator", ...base });
  if (policy.requirePreparedArtifact && (!artifactAvailable || !evidence.integrityRef)) gaps.push({ kind: "missing-prepared-artifact", ...base });
  if (policy.requireAcceptedReview && !accepted) gaps.push({ kind: "review-not-accepted", ...base, ...(dimension.reviewDecisionName ? { reviewDecisionName: dimension.reviewDecisionName } : {}) });
  if (policy.requireValidatedStructure && reviewed.structuralTrust !== "validated") gaps.push({ kind: "structure-not-validated", ...base, structuralTrust: reviewed.structuralTrust });
  if (!coherentSourceState) gaps.push({ kind: "source-state-incoherent", ...base });
  if (policy.requireCurrentSource && dimension.sourceState.status !== "current") gaps.push({ kind: "source-not-current", ...base, status: dimension.sourceState.status });
  for (const gap of profileGapsFor(evidence)) gaps.push({ kind: "profile-gap", ...base, gap });
  return gaps;
}

function sourceStateCoherent(state: ReviewedExtractionSourceState, expectedSnapshotRef: string): boolean {
  if (state.expectedSnapshotRef !== expectedSnapshotRef) return false;
  if (state.status === "current") return state.observedSnapshotRef === state.expectedSnapshotRef;
  if (state.status === "drifted") return typeof state.observedSnapshotRef === "string" && state.observedSnapshotRef !== state.expectedSnapshotRef;
  return state.observedSnapshotRef === undefined;
}

function isReviewedExtractionEvidence(evidence: Evidence): boolean {
  const metadata = evidence.metadata?.reviewedExtraction;
  return metadata !== null && typeof metadata === "object" && !Array.isArray(metadata);
}

function profileGapsFor(evidence: Evidence): ReviewedExtractionProvenanceGap[] {
  const metadata = evidence.metadata?.reviewedExtraction as { gaps?: unknown } | undefined;
  return Array.isArray(metadata?.gaps) ? metadata.gaps as ReviewedExtractionProvenanceGap[] : [];
}
