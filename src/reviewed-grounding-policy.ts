import type { Claim, Evidence } from "./types.js";
import { valueDigest } from "./canonical-digest.js";
import {
  restoreReviewedExtractionEvidence,
  reviewedExtractionStructuralTrust,
  type ReviewedExtractionEvidenceInput,
  type ReviewedExtractionProvenanceGap,
} from "./reviewed-extraction-evidence.js";
import { restoreReviewedExtractionEvidenceBrowser } from "./reviewed-extraction-evidence-browser.js";

export interface ReviewedGroundingPolicy {
  id: string;
  action: string;
  /**
   * The claims the action depends on. Derive this list from the caller's intent
   * (the task's fields or the output schema), independently of the evidence
   * passed to the same call. Building it from that evidence (for example
   * `new Set(evidence.map((item) => item.claimId))`) is circular: a claim that
   * should have reviewed evidence but has none is then never required, so
   * `missing-reviewed-evidence` cannot fire for it. An empty list is refused
   * with a `no-required-claims` gap.
   */
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
  /** A producer-resolved, digest-bound comparison; Surface does not resolve sources itself. */
  observation?: ReviewedExtractionSourceObservation;
}

export interface ReviewedExtractionSourceDigest {
  algorithm: "sha256";
  value: string;
}

export interface ReviewedExtractionSourceCapture {
  snapshotRef: string;
  sourceId: string;
  resourceRef: string;
  capturedAt: string;
  envelopeDigest: ReviewedExtractionSourceDigest;
  contentDigest: ReviewedExtractionSourceDigest;
}

/** Closed, producer-owned fact pair for a rechecked reviewed extraction source. */
export interface ReviewedExtractionSourceObservation {
  version: "surface.reviewed-source-observation/v1";
  owner: { authority: string; observationRef: string };
  expected: ReviewedExtractionSourceCapture;
  observed: ReviewedExtractionSourceCapture;
}

export type ReviewedExtractionSourceObservationErrorCode =
  | "invalid-observation" | "unknown-version" | "invalid-digest"
  | "expected-snapshot-mismatch" | "incompatible-source-identity" | "contradictory-capture";

export class ReviewedExtractionSourceObservationError extends Error {
  constructor(readonly code: ReviewedExtractionSourceObservationErrorCode, message: string) {
    super(message);
    this.name = "ReviewedExtractionSourceObservationError";
  }
}

export type ReviewedGroundingPolicyGap =
  | { kind: "no-required-claims" }
  | { kind: "missing-reviewed-evidence"; claimId: string }
  | { kind: "claims-not-supplied" }
  | { kind: "claim-missing"; claimId: string }
  | { kind: "value-mismatch"; claimId: string; evidenceId: string; claimValueDigest: string; candidateValueDigest: string }
  | { kind: "evidence-not-entailing"; claimId: string; evidenceId: string }
  | { kind: "missing-exact-locator"; claimId: string; evidenceId: string }
  | { kind: "missing-prepared-artifact"; claimId: string; evidenceId: string }
  | { kind: "review-not-accepted"; claimId: string; evidenceId: string; reviewDecisionName?: string }
  | { kind: "structure-not-validated"; claimId: string; evidenceId: string; structuralTrust: string }
  | { kind: "source-not-current"; claimId: string; evidenceId: string; status: "drifted" | "unknown" }
  | { kind: "source-state-incoherent"; claimId: string; evidenceId: string }
  | { kind: "invalid-reviewed-evidence"; claimId: string; evidenceId: string }
  | { kind: "extraction-coverage-incomplete"; claimId: string; evidenceId: string; outcome: "partial" | "failure" | "provider-failure"; reason?: string; providerFailureCount?: number }
  | { kind: "profile-gap"; claimId: string; evidenceId: string; gap: ReviewedExtractionProvenanceGap };

