import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateTrustStatuses,
  isRequirementUnsupportedStatus,
  isUnsupportedStatus,
  deriveClaimGroupRollups,
  TRUST_STATUS_ORDER,
  type Claim,
  type ClaimGroup,
  type TrustStatus,
} from "../src/index.js";

/**
 * `aggregateTrustStatuses` decides what "verified" means for every rollup Surface produces,
 * and had zero test coverage until this file. That is why `revoked` was missing from its
 * precedence chain: nothing ever asked it the question. A fold whose default is the STRONGEST
 * value in the taxonomy must be exhaustive over the union by construction, so these tests
 * iterate TRUST_STATUS_ORDER rather than sampling — a status added later without a branch
 * fails here instead of silently returning "verified".
 */

const claim = (id: string, status: TrustStatus): Claim & { status: TrustStatus } => ({
  id,
  subjectType: "flow-step",
  subjectId: "subject",
  claimType: "builder.verify.tests",
  fieldOrBehavior: `behaviour-${id}`,
  value: "pass",
  impactLevel: "high",
  status,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const groupOver = (claimIds: string[]): ClaimGroup => ({
  id: "group",
  title: "Delivery requirements",
  kind: "requirement-set",
  requirements: [{ id: "req", title: "All checks", claimIds, required: true }],
});

const rollupOf = (claims: Array<Claim & { status: TrustStatus }>) => {
  const [group] = deriveClaimGroupRollups({
    claimGroups: [groupOver(claims.map((c) => c.id))],
    claims,
  });
  return { group, requirement: group.requirements[0] };
};

test("an empty set aggregates to unknown, never to verified", () => {
  assert.equal(aggregateTrustStatuses([]), "unknown");
});

test("every status alone aggregates to itself, except the documented superseded->stale collapse", () => {
  for (const status of TRUST_STATUS_ORDER) {
    const expected = status === "superseded" ? "stale" : status;
    assert.equal(
      aggregateTrustStatuses([status]),
      expected,
      `aggregate(["${status}"]) must be "${expected}" — a lone status must never be upgraded`,
    );
  }
});

test("no status is invisible beside verified: every non-verified status dominates the fold", () => {
  for (const status of TRUST_STATUS_ORDER) {
    if (status === "verified") continue;
    const expected = status === "superseded" ? "stale" : status;
    assert.equal(
      aggregateTrustStatuses(["verified", status]),
      expected,
      `aggregate(["verified","${status}"]) must be "${expected}" — a weaker claim must never be masked by a verified one`,
    );
    assert.equal(
      aggregateTrustStatuses([status, "verified"]),
      expected,
      "the fold must be order-independent",
    );
  }
});

test("revoked is the weakest status and dominates every other", () => {
  for (const status of TRUST_STATUS_ORDER) {
    assert.equal(
      aggregateTrustStatuses(["revoked", status]),
      "revoked",
      `a revoked claim must dominate "${status}"`,
    );
  }
});

test("the two unsupported predicates agree on assumed", () => {
  // They disagreed, and the rollup used the one that excluded `assumed` — so an assumed
  // claim landed in no list at all.
  for (const status of TRUST_STATUS_ORDER) {
    if (status === "assumed") {
      assert.equal(isUnsupportedStatus(status), true);
      assert.equal(isRequirementUnsupportedStatus(status), true);
    }
  }
});

test("a requirement of only disclosed gaps is NOT reported as verified", () => {
  const { requirement, group } = rollupOf([claim("c1", "assumed"), claim("c2", "assumed")]);
  assert.equal(
    requirement.status,
    "assumed",
    "an all-assumed requirement must report assumed — Surface's own waiver semantics (ADR 0020) forbid a bare assumed claim defaulting to a passing verdict",
  );
  assert.equal(group.status, "assumed");
});

test("a requirement of only disclosed gaps is DISTINGUISHABLE from a genuinely verified one", () => {
  const gaps = rollupOf([claim("c1", "assumed"), claim("c2", "assumed")]);
  const real = rollupOf([claim("c1", "verified"), claim("c2", "verified")]);
  assert.notEqual(
    gaps.requirement.status,
    real.requirement.status,
    "an all-gap requirement and an all-evidenced requirement must not report the same status",
  );
  assert.notEqual(gaps.group.status, real.group.status);
});

test("assumed claims are visible in the rollup rather than absent from every list", () => {
  const { requirement } = rollupOf([claim("c1", "assumed"), claim("c2", "assumed")]);
  assert.deepEqual(requirement.unsupportedClaims, ["c1", "c2"]);
  assert.deepEqual(requirement.verifiedClaims, []);
});

test("a single disclosed gap is not absorbed by verified siblings", () => {
  const { requirement } = rollupOf([
    claim("c1", "verified"),
    claim("c2", "verified"),
    claim("c3", "assumed"),
  ]);
  assert.equal(requirement.status, "assumed");
  assert.deepEqual(requirement.verifiedClaims, ["c1", "c2"]);
  assert.deepEqual(requirement.unsupportedClaims, ["c3"]);
});

test("genuinely verified requirements still report verified", () => {
  // The guard must not be an outage: the honest case must keep passing.
  const { requirement, group } = rollupOf([claim("c1", "verified"), claim("c2", "verified")]);
  assert.equal(requirement.status, "verified");
  assert.equal(group.status, "verified");
  assert.deepEqual(requirement.unsupportedClaims, []);
});
