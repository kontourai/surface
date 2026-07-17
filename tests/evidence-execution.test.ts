import test from "node:test";
import assert from "node:assert/strict";
import { validateTrustBundle, type TrustBundle } from "../src/index.js";

function makeInput(executionOverride?: Record<string, unknown>): TrustBundle {
  return {
    schemaVersion: 3,
    source: "evidence-execution-test",
    claims: [{
      id: "claim.release.test-suite-passes",
      subjectType: "npm-package",
      subjectId: "@kontourai/surface@0.0.0-test",
      facet: "kontourai-surface.release",
      claimType: "release-check",
      fieldOrBehavior: "test-suite-passes",
      value: true,
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z",
      impactLevel: "high",
      verificationPolicyId: "policy.release.test-suite",
    }],
    evidence: [{
      id: "evidence.release.test-output",
      claimId: "claim.release.test-suite-passes",
      supportStrength: "entails",
      evidenceType: "test_output",
      method: "validation",
      sourceRef: "npm test",
      excerptOrSummary: "npm test passed: 1 test passed, 0 failed",
      observedAt: "2026-06-12T00:00:00.000Z",
      collectedBy: "kontourai-surface-release",
      passing: true,
      blocking: false,
      execution: (executionOverride ?? {
        runner: "bash",
        label: "npm test",
        exitCode: 0,
      }) as TrustBundle["evidence"][number]["execution"],
    }],
    policies: [{
      id: "policy.release.test-suite",
      claimType: "release-check",
      requiredEvidence: ["test_output"],
      requiredMethods: ["validation"],
      requiresCorroboration: false,
      acceptanceCriteria: ["test suite passes"],
      reviewAuthority: "role:release-pipeline",
      validityRule: { kind: "duration", durationDays: 90 },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "high",
    }],
    events: [{
      id: "event.release.test-output.verified",
      claimId: "claim.release.test-suite-passes",
      status: "verified",
      actor: "kontourai-surface-release",
      method: "validation",
      evidenceIds: ["evidence.release.test-output"],
      createdAt: "2026-06-12T00:00:01.000Z",
      verifiedAt: "2026-06-12T00:00:01.000Z",
    }],
  } as unknown as TrustBundle;
}

test("validateTrustBundle accepts evidence with a well-formed execution block", () => {
  const bundle = validateTrustBundle(makeInput());
  assert.equal(bundle.evidence[0].execution?.runner, "bash");
  assert.equal(bundle.evidence[0].execution?.label, "npm test");
  assert.equal(bundle.evidence[0].execution?.exitCode, 0);
});

test("validateTrustBundle accepts execution with all optional fields", () => {
  const bundle = validateTrustBundle(makeInput({
    runner: "mcp",
    label: "tool:run-tests",
    exitCode: 0,
    isError: false,
    durationMs: 1234.5,
    environment: "staging",
    metadata: { transport: "stdio" },
  }));
  assert.equal(bundle.evidence[0].execution?.runner, "mcp");
  assert.equal(bundle.evidence[0].execution?.durationMs, 1234.5);
  assert.equal(bundle.evidence[0].execution?.environment, "staging");
});

test("validateTrustBundle rejects execution with an unknown field", () => {
  assert.throws(
    () => validateTrustBundle(makeInput({ runner: "bash", label: "npm test", surprise: true })),
    /evidence evidence\.release\.test-output execution contains unsupported field: surprise/,
  );
});

test("validateTrustBundle rejects execution with an invalid runner", () => {
  assert.throws(
    () => validateTrustBundle(makeInput({ runner: "powershell", label: "npm test" })),
    /execution\.runner must be "bash" or "mcp"/,
  );
});

test("validateTrustBundle rejects execution without a label", () => {
  assert.throws(
    () => validateTrustBundle(makeInput({ runner: "bash" })),
    /execution\.label must be a non-empty string/,
  );
});

test("validateTrustBundle rejects execution with null durationMs (omit instead)", () => {
  assert.throws(
    () => validateTrustBundle(makeInput({ runner: "bash", label: "npm test", durationMs: null })),
    /execution\.durationMs must be a number/,
  );
});

test("validateTrustBundle rejects execution with an invalid environment", () => {
  assert.throws(
    () => validateTrustBundle(makeInput({ runner: "bash", label: "npm test", environment: "local" })),
    /execution\.environment must be "test", "staging", or "production"/,
  );
});

test("the published v0.12.0 regression shape now validates (release bundle evidence)", () => {
  // Mirror of the exact evidence shape shipped in the v0.12.0 release assets
  // that strict receivers rejected (ops receiver-attestation spike, 2026-06-12),
  // minus the durationMs:null the emitter no longer writes.
  const bundle = validateTrustBundle(makeInput({
    runner: "bash",
    label: "npm test",
    exitCode: 0,
  }));
  assert.equal(bundle.evidence.length, 1);
});