export interface ReviewedGroundingDimension {
  claimId: string;
  evidenceId: string;
  reviewItemName?: string;
  reviewDecisionName?: string;
  /** Producer-reported candidate confidence; omitted when the proposal carries none. */
  candidateConfidence?: number;
  /** `valueDigest` of the reviewed candidate value, for binding a claim value to this evidence. */
  candidateValueDigest: string;
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
  /**
   * The claims whose values the evidence must support. Each required claim must
   * be present (`claim-missing`) and its value must equal the reviewed
   * candidate value by `valueDigest` (`value-mismatch`). A call without a
   * `claims` array cannot bind any value and is refused with `claims-not-supplied`.
   */
  claims: readonly Pick<Claim, "id" | "value">[];
}): ReviewedGroundingPolicyDecision {
  const dimensions: ReviewedGroundingDimension[] = [];
  const gaps: ReviewedGroundingPolicyGap[] = [];
  const sourceStates = new Map<string, ReviewedExtractionSourceState>();
  const conflictingSourceStateIds = new Set<string>();
  for (const state of input.sourceStates ?? []) {
    const previous = sourceStates.get(state.evidenceId);
    if (previous && !sameSourceState(previous, state)) conflictingSourceStateIds.add(state.evidenceId);
    else if (!previous) sourceStates.set(state.evidenceId, state);
  }

  // An empty requirement set says nothing about what the action needs, so it
  // cannot be allowed by default.
  if (input.policy.requiredClaimIds.length === 0) gaps.push({ kind: "no-required-claims" });
  // Untyped callers can still omit `claims`; without them no value is bound, so
  // the decision cannot be allowed.
  const claims = Array.isArray(input.claims) ? input.claims : undefined;
  if (claims === undefined) gaps.push({ kind: "claims-not-supplied" });

  for (const claimId of input.policy.requiredClaimIds) {
    const claim = claims?.find((candidate) => candidate.id === claimId);
    if (claims !== undefined && claim === undefined) gaps.push({ kind: "claim-missing", claimId });
    const candidates = input.evidence.filter((item) => item.claimId === claimId && isReviewedExtractionEvidence(item));
    if (candidates.length === 0) {
      gaps.push({ kind: "missing-reviewed-evidence", claimId });
      continue;
    }
    for (const evidence of candidates) {
      const result = evaluateEvidence(input.policy, claimId, evidence, sourceStates.get(evidence.id), conflictingSourceStateIds.has(evidence.id));
      if (result.dimension) {
        dimensions.push(result.dimension);
        if (claim !== undefined) {
          const claimValueDigest = valueDigest(claim.value);
          if (claimValueDigest !== result.dimension.candidateValueDigest) {
            result.gaps.push({ kind: "value-mismatch", claimId, evidenceId: evidence.id, claimValueDigest, candidateValueDigest: result.dimension.candidateValueDigest });
          }
        }
      }
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

function evaluateEvidence(policy: ReviewedGroundingPolicy, claimId: string, evidence: Evidence, suppliedSourceState?: ReviewedExtractionSourceState, duplicateConflict = false): {
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
  return { dimension, gaps: evaluateEvidenceGaps(policy, evidence, reviewed, dimension, artifactAvailable, !duplicateConflict && sourceStateCoherent(sourceState, expectedSnapshotRef)) };
}

function buildDimension(claimId: string, evidence: Evidence, reviewed: ReviewedExtractionEvidenceInput, sourceState: ReviewedExtractionSourceState, artifactAvailable: boolean): ReviewedGroundingDimension {
  const proposal = reviewed.importRecord.spec.envelope.result.proposals[reviewed.proposalIndex]!;
  const reviewItemName = reviewed.reviewItem?.metadata.name;
  const reviewDecisionName = reviewed.reviewDecision?.metadata.name;
  return {
    claimId, evidenceId: evidence.id,
    ...(reviewItemName ? { reviewItemName } : {}), ...(reviewDecisionName ? { reviewDecisionName } : {}),
    ...(proposal.confidence !== undefined ? { candidateConfidence: proposal.confidence } : {}),
    candidateValueDigest: valueDigest(proposal.candidateValue),
    reviewDisposition: reviewed.reviewDecision?.spec.resolution ?? reviewed.reviewDecision?.spec.status ?? "not-reviewed",
    structuralTrust: reviewedExtractionStructuralTrust(reviewed), typeOrigin: proposal.inferenceType ?? "inferred",
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
  if (policy.requireValidatedStructure && dimension.structuralTrust !== "validated") gaps.push({ kind: "structure-not-validated", ...base, structuralTrust: dimension.structuralTrust });
  if (!coherentSourceState) gaps.push({ kind: "source-state-incoherent", ...base });
  if (policy.requireCurrentSource && dimension.sourceState.status !== "current") gaps.push({ kind: "source-not-current", ...base, status: dimension.sourceState.status });
  const coverage = extractionCoverageGap(reviewed);
  if (coverage) gaps.push({ kind: "extraction-coverage-incomplete", ...base, ...coverage });
  for (const gap of profileGapsFor(evidence)) gaps.push({ kind: "profile-gap", ...base, gap });
  return gaps;
}

/**
 * A partial or partly failed extraction did not read all of the source, so a
 * field in the unread part has no claim at all. This is a fact about the
 * evidence item (not a policy option), derived from the digest-bound envelope.
 */
function extractionCoverageGap(reviewed: ReviewedExtractionEvidenceInput): { outcome: "partial" | "failure" | "provider-failure"; reason?: string; providerFailureCount?: number } | undefined {
  const result = reviewed.importRecord.spec.envelope.result;
  const failures = Array.isArray(result.providerFailures) ? result.providerFailures.length : 0;
  // The profile validator does not constrain `outcome`; an absent or malformed
  // outcome cannot show a complete read, so it is treated as a failure.
  const recorded = isObject(result.outcome) ? result.outcome : undefined;
  const status = recorded?.status;
  // A success outcome is only trusted when the rest of the envelope agrees
  // with it: failures recorded as an array, no partial record, and every
  // coverage range read completely. Anything else is treated as a failure.
  const contradicted = (result.providerFailures !== undefined && !Array.isArray(result.providerFailures))
    || (status === "success" && result.partial !== undefined)
    || coverageIncomplete(result.coverage);
  // Producers before Traverse 2.0.0 wrote a success outcome for a run that
  // lost a chunk (text cut before dispatch, answer at the output cap, no tool
  // call returned) and recorded the loss only as a typed warning. Such a run
  // did not read everything. Accepted gap: producers before Traverse 1.0.0
  // classify truncated output, a missing tool call, and an adapter-level
  // provider notice all as the generic `provider-warning` code, with no other
  // structured field to tell them apart, so that code is not treated as a loss.
  const truncated = status === "success" && truncationWarning(result.warningClassifications);
  if (status === "success" && failures === 0 && !contradicted && !truncated) return undefined;
  const outcome = status === "partial" ? "partial" : status === "success" && !contradicted && failures > 0 ? "provider-failure" : "failure";
  const reason = typeof recorded?.reason === "string" ? recorded.reason : typeof recorded?.code === "string" ? recorded.code : undefined;
  return { outcome, ...(reason !== undefined ? { reason } : {}), ...(failures > 0 ? { providerFailureCount: failures } : {}) };
}

const truncationWarningCodes = new Set(["output-truncated", "content-truncated-at-dispatch", "content-truncated", "missing-tool-call", "chunk-provider-failure"]);

function truncationWarning(warnings: unknown): boolean {
  return Array.isArray(warnings) && warnings.some((entry) => isObject(entry) && typeof entry.code === "string" && truncationWarningCodes.has(entry.code));
}

function coverageIncomplete(coverage: unknown): boolean {
  if (coverage === undefined) return false;
  return !Array.isArray(coverage) || coverage.some((entry) => !isObject(entry) || entry.status !== "complete");
}

function sourceStateCoherent(state: ReviewedExtractionSourceState, expectedSnapshotRef: string): boolean {
  if (state.observation) {
    try {
      const rebuilt = buildReviewedExtractionSourceStateFromRestored(state.evidenceId, expectedSnapshotRef, state.observation, state.observedAt);
      return sameSourceState(rebuilt, state);
    } catch { return false; }
  }
  if (state.expectedSnapshotRef !== expectedSnapshotRef) return false;
  if (state.status === "current") return state.observedSnapshotRef === state.expectedSnapshotRef;
  if (state.status === "drifted") return typeof state.observedSnapshotRef === "string" && state.observedSnapshotRef !== state.expectedSnapshotRef;
  return state.observedSnapshotRef === undefined;
}

/**
 * Builds source state from frozen reviewed evidence and a producer-owned observation.
 * It is intentionally pure: callers must authenticate and resolve captures before use.
 */
export function buildReviewedExtractionSourceState(evidence: Evidence, observation: ReviewedExtractionSourceObservation, observedAt: string): ReviewedExtractionSourceState {
  let reviewed: ReviewedExtractionEvidenceInput;
  try { reviewed = restoreReviewedExtractionEvidence(evidence); }
  catch { throw new ReviewedExtractionSourceObservationError("invalid-observation", "Evidence is not valid reviewed extraction evidence."); }
  const expectedSnapshotRef = reviewed.importRecord.spec.envelope.source.snapshotRef ?? reviewed.importRecord.spec.envelope.source.ref;
  return buildReviewedExtractionSourceStateFromRestored(evidence.id, expectedSnapshotRef, observation, observedAt);
}

/** Builds the only coherent no-comparison state. Callers cannot attach capture
 * facts to an unknown status, which prevents a moved or unavailable owner read
 * from being mistaken for a valid comparison. */
export async function buildUnknownReviewedExtractionSourceState(evidence: Evidence, observedAt: string): Promise<ReviewedExtractionSourceState> {
  let reviewed: ReviewedExtractionEvidenceInput;
  try { const authenticated = await restoreReviewedExtractionEvidenceBrowser(evidence); reviewed = restoreReviewedExtractionEvidence(authenticated); }
  catch { throw new ReviewedExtractionSourceObservationError("invalid-observation", "Evidence is not valid reviewed extraction evidence."); }
  if (!validDate(observedAt)) throw new ReviewedExtractionSourceObservationError("invalid-observation", "Observation check time is invalid.");
  return {
    evidenceId: evidence.id,
    status: "unknown",
    expectedSnapshotRef: reviewed.importRecord.spec.envelope.source.snapshotRef ?? reviewed.importRecord.spec.envelope.source.ref,
    observedAt,
  };
}

function buildReviewedExtractionSourceStateFromRestored(evidenceId: string, expectedSnapshotRef: string, observation: ReviewedExtractionSourceObservation, observedAt: string): ReviewedExtractionSourceState {
  validateObservation(observation, observedAt);
  if (observation.expected.snapshotRef !== expectedSnapshotRef) throw new ReviewedExtractionSourceObservationError("expected-snapshot-mismatch", "Observation expected snapshot does not match frozen reviewed evidence.");
  const { expected, observed } = observation;
  if (expected.sourceId !== observed.sourceId || expected.resourceRef !== observed.resourceRef) {
    throw new ReviewedExtractionSourceObservationError("incompatible-source-identity", "Observation captures resolve different source or resource identities.");
  }
  if (expected.snapshotRef === observed.snapshotRef && (!sameDigest(expected.envelopeDigest, observed.envelopeDigest) || !sameDigest(expected.contentDigest, observed.contentDigest))) {
    throw new ReviewedExtractionSourceObservationError("contradictory-capture", "One capture reference has contradictory digests.");
  }
  if (expected.snapshotRef === observed.snapshotRef && timestampInstant(expected.capturedAt) !== timestampInstant(observed.capturedAt)) {
    throw new ReviewedExtractionSourceObservationError("contradictory-capture", "One capture reference has contradictory capture times.");
  }
  // A raw capture digest says nothing on its own about the extracted field.
  // Producers may attach an explicit value-comparison fact through the legacy
  // source-state input, but this pure capture adapter must leave it unknown.
  const changed = !sameDigest(expected.contentDigest, observed.contentDigest);
  return {
    evidenceId,
    status: changed ? "drifted" : "current",
    expectedSnapshotRef,
    observedSnapshotRef: observed.snapshotRef,
    observedAt,
    observation,
  };
}

function validateObservation(observation: ReviewedExtractionSourceObservation, observedAt: string): void {
  if (!isObject(observation)) throw observationError("invalid-observation", "Observation must be an object.");
  exactObservationKeys(observation, ["version", "owner", "expected", "observed"], "observation");
  if (observation.version !== "surface.reviewed-source-observation/v1") throw observationError("unknown-version", "Observation version is unsupported.");
  if (!isObject(observation.owner)) throw observationError("invalid-observation", "Observation owner is invalid.");
  exactObservationKeys(observation.owner, ["authority", "observationRef"], "observation.owner");
  for (const value of [observation.owner.authority, observation.owner.observationRef]) if (typeof value !== "string" || value.length === 0) throw observationError("invalid-observation", "Observation owner fields must be non-empty strings.");
  if (!validDate(observedAt)) throw observationError("invalid-observation", "Observation check time is invalid.");
  validateCapture(observation.expected, "observation.expected"); validateCapture(observation.observed, "observation.observed");
  const checkTime = timestampInstant(observedAt)!;
  for (const capture of [observation.expected, observation.observed]) {
    if (timestampInstant(capture.capturedAt)! > checkTime) {
      throw observationError("invalid-observation", "Observation capture time cannot be after its check time.");
    }
  }
}

function validateCapture(capture: ReviewedExtractionSourceCapture, label: string): void {
  if (!isObject(capture)) throw observationError("invalid-observation", `${label} is invalid.`);
  exactObservationKeys(capture, ["snapshotRef", "sourceId", "resourceRef", "capturedAt", "envelopeDigest", "contentDigest"], label);
  for (const value of [capture.snapshotRef, capture.sourceId, capture.resourceRef]) if (typeof value !== "string" || value.length === 0) throw observationError("invalid-observation", `${label} references must be non-empty strings.`);
  if (!validDate(capture.capturedAt)) throw observationError("invalid-observation", `${label}.capturedAt is invalid.`);
  validateDigest(capture.envelopeDigest, `${label}.envelopeDigest`); validateDigest(capture.contentDigest, `${label}.contentDigest`);
}

function validateDigest(digest: ReviewedExtractionSourceDigest, label: string): void {
  if (!isObject(digest) || Object.keys(digest).length !== 2 || !("algorithm" in digest) || !("value" in digest) || digest.algorithm !== "sha256" || typeof digest.value !== "string" || !/^[a-f0-9]{64}$/.test(digest.value)) throw observationError("invalid-digest", `${label} must be a lowercase SHA-256 digest.`);
}
function observationError(code: ReviewedExtractionSourceObservationErrorCode, message: string): ReviewedExtractionSourceObservationError { return new ReviewedExtractionSourceObservationError(code, message); }
function exactObservationKeys(value: object, keys: string[], label: string): void { if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) throw observationError("invalid-observation", `${label} has unsupported or missing fields.`); }
function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function validDate(value: unknown): boolean { return timestampInstant(value) !== undefined; }
function timestampInstant(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : undefined;
}
function sameDigest(left: ReviewedExtractionSourceDigest, right: ReviewedExtractionSourceDigest): boolean { return left.algorithm === right.algorithm && left.value === right.value; }
function sameSourceState(left: ReviewedExtractionSourceState, right: ReviewedExtractionSourceState): boolean { return deepStructuralEqual(left, right); }

/** Browser-safe, order-independent equality for closed policy facts. */
function deepStructuralEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length && left.every((value, index) => deepStructuralEqual(value, right[index]));
  }
  if (typeof left !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && deepStructuralEqual(leftRecord[key], rightRecord[key]));
}

function isReviewedExtractionEvidence(evidence: Evidence): boolean {
  const metadata = evidence.metadata?.reviewedExtraction;
  return metadata !== null && typeof metadata === "object" && !Array.isArray(metadata);
}

function profileGapsFor(evidence: Evidence): ReviewedExtractionProvenanceGap[] {
  const metadata = evidence.metadata?.reviewedExtraction as { gaps?: unknown } | undefined;
  return Array.isArray(metadata?.gaps) ? metadata.gaps as ReviewedExtractionProvenanceGap[] : [];
}
