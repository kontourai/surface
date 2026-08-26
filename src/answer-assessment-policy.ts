import { evaluateClaimEvidence } from "./claim-evaluation.js";
import { evidenceEntailsClaim, isStandingCounterevidence } from "./evidence-support.js";
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
  const entailing = evidence.filter(evidenceEntailsClaim);
  const evaluation = evaluateClaimEvidence({ entailingEvidence: entailing, policy });
  const blockingGap = report.transparencyGaps.some(
    (gap) => gap.claimId === claimId && gap.blocking !== false,
  );
  const satisfied =
    claim.status === "verified" &&
    claim.freshness?.stale !== true &&
    !evaluation.requirementUnmet &&
    !evidence.some(isStandingCounterevidence) &&
    !blockingGap &&
    // Explicit support is mandatory for this answer-facing reference policy.
    // Legacy evidence without supportStrength is deliberately not an explicit
    // policy success path.
    (policy.id !== ordinaryVerificationPolicy.id ||
      evidence.some((item) => item.supportStrength === "entails"));
  return {
    id: policy.id,
    outcome: satisfied ? "satisfied" : "not-satisfied",
    satisfied,
  };
}

/** A small reference policy; products own their concrete policy templates. */
export const ordinaryVerificationPolicy: VerificationPolicy = {
  id: "surface.ordinary-verification/v1",
  claimType: "surface/ordinary-verified",
  requiredEvidence: [],
  acceptanceCriteria: ["Explicit entailing evidence is required."],
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
