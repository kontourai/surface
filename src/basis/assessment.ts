import { derivationInputsForClaim } from "../derivation.js";
import { partitionEvidenceBySupport } from "../evidence-support.js";
import type { Evidence, TrustReport } from "../types.js";
import { SURFACE_ANSWER_ASSESSMENT_VERSION, SURFACE_BASIS_VERSION, type AnswerAssessmentProjection, type BasisAssessmentEvidence } from "./types.js";

/**
 * Projects report facts for one claim.  This never derives a claim status and
 * never interprets owner workflow output as policy evidence.
 */
export function buildAnswerAssessmentProjection(report: TrustReport, claimId: string): AnswerAssessmentProjection {
  const bundle = { id: report.id, schemaVersion: report.schemaVersion, source: report.source, generatedAt: report.generatedAt };
  const claim = report.claims.find((candidate) => candidate.id === claimId);
  if (!claim) return emptyAssessment(bundle, claimId);

  const evidence = report.evidence.filter((candidate) => candidate.claimId === claimId);
  const partitioned = partitionEvidenceBySupport(evidence);
  // Evidence coverage is not a policy verdict.  Surface currently has no
  // owner policy-evaluation outcome in TrustReport, so this builder must never
  // promote coverage to satisfied/not-satisfied.  The projection shape reserves
  // that explicit result for a future Surface evaluator.
  const policy = null;

  return {
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
      counterevidence: evidence.filter((candidate) => candidate.passing === false).map(projectEvidence),
    },
    derivation: projectDerivation(report, claim),
    gaps: report.transparencyGaps.filter((gap) => gap.claimId === claimId).map((gap) => ({ code: gap.type, message: gap.message })),
  };
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
