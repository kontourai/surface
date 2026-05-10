import test from "node:test";
import assert from "node:assert/strict";
import { buildCommitValidityPolicy, buildHumanAttestationEvidence, validateTrustInput } from "../src/index.js";

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

test("buildHumanAttestationEvidence creates schema-valid attestation evidence", () => {
  const evidence = buildHumanAttestationEvidence({
    subject: { claimId: "claim.policy-pack", sourceRef: "surface:test" },
    actor: { id: "brian", displayName: "Brian" },
    attestedAt: "2026-05-10T00:00:00.000Z",
    validUntil: "2026-08-08T00:00:00.000Z",
    contentHash: "sha256:abc123",
  });
  const input = validateTrustInput({
    schemaVersion: 2,
    source: "surface:test",
    claims: [{
      id: "claim.policy-pack",
      subjectType: "policy-pack",
      subjectId: "default",
      surface: "governance",
      claimType: "human-attested-policy-pack",
      fieldOrBehavior: "policy-pack",
      value: "approved",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    }],
    evidence: [evidence],
    policies: [],
    events: [],
  });

  assert.equal(input.evidence[0].evidenceType, "attestation");
  assert.equal(input.evidence[0].method, "attestation");
});
