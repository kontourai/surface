import test from "node:test";
import assert from "node:assert/strict";
import { buildCommitValidityPolicy } from "../src/index.js";

test("buildCommitValidityPolicy creates a commit-scoped verification policy", () => {
  const policy = buildCommitValidityPolicy({
    id: "example.policy",
    claimType: "example-claim",
    requiredEvidence: ["policy_rule"],
    requiredMethods: ["validation"],
    requiresCorroboration: false,
    requiredProof: ["example proof"],
    reviewAuthority: "example reviewer",
    stalenessTriggers: ["source changes"],
    conflictRules: ["failed proof rejects claim"],
    impactLevel: "medium",
  });

  assert.equal(policy.validityRule.kind, "commit");
  assert.equal(policy.id, "example.policy");
  assert.equal(policy.claimType, "example-claim");
});
