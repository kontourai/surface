import { derivationInputsForClaim } from "../derivation.js";
import { isStandingCounterevidence, partitionEvidenceBySupport } from "../evidence-support.js";
import type { Evidence, TrustReport } from "../types.js";
import { SURFACE_ANSWER_ASSESSMENT_VERSION, SURFACE_BASIS_VERSION, type AnswerAssessmentProjection, type BasisAssessmentEvidence, type SurfacePolicyOutcome } from "./types.js";
import { isBasisInertDisplayScalar, isBasisOpaqueRefScalar, isBasisRestrictedContractScalar, parseSurfacePolicyOutcome } from "./validation.js";

/** Surface-owned seam for the only policy object that can affect Basis standing. */
export function createSurfacePolicyOutcome(id: unknown, outcome: unknown): SurfacePolicyOutcome {
  const policy = parseSurfacePolicyOutcome({ id, outcome, satisfied: outcome === "satisfied" });
  if (!policy) throw new TypeError("Surface policy outcome requires a bounded, well-formed opaque id and a known outcome.");
  return policy;
}

/**
 * Projects report facts for one claim.  This never derives a claim status and
 * never interprets owner workflow output as policy evidence.
 */
export function buildAnswerAssessmentProjection(report: TrustReport, claimId: string): AnswerAssessmentProjection {
  const bundle = { id: report.id, schemaVersion: report.schemaVersion, source: report.source, generatedAt: report.generatedAt };
  const claim = report.claims.find((candidate) => candidate.id === claimId);
  assertBuildScalars(bundle, claimId);
  if (!claim) return emptyAssessment(bundle, claimId);

  const evidence = report.evidence.filter((candidate) => candidate.claimId === claimId);
  const partitioned = partitionEvidenceBySupport(evidence);
  // Evidence coverage is not a policy verdict.  Surface currently has no
  // owner policy-evaluation outcome in TrustReport, so this builder must never
  // promote coverage to satisfied/not-satisfied.  The projection shape reserves
  // that explicit result for a future Surface evaluator.
  const policy = null;

  const projection: AnswerAssessmentProjection = {
    version: SURFACE_BASIS_VERSION,
    ref: { authority: "@kontourai/surface", schemaVersion: SURFACE_ANSWER_ASSESSMENT_VERSION, kind: "answer-assessment", bundleId: report.id, claimId },
    found: true,
    bundle,
    claim: {
      id: claim.id,
      subject: { subjectType: claim.subjectType, subjectId: claim.subjectId },
      status: claim.status,
      freshness: claim.freshness ? { asOf: claim.freshness.asOf, expiresAt: claim.freshness.expiresAt ?? null, stale: claim.freshness.stale } : null,
    },
    policy,
    evidence: {
      cited: partitioned.citedEvidence.map(projectEvidence),
      entails: partitioned.entailingEvidence.map(projectEvidence),
      counterevidence: evidence.filter(isStandingCounterevidence).map(projectEvidence),
    },
    derivation: projectDerivation(report, claim),
    gaps: report.transparencyGaps.filter((gap) => gap.claimId === claimId).map((gap) => ({ code: gap.type, message: gap.message })),
  };
  assertProjectionScalars(projection);
  return projection;
}

function projectEvidence(evidence: Evidence): BasisAssessmentEvidence {
  return { id: evidence.id, label: evidence.excerptOrSummary, sourceRef: evidence.sourceRef, observedAt: evidence.observedAt };
}

function projectDerivation(report: TrustReport, claim: TrustReport["claims"][number]): AnswerAssessmentProjection["derivation"] {
  try {
    const claims = new Map(report.claims.map((candidate) => [candidate.id, candidate]));
    return {
      available: true,
      directInputs: derivationInputsForClaim(claim).map((input) => ({ claimId: input.inputClaimId, status: claims.get(input.inputClaimId)?.status ?? null })),
    };
  } catch {
    return { available: false, directInputs: [] };
  }
}

function emptyAssessment(bundle: AnswerAssessmentProjection["bundle"], claimId: string): AnswerAssessmentProjection {
  return {
    version: SURFACE_BASIS_VERSION, ref: { authority: "@kontourai/surface", schemaVersion: SURFACE_ANSWER_ASSESSMENT_VERSION, kind: "answer-assessment", bundleId: bundle.id, claimId }, found: false, bundle, claim: null, policy: null,
    evidence: { cited: [], entails: [], counterevidence: [] }, derivation: { available: false, directInputs: [] }, gaps: [],
  };
}

function assertBuildScalars(bundle: AnswerAssessmentProjection["bundle"], claimId: string): void {
  if (!isBasisRestrictedContractScalar(bundle.id) || !isBasisInertDisplayScalar(bundle.source) || !isBasisRestrictedContractScalar(claimId)) throw new TypeError("Surface report values cannot be represented safely in the bounded Basis projection.");
}

function assertProjectionScalars(projection: AnswerAssessmentProjection): void {
  const evidence = [...projection.evidence.cited, ...projection.evidence.entails, ...projection.evidence.counterevidence];
  const display = [projection.bundle.source, projection.claim?.status, projection.claim?.subject.subjectType, ...evidence.map((item) => item.label), ...projection.derivation.directInputs.flatMap((item) => item.status === null ? [] : [item.status]), ...projection.gaps.map((gap) => gap.message)];
  const opaque = evidence.map((item) => item.sourceRef);
  const restricted = [projection.ref.bundleId, projection.ref.claimId, projection.claim?.id, projection.claim?.subject.subjectId, ...evidence.map((item) => item.id), ...projection.derivation.directInputs.map((item) => item.claimId), ...projection.gaps.map((gap) => gap.code)];
  if (!display.filter((value): value is string => value !== undefined).every(isBasisInertDisplayScalar) || !opaque.every(isBasisOpaqueRefScalar) || !restricted.filter((value): value is string => value !== undefined).every(isBasisRestrictedContractScalar)) throw new TypeError("Surface report values cannot be represented safely in the bounded Basis projection.");
}
