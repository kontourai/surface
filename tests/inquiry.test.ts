/**
 * ADR 0003 steps 3 & 4 — resolveInquiry and evaluateDerivationRule tests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  evaluateDerivationRule,
  resolveInquiry,
  validateTrustBundle,
  statusFunctionVersion,
} from "../src/index.js";
import type {
  Claim,
  DerivationRule,
  Evidence,
  Inquiry,
  TrustBundle,
  VerificationEvent,
  VerificationPolicy,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Minimal bundle helpers
// ---------------------------------------------------------------------------

function makeBundle(overrides: Partial<TrustBundle> = {}): TrustBundle {
  return {
    schemaVersion: 3,
    source: "test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

const BASE_CLAIM: Claim = {
  id: "claim-1",
  subjectType: "repo",
  subjectId: "acme/api",
  facet: "repo.developer-evidence",
  claimType: "software-evidence",
  fieldOrBehavior: "testspassing",
  value: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  status: "proposed",
};

const VERIFIED_EVENT: VerificationEvent = {
  id: "event-1",
  claimId: "claim-1",
  status: "verified",
  actor: "ci",
  method: "test-run",
  evidenceIds: ["evidence-1"],
  createdAt: "2026-06-01T00:10:00.000Z",
  verifiedAt: "2026-06-01T00:10:00.000Z",
};

const TEST_OUTPUT_EVIDENCE: Evidence = {
  id: "evidence-1",
  claimId: "claim-1",
  evidenceType: "test_output",
  method: "validation",
  sourceRef: "npm test",
  excerptOrSummary: "All tests passed.",
  observedAt: "2026-06-01T00:05:00.000Z",
  collectedBy: "ci",
};

const SHORT_DURATION_POLICY: VerificationPolicy = {
  id: "policy-1",
  claimType: "software-evidence",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["tests pass"],
  reviewAuthority: "system",
  validityRule: { kind: "duration", durationDays: 7 },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "high",
};

function makeInquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    id: "inquiry-1",
    question: "Do the API tests pass?",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
    askedBy: "user@example.com",
    askedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Step 3: Exact-match resolution
// ---------------------------------------------------------------------------

test("resolveInquiry returns 'matched' when canonical key matches a bundle claim", () => {
  const bundle = makeBundle({
    claims: [BASE_CLAIM],
    evidence: [TEST_OUTPUT_EVIDENCE],
    events: [VERIFIED_EVENT],
    policies: [SHORT_DURATION_POLICY],
  });
  const inquiry = makeInquiry();
  const now = new Date("2026-06-03T00:00:00.000Z"); // within 7-day window
  const record = resolveInquiry(bundle, inquiry, { now });

  assert.equal(record.outcome, "matched");
  assert.equal(record.resolutionPath.claimIds[0], "claim-1");
  assert.equal(record.answer?.value, true);
  assert.equal(record.answer?.status, "verified");
  assert.equal(record.inputSnapshot.length, 1);
  assert.equal(record.inputSnapshot[0].claimId, "claim-1");
  assert.equal(record.statusFunctionVersion, statusFunctionVersion);
  assert.ok(record.resolvedAt.startsWith("2026-06-03"));
});

test("resolveInquiry exact-match is case-insensitive for subjectType and fieldOrBehavior", () => {
  const bundle = makeBundle({
    claims: [{ ...BASE_CLAIM, subjectType: "REPO", fieldOrBehavior: "TESTSPASSING" }],
    evidence: [TEST_OUTPUT_EVIDENCE],
    events: [VERIFIED_EVENT],
    policies: [SHORT_DURATION_POLICY],
  });
  // inquiry uses lowercase — should still match
  const record = resolveInquiry(bundle, makeInquiry(), { now: new Date("2026-06-03T00:00:00.000Z") });
  assert.equal(record.outcome, "matched");
});

test("resolveInquiry match is case-sensitive for subjectId", () => {
  const bundle = makeBundle({
    claims: [{ ...BASE_CLAIM, subjectId: "ACME/api" }], // different case on subjectId
    evidence: [],
    events: [],
    policies: [],
  });
  const record = resolveInquiry(bundle, makeInquiry(), { now: new Date("2026-06-03T00:00:00.000Z") });
  // subjectId mismatch → no match
  assert.equal(record.outcome, "unsupported");
});

// ---------------------------------------------------------------------------
// Step 3: Unsupported outcome
// ---------------------------------------------------------------------------

test("resolveInquiry returns 'unsupported' when no claim or rule matches", () => {
  const bundle = makeBundle({ claims: [BASE_CLAIM] });
  const inquiry = makeInquiry({
    target: { subjectType: "repo", subjectId: "other/repo", fieldOrBehavior: "testspassing" },
  });
  const record = resolveInquiry(bundle, inquiry, { now: new Date("2026-06-03T00:00:00.000Z") });
  assert.equal(record.outcome, "unsupported");
  assert.deepEqual(record.resolutionPath.claimIds, []);
  assert.equal(record.answer, undefined);
  assert.equal(record.inputSnapshot.length, 0);
});

test("resolveInquiry returns 'unsupported' for natural-language-only inquiry (no target)", () => {
  const bundle = makeBundle({ claims: [BASE_CLAIM] });
  const inquiry: Inquiry = {
    id: "inq-nl",
    question: "Is the system reliable?",
    askedBy: "user@example.com",
    askedAt: "2026-06-05T00:00:00.000Z",
    // no target
  };
  const record = resolveInquiry(bundle, inquiry, { now: new Date("2026-06-03T00:00:00.000Z") });
  assert.equal(record.outcome, "unsupported");
});

// ---------------------------------------------------------------------------
// Step 3: InquiryRecord snapshots status at the given `now`
// ---------------------------------------------------------------------------

test("inputSnapshot captures status at resolution time — freshness boundary changes status", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const bundle = validateTrustBundle(JSON.parse(raw));

  // The field-attested-records claim is stale by 2026-04-25 (14-day window from 2026-04-01)
  const staleTarget = {
    subjectType: "attested-record",
    subjectId: "field-attested-records:denver-example-record",
    fieldOrBehavior: "registrationstatus",
  };
  const inquiry: Inquiry = {
    id: "inq-freshness",
    question: "What is the registration status?",
    target: staleTarget,
    askedBy: "test",
    askedAt: "2026-04-25T00:00:00.000Z",
  };

  // Before the staleness window expires: status should be verified
  const earlyRecord = resolveInquiry(bundle, inquiry, { now: new Date("2026-04-05T00:00:00.000Z") });
  assert.equal(earlyRecord.outcome, "matched");
  assert.equal(earlyRecord.inputSnapshot[0].status, "verified", "Should be verified before staleness");

  // After the staleness window expires: status should be stale
  const lateRecord = resolveInquiry(bundle, inquiry, { now: new Date("2026-04-25T00:00:00.000Z") });
  assert.equal(lateRecord.outcome, "matched");
  assert.equal(lateRecord.inputSnapshot[0].status, "stale", "Should be stale after freshness window");

  // The two snapshots disagree — proving the snapshot is time-dependent
  assert.notEqual(earlyRecord.inputSnapshot[0].status, lateRecord.inputSnapshot[0].status);
});

// ---------------------------------------------------------------------------
// Step 4: evaluateDerivationRule — all combinator
// ---------------------------------------------------------------------------

const REPO_CLAIM: Claim = {
  id: "claim-tests",
  subjectType: "repo",
  subjectId: "acme/api",
  facet: "repo.developer-evidence",
  claimType: "software-evidence",
  fieldOrBehavior: "testspassing",
  value: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const COVERAGE_CLAIM: Claim = {
  id: "claim-coverage",
  subjectType: "repo",
  subjectId: "acme/api",
  facet: "repo.developer-evidence",
  claimType: "software-evidence",
  fieldOrBehavior: "coveragepercent",
  value: 95,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const VERIFIED_TESTS_EVENT: VerificationEvent = {
  id: "evt-tests",
  claimId: "claim-tests",
  status: "verified",
  actor: "ci",
  method: "test-run",
  evidenceIds: ["ev-tests"],
  createdAt: "2026-06-01T00:10:00.000Z",
  verifiedAt: "2026-06-01T00:10:00.000Z",
};

const VERIFIED_COVERAGE_EVENT: VerificationEvent = {
  id: "evt-coverage",
  claimId: "claim-coverage",
  status: "verified",
  actor: "ci",
  method: "test-run",
  evidenceIds: ["ev-coverage"],
  createdAt: "2026-06-01T00:10:00.000Z",
  verifiedAt: "2026-06-01T00:10:00.000Z",
};

const TESTS_EVIDENCE: Evidence = {
  id: "ev-tests",
  claimId: "claim-tests",
  evidenceType: "test_output",
  method: "validation",
  sourceRef: "npm test",
  excerptOrSummary: "All tests passed.",
  observedAt: "2026-06-01T00:05:00.000Z",
  collectedBy: "ci",
};

const COVERAGE_EVIDENCE: Evidence = {
  id: "ev-coverage",
  claimId: "claim-coverage",
  evidenceType: "test_output",
  method: "validation",
  sourceRef: "npm test",
  excerptOrSummary: "Coverage 95%.",
  observedAt: "2026-06-01T00:05:00.000Z",
  collectedBy: "ci",
};

const SOFTWARE_POLICY: VerificationPolicy = {
  id: "policy-sw",
  claimType: "software-evidence",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["tests pass"],
  reviewAuthority: "system",
  validityRule: { kind: "duration", durationDays: 30 },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "high",
};

const RELEASE_READY_RULE: DerivationRule = {
  id: "rule-release-ready",
  version: "1.0.0",
  name: "Release Ready",
  target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "releaseready" },
  requirements: [
    {
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    },
    {
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "coveragepercent" },
      acceptedStatuses: ["verified"],
      predicate: { op: "gte", value: 90 },
    },
  ],
  combinator: "all",
};

test("evaluateDerivationRule: all combinator satisfied when all requirements met", () => {
  const bundle = makeBundle({
    claims: [REPO_CLAIM, COVERAGE_CLAIM],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(RELEASE_READY_RULE, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, true);
  assert.equal(result.inputs.length, 2);
  assert.ok(result.inputs.every((i) => i.requirementMet));
  assert.equal(result.missing.length, 0);
});

test("evaluateDerivationRule: all combinator not satisfied when one requirement fails", () => {
  // Coverage is only 75% — fails the gte:90 predicate
  const lowCoverage = { ...COVERAGE_CLAIM, value: 75 };
  const bundle = makeBundle({
    claims: [REPO_CLAIM, lowCoverage],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(RELEASE_READY_RULE, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, false);
  const coverageInput = result.inputs.find((i) => i.claimId === "claim-coverage");
  assert.ok(coverageInput);
  assert.equal(coverageInput.requirementMet, false);
});

// ---------------------------------------------------------------------------
// Step 4: evaluateDerivationRule — any combinator
// ---------------------------------------------------------------------------

test("evaluateDerivationRule: any combinator satisfied when at least one requirement is met", () => {
  const anyRule: DerivationRule = {
    ...RELEASE_READY_RULE,
    id: "rule-any",
    combinator: "any",
  };
  // Only tests pass, coverage is low — but "any" is enough
  const lowCoverage = { ...COVERAGE_CLAIM, value: 50 };
  const bundle = makeBundle({
    claims: [REPO_CLAIM, lowCoverage],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(anyRule, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, true);
  const testsInput = result.inputs.find((i) => i.claimId === "claim-tests");
  assert.equal(testsInput?.requirementMet, true);
});

test("evaluateDerivationRule: any combinator not satisfied when no requirements met", () => {
  const anyRule: DerivationRule = { ...RELEASE_READY_RULE, id: "rule-any-fail", combinator: "any" };
  // Tests claim has stale status (no events + no policy → unknown, which is not "verified")
  const bundle = makeBundle({
    claims: [REPO_CLAIM, COVERAGE_CLAIM],
    evidence: [],
    events: [],
    policies: [],
  });
  const result = evaluateDerivationRule(anyRule, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, false);
});

// ---------------------------------------------------------------------------
// Step 4: missing claims
// ---------------------------------------------------------------------------

test("evaluateDerivationRule: missing claims are reported and requirement fails", () => {
  // Bundle has no coverage claim
  const bundle = makeBundle({
    claims: [REPO_CLAIM],
    evidence: [TESTS_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(RELEASE_READY_RULE, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, false);
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].fieldOrBehavior, "coveragepercent");
});

// ---------------------------------------------------------------------------
// Step 4: predicate operators
// ---------------------------------------------------------------------------

test("predicate op=eq matches exact value", () => {
  const rule: DerivationRule = {
    id: "rule-eq",
    version: "1",
    name: "Test",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [REPO_CLAIM],
    evidence: [TESTS_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(rule, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, true);
});

test("predicate op=neq passes when value differs", () => {
  const rule: DerivationRule = {
    id: "rule-neq",
    version: "1",
    name: "Test",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],
      predicate: { op: "neq", value: false },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [REPO_CLAIM],
    evidence: [TESTS_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(rule, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, true);
});

test("predicate op=gt passes for numeric comparison", () => {
  const rule: DerivationRule = {
    id: "rule-gt",
    version: "1",
    name: "Test",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "coveragepercent" },
      acceptedStatuses: ["verified"],
      predicate: { op: "gt", value: 80 },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [COVERAGE_CLAIM],
    evidence: [COVERAGE_EVIDENCE],
    events: [VERIFIED_COVERAGE_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(rule, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, true);
});

test("predicate op=lte passes and op=lt fails for boundary value", () => {
  // value is 95; lte:95 should pass, lt:95 should fail
  const ruleBase: Omit<DerivationRule, "id"> = {
    version: "1",
    name: "Test",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "coveragepercent" },
      acceptedStatuses: ["verified"],
      predicate: { op: "lte", value: 95 },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [COVERAGE_CLAIM],
    evidence: [COVERAGE_EVIDENCE],
    events: [VERIFIED_COVERAGE_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const lteResult = evaluateDerivationRule({ ...ruleBase, id: "rule-lte" }, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(lteResult.satisfied, true);

  const ltRule: DerivationRule = {
    ...ruleBase,
    id: "rule-lt",
    requirements: [{
      ...ruleBase.requirements[0],
      predicate: { op: "lt", value: 95 },
    }],
  };
  const ltResult = evaluateDerivationRule(ltRule, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(ltResult.satisfied, false);
});

test("predicate op=in passes when value is in the array", () => {
  const statusClaim: Claim = {
    id: "claim-status",
    subjectType: "t",
    subjectId: "id",
    facet: "s",
    claimType: "ct",
    fieldOrBehavior: "state",
    value: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    status: "assumed",
  };
  const rule: DerivationRule = {
    id: "rule-in",
    version: "1",
    name: "Test",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "state" },
      acceptedStatuses: ["assumed"],
      predicate: { op: "in", value: ["active", "pending"] },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({ claims: [statusClaim] });
  const result = evaluateDerivationRule(rule, bundle, {});
  assert.equal(result.satisfied, true);
});

test("predicate op=exists passes when value is not null/undefined", () => {
  const rule: DerivationRule = {
    id: "rule-exists",
    version: "1",
    name: "Test",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],
      predicate: { op: "exists" },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [REPO_CLAIM],
    evidence: [TESTS_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(rule, bundle, { now: new Date("2026-06-15T00:00:00.000Z") });
  assert.equal(result.satisfied, true);
});

test("numeric string coercion in predicate (gte)", () => {
  const claimWithStringValue: Claim = {
    id: "claim-str-num",
    subjectType: "repo",
    subjectId: "acme/api",
    facet: "s",
    claimType: "software-evidence",
    fieldOrBehavior: "coveragepercent",
    value: "92",  // string, not number
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const rule: DerivationRule = {
    id: "rule-str-coerce",
    version: "1",
    name: "Test",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "coveragepercent" },
      acceptedStatuses: ["unknown"],
      predicate: { op: "gte", value: 90 },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({ claims: [claimWithStringValue] });
  const result = evaluateDerivationRule(rule, bundle, {});
  assert.equal(result.satisfied, true);
});

// ---------------------------------------------------------------------------
// Step 3 + 4: resolveInquiry returns "derived" for a matching rule
// ---------------------------------------------------------------------------

test("resolveInquiry returns 'derived' when a rule matches and is satisfied", () => {
  const bundle = makeBundle({
    claims: [REPO_CLAIM, COVERAGE_CLAIM],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT],
    policies: [SOFTWARE_POLICY],
  });

  const releaseReadyInquiry: Inquiry = {
    id: "inq-release",
    question: "Is acme/api release ready?",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "releaseready" },
    askedBy: "engineer@example.com",
    askedAt: "2026-06-15T00:00:00.000Z",
  };

  const record = resolveInquiry(bundle, releaseReadyInquiry, {
    now: new Date("2026-06-15T00:00:00.000Z"),
    rules: [RELEASE_READY_RULE],
  });

  assert.equal(record.outcome, "derived");
  assert.equal(record.resolutionPath.ruleId, "rule-release-ready");
  assert.equal(record.resolutionPath.ruleVersion, "1.0.0");
  assert.equal(record.answer?.value, true);
  assert.equal(record.answer?.status, "verified");
  assert.equal(record.inputSnapshot.length, 2);
  assert.ok(record.resolutionPath.claimIds.includes("claim-tests"));
  assert.ok(record.resolutionPath.claimIds.includes("claim-coverage"));
});

test("resolveInquiry returns 'derived' with satisfied=false when rule fails", () => {
  const lowCoverage = { ...COVERAGE_CLAIM, value: 50 };
  const bundle = makeBundle({
    claims: [REPO_CLAIM, lowCoverage],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const inquiry: Inquiry = {
    id: "inq-fail",
    question: "Is release ready?",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "releaseready" },
    askedBy: "test",
    askedAt: "2026-06-15T00:00:00.000Z",
  };
  const record = resolveInquiry(bundle, inquiry, {
    now: new Date("2026-06-15T00:00:00.000Z"),
    rules: [RELEASE_READY_RULE],
  });
  assert.equal(record.outcome, "derived");
  assert.equal(record.answer?.value, false);
  assert.equal(record.answer?.status, "proposed");
});

test("resolveInquiry prefers exact match over derivation rule", () => {
  // Add a claim that directly answers the "releaseready" question
  const directClaim: Claim = {
    id: "claim-release-direct",
    subjectType: "repo",
    subjectId: "acme/api",
    facet: "s",
    claimType: "ct",
    fieldOrBehavior: "releaseready",
    value: "ship it",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    status: "assumed",
  };
  const bundle = makeBundle({ claims: [directClaim] });
  const inquiry: Inquiry = {
    id: "inq-prefer-exact",
    question: "Is release ready?",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "releaseready" },
    askedBy: "test",
    askedAt: "2026-06-15T00:00:00.000Z",
  };
  const record = resolveInquiry(bundle, inquiry, {
    now: new Date("2026-06-15T00:00:00.000Z"),
    rules: [RELEASE_READY_RULE],
  });
  assert.equal(record.outcome, "matched");
  assert.equal(record.answer?.value, "ship it");
});

// ---------------------------------------------------------------------------
// Step 3: InquiryRecord fields validation
// ---------------------------------------------------------------------------

test("InquiryRecord contains the original inquiry object verbatim", () => {
  const inquiry = makeInquiry({ metadata: { ticketId: "TICKET-123" } });
  const bundle = makeBundle({ claims: [BASE_CLAIM], evidence: [TEST_OUTPUT_EVIDENCE], events: [VERIFIED_EVENT], policies: [SHORT_DURATION_POLICY] });
  const record = resolveInquiry(bundle, inquiry, { now: new Date("2026-06-03T00:00:00.000Z") });
  assert.deepEqual(record.inquiry, inquiry);
});

test("resolveInquiry does not mutate the bundle", () => {
  const bundle = makeBundle({ claims: [BASE_CLAIM] });
  const original = JSON.stringify(bundle);
  resolveInquiry(bundle, makeInquiry(), { now: new Date() });
  assert.equal(JSON.stringify(bundle), original);
});

// ---------------------------------------------------------------------------
// ruleRef requirements — ADR 0003 §5 rule composition
// ---------------------------------------------------------------------------

// Shared claims + rules for ruleRef tests
const SECURITY_SCAN_CLAIM: import("../src/index.js").Claim = {
  id: "claim-sec-scan",
  subjectType: "repo",
  subjectId: "acme/api",
  facet: "repo.security",
  claimType: "software-evidence",
  fieldOrBehavior: "securityscanpassed",
  value: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const VERIFIED_SEC_SCAN_EVENT: import("../src/index.js").VerificationEvent = {
  id: "evt-sec-scan",
  claimId: "claim-sec-scan",
  status: "verified",
  actor: "ci",
  method: "test-run",
  evidenceIds: ["ev-sec-scan"],
  createdAt: "2026-06-01T00:10:00.000Z",
  verifiedAt: "2026-06-01T00:10:00.000Z",
};

const SEC_SCAN_EVIDENCE: import("../src/index.js").Evidence = {
  id: "ev-sec-scan",
  claimId: "claim-sec-scan",
  evidenceType: "test_output",
  method: "validation",
  sourceRef: "npm audit",
  excerptOrSummary: "No vulnerabilities found.",
  observedAt: "2026-06-01T00:05:00.000Z",
  collectedBy: "ci",
};

// Rule A: tests + coverage (leaf rule)
const RULE_A: import("../src/index.js").DerivationRule = {
  id: "rule-a",
  version: "1.0.0",
  name: "Quality Gate A",
  target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "qualitygatea" },
  requirements: [
    {
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    },
    {
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "coveragepercent" },
      acceptedStatuses: ["verified"],
      predicate: { op: "gte", value: 90 },
    },
  ],
  combinator: "all",
};

// Rule B: security scan (leaf rule)
const RULE_B: import("../src/index.js").DerivationRule = {
  id: "rule-b",
  version: "1.0.0",
  name: "Quality Gate B",
  target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "qualitygateb" },
  requirements: [
    {
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "securityscanpassed" },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    },
  ],
  combinator: "all",
};

// Rule C: composite rule — ruleRef to A and B
const RULE_C: import("../src/index.js").DerivationRule = {
  id: "rule-c",
  version: "1.0.0",
  name: "Composite Gate (A+B)",
  target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "compositegate" },
  requirements: [
    { ruleRef: "rule-a" },
    { ruleRef: "rule-b" },
  ],
  combinator: "all",
};

test("ruleRef: satisfied when referenced rule is satisfied", () => {
  const bundle = makeBundle({
    claims: [REPO_CLAIM, COVERAGE_CLAIM, SECURITY_SCAN_CLAIM],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE, SEC_SCAN_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT, VERIFIED_SEC_SCAN_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(RULE_C, bundle, {
    now: new Date("2026-06-15T00:00:00.000Z"),
    rules: [RULE_A, RULE_B, RULE_C],
  });
  assert.equal(result.satisfied, true);
  assert.ok(Array.isArray(result.transitiveRuleIds), "transitiveRuleIds should be set");
  assert.ok(result.transitiveRuleIds!.includes("rule-a"), "rule-a in transitiveRuleIds");
  assert.ok(result.transitiveRuleIds!.includes("rule-b"), "rule-b in transitiveRuleIds");
  // Claim ids from both sub-rules propagate to the composite result
  assert.ok(result.inputs.some((i) => i.claimId === "claim-tests"));
  assert.ok(result.inputs.some((i) => i.claimId === "claim-coverage"));
  assert.ok(result.inputs.some((i) => i.claimId === "claim-sec-scan"));
});

test("ruleRef: unsatisfied when referenced rule fails", () => {
  // Low coverage makes rule-a fail
  const lowCoverage = { ...COVERAGE_CLAIM, value: 50 };
  const bundle = makeBundle({
    claims: [REPO_CLAIM, lowCoverage, SECURITY_SCAN_CLAIM],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE, SEC_SCAN_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT, VERIFIED_SEC_SCAN_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(RULE_C, bundle, {
    now: new Date("2026-06-15T00:00:00.000Z"),
    rules: [RULE_A, RULE_B, RULE_C],
  });
  assert.equal(result.satisfied, false);
});

test("ruleRef: cycle detection fails the requirement with a missing sentinel", () => {
  // Rule D references itself → cycle
  const RULE_D: import("../src/index.js").DerivationRule = {
    id: "rule-d",
    version: "1.0.0",
    name: "Cyclic Rule",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "cyclic" },
    requirements: [{ ruleRef: "rule-d" }],
    combinator: "all",
  };
  const bundle = makeBundle({});
  const result = evaluateDerivationRule(RULE_D, bundle, { rules: [RULE_D] });
  assert.equal(result.satisfied, false);
  // The cycle is reported as a missing sentinel with subjectType "_cycle_"
  assert.ok(result.missing.some((m) => m.subjectType === "_cycle_" && m.subjectId === "rule-d"));
});

test("ruleRef: A → B → C nested chain resolves correctly with transitiveRuleIds", () => {
  // Rule B2: leaf — just needs securityscan claim
  const RULE_B2: import("../src/index.js").DerivationRule = {
    id: "rule-b2",
    version: "1.0.0",
    name: "Inner B",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "innerb" },
    requirements: [
      {
        target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "securityscanpassed" },
        acceptedStatuses: ["verified"],
      },
    ],
    combinator: "all",
  };
  // Rule A2: references B2
  const RULE_A2: import("../src/index.js").DerivationRule = {
    id: "rule-a2",
    version: "1.0.0",
    name: "Middle A",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "middlea" },
    requirements: [{ ruleRef: "rule-b2" }],
    combinator: "all",
  };
  // Rule TOP: references A2
  const RULE_TOP: import("../src/index.js").DerivationRule = {
    id: "rule-top",
    version: "1.0.0",
    name: "Top Level",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "toplevel" },
    requirements: [{ ruleRef: "rule-a2" }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [SECURITY_SCAN_CLAIM],
    evidence: [SEC_SCAN_EVIDENCE],
    events: [VERIFIED_SEC_SCAN_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(RULE_TOP, bundle, {
    now: new Date("2026-06-15T00:00:00.000Z"),
    rules: [RULE_TOP, RULE_A2, RULE_B2],
  });
  assert.equal(result.satisfied, true);
  assert.ok(Array.isArray(result.transitiveRuleIds));
  // Both rule-a2 and rule-b2 should appear
  assert.ok(result.transitiveRuleIds!.includes("rule-a2"), "rule-a2 in transitiveRuleIds");
  assert.ok(result.transitiveRuleIds!.includes("rule-b2"), "rule-b2 in transitiveRuleIds");
  // The claim from rule-b2 appears in inputs
  assert.ok(result.inputs.some((i) => i.claimId === "claim-sec-scan"));
});

// ---------------------------------------------------------------------------
// fresherThan requirements
// ---------------------------------------------------------------------------

test("fresherThan: requirement met when claim is within the freshness window", () => {
  // verifiedAt is 2026-06-01; now is 2026-06-08 → 7 days → exactly within a 7-day window
  const rule: import("../src/index.js").DerivationRule = {
    id: "rule-fresh",
    version: "1",
    name: "Fresh tests",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],
      fresherThan: { days: 7 },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [REPO_CLAIM],
    evidence: [TESTS_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  // exactly 7 days after the verifiedAt timestamp
  const result = evaluateDerivationRule(rule, bundle, {
    now: new Date("2026-06-08T00:10:00.000Z"),
  });
  assert.equal(result.satisfied, true);
  assert.equal(result.inputs[0].requirementMet, true);
});

test("fresherThan: requirement NOT met when claim is outside the freshness window", () => {
  const rule: import("../src/index.js").DerivationRule = {
    id: "rule-stale",
    version: "1",
    name: "Stale tests",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],
      fresherThan: { days: 7 },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({
    claims: [REPO_CLAIM],
    evidence: [TESTS_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  // 8 days after verifiedAt — outside 7-day window
  const result = evaluateDerivationRule(rule, bundle, {
    now: new Date("2026-06-09T00:10:00.000Z"),
  });
  assert.equal(result.satisfied, false);
  assert.equal(result.inputs[0].requirementMet, false);
});

test("fresherThan: combined with acceptedStatuses — fails when status not accepted even if fresh", () => {
  const rule: import("../src/index.js").DerivationRule = {
    id: "rule-status-and-fresh",
    version: "1",
    name: "Status + Freshness",
    target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testspassing" },
      acceptedStatuses: ["verified"],  // requires verified
      fresherThan: { days: 30 },
    }],
    combinator: "all",
  };
  // No events → status will be "proposed" (there is evidence but no verified event)
  const bundle = makeBundle({
    claims: [REPO_CLAIM],
    evidence: [TESTS_EVIDENCE],
    events: [],  // no verified event → not "verified" status
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(rule, bundle, {
    now: new Date("2026-06-05T00:00:00.000Z"),
  });
  // Status is not "verified" → fails even though it would be fresh
  assert.equal(result.satisfied, false);
  assert.equal(result.inputs[0].requirementMet, false);
});

test("fresherThan: falls back to claim.updatedAt when no verifying events exist", () => {
  // No verification events — freshness uses claim.updatedAt
  const claimUpdatedRecently: import("../src/index.js").Claim = {
    id: "claim-recent-update",
    subjectType: "t",
    subjectId: "id",
    facet: "s",
    claimType: "ct",
    fieldOrBehavior: "field",
    value: "x",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    status: "assumed",
  };
  const rule: import("../src/index.js").DerivationRule = {
    id: "rule-fallback",
    version: "1",
    name: "Fallback to updatedAt",
    target: { subjectType: "t2", subjectId: "id2", fieldOrBehavior: "result" },
    requirements: [{
      target: { subjectType: "t", subjectId: "id", fieldOrBehavior: "field" },
      acceptedStatuses: ["assumed"],
      fresherThan: { days: 5 },
    }],
    combinator: "all",
  };
  const bundle = makeBundle({ claims: [claimUpdatedRecently] });
  // 3 days after updatedAt — within 5-day window
  const withinResult = evaluateDerivationRule(rule, bundle, {
    now: new Date("2026-06-13T00:00:00.000Z"),
  });
  assert.equal(withinResult.satisfied, true);

  // 6 days after updatedAt — outside 5-day window
  const outsideResult = evaluateDerivationRule(rule, bundle, {
    now: new Date("2026-06-16T00:00:00.000Z"),
  });
  assert.equal(outsideResult.satisfied, false);
});

// ---------------------------------------------------------------------------
// resolutionPath transitivity via resolveInquiry
// ---------------------------------------------------------------------------

test("resolveInquiry with ruleRef: resolutionPath includes transitiveRuleIds", () => {
  const bundle = makeBundle({
    claims: [REPO_CLAIM, COVERAGE_CLAIM, SECURITY_SCAN_CLAIM],
    evidence: [TESTS_EVIDENCE, COVERAGE_EVIDENCE, SEC_SCAN_EVIDENCE],
    events: [VERIFIED_TESTS_EVENT, VERIFIED_COVERAGE_EVENT, VERIFIED_SEC_SCAN_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const inquiry: Inquiry = {
    id: "inq-composite",
    question: "Is the composite gate satisfied?",
    target: { subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "compositegate" },
    askedBy: "test",
    askedAt: "2026-06-15T00:00:00.000Z",
  };
  const record = resolveInquiry(bundle, inquiry, {
    now: new Date("2026-06-15T00:00:00.000Z"),
    rules: [RULE_A, RULE_B, RULE_C],
  });
  assert.equal(record.outcome, "derived");
  assert.equal(record.answer?.value, true);
  assert.ok(Array.isArray(record.resolutionPath.transitiveRuleIds));
  assert.ok(record.resolutionPath.transitiveRuleIds!.includes("rule-a"));
  assert.ok(record.resolutionPath.transitiveRuleIds!.includes("rule-b"));
  // All transitive claim ids appear in claimIds
  assert.ok(record.resolutionPath.claimIds.includes("claim-tests"));
  assert.ok(record.resolutionPath.claimIds.includes("claim-coverage"));
  assert.ok(record.resolutionPath.claimIds.includes("claim-sec-scan"));
});

// ---------------------------------------------------------------------------
// requiresActiveAuthority — active / expired / revoked / missing trace
// ---------------------------------------------------------------------------

// Shared fixtures for authority tests
const AUTH_CLAIM: import('../src/index.js').Claim = {
  id: 'claim-auth',
  subjectType: 'ai-system',
  subjectId: 'acme-screening-ai',
  facet: 'compliance',
  claimType: 'oversight',
  fieldOrBehavior: 'oversightauthorityactive',
  value: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const AUTH_CLAIM_EVENT: import('../src/index.js').VerificationEvent = {
  id: 'evt-auth',
  claimId: 'claim-auth',
  status: 'verified',
  actor: 'dpo@acme.example',
  method: 'attestation',
  evidenceIds: ['ev-auth'],
  createdAt: '2026-01-01T00:10:00.000Z',
  verifiedAt: '2026-01-01T00:10:00.000Z',
};

const AUTH_EVIDENCE: import('../src/index.js').Evidence = {
  id: 'ev-auth',
  claimId: 'claim-auth',
  supportStrength: 'entails',
  evidenceType: 'attestation',
  method: 'attestation',
  sourceRef: 'iam-record',
  excerptOrSummary: 'DPO confirms oversight authority active.',
  observedAt: '2026-01-01T00:00:00.000Z',
  collectedBy: 'dpo@acme.example',
};

const ACTIVE_TRACE: import('../src/index.js').AuthorityTrace = {
  id: 'trace-dpo-active',
  subject: { subjectType: 'ai-system', subjectId: 'acme-screening-ai' },
  actorRef: 'dpo@acme.example',
  authorityType: 'role',
  authorityRef: 'DPO',
  sourceRef: 'hr-iam',
  observedAt: '2026-01-01T00:00:00.000Z',
  validFrom: '2025-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
};

const EXPIRED_TRACE: import('../src/index.js').AuthorityTrace = {
  ...ACTIVE_TRACE,
  id: 'trace-dpo-expired',
  validUntil: '2025-12-31T23:59:59.000Z',
};

const REVOKED_TRACE: import('../src/index.js').AuthorityTrace = {
  ...ACTIVE_TRACE,
  id: 'trace-dpo-revoked',
  revokedAt: '2025-06-01T00:00:00.000Z',
};

const AUTH_RULE: import('../src/index.js').DerivationRule = {
  id: 'rule-active-authority',
  version: '1.0.0',
  name: 'Active Authority Check',
  target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'oversightready' },
  requirements: [{
    target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'oversightauthorityactive' },
    acceptedStatuses: ['verified'],
    requiresActiveAuthority: true,
  }],
  combinator: 'all',
};

const NOW_IN_WINDOW = new Date('2026-06-01T00:00:00.000Z');

test('requiresActiveAuthority: met when actor has active trace', () => {
  const bundle = makeBundle({
    claims: [AUTH_CLAIM],
    evidence: [AUTH_EVIDENCE],
    events: [AUTH_CLAIM_EVENT],
    policies: [SOFTWARE_POLICY],
    authorityTrace: [ACTIVE_TRACE],
  });
  const result = evaluateDerivationRule(AUTH_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, true);
  assert.equal(result.inputs[0].requirementMet, true);
});

test('requiresActiveAuthority: not met when actor has expired trace', () => {
  const bundle = makeBundle({
    claims: [AUTH_CLAIM],
    evidence: [AUTH_EVIDENCE],
    events: [AUTH_CLAIM_EVENT],
    policies: [SOFTWARE_POLICY],
    authorityTrace: [EXPIRED_TRACE],
  });
  const result = evaluateDerivationRule(AUTH_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, false);
  assert.equal(result.inputs[0].requirementMet, false);
});

test('requiresActiveAuthority: not met when actor trace is revoked', () => {
  const bundle = makeBundle({
    claims: [AUTH_CLAIM],
    evidence: [AUTH_EVIDENCE],
    events: [AUTH_CLAIM_EVENT],
    policies: [SOFTWARE_POLICY],
    authorityTrace: [REVOKED_TRACE],
  });
  const result = evaluateDerivationRule(AUTH_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, false);
  assert.equal(result.inputs[0].requirementMet, false);
});

test('requiresActiveAuthority: not met when actor has no trace in bundle', () => {
  const bundle = makeBundle({
    claims: [AUTH_CLAIM],
    evidence: [AUTH_EVIDENCE],
    events: [AUTH_CLAIM_EVENT],
    policies: [SOFTWARE_POLICY],
    authorityTrace: [],  // empty traces
  });
  const result = evaluateDerivationRule(AUTH_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, false);
  assert.equal(result.inputs[0].requirementMet, false);
});

test('requiresActiveAuthority: not met when no status-bearing events exist', () => {
  const bundle = makeBundle({
    claims: [AUTH_CLAIM],
    evidence: [AUTH_EVIDENCE],
    events: [],  // no events — cannot identify actor
    policies: [SOFTWARE_POLICY],
    authorityTrace: [ACTIVE_TRACE],
  });
  const result = evaluateDerivationRule(AUTH_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, false);
});

test('requiresActiveAuthority: combined with acceptedStatuses and fresherThan', () => {
  // All three constraints must be met simultaneously
  const rule: import('../src/index.js').DerivationRule = {
    id: 'rule-auth-combined',
    version: '1',
    name: 'Combined',
    target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'combined' },
    requirements: [{
      target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'oversightauthorityactive' },
      acceptedStatuses: ['verified'],
      fresherThan: { days: 180 },
      requiresActiveAuthority: true,
    }],
    combinator: 'all',
  };
  const bundle = makeBundle({
    claims: [AUTH_CLAIM],
    evidence: [AUTH_EVIDENCE],
    events: [AUTH_CLAIM_EVENT],
    policies: [SOFTWARE_POLICY],
    authorityTrace: [ACTIVE_TRACE],
  });
  // Within freshness window (verifiedAt = 2026-01-01, now = 2026-06-01 = 151 days)
  const result = evaluateDerivationRule(rule, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, true);

  // Outside freshness window (now = 2026-10-01 > 180 days from 2026-01-01)
  const staleResult = evaluateDerivationRule(rule, bundle, { now: new Date('2026-10-01T00:00:00.000Z') });
  assert.equal(staleResult.satisfied, false);
});

// ---------------------------------------------------------------------------
// corroboration.minActors — distinct-actor evidence tests
// ---------------------------------------------------------------------------

const CORROBORATION_CLAIM: import('../src/index.js').Claim = {
  id: 'claim-corr',
  subjectType: 'ai-system',
  subjectId: 'acme-screening-ai',
  facet: 'compliance',
  claimType: 'oversight',
  fieldOrBehavior: 'humanreviewattestationpresent',
  value: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CORR_VERIFIED_EVENT: import('../src/index.js').VerificationEvent = {
  id: 'evt-corr',
  claimId: 'claim-corr',
  status: 'verified',
  actor: 'hr-manager@acme.example',
  method: 'attestation',
  evidenceIds: ['ev-corr-1'],
  createdAt: '2026-01-01T00:10:00.000Z',
  verifiedAt: '2026-01-01T00:10:00.000Z',
};

// Evidence from two distinct actors
const CORR_EV_ACTOR_A: import('../src/index.js').Evidence = {
  id: 'ev-corr-1',
  claimId: 'claim-corr',
  supportStrength: 'entails',
  evidenceType: 'attestation',
  method: 'attestation',
  sourceRef: 'hr-portal',
  excerptOrSummary: 'HR manager attests human review is in place.',
  observedAt: '2026-01-01T00:00:00.000Z',
  collectedBy: 'hr-manager@acme.example',
};

const CORR_EV_ACTOR_B: import('../src/index.js').Evidence = {
  id: 'ev-corr-2',
  claimId: 'claim-corr',
  supportStrength: 'entails',
  evidenceType: 'attestation',
  method: 'corroboration',
  sourceRef: 'dpo-portal',
  excerptOrSummary: 'DPO independently corroborates human review.',
  observedAt: '2026-01-01T01:00:00.000Z',
  collectedBy: 'dpo@acme.example',
};

// Second evidence item from the SAME actor as ACTOR_A
const CORR_EV_ACTOR_A_DUP: import('../src/index.js').Evidence = {
  id: 'ev-corr-3',
  claimId: 'claim-corr',
  supportStrength: 'entails',
  evidenceType: 'document_citation',
  method: 'attestation',
  sourceRef: 'hr-supplemental',
  excerptOrSummary: 'HR manager adds supplemental reference.',
  observedAt: '2026-01-02T00:00:00.000Z',
  collectedBy: 'hr-manager@acme.example',  // same actor as ACTOR_A
};

const CORR_RULE: import('../src/index.js').DerivationRule = {
  id: 'rule-corroboration',
  version: '1.0.0',
  name: 'Human Review Corroboration',
  target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'humanreviewready' },
  requirements: [{
    target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'humanreviewattestationpresent' },
    acceptedStatuses: ['verified'],
    corroboration: { minActors: 2 },
  }],
  combinator: 'all',
};

test('corroboration: met when 2 distinct actors provide entailing evidence', () => {
  const bundle = makeBundle({
    claims: [CORROBORATION_CLAIM],
    evidence: [CORR_EV_ACTOR_A, CORR_EV_ACTOR_B],
    events: [CORR_VERIFIED_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(CORR_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, true);
  assert.equal(result.inputs[0].requirementMet, true);
});

test('corroboration: NOT met with 2 evidence items from same actor', () => {
  // Two entailing items but both from hr-manager — only 1 distinct actor
  const bundle = makeBundle({
    claims: [CORROBORATION_CLAIM],
    evidence: [CORR_EV_ACTOR_A, CORR_EV_ACTOR_A_DUP],
    events: [CORR_VERIFIED_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(CORR_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, false);
  assert.equal(result.inputs[0].requirementMet, false);
});

test('corroboration: minActors:1 met with a single entailing evidence item', () => {
  const rule: import('../src/index.js').DerivationRule = {
    ...CORR_RULE,
    id: 'rule-corr-1',
    requirements: [{
      target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'humanreviewattestationpresent' },
      acceptedStatuses: ['verified'],
      corroboration: { minActors: 1 },
    }],
  };
  const bundle = makeBundle({
    claims: [CORROBORATION_CLAIM],
    evidence: [CORR_EV_ACTOR_A],
    events: [CORR_VERIFIED_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(rule, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, true);
});

test('corroboration: non-entailing (cited) evidence does not count toward minActors', () => {
  // CORR_EV_ACTOR_B has supportStrength 'entails' but we override it to 'cited'
  const citedEvidence: import('../src/index.js').Evidence = {
    ...CORR_EV_ACTOR_B,
    supportStrength: 'cited',  // does NOT count
  };
  const bundle = makeBundle({
    claims: [CORROBORATION_CLAIM],
    evidence: [CORR_EV_ACTOR_A, citedEvidence],
    events: [CORR_VERIFIED_EVENT],
    policies: [SOFTWARE_POLICY],
  });
  // Only 1 entailing actor (ACTOR_A), ACTOR_B is cited-only — minActors:2 fails
  const result = evaluateDerivationRule(CORR_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, false);
});

test('corroboration: combined with acceptedStatuses — both must be satisfied', () => {
  // Status fails (no verified event), even though corroboration would pass
  const bundle = makeBundle({
    claims: [CORROBORATION_CLAIM],
    evidence: [CORR_EV_ACTOR_A, CORR_EV_ACTOR_B],
    events: [],  // no verified event → status will not be verified
    policies: [SOFTWARE_POLICY],
  });
  const result = evaluateDerivationRule(CORR_RULE, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, false);
  assert.equal(result.inputs[0].requirementMet, false);
});

test('corroboration + requiresActiveAuthority: both predicates evaluated together', () => {
  const combinedRule: import('../src/index.js').DerivationRule = {
    id: 'rule-auth-corr',
    version: '1.0.0',
    name: 'Authority + Corroboration',
    target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'fullcheck' },
    requirements: [{
      target: { subjectType: 'ai-system', subjectId: 'acme-screening-ai', fieldOrBehavior: 'humanreviewattestationpresent' },
      acceptedStatuses: ['verified'],
      requiresActiveAuthority: true,
      corroboration: { minActors: 2 },
    }],
    combinator: 'all',
  };
  const bundle = makeBundle({
    claims: [CORROBORATION_CLAIM],
    evidence: [CORR_EV_ACTOR_A, CORR_EV_ACTOR_B],
    events: [CORR_VERIFIED_EVENT],
    policies: [SOFTWARE_POLICY],
    authorityTrace: [
      {
        ...ACTIVE_TRACE,
        id: 'trace-hr-active',
        actorRef: 'hr-manager@acme.example',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
      },
    ],
  });
  // Both satisfied: hr-manager has active trace, 2 distinct actors in evidence
  const result = evaluateDerivationRule(combinedRule, bundle, { now: NOW_IN_WINDOW });
  assert.equal(result.satisfied, true);

  // Now revoke the trace — authority fails even though corroboration passes
  const revokedBundle = makeBundle({
    ...bundle,
    authorityTrace: [
      {
        ...ACTIVE_TRACE,
        id: 'trace-hr-revoked',
        actorRef: 'hr-manager@acme.example',
        revokedAt: '2025-12-01T00:00:00.000Z',
      },
    ],
  });
  const revokedResult = evaluateDerivationRule(combinedRule, revokedBundle, { now: NOW_IN_WINDOW });
  assert.equal(revokedResult.satisfied, false);
});
