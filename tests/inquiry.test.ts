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
  STATUS_FUNCTION_VERSION,
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
  surface: "repo.developer-evidence",
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
  assert.equal(record.statusFunctionVersion, STATUS_FUNCTION_VERSION);
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
  surface: "repo.developer-evidence",
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
  surface: "repo.developer-evidence",
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
    surface: "s",
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
    surface: "s",
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
    surface: "s",
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
