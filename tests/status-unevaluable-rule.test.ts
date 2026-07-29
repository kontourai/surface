import test from "node:test";
import assert from "node:assert/strict";
import { deriveTrustStatus } from "../src/status.js";
import type { Claim, Evidence, VerificationEvent, VerificationPolicy } from "../src/types.js";

/**
 * A declared validity rule that cannot be evaluated must fail closed.
 *
 * The failure these cover: omitting the one input a rule depends on was the
 * cheapest way to make a claim permanently fresh. A policy that says "validity
 * is bound to a commit" against a claim carrying no commit is unsatisfiable,
 * not satisfied.
 */

const baseClaim: Claim = {
  id: "claim-1",
  subjectType: "attested-record",
  subjectId: "record-1",
  facet: "field-attested-records.public-data",
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
    method: "observation",
    sourceRef: "https://example.test",
    excerptOrSummary: "Registration is open.",
    observedAt: "2026-04-01T00:00:00.000Z",
    collectedBy: "crawler",
    integrityRef: "sha256:aaaa",
  },
];

const verifiedEvent: VerificationEvent = {
  id: "event-1",
  claimId: "claim-1",
  status: "verified",
  evidenceIds: ["evidence-1"],
  actor: "operator",
  method: "attestation",
  createdAt: "2026-04-01T00:00:00.000Z",
  verifiedAt: "2026-04-01T00:00:00.000Z",
};

const now = new Date("2026-04-02T00:00:00.000Z");

function derive(claim: Claim, policy: VerificationPolicy | undefined) {
  return deriveTrustStatus({ claim, evidence, events: [verifiedEvent], policy, now });
}

function policyWith(validityRule: VerificationPolicy["validityRule"], id: string): VerificationPolicy {
  return {
    id,
    claimType: "public-data-field",
    requiredEvidence: [],
    acceptanceCriteria: [],
    reviewAuthority: "operator",
    validityRule,
    stalenessTriggers: [],
    conflictRules: [],
    impactLevel: "low",
  };
}

function commitPolicy(): VerificationPolicy {
  return policyWith({ kind: "commit" }, "policy-commit");
}

test("commit rule with no currentIntegrityRef on the claim is stale, not verified", () => {
  // The claim carries no commit, so the declared rule cannot be satisfied.
  const status = derive({ ...baseClaim, currentIntegrityRef: undefined }, commitPolicy());
  assert.equal(status, "stale");
});

test("commit rule still verifies when the claim's commit matches the event's evidence", () => {
  const status = derive({ ...baseClaim, currentIntegrityRef: "sha256:aaaa" }, commitPolicy());
  assert.equal(status, "verified");
});

test("commit rule is stale when the claim has moved to a different commit", () => {
  const status = derive({ ...baseClaim, currentIntegrityRef: "sha256:bbbb" }, commitPolicy());
  assert.equal(status, "stale");
});

test("duration rule with no durationDays is stale, not verified", () => {
  const policy = policyWith({ kind: "duration" } as VerificationPolicy["validityRule"], "policy-duration");
  assert.equal(derive(baseClaim, policy), "stale");
});

test("duration rule with an unparseable anchor timestamp is stale, not verified", () => {
  const policy = policyWith({ kind: "duration", durationDays: 30 }, "policy-duration");
  const badEvent: VerificationEvent = { ...verifiedEvent, verifiedAt: "not-a-date", createdAt: "not-a-date" };
  const status = deriveTrustStatus({
    claim: baseClaim,
    evidence,
    events: [badEvent],
    policy,
    now,
  });
  assert.equal(status, "stale");
});

test("duration rule within its window still verifies", () => {
  const policy = policyWith({ kind: "duration", durationDays: 30 }, "policy-duration");
  assert.equal(derive(baseClaim, policy), "verified");
});

test("declared non-expiring rules (historical, manual) remain verified — they are evaluable", () => {
  // Regression guard: an earlier version of this fix treated every non-duration
  // kind as unevaluable, which wrongly staled `manual` and `historical` claims.
  assert.equal(derive(baseClaim, policyWith({ kind: "manual" }, "policy-manual")), "verified");
  assert.equal(derive(baseClaim, policyWith({ kind: "historical" }, "policy-historical")), "verified");
});

test("a rule kind this version cannot evaluate at all is stale, not verified", () => {
  const policy = policyWith(
    { kind: "some-future-rule-this-version-cannot-evaluate" } as unknown as VerificationPolicy["validityRule"],
    "policy-future",
  );
  assert.equal(derive(baseClaim, policy), "stale");
});

test("no policy at all remains not-stale — no rule is declared, so none is unevaluable", () => {
  // Deliberate boundary: this is what distinguishes "nothing to enforce" from
  // "a rule was declared and we cannot check it". Changing this would make
  // every policy-less claim stale, which is a separate decision.
  assert.equal(derive(baseClaim, undefined), "verified");
});
