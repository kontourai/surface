import type { Evidence } from "../types.js";
import { restoreReviewedExtractionEvidenceBrowser } from "../reviewed-extraction-evidence-browser.js";
import { buildReviewedExtractionSourceState, type ReviewedExtractionSourceState } from "../reviewed-grounding-policy.js";
import type { AnswerAssessmentProjection, BasisContributionV2, BasisGap, FieldworkReviewedSourceRef, ReviewedSourceBasisAssociationV1, ReviewedSourceBasisContext, ThreadAnswerRef } from "./types.js";
import { ReviewedSourceBasisBuildError } from "./types.js";

export interface BuildReviewedSourceBasisContributionInput {
  answer: ThreadAnswerRef;
  ref: FieldworkReviewedSourceRef;
  evidence: Evidence;
  sourceState: ReviewedExtractionSourceState;
  association: ReviewedSourceBasisAssociationV1;
  assessment: { revision: number; value: AnswerAssessmentProjection };
}

/** Pure semantic bridge from authenticated reviewed evidence to a bounded Basis
 * source item. It has no Fieldwork, filesystem, network, owner-read, or policy
 * promotion capability. */
export async function buildReviewedSourceBasisContribution(input: BuildReviewedSourceBasisContributionInput): Promise<BasisContributionV2<FieldworkReviewedSourceRef>> {
  let evidence: Evidence;
  try { evidence = await restoreReviewedExtractionEvidenceBrowser(input.evidence); }
  catch { throw fail("invalid-reviewed-evidence"); }
  const { ref, association, sourceState, assessment } = input;
  if (!exactRef(ref)) throw fail("owner-ref-mismatch");
  if (!exactAssociation(association)) throw fail("source-claim-mismatch");
  if (evidence.id !== ref.evidenceId || evidence.id !== association.sourceEvidenceId || evidence.id !== sourceState.evidenceId) throw fail("source-evidence-mismatch");
  if (evidence.claimId !== association.sourceClaimId) throw fail("source-claim-mismatch");
  if (!positive(assessment.revision) || !positive(association.assessmentRevision) || assessment.revision !== association.assessmentRevision) throw fail("assessment-revision-mismatch");
  const answerAssessment = assessment.value;
  if (!answerAssessment.found || !answerAssessment.claim || answerAssessment.claim.id !== association.answerClaimId || answerAssessment.ref.claimId !== association.answerClaimId) throw fail("answer-claim-mismatch");
  const direct = answerAssessment.derivation.directInputs.filter((item) => item.claimId === association.sourceClaimId);
  if (direct.length !== 1) throw fail("source-claim-mismatch");
  const citations = answerAssessment.evidence.cited.filter((item) => item.id === association.answerCitationEvidenceId);
  const citation = citations[0];
  if (citations.length !== 1 || !citation || citation.id === evidence.id || citation.result === "failed" || citation.blocksClaim || citation.supportStrength !== "cited" || citation.sourceRef !== evidence.sourceRef || citation.locator !== (evidence.sourceLocator ?? null)) throw fail("answer-citation-mismatch");
  const state = sourceFacts(evidence, sourceState);
  if (!state) throw fail("source-state-incoherent");
  const reviewed = evidence.metadata?.reviewedExtraction as { input?: { reviewDecision?: { spec?: { status?: string; resolution?: string; reviewedAt?: string } }; structuralTrust?: string }; gaps?: unknown[] } | undefined;
  const decision = reviewed?.input?.reviewDecision?.spec;
  const accepted = decision?.status === "verified" && (decision.resolution === undefined || decision.resolution === "accepted");
  const review = !decision ? "not-captured" : accepted ? "accepted" : "not-accepted";
  const context: ReviewedSourceBasisContext = {
    kind: "reviewed-source", sourceClaimId: association.sourceClaimId, sourceEvidenceId: evidence.id,
    answerClaimId: association.answerClaimId, answerCitationEvidenceId: citation.id, assessmentRevision: assessment.revision,
    review, reviewedAt: accepted && validTime(decision.reviewedAt) ? decision.reviewedAt : null,
    currentness: state.currentness, checkedAt: state.checkedAt, expectedCapture: state.expectedCapture, observedCapture: state.observedCapture,
  };
  const gaps: BasisGap[] = [];
  if (review === "not-accepted") gaps.push(gap("reviewed-source-review-not-accepted"));
  if (review === "not-captured") gaps.push(gap("reviewed-source-review-not-captured"));
  if (state.currentness === "unknown") gaps.push(gap(state.comparisonUnavailable ? "reviewed-source-capture-comparison-unavailable" : "reviewed-source-currentness-unknown"));
  if (state.currentness === "drifted") gaps.push(gap("reviewed-source-drifted"));
  if (direct[0]!.status !== "verified") gaps.push(gap("reviewed-source-claim-not-verified"));
  return { ref: { ...ref }, answer: { ...input.answer }, role: "source", context, gaps };
}

