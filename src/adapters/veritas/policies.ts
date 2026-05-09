import type { VerificationPolicy } from "../../types.js";

export const SURFACE_POLICY: VerificationPolicy = {
  id: "veritas.surface",
  claimType: "veritas-affected-surface",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["auditability"],
  requiresCorroboration: false,
  requiredProof: ["veritas evidence artifact"],
  reviewAuthority: "veritas",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["source_ref changes", "affected node changes"],
  conflictRules: ["newer evidence for the same node supersedes older evidence"],
  impactLevel: "medium",
};

export const PROOF_POLICY: VerificationPolicy = {
  id: "veritas.proof-lane",
  claimType: "software-proof",
  parentType: "developer-claim",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["selected proof command"],
  reviewAuthority: "veritas",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["source_ref changes", "proof command changes", "baseline proof fails"],
  conflictRules: ["failed proof rejects a previously verified proof claim"],
  impactLevel: "high",
};

export const POLICY_RESULT_POLICY: VerificationPolicy = {
  id: "veritas.policy-result",
  claimType: "veritas-policy-result",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["policy pack evaluation"],
  reviewAuthority: "veritas policy pack",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["source_ref changes", "policy pack changes", "rule implementation changes"],
  conflictRules: ["blocking failed rules reject the affected policy claim"],
  impactLevel: "high",
};

export const PROOF_FAMILY_POLICY: VerificationPolicy = {
  id: "veritas.proof-family",
  claimType: "veritas-proof-family",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["proof-family manifest"],
  reviewAuthority: "veritas proof family owner",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["review trigger changes", "freshness status changes", "catch evidence changes"],
  conflictRules: ["stale or unknown proof families dispute promotion readiness"],
  impactLevel: "medium",
};

export const VERIFICATION_BUDGET_POLICY: VerificationPolicy = {
  id: "veritas.verification-budget",
  claimType: "veritas-verification-budget",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["auditability"],
  requiresCorroboration: false,
  requiredProof: ["verification budget"],
  reviewAuthority: "veritas",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["proof family inventory changes", "proof lane inventory changes"],
  conflictRules: ["unknown or stale proof families dispute budget readiness"],
  impactLevel: "medium",
};

