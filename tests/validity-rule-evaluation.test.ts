import test from "node:test";
import assert from "node:assert/strict";
import { deriveTrustSnapshot, validateTrustBundle } from "../src/index.js";
import type { TrustBundle, VerificationPolicy } from "../src/types.js";

const now = new Date("2026-08-08T12:00:00.000Z");

function verifiedBundle(policy: VerificationPolicy, claim: Record<string, unknown> = {}): TrustBundle {
  return {
    schemaVersion: 3,
    source: "validity-rule-evaluation-test",
    claims: [{
      id: "claim.validity",
      subjectType: "repository",
      subjectId: "surface",
      facet: "surface.validity",
      claimType: "software-evidence",
      fieldOrBehavior: "validity rule is evaluable",
      value: true,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
      verificationPolicyId: policy.id,
      ...claim,
    }],
    evidence: [{
      id: "evidence.validity",
      claimId: "claim.validity",
      evidenceType: "test_output",
      method: "validation",
      sourceRef: "npm test",
      excerptOrSummary: "Tests passed.",
      observedAt: "2026-08-01T12:00:00.000Z",
      collectedBy: "ci",
      integrityRef: "commit:abc123",
      passing: true,
    }],
    policies: [policy],
    events: [{
      id: "event.validity",
      claimId: "claim.validity",
      status: "verified",
      actor: "ci",
      method: "validation",
      evidenceIds: ["evidence.validity"],
      createdAt: "2026-08-01T12:00:00.000Z",
      verifiedAt: "2026-08-01T12:00:00.000Z",
    }],
  };
}

function policy(validityRule: VerificationPolicy["validityRule"]): VerificationPolicy {
  return {
    id: "policy.validity",
    claimType: "software-evidence",
    requiredEvidence: ["test_output"],
    requiredMethods: ["validation"],
    requiresCorroboration: false,
    acceptanceCriteria: ["test output"],
    reviewAuthority: "ci",
    validityRule,
    stalenessTriggers: ["revision changes"],
    conflictRules: [],
    impactLevel: "high",
  };
}

function validityGap(bundle: TrustBundle) {
  return deriveTrustSnapshot(bundle, { now }).transparencyGaps.find((gap) => gap.id === "claim.validity.gap.unevaluable-validity-rule");
}

test("commit validity without a current integrity ref is a blocking, inspectable gap", () => {
  const bundle = verifiedBundle(policy({ kind: "commit" }));
  const snapshot = deriveTrustSnapshot(bundle, { now });

  assert.throws(() => validateTrustBundle(bundle), /currentIntegrityRef/);
  assert.equal(snapshot.claims[0].status, "verified");
  assert.equal(validityGap(bundle)?.type, "policy_violation");
  assert.equal(validityGap(bundle)?.blocking, true);
  assert.match(validityGap(bundle)?.message ?? "", /currentIntegrityRef/);
});

test("duration validity without a duration is rejected at validation and visible to direct snapshot callers", () => {
  const bundle = verifiedBundle(policy({ kind: "duration" }));

  assert.throws(() => validateTrustBundle(bundle), /durationDays/);
  assert.equal(validityGap(bundle)?.type, "policy_violation");
  assert.match(validityGap(bundle)?.message ?? "", /durationDays/);
});

test("invalid duration validity input is rejected at validation and remains non-silent for direct snapshot callers", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: Number.NaN }));

  assert.throws(() => validateTrustBundle(bundle), /durationDays/);
  assert.equal(validityGap(bundle)?.blocking, true);
});

test("a negative duration remains valid and deterministically stale under status function v2", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: -1 }));

  assert.doesNotThrow(() => validateTrustBundle(bundle));
  assert.equal(deriveTrustSnapshot(bundle, { now }).claims[0].status, "stale");
  assert.equal(validityGap(bundle), undefined);
});

test("an invalid duration verification timestamp is rejected at validation and remains non-silent for direct snapshot callers", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: 7 }));
  bundle.events[0].verifiedAt = "not-a-date";

  assert.throws(() => validateTrustBundle(bundle), /verifiedAt/);
  assert.equal(validityGap(bundle)?.blocking, true);
  assert.match(validityGap(bundle)?.message ?? "", /timestamp/);
});

test("an unknown validity rule is a blocking gap when an unvalidated in-memory bundle reaches the snapshot", () => {
  const bundle = verifiedBundle(policy({ kind: "manual" }));
  (bundle.policies[0].validityRule as { kind: unknown }).kind = "revision-window";

  assert.throws(() => validateTrustBundle(bundle), /unsupported value/);
  assert.equal(validityGap(bundle)?.type, "policy_violation");
  assert.match(validityGap(bundle)?.message ?? "", /not understood/);
});

test("a proposed duration claim without a verified event has no unevaluable-validity gap", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: 7 }));
  bundle.events = [];

  const snapshot = deriveTrustSnapshot(bundle, { now });
  assert.equal(snapshot.claims[0].status, "proposed");
  assert.equal(validityGap(bundle), undefined);
});

test("commit validation evaluates the ledger at its event anchor, not the wall clock", () => {
  const bundle = verifiedBundle(policy({ kind: "commit" }), {
    expiresAt: "2026-08-01T12:00:01.000Z",
  });

  assert.throws(() => validateTrustBundle(bundle), /currentIntegrityRef/);
});

test("commit validation keeps an intrinsically expired ledger non-verified", () => {
  const bundle = verifiedBundle(policy({ kind: "commit" }), {
    expiresAt: "2026-08-01T11:59:59.000Z",
  });

  assert.doesNotThrow(() => validateTrustBundle(bundle));
});

test("a policy remains optional: no policy does not invent a validity-rule gap", () => {
  const bundle = verifiedBundle(policy({ kind: "manual" }));
  bundle.claims[0].verificationPolicyId = undefined;
  bundle.policies = [];

  assert.doesNotThrow(() => validateTrustBundle(bundle));
  const snapshot = deriveTrustSnapshot(bundle, { now });
  assert.equal(snapshot.claims[0].status, "verified");
  assert.equal(snapshot.transparencyGaps.some((gap) => gap.id === "claim.validity.gap.unevaluable-validity-rule"), false);
});
