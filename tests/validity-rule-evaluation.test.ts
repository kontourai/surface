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

function validityGap(bundle: TrustBundle, statusFunctionVersion?: "2" | "3") {
  return deriveTrustSnapshot(bundle, { now, statusFunctionVersion }).transparencyGaps.find((gap) => gap.id === "claim.validity.gap.unevaluable-validity-rule");
}

test("commit validity without a current integrity ref derives stale with a blocking, inspectable gap", () => {
  const bundle = verifiedBundle(policy({ kind: "commit" }));
  const snapshot = deriveTrustSnapshot(bundle, { now });

  // Status function "3" derives `stale` for this input, so validation no
  // longer needs to refuse it to keep it from reading as verified.
  assert.doesNotThrow(() => validateTrustBundle(bundle));
  assert.equal(snapshot.claims[0].status, "stale");
  assert.equal(deriveTrustSnapshot(bundle, { now, statusFunctionVersion: "2" }).claims[0].status, "verified");
  assert.equal(validityGap(bundle, "2")?.blocking, true);
  assert.equal(validityGap(bundle)?.type, "policy_violation");
  assert.equal(validityGap(bundle)?.blocking, true);
  assert.match(validityGap(bundle)?.message ?? "", /currentIntegrityRef/);
});

test("validating for version 2 keeps the commit-rule refusal that version relied on", () => {
  const bundle = verifiedBundle(policy({ kind: "commit" }));

  // The default (version 3) accepts the bundle: it derives `stale`.
  assert.doesNotThrow(() => validateTrustBundle(bundle));
  // A caller that will derive under "2" would get `verified`, so it is refused, as before version 3.
  assert.throws(() => validateTrustBundle(bundle, { statusFunctionVersion: "2" }), /requires currentIntegrityRef because policy policy\.validity uses commit validity/);
  // With the reference present the same call accepts it.
  assert.doesNotThrow(() => validateTrustBundle(verifiedBundle(policy({ kind: "commit" }), { currentIntegrityRef: "commit:abc123" }), { statusFunctionVersion: "2" }));
  // The refusal replays at the ledger's own event time, not the wall clock: an
  // intrinsic window that had already lapsed by then is not `verified`, so it is accepted.
  assert.throws(
    () => validateTrustBundle(verifiedBundle(policy({ kind: "commit" }), { expiresAt: "2026-08-01T12:00:01.000Z" }), { statusFunctionVersion: "2" }),
    /currentIntegrityRef/,
  );
  assert.doesNotThrow(
    () => validateTrustBundle(verifiedBundle(policy({ kind: "commit" }), { expiresAt: "2026-08-01T11:59:59.000Z" }), { statusFunctionVersion: "2" }),
  );
  assert.throws(() => validateTrustBundle(bundle, { statusFunctionVersion: "1" as "2" }), /unsupported statusFunctionVersion/);
  // Passing validateTrustBundle straight to `.map` hands it an index, not options.
  assert.equal([bundle].map(validateTrustBundle as (input: unknown) => unknown).length, 1);
});

test("duration validity without a duration is rejected at validation, and derives stale for direct snapshot callers", () => {
  const bundle = verifiedBundle(policy({ kind: "duration" }));

  assert.throws(() => validateTrustBundle(bundle), /durationDays/);
  assert.equal(deriveTrustSnapshot(bundle, { now }).claims[0].status, "stale");
  assert.equal(deriveTrustSnapshot(bundle, { now, statusFunctionVersion: "2" }).claims[0].status, "verified");
  assert.equal(validityGap(bundle)?.type, "policy_violation");
  assert.match(validityGap(bundle)?.message ?? "", /durationDays/);
});

test("invalid duration validity input is rejected at validation and remains non-silent for direct snapshot callers", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: Number.NaN }));

  assert.throws(() => validateTrustBundle(bundle), /durationDays/);
  assert.equal(validityGap(bundle)?.blocking, true);
  assert.equal(deriveTrustSnapshot(bundle, { now }).claims[0].status, "stale");
});

