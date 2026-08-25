import type { AnswerObservationRead, BasisProjection, BasisUnresolvedReason, SurfaceAssessmentRead } from "./types.js";

/** The sole standing derivation. Context is deliberately not an input. */
export function deriveBasisStanding(answer: AnswerObservationRead, assessment: SurfaceAssessmentRead): { standing: BasisProjection["standing"]; reason: BasisUnresolvedReason | null } {
  if (answer.state !== "available") return { standing: "unresolved", reason: answerReason(answer.state) };
  if (assessment.state === "not-captured" || assessment.state === "observed-empty") return { standing: "execution-only", reason: null };
  if (assessment.state !== "available") return { standing: "unresolved", reason: assessmentReason(assessment.state) };
  const value = assessment.value;
  if (!value.found || !value.claim) return { standing: "unresolved", reason: "claim-not-in-assessment" };
  const policyMet = value.policy?.outcome === "satisfied" && value.policy.satisfied === true && value.claim.status === "verified" && !value.claim.freshness?.stale && value.evidence.counterevidence.length === 0 && value.gaps.length === 0;
  return policyMet ? { standing: "policy-met", reason: null } : { standing: "assessed-with-gaps", reason: null };
}
function answerReason(state: Exclude<AnswerObservationRead["state"], "available">): BasisUnresolvedReason { return state === "observed-empty" ? "answer-observed-empty" : state === "not-captured" ? "answer-not-captured" : state === "restricted" ? "answer-restricted" : state === "stale" ? "answer-stale" : state === "corrupt" ? "answer-corrupt" : state === "unsupported-version" ? "answer-unsupported-version" : "answer-unavailable"; }
function assessmentReason(state: Exclude<SurfaceAssessmentRead["state"], "available" | "not-captured" | "observed-empty">): BasisUnresolvedReason { return state === "restricted" ? "assessment-restricted" : state === "stale" ? "assessment-stale" : state === "corrupt" ? "assessment-corrupt" : state === "unsupported-version" ? "assessment-unsupported-version" : "assessment-unavailable"; }
