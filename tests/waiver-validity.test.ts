/**
 * Task S1 — deriveWaiverValidity unit tests.
 *
 * Covers all 6 WaiverVerdict outcomes, the command-backed-waiver-rejection
 * precedence rule, a malformed-shape case (metadata.waiver not an object),
 * a not-a-date approved_at case, and approverAuthenticated === false on
 * every branch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveWaiverValidity,
  isCommandBackedEvidence,
  waiverValidityFunctionVersion,
  type Claim,
  type Evidence,
  type TrustStatus,
} from "../src/index.js";

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "claim.example.field",
    subjectType: "record",
    subjectId: "record-1",
    claimType: "record-field",
    fieldOrBehavior: "status",
    value: "OPEN",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "evidence.example.1",
    claimId: "claim.example.field",
    evidenceType: "human_attestation",
    method: "attestation",
    sourceRef: "review-log",
    excerptOrSummary: "Reviewed manually.",
    observedAt: "2026-05-01T00:05:00.000Z",
    collectedBy: "actor:reviewer-1",
    ...overrides,
  };
}

const completeWaiver = {
  reason: "Deferred to next release cycle.",
  approved_by: "actor:eng-lead-1",
  approved_at: "2026-05-01T00:00:00.000Z",
};

test("waiverValidityFunctionVersion is a non-empty string", () => {
  assert.equal(typeof waiverValidityFunctionVersion, "string");
  assert.ok(waiverValidityFunctionVersion.length > 0);
});

test("not-applicable: verified claim with no waiver", () => {
  const claim = makeClaim();
  const result = deriveWaiverValidity({ claim, status: "verified", evidence: [] });
  assert.equal(result.verdict, "not-applicable");
  assert.equal(result.approverAuthenticated, false);
});

test("not-applicable: proposed claim even if metadata.waiver happens to be present", () => {
  const claim = makeClaim({ metadata: { waiver: completeWaiver } });
  const result = deriveWaiverValidity({ claim, status: "proposed", evidence: [] });
  assert.equal(result.verdict, "not-applicable");
  assert.equal(result.approverAuthenticated, false);
});

test("bare-assumed: assumed claim with no metadata.waiver", () => {
  const claim = makeClaim({ status: "assumed" });
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(result.verdict, "bare-assumed");
  assert.equal(result.approverAuthenticated, false);
  assert.equal(result.waiver, undefined);
});

test("bare-assumed: assumed claim with metadata present but no waiver key", () => {
  const claim = makeClaim({ status: "assumed", metadata: { other: "value" } });
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(result.verdict, "bare-assumed");
  assert.equal(result.approverAuthenticated, false);
});

test("complete-waiver: assumed claim with a well-formed waiver", () => {
  const claim = makeClaim({ status: "assumed", metadata: { waiver: completeWaiver } });
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(result.verdict, "complete-waiver");
  assert.equal(result.approverAuthenticated, false);
  assert.deepEqual(result.waiver, {
    reason: completeWaiver.reason,
    approvedBy: completeWaiver.approved_by,
    approvedAt: completeWaiver.approved_at,
  });
  assert.equal(result.incompleteFields, undefined);
});

test("incomplete-waiver: missing approved_by", () => {
  const claim = makeClaim({
    status: "assumed",
    metadata: { waiver: { reason: "reason text", approved_at: "2026-05-01T00:00:00.000Z" } },
  });
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(result.verdict, "incomplete-waiver");
  assert.equal(result.approverAuthenticated, false);
  assert.deepEqual(result.incompleteFields, ["approved_by"]);
  assert.equal(result.waiver?.reason, "reason text");
});

test("incomplete-waiver: empty-string reason and approved_by are treated as missing", () => {
  const claim = makeClaim({
    status: "assumed",
    metadata: { waiver: { reason: "", approved_by: "", approved_at: "2026-05-01T00:00:00.000Z" } },
  });
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(result.verdict, "incomplete-waiver");
  assert.deepEqual(result.incompleteFields, ["reason", "approved_by"]);
  assert.equal(result.approverAuthenticated, false);
});

test("incomplete-waiver: approved_at is not a parseable date", () => {
  const claim = makeClaim({
    status: "assumed",
    metadata: {
      waiver: { reason: "reason text", approved_by: "actor:approver-1", approved_at: "not-a-date" },
    },
  });
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(result.verdict, "incomplete-waiver");
  assert.equal(result.approverAuthenticated, false);
  assert.deepEqual(result.incompleteFields, ["approved_at"]);
  assert.equal(result.waiver?.reason, "reason text");
  assert.equal(result.waiver?.approvedBy, "actor:approver-1");
  assert.equal(result.waiver?.approvedAt, undefined);
});

test("incomplete-waiver: malformed shape (metadata.waiver is a string) lists all three fields", () => {
  const claim = makeClaim({ status: "assumed", metadata: { waiver: "approved verbally" } });
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(result.verdict, "incomplete-waiver");
  assert.equal(result.approverAuthenticated, false);
  assert.deepEqual(result.incompleteFields, ["reason", "approved_by", "approved_at"]);
  assert.deepEqual(result.waiver, {});
});

test("stale-or-revoked-waiver: stale claim retaining a waiver in metadata", () => {
  const claim = makeClaim({ metadata: { waiver: completeWaiver } });
  const result = deriveWaiverValidity({ claim, status: "stale", evidence: [] });
  assert.equal(result.verdict, "stale-or-revoked-waiver");
  assert.equal(result.approverAuthenticated, false);
});

test("stale-or-revoked-waiver: revoked claim retaining a waiver in metadata", () => {
  const claim = makeClaim({ metadata: { waiver: completeWaiver } });
  const result = deriveWaiverValidity({ claim, status: "revoked", evidence: [] });
  assert.equal(result.verdict, "stale-or-revoked-waiver");
  assert.equal(result.approverAuthenticated, false);
});

test("command-backed-waiver-rejection: assumed claim, waiver present, evidence is test_output", () => {
  const claim = makeClaim({ status: "assumed", metadata: { waiver: completeWaiver } });
  const evidence = [makeEvidence({ evidenceType: "test_output" })];
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence });
  assert.equal(result.verdict, "command-backed-waiver-rejection");
  assert.equal(result.approverAuthenticated, false);
});

test("command-backed-waiver-rejection: assumed claim, waiver present, evidence carries an execution block", () => {
  const claim = makeClaim({ status: "assumed", metadata: { waiver: completeWaiver } });
  const evidence = [
    makeEvidence({ evidenceType: "human_attestation", execution: { runner: "bash", label: "npm test" } }),
  ];
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence });
  assert.equal(result.verdict, "command-backed-waiver-rejection");
  assert.equal(result.approverAuthenticated, false);
});

test("precedence: command-backed-waiver-rejection wins over an otherwise-complete waiver", () => {
  const claim = makeClaim({ status: "assumed", metadata: { waiver: completeWaiver } });
  const evidence = [makeEvidence({ evidenceType: "test_output" })];
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence });
  // Without the command-backed evidence, this exact claim/waiver would be
  // "complete-waiver" — asserting that here documents the precedence.
  const withoutCommandEvidence = deriveWaiverValidity({ claim, status: "assumed", evidence: [] });
  assert.equal(withoutCommandEvidence.verdict, "complete-waiver");
  assert.equal(result.verdict, "command-backed-waiver-rejection");
  assert.notEqual(result.verdict, withoutCommandEvidence.verdict);
});

test("command-backed evidence that is not blocking still triggers rejection (no waiver override on command checks)", () => {
  const claim = makeClaim({ status: "assumed", metadata: { waiver: completeWaiver } });
  const evidence = [makeEvidence({ evidenceType: "test_output", passing: true, blocking: false })];
  const result = deriveWaiverValidity({ claim, status: "assumed", evidence });
  assert.equal(result.verdict, "command-backed-waiver-rejection");
  assert.equal(result.approverAuthenticated, false);
});

test("isCommandBackedEvidence: true for test_output evidenceType", () => {
  assert.equal(isCommandBackedEvidence(makeEvidence({ evidenceType: "test_output" })), true);
});

test("isCommandBackedEvidence: true when an execution block is present regardless of evidenceType", () => {
  assert.equal(
    isCommandBackedEvidence(
      makeEvidence({ evidenceType: "human_attestation", execution: { runner: "mcp", label: "check" } }),
    ),
    true,
  );
});

test("isCommandBackedEvidence: false for a plain human attestation with no execution block", () => {
  assert.equal(isCommandBackedEvidence(makeEvidence({ evidenceType: "human_attestation" })), false);
});

const ALL_VERDICT_CASES: Array<{ name: string; status: TrustStatus; metadataWaiver: unknown; evidence: Evidence[] }> = [
  { name: "not-applicable", status: "verified", metadataWaiver: undefined, evidence: [] },
  { name: "bare-assumed", status: "assumed", metadataWaiver: undefined, evidence: [] },
  { name: "complete-waiver", status: "assumed", metadataWaiver: completeWaiver, evidence: [] },
  { name: "incomplete-waiver", status: "assumed", metadataWaiver: { reason: "only reason" }, evidence: [] },
  { name: "stale-or-revoked-waiver", status: "stale", metadataWaiver: completeWaiver, evidence: [] },
  {
    name: "command-backed-waiver-rejection",
    status: "assumed",
    metadataWaiver: completeWaiver,
    evidence: [makeEvidence({ evidenceType: "test_output" })],
  },
];

test("approverAuthenticated === false on every verdict branch, including complete-waiver", () => {
  for (const testCase of ALL_VERDICT_CASES) {
    const claim = makeClaim({
      status: testCase.status,
      metadata: testCase.metadataWaiver === undefined ? undefined : { waiver: testCase.metadataWaiver },
    });
    const result = deriveWaiverValidity({ claim, status: testCase.status, evidence: testCase.evidence });
    assert.equal(result.verdict, testCase.name, `expected verdict ${testCase.name}`);
    assert.equal(
      result.approverAuthenticated,
      false,
      `approverAuthenticated must be false for verdict ${testCase.name}`,
    );
  }
});
