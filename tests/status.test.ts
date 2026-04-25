import test from "node:test";
import assert from "node:assert/strict";
import { deriveTrustStatus } from "../src/status.js";
import type { Claim, Evidence, VerificationEvent, VerificationPolicy } from "../src/types.js";

const claim: Claim = {
  id: "claim-1",
  subjectType: "camp",
  subjectId: "camp-1",
  surface: "campfit.public-data",
  claimType: "public-data-field",
  fieldOrBehavior: "registrationStatus",
  value: "OPEN",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

const evidence: Evidence[] = [
  {
    id: "evidence-1",
    claimId: "claim-1",
    evidenceType: "source_excerpt",
    sourceRef: "https://example.test",
    excerptOrSummary: "Registration is open.",
    observedAt: "2026-04-01T00:00:00.000Z",
    collectedBy: "crawler",
  },
  {
    id: "evidence-2",
    claimId: "claim-1",
    evidenceType: "human_attestation",
    sourceRef: "admin",
    excerptOrSummary: "Reviewed by operator.",
    observedAt: "2026-04-01T00:10:00.000Z",
    collectedBy: "admin",
  },
];

const policy: VerificationPolicy = {
  id: "policy-1",
  claimType: "public-data-field",
  requiredEvidence: ["source_excerpt", "human_attestation"],
  requiredProof: ["field review"],
  reviewAuthority: "operator",
  validityRule: { kind: "duration", durationDays: 14 },
  stalenessTriggers: ["source changes"],
  conflictRules: ["new source conflicts"],
  impactLevel: "high",
};

test("derives proposed when required evidence exists but no verification event exists", () => {
  assert.equal(deriveTrustStatus({ claim, evidence, policy, events: [] }), "proposed");
});

test("derives verified when a fresh verification event exists", () => {
  const events: VerificationEvent[] = [{
    id: "event-1",
    claimId: "claim-1",
    status: "verified",
    actor: "admin",
    method: "field review",
    evidenceIds: ["evidence-1", "evidence-2"],
    createdAt: "2026-04-01T00:10:00.000Z",
    verifiedAt: "2026-04-01T00:10:00.000Z",
  }];

  assert.equal(deriveTrustStatus({ claim, evidence, policy, events, now: new Date("2026-04-05T00:00:00.000Z") }), "verified");
});

test("derives stale when duration policy expires", () => {
  const events: VerificationEvent[] = [{
    id: "event-1",
    claimId: "claim-1",
    status: "verified",
    actor: "admin",
    method: "field review",
    evidenceIds: ["evidence-1", "evidence-2"],
    createdAt: "2026-04-01T00:10:00.000Z",
    verifiedAt: "2026-04-01T00:10:00.000Z",
  }];

  assert.equal(deriveTrustStatus({ claim, evidence, policy, events, now: new Date("2026-04-25T00:00:00.000Z") }), "stale");
});

test("terminal dispute and superseded events override claim status", () => {
  assert.equal(
    deriveTrustStatus({
      claim,
      evidence,
      policy,
      events: [{
        id: "event-disputed",
        claimId: "claim-1",
        status: "disputed",
        actor: "operator",
        method: "user report",
        evidenceIds: [],
        createdAt: "2026-04-03T00:00:00.000Z",
      }],
    }),
    "disputed",
  );

  assert.equal(
    deriveTrustStatus({
      claim,
      evidence,
      policy,
      events: [{
        id: "event-superseded",
        claimId: "claim-1",
        status: "superseded",
        actor: "crawler",
        method: "new crawl",
        evidenceIds: [],
        createdAt: "2026-04-03T00:00:00.000Z",
      }],
    }),
    "superseded",
  );
});

test("does not allow a claim to self-assert verified without a verification event", () => {
  assert.equal(
    deriveTrustStatus({
      claim: { ...claim, status: "verified" },
      evidence: [],
      policy,
      events: [],
    }),
    "unknown",
  );
});

test("derives stale for commit-scoped verification when current integrity ref drifts", () => {
  const commitPolicy: VerificationPolicy = {
    id: "policy-commit",
    claimType: "software-proof",
    requiredEvidence: ["test_output"],
    requiredProof: ["proof lane"],
    reviewAuthority: "repo policy",
    validityRule: { kind: "commit" },
    stalenessTriggers: ["new commit touches the same surface"],
    conflictRules: ["failed proof supersedes passing proof"],
    impactLevel: "high",
  };
  const proofClaim: Claim = {
    ...claim,
    id: "claim-proof",
    claimType: "software-proof",
    currentIntegrityRef: "current-commit",
  };
  const proofEvidence: Evidence[] = [{
    id: "proof-output",
    claimId: "claim-proof",
    evidenceType: "test_output",
    sourceRef: "npm test",
    excerptOrSummary: "Tests passed.",
    observedAt: "2026-04-25T00:00:00.000Z",
    collectedBy: "veritas",
    integrityRef: "old-commit",
  }];
  const events: VerificationEvent[] = [{
    id: "event-proof",
    claimId: "claim-proof",
    status: "verified",
    actor: "veritas",
    method: "proof lane",
    evidenceIds: ["proof-output"],
    createdAt: "2026-04-25T00:00:00.000Z",
    verifiedAt: "2026-04-25T00:00:00.000Z",
  }];

  assert.equal(deriveTrustStatus({ claim: proofClaim, evidence: proofEvidence, policy: commitPolicy, events }), "stale");
});