test("a negative duration is accepted and stale: unevaluable under v3, an expired window under v2", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: -1 }));

  assert.doesNotThrow(() => validateTrustBundle(bundle));
  assert.equal(deriveTrustSnapshot(bundle, { now }).claims[0].status, "stale");
  assert.match(validityGap(bundle)?.message ?? "", /durationDays/);
  // Under "3" the window is unevaluable whatever `now` is; under "2" it is a
  // window that ended a day before the verification.
  const beforeVerification = new Date("2026-07-01T00:00:00.000Z");
  assert.equal(deriveTrustSnapshot(bundle, { now: beforeVerification }).claims[0].status, "stale");
  assert.equal(deriveTrustSnapshot(bundle, { now: beforeVerification, statusFunctionVersion: "2" }).claims[0].status, "verified");
  assert.equal(deriveTrustSnapshot(bundle, { now, statusFunctionVersion: "2" }).claims[0].status, "stale");
  assert.equal(validityGap(bundle, "2"), undefined);
});

test("an invalid duration verification timestamp is rejected at validation and remains non-silent for direct snapshot callers", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: 7 }));
  bundle.events[0].verifiedAt = "not-a-date";

  assert.throws(() => validateTrustBundle(bundle), /verifiedAt/);
  assert.equal(validityGap(bundle)?.blocking, true);
  assert.match(validityGap(bundle)?.message ?? "", /timestamp/);
  assert.equal(deriveTrustSnapshot(bundle, { now }).claims[0].status, "stale");
});

test("an unknown validity rule is a blocking gap when an unvalidated in-memory bundle reaches the snapshot", () => {
  const bundle = verifiedBundle(policy({ kind: "manual" }));
  (bundle.policies[0].validityRule as { kind: unknown }).kind = "revision-window";

  assert.throws(() => validateTrustBundle(bundle), /unsupported value/);
  assert.equal(validityGap(bundle)?.type, "policy_violation");
  assert.match(validityGap(bundle)?.message ?? "", /not understood/);
  assert.equal(deriveTrustSnapshot(bundle, { now }).claims[0].status, "stale");
  assert.equal(deriveTrustSnapshot(bundle, { now, statusFunctionVersion: "2" }).claims[0].status, "verified");
});

test("a proposed duration claim without a verified event has no unevaluable-validity gap", () => {
  const bundle = verifiedBundle(policy({ kind: "duration", durationDays: 7 }));
  bundle.events = [];

  const snapshot = deriveTrustSnapshot(bundle, { now });
  assert.equal(snapshot.claims[0].status, "proposed");
  assert.equal(validityGap(bundle), undefined);
});

test("a claim-intrinsic window overrides an unevaluable commit rule", () => {
  // `expiresAt` wins over the policy validity rule, so the missing
  // currentIntegrityRef is never consulted: the claim is verified until expiry.
  const bundle = verifiedBundle(policy({ kind: "commit" }), {
    expiresAt: "2026-08-09T12:00:00.000Z",
  });

  assert.doesNotThrow(() => validateTrustBundle(bundle));
  assert.equal(deriveTrustSnapshot(bundle, { now }).claims[0].status, "verified");
  assert.equal(deriveTrustSnapshot(bundle, { now: new Date("2026-08-10T00:00:00.000Z") }).claims[0].status, "stale");
});

test("an unparseable intrinsic window derives stale under v3 for direct snapshot callers", () => {
  const expires = verifiedBundle(policy({ kind: "manual" }), { expiresAt: "not-a-date" });
  assert.throws(() => validateTrustBundle(expires), /expiresAt/);
  assert.equal(deriveTrustSnapshot(expires, { now }).claims[0].status, "stale");
  assert.equal(deriveTrustSnapshot(expires, { now, statusFunctionVersion: "2" }).claims[0].status, "verified");

  const ttl = verifiedBundle(policy({ kind: "manual" }), { ttlSeconds: -5 });
  assert.equal(deriveTrustSnapshot(ttl, { now: new Date("2026-07-01T00:00:00.000Z") }).claims[0].status, "stale");
});

test("no policy does not invent a validity-rule gap, and derives proposed", () => {
  const bundle = verifiedBundle(policy({ kind: "manual" }));
  bundle.claims[0].verificationPolicyId = undefined;
  bundle.policies = [];

  assert.doesNotThrow(() => validateTrustBundle(bundle));
  const snapshot = deriveTrustSnapshot(bundle, { now });
  assert.equal(snapshot.claims[0].status, "proposed");
  assert.equal(deriveTrustSnapshot(bundle, { now, statusFunctionVersion: "2" }).claims[0].status, "verified");
  assert.equal(snapshot.transparencyGaps.some((gap) => gap.id === "claim.validity.gap.unevaluable-validity-rule"), false);
});
