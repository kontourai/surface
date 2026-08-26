import { evaluateClaimEvidence } from "./claim-evaluation.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import type { SurfaceExtension, TrustReport, VerificationPolicy } from "./types.js";
import type { SurfacePolicyOutcome } from "./basis/types.js";

/**
 * Owner-first policy evaluation for an answer assessment. It consumes only the
 * report Surface derived and the resolved policy; callers cannot supply a
 * `satisfied` boolean or promote an otherwise verified claim by assertion.
 */
export function evaluateAnswerAssessmentPolicy(
  report: TrustReport,
  claimId: string,
): SurfacePolicyOutcome | null {
  const claim = report.claims.find((candidate) => candidate.id === claimId);
  if (!claim) return null;
  const policy = resolvePolicyForClaim(claim, report.policies);
  if (!policy) return null;

  const evidence = report.evidence.filter((candidate) => candidate.claimId === claimId);
  // Answer-facing policy must use declared support only. The kernel preserves
  // legacy undeclared evidence semantics elsewhere; this owner assessment
  // deliberately cannot promote that legacy default into answer support.
  const entailing = evidence.filter((candidate) => candidate.supportStrength === "entails" && candidate.passing !== false);
  const evaluation = evaluateClaimEvidence({ entailingEvidence: entailing, policy });
  const blockingGap = report.transparencyGaps.some(
    (gap) => gap.claimId === claimId && gap.blocking !== false,
  );
  const blockingEvidence = evidence.some((item) => item.supportStrength === "entails" && item.passing === false && item.blocking !== false);
  const reasons: SurfacePolicyOutcome["reasons"][number][] = [];
  if (claim.status !== "verified") reasons.push("claim-not-verified");
  if (claim.freshness?.stale === true) reasons.push("claim-stale");
  if (evaluation.requirementUnmet) reasons.push("required-evidence-unmet");
  if (entailing.length === 0) reasons.push("explicit-entailing-evidence-missing");
  if (blockingEvidence) reasons.push("blocking-evidence");
  if (blockingGap) reasons.push("blocking-gap");
  const satisfied = reasons.length === 0;
  return {
    version: "surface.answer-assessment-policy/v1",
    id: policy.id,
    evaluatedAt: report.generatedAt,
    outcome: satisfied ? "satisfied" : "not-satisfied",
    satisfied,
    reasons,
  };
}

/** A small reference policy; products own their concrete policy templates. */
export const ordinaryVerificationPolicy: VerificationPolicy = {
  id: "surface.ordinary-verification/v1",
  claimType: "surface/ordinary-verified",
  requiredEvidence: [],
  acceptanceCriteria: ["Declared entailing evidence is required."],
  reviewAuthority: "surface-owner",
  validityRule: { kind: "manual" },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "medium",
};

/** Public construction seam for products that want the reference profile. */
export function createAnswerAssessmentReferenceExtension(input: {
  name: string;
  displayName: string;
  vocab: SurfaceExtension["vocab"];
  theme: SurfaceExtension["theme"];
}): SurfaceExtension {
  const { id: _id, ...template } = ordinaryVerificationPolicy;
  return {
    name: input.name,
    displayName: input.displayName,
    vocab: input.vocab,
    theme: input.theme,
    policyTemplates: [
      {
        id: ordinaryVerificationPolicy.id,
        template,
      },
    ],
  };
}
