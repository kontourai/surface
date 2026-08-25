import { derivationInputsForClaim } from "../derivation.js";
import { evaluateClaimEvidence } from "../claim-evaluation.js";
import { partitionEvidenceBySupport } from "../evidence-support.js";
import type { Evidence, TrustReport } from "../types.js";
import { SURFACE_BASIS_VERSION, type AnswerAssessmentProjection, type BasisAssessmentEvidence, type BasisGap } from "./types.js";

/**
 * Projects report facts for one claim.  This never derives a claim status and
 * never interprets owner workflow output as policy evidence.
 */
export function buildAnswerAssessmentProjection(report: TrustReport, claimId: string): AnswerAssessmentProjection {
  const bundle = { id: report.id, schemaVersion: report.schemaVersion, source: report.source, generatedAt: report.generatedAt };
  const claim = report.claims.find((candidate) => candidate.id === claimId);
  if (!claim) return emptyAssessment(bundle);

  const evidence = report.evidence.filter((candidate) => candidate.claimId === claimId);
  const partitioned = partitionEvidenceBySupport(evidence);
  const policyRecord = claim.verificationPolicyId
    ? report.policies.find((candidate) => candidate.id === claim.verificationPolicyId)
    : undefined;
  // The outcome comes exclusively from the existing Surface policy evaluator.
  // Claim status, events, and owner contributions are deliberately not inputs.
  const policy = policyRecord
    ? {
        id: policyRecord.id,
        outcome: evaluateClaimEvidence({ entailingEvidence: partitioned.entailingEvidence, policy: policyRecord }).requirementUnmet
          ? "not-satisfied" as const
          : "satisfied" as const,
      }
    : null;

  return {
    version: SURFACE_BASIS_VERSION,
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

function emptyAssessment(bundle: AnswerAssessmentProjection["bundle"]): AnswerAssessmentProjection {
  return {
    version: SURFACE_BASIS_VERSION, found: false, bundle, claim: null, policy: null,
    evidence: { cited: [], entails: [], counterevidence: [] }, derivation: { available: false, directInputs: [] }, gaps: [],
  };
}
