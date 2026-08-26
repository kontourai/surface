import { derivationInputsForClaim } from "../derivation.js";
import { evaluateAnswerAssessmentPolicy } from "../answer-assessment-policy.js";
import { isStandingCounterevidence } from "../evidence-support.js";
import type { Evidence, TrustReport } from "../types.js";
import { SURFACE_ANSWER_ASSESSMENT_VERSION, type AnswerAssessmentProjection, type BasisAssessmentEvidence } from "./types.js";
import { isBasisInertDisplayScalar, isBasisOpaqueRefScalar, isBasisRestrictedContractScalar } from "./validation.js";

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
  const policy = evaluateAnswerAssessmentPolicy(report, claimId);

  const projection: AnswerAssessmentProjection = {
    version: SURFACE_ANSWER_ASSESSMENT_VERSION,
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
      cited: evidence.filter((item) => item.supportStrength === "cited").map(projectEvidence),
      entails: evidence.filter((item) => item.supportStrength === "entails").map(projectEvidence),
      undeclared: evidence.filter((item) => item.supportStrength === undefined).map(projectEvidence),
      counterevidence: evidence.filter(isStandingCounterevidence).map(projectEvidence),
    },
    derivation: projectDerivation(report, claim),
    gaps: report.transparencyGaps.filter((gap) => gap.claimId === claimId).map(projectGap),
  };
  assertProjectionScalars(projection);
  return projection;
}

function projectEvidence(evidence: Evidence): BasisAssessmentEvidence {
  return {
    id: evidence.id,
    label: evidence.excerptOrSummary,
    sourceRef: evidence.sourceRef,
    locator: evidence.sourceLocator ?? null,
    observedAt: evidence.observedAt,
    supportStrength: evidence.supportStrength ?? null,
    result: evidence.passing === true ? "passed" : evidence.passing === false ? "failed" : "not-evaluated",
    blocksClaim: isStandingCounterevidence(evidence),
  };
}

function projectGap(gap: TrustReport["transparencyGaps"][number]): AnswerAssessmentProjection["gaps"][number] {
  const weakEdges = gap.metadata?.source === "derivation.weak" && Array.isArray(gap.metadata.weakEdges) ? gap.metadata.weakEdges.filter((edge): edge is { claimId: string; inputClaimId: string } => typeof edge === "object" && edge !== null && typeof edge.claimId === "string" && typeof edge.inputClaimId === "string") : [];
  return weakEdges.length > 0 ? { code: gap.type, message: gap.message, metadata: { source: "derivation.weak", weakEdges } } : { code: gap.type, message: gap.message };
}

function projectDerivation(report: TrustReport, claim: TrustReport["claims"][number]): AnswerAssessmentProjection["derivation"] {
  try {
    const claims = new Map(report.claims.map((candidate) => [candidate.id, candidate]));
    return {
      available: true,
      directInputs: derivationInputsForClaim(claim).map((input) => ({
        claimId: input.inputClaimId,
        status: claims.get(input.inputClaimId)?.status ?? null,
        source: input.source,
        edge: input.edge ? {
          method: input.edge.method ?? null,
          supportStrength: input.edge.supportStrength ?? null,
          rationale: input.edge.rationale ?? null,
        } : null,
      })),
    };
  } catch {
    return { available: false, directInputs: [] };
  }
}

function emptyAssessment(bundle: AnswerAssessmentProjection["bundle"], claimId: string): AnswerAssessmentProjection {
  return {
    version: SURFACE_ANSWER_ASSESSMENT_VERSION, ref: { authority: "@kontourai/surface", schemaVersion: SURFACE_ANSWER_ASSESSMENT_VERSION, kind: "answer-assessment", bundleId: bundle.id, claimId }, found: false, bundle, claim: null, policy: null,
    evidence: { cited: [], entails: [], undeclared: [], counterevidence: [] }, derivation: { available: false, directInputs: [] }, gaps: [],
  };
}

function assertBuildScalars(bundle: AnswerAssessmentProjection["bundle"], claimId: string): void {
  if (!isBasisRestrictedContractScalar(bundle.id) || !isBasisInertDisplayScalar(bundle.source) || !isBasisRestrictedContractScalar(claimId)) throw new TypeError("Surface report values cannot be represented safely in the bounded Basis projection.");
}

function assertProjectionScalars(projection: AnswerAssessmentProjection): void {
  const evidence = [...projection.evidence.cited, ...projection.evidence.entails, ...projection.evidence.undeclared, ...projection.evidence.counterevidence];
  const display = [projection.bundle.source, projection.claim?.status, projection.claim?.subject.subjectType, projection.policy?.evaluatedAt, ...(projection.policy?.reasons ?? []), ...evidence.flatMap((item) => [item.label, ...(item.locator === null ? [] : [item.locator])]), ...projection.derivation.directInputs.flatMap((item) => [item.status, item.edge?.rationale].filter((value): value is string => value !== null)), ...projection.gaps.map((gap) => gap.message)];
  const opaque = [...(projection.policy ? [projection.policy.id] : []), ...evidence.flatMap((item) => [item.sourceRef, ...(item.locator === null ? [] : [item.locator])])];
  const restricted = [projection.ref.bundleId, projection.ref.claimId, projection.claim?.id, projection.claim?.subject.subjectId, ...evidence.map((item) => item.id), ...projection.derivation.directInputs.map((item) => item.claimId), ...projection.gaps.map((gap) => gap.code)];
  if (!display.filter((value): value is string => value !== undefined).every(isBasisInertDisplayScalar) || !opaque.every(isBasisOpaqueRefScalar) || !restricted.filter((value): value is string => value !== undefined).every(isBasisRestrictedContractScalar)) throw new TypeError("Surface report values cannot be represented safely in the bounded Basis projection.");
}
