import type {
  Evidence,
  EvidenceMethod,
  EvidenceRequirement,
  EvidenceType,
  VerificationPolicy,
} from "./types.js";
import { resolveStatusFunctionVersion, type StatusFunctionVersion } from "./status-function-version.js";

/** Evidence types that record the result of a pass/fail check through `passing`. */
export const CHECK_EVIDENCE_TYPES: ReadonlySet<string> = new Set(["test_output", "calculation_trace", "runtime_observation"]);

/**
 * Status function "3" qualifying evidence: entailing evidence satisfies a
 * policy requirement unless it is check evidence whose `passing` is not `true`.
 */
export function evidenceQualifies(evidence: Evidence): boolean {
  return !CHECK_EVIDENCE_TYPES.has(evidence.evidenceType) || evidence.passing === true;
}

/**
 * True when the policy names at least one required evidence type or method.
 * Under status function "3" a policy that requires nothing is treated by the
 * fold as if no policy had been resolved.
 */
export function policyRequiresSomething(policy: VerificationPolicy): boolean {
  return (policy.requiredEvidence ?? []).length > 0 || (policy.requiredMethods ?? []).length > 0;
}

/**
 * The shared per-claim evidence/policy satisfaction facts, computed once near
 * Trust Snapshot derivation and consumed by BOTH status derivation and
 * transparency-gap derivation.
 *
 * Before this contract existed, `deriveTrustStatus` (to decide
 * `verified` → `proposed`) and `deriveTransparencyGaps` (to emit
 * `provenance_gap` / `policy_violation` / `corroboration_absent`) each
 * recomputed the same missing-evidence / missing-method / corroboration facts
 * from the entailing evidence and policy. Centralising them here keeps the two
 * derivations in lock-step by construction — the status decision and the gaps
 * that explain it can no longer drift apart.
 *
 * The evaluation is a pure projection of `(entailing evidence, policy, status
 * function version)`; it
 * does not itself decide status or build gaps, so callers keep full control of
 * their output shapes (which must stay byte-stable).
 */
export interface ClaimEvidenceEvaluation {
  /** The status function version whose requirement rules produced this evaluation. */
  statusFunctionVersion: StatusFunctionVersion;
  /** The entailing evidence the evaluation was computed from (support-strength filtered upstream). */
  entailingEvidence: Evidence[];
  /**
   * The entailing evidence that can satisfy a requirement. Under status
   * function "3" this excludes check evidence without `passing: true`; under
   * "2" it is all the entailing evidence.
   */
  qualifyingEvidence: Evidence[];
  /** Distinct `evidenceType` values present in the qualifying evidence. */
  evidenceTypes: Set<EvidenceType>;
  /** Distinct `method` values present in the qualifying evidence. */
  evidenceMethods: Set<EvidenceMethod>;
  /** Policy-required evidence types not covered by the qualifying evidence. */
  missingEvidenceTypes: EvidenceType[];
  /** Policy-required methods not covered by the qualifying evidence. */
  missingMethods: EvidenceMethod[];
  /** True when the policy requires corroboration. */
  corroborationRequired: boolean;
  /** True when corroboration is required but fewer than two qualifying records exist. */
  corroborationMissing: boolean;
  /**
   * True when any policy evidence requirement is unmet — a missing required
   * type, a missing required method, or absent corroboration. This is the
   * single fact shared by the status decision (`verified` → `proposed`) and by
   * gap emission, so both always agree on whether the requirement is satisfied.
   */
  requirementUnmet: boolean;
}

/**
 * Compute the shared evidence/policy satisfaction facts for one claim from its
 * entailing evidence and resolved policy. Pure and cheap; safe to call at the
 * single orchestration point (`foldClaim`) and thread into both derivations.
 */
export function evaluateClaimEvidence(args: {
  entailingEvidence: Evidence[];
  policy: VerificationPolicy;
  /** Defaults to the current status function version. */
  statusFunctionVersion?: StatusFunctionVersion;
}): ClaimEvidenceEvaluation {
  const { entailingEvidence, policy } = args;
  const statusFunctionVersion = resolveStatusFunctionVersion(args.statusFunctionVersion);
  const qualifyingEvidence = statusFunctionVersion === "2" ? entailingEvidence : entailingEvidence.filter(evidenceQualifies);
  const evidenceTypes = new Set<EvidenceType>(qualifyingEvidence.map((item) => item.evidenceType));
  const evidenceMethods = new Set<EvidenceMethod>(qualifyingEvidence.map((item) => item.method));
  const missingEvidenceTypes = policy.requiredEvidence.filter((type) => !evidenceTypes.has(type));
  const missingMethods = (policy.requiredMethods ?? []).filter((method) => !evidenceMethods.has(method));
  const corroborationRequired = policy.requiresCorroboration === true;
  const corroborationMissing = corroborationRequired && qualifyingEvidence.length < 2;
  const requirementUnmet =
    missingEvidenceTypes.length > 0 || missingMethods.length > 0 || corroborationMissing;

  return {
    statusFunctionVersion,
    entailingEvidence,
    qualifyingEvidence,
    evidenceTypes,
    evidenceMethods,
    missingEvidenceTypes,
    missingMethods,
    corroborationRequired,
    corroborationMissing,
    requirementUnmet,
  };
}

/**
 * Project the resolved policy into the public `EvidenceRequirement` shape
 * surfaced on the report (`evidenceRequirementsByClaimId`). Kept alongside the
 * evaluation contract so the "what does this claim need" facts live in one
 * module; the output shape is byte-stable and must not change.
 */
export function evidenceRequirementFromPolicy(policy: VerificationPolicy): EvidenceRequirement {
  return {
    requiredEvidenceTypes: policy.requiredEvidence,
    requiredMethods: policy.requiredMethods,
    requiresCorroboration: policy.requiresCorroboration,
    requiredAuthority: policy.reviewAuthority,
    notes: policy.acceptanceCriteria.join("; "),
  };
}