function sourceFacts(evidence: Evidence, state: ReviewedExtractionSourceState): { currentness: "current" | "drifted" | "unknown"; checkedAt: string; expectedCapture: ReviewedSourceBasisContext["expectedCapture"]; observedCapture: ReviewedSourceBasisContext["observedCapture"]; comparisonUnavailable: boolean } | null {
  if (!validTime(state.observedAt)) return null;
  const expectedSnapshot = ((evidence.metadata?.reviewedExtraction as { input?: { importRecord?: { spec?: { envelope?: { source?: { snapshotRef?: string; ref?: string } } } } } })?.input?.importRecord?.spec?.envelope?.source);
  const expectedRef = expectedSnapshot?.snapshotRef ?? expectedSnapshot?.ref;
  if (typeof expectedRef !== "string" || state.expectedSnapshotRef !== expectedRef) return null;
  if (!state.observation) return state.status === "unknown" && state.observedSnapshotRef === undefined ? { currentness: "unknown", checkedAt: state.observedAt, expectedCapture: null, observedCapture: null, comparisonUnavailable: true } : null;
  const observation = state.observation;
  const expected = observation.expected; const observed = observation.observed;
  if (!exactKeys(observation, ["version", "owner", "expected", "observed"]) || observation.version !== "surface.reviewed-source-observation/v1" || !exactKeys(observation.owner, ["authority", "observationRef"]) || observation.owner.authority !== "fieldwork-source-check-receipt/v2" || !nonEmpty(observation.owner.observationRef) || observation.expected.snapshotRef !== expectedRef || !validCapture(expected) || !validCapture(observed) || expected.sourceId !== observed.sourceId || expected.resourceRef !== observed.resourceRef || Date.parse(expected.capturedAt) > Date.parse(state.observedAt) || Date.parse(observed.capturedAt) > Date.parse(state.observedAt)) return null;
  try { const rebuilt = buildReviewedExtractionSourceState(evidence, observation, state.observedAt); if (!sameStructure(rebuilt, state)) return null; } catch { return null; }
  const currentness = expected.contentDigest.value === observed.contentDigest.value ? "current" : "drifted";
  if (state.status !== currentness || state.observedSnapshotRef !== observed.snapshotRef) return null;
  return { currentness, checkedAt: state.observedAt, expectedCapture: { capturedAt: expected.capturedAt, contentDigest: expected.contentDigest.value }, observedCapture: { capturedAt: observed.capturedAt, contentDigest: observed.contentDigest.value }, comparisonUnavailable: false };
}
function validCapture(capture: { snapshotRef: string; sourceId: string; resourceRef: string; capturedAt: string; contentDigest: { algorithm: string; value: string }; envelopeDigest: { algorithm: string; value: string } }): boolean { return exactKeys(capture, ["snapshotRef", "sourceId", "resourceRef", "capturedAt", "envelopeDigest", "contentDigest"]) && nonEmpty(capture.snapshotRef) && nonEmpty(capture.sourceId) && nonEmpty(capture.resourceRef) && validTime(capture.capturedAt) && exactKeys(capture.contentDigest, ["algorithm", "value"]) && exactKeys(capture.envelopeDigest, ["algorithm", "value"]) && capture.contentDigest.algorithm === "sha256" && capture.envelopeDigest.algorithm === "sha256" && /^[a-f0-9]{64}$/.test(capture.contentDigest.value) && /^[a-f0-9]{64}$/.test(capture.envelopeDigest.value); }
function exactRef(value: FieldworkReviewedSourceRef): boolean { return Object.keys(value).length === 5 && value.authority === "@kontourai/fieldwork" && value.schemaVersion === "fieldwork.kontourai.io/v1" && value.kind === "reviewed-web-source" && /^fieldwork-reviewed-source:v1:[a-f0-9]{64}$/.test(value.exactRef) && nonEmpty(value.evidenceId); }
function exactAssociation(value: ReviewedSourceBasisAssociationV1): boolean { return exactKeys(value, ["version", "sourceClaimId", "sourceEvidenceId", "answerClaimId", "answerCitationEvidenceId", "assessmentRevision"]) && value.version === "surface.reviewed-source-basis-association/v1" && nonEmpty(value.sourceClaimId) && nonEmpty(value.sourceEvidenceId) && nonEmpty(value.answerClaimId) && nonEmpty(value.answerCitationEvidenceId) && positive(value.assessmentRevision); }
function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function sameStructure(left: unknown, right: unknown): boolean { if (Object.is(left, right)) return true; if (typeof left !== typeof right || left === null || right === null) return false; if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameStructure(item, right[index])); if (typeof left !== "object") return false; const l = left as Record<string, unknown>; const r = right as Record<string, unknown>; const keys = Object.keys(l).sort(); const other = Object.keys(r).sort(); return keys.length === other.length && keys.every((key, index) => key === other[index] && sameStructure(l[key], r[key])); }
function validTime(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function fail(code: ConstructorParameters<typeof ReviewedSourceBasisBuildError>[0]): ReviewedSourceBasisBuildError { return new ReviewedSourceBasisBuildError(code); }
function gap(code: string): BasisGap { return { code, message: "Reviewed source context is incomplete or requires attention." }; }
