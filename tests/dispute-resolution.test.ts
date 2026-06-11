/**
 * ADR 0003 §8 — authority-weighted dispute resolution tests.
 *
 * Tests:
 *  1. Conflicting evidence → disputed
 *  2. Authorized decision → decided status
 *  3. Unauthorized decision (no matching AuthorityTrace) → stays disputed
 *  4. New conflicting evidence after resolution → disputed again
 *  5. Decision event visible in report events
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDisputeResolutionEvent,
  buildTrustReport,
  deriveTrustStatus,
  deriveClaimStatus,
  validateTrustBundle,
  type AuthorityTrace,
  type Claim,
  type Evidence,
  type TrustBundle,
  type VerificationEvent,
  type VerificationPolicy,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const claim: Claim = {
  id: "claim.widget.status",
  subjectType: "widget",
  subjectId: "widget-1",
  surface: "widgets.public",
  claimType: "widget-field",
  fieldOrBehavior: "status",
  value: "OPEN",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  impactLevel: "high",
  verificationPolicyId: "policy.widget-status",
};

const policy: VerificationPolicy = {
  id: "policy.widget-status",
  claimType: "widget-field",
  requiredEvidence: ["source_excerpt"],
  requiredMethods: ["observation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["review"],
  reviewAuthority: "role:domain-expert",
  validityRule: { kind: "manual" },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "high",
};

// Two pieces of evidence that conflict (one passing, one failing)
const passingEvidence: Evidence = {
  id: "ev.pass",
  claimId: claim.id,
  evidenceType: "source_excerpt",
  method: "observation",
  sourceRef: "https://example.test/source",
  excerptOrSummary: "Widget is open.",
  observedAt: "2026-06-01T00:10:00.000Z",
  collectedBy: "crawler",
  passing: true,
};

const failingEvidence: Evidence = {
  id: "ev.fail",
  claimId: claim.id,
  evidenceType: "source_excerpt",
  method: "observation",
  sourceRef: "https://example.test/other-source",
  excerptOrSummary: "Widget is closed.",
  observedAt: "2026-06-01T00:20:00.000Z",
  collectedBy: "crawler",
  passing: false,
};

const verifiedEvent: VerificationEvent = {
  id: "ev.verified",
  claimId: claim.id,
  status: "verified",
  actor: "actor:reviewer-1",
  method: "observation",
  evidenceIds: ["ev.pass"],
  createdAt: "2026-06-01T00:15:00.000Z",
};

const authorityTrace: AuthorityTrace = {
  id: "authority.reviewer-1",
  subject: { subjectType: "widget", subjectId: "widget-1" },
  actorRef: "actor:reviewer-1",
  authorityType: "role",
  authorityRef: "role:domain-expert",
  sourceRef: "directory:team",
  observedAt: "2026-06-01T00:00:00.000Z",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T23:59:59.000Z",
};

// ---------------------------------------------------------------------------
// 1. Conflicting evidence → disputed
// ---------------------------------------------------------------------------

test("conflicting evidence (blocking failing evidence alongside verified event) derives disputed", () => {
  const status = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent],
    now: new Date("2026-06-02T00:00:00.000Z"),
  });
  assert.equal(status, "disputed");
});

// ---------------------------------------------------------------------------
// 2. Authorized decision → decided status
// ---------------------------------------------------------------------------

test("authorized dispute-resolution event flips status to decided outcome", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Evidence A is authoritative; evidence B is stale.",
    evidenceIds: ["ev.pass"],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  const status = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-02T00:01:00.000Z"),
    authorityTrace: [authorityTrace],
  });
  assert.equal(status, "verified");
});

test("authorized resolution to rejected flips status to rejected", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "rejected",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Claim is incorrect.",
    evidenceIds: ["ev.fail"],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  const status = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-02T00:01:00.000Z"),
    authorityTrace: [authorityTrace],
  });
  assert.equal(status, "rejected");
});

// ---------------------------------------------------------------------------
// 3. Unauthorized decision → stays disputed
// ---------------------------------------------------------------------------

test("resolution event with no matching AuthorityTrace does NOT flip status — dispute stands", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:unauthorized-reviewer",
    rationale: "I say it is fine.",
    evidenceIds: [],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  // No authorityTrace provided → resolution has no authority
  const statusNoTrace = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-02T00:01:00.000Z"),
  });
  assert.equal(statusNoTrace, "disputed");

  // authorityTrace present but for a different actor → still no authority
  const statusWrongActor = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-02T00:01:00.000Z"),
    authorityTrace: [authorityTrace], // actorRef is "actor:reviewer-1", not "actor:unauthorized-reviewer"
  });
  assert.equal(statusWrongActor, "disputed");
});

test("resolution event with expired AuthorityTrace does NOT flip status", () => {
  const expiredTrace: AuthorityTrace = {
    ...authorityTrace,
    id: "authority.reviewer-1-expired",
    validUntil: "2026-05-31T23:59:59.000Z", // expired before the resolution event
  };

  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Resolved.",
    evidenceIds: [],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  const status = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-02T00:01:00.000Z"),
    authorityTrace: [expiredTrace],
  });
  assert.equal(status, "disputed");
});

test("resolution event with revoked AuthorityTrace does NOT flip status", () => {
  const revokedTrace: AuthorityTrace = {
    ...authorityTrace,
    id: "authority.reviewer-1-revoked",
    revokedAt: "2026-06-01T12:00:00.000Z", // revoked before the decision
  };

  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Resolved.",
    evidenceIds: [],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  const status = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-02T00:01:00.000Z"),
    authorityTrace: [revokedTrace],
  });
  assert.equal(status, "disputed");
});

// ---------------------------------------------------------------------------
// 4. New conflicting evidence after resolution → disputed again
// ---------------------------------------------------------------------------

test("new conflicting (blocking-failing) evidence after resolution re-disputes the claim", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Resolved in favour of passing evidence.",
    evidenceIds: ["ev.pass"],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  // New conflicting evidence observed AFTER the resolution
  const newerFailingEvidence: Evidence = {
    ...failingEvidence,
    id: "ev.fail-new",
    observedAt: "2026-06-03T00:00:00.000Z", // after resolution at 2026-06-02
    passing: false,
  };

  const status = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, newerFailingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-03T00:01:00.000Z"),
    authorityTrace: [authorityTrace],
  });
  assert.equal(status, "disputed");
});

test("old failing evidence (before resolution) does NOT re-dispute after an authorized resolution", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Resolved.",
    evidenceIds: ["ev.pass"],
    decidedAt: "2026-06-02T12:00:00.000Z", // after the failing evidence at 00:20
  });

  // failingEvidence.observedAt = "2026-06-01T00:20:00.000Z" — before resolution
  const status = deriveTrustStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    policy,
    events: [verifiedEvent, resolutionEvent],
    now: new Date("2026-06-03T00:00:00.000Z"),
    authorityTrace: [authorityTrace],
  });
  assert.equal(status, "verified");
});

// ---------------------------------------------------------------------------
// 5. Decision event visible in report events
// ---------------------------------------------------------------------------

test("dispute-resolution event is present in TrustReport events and drives final status", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Passing evidence is authoritative.",
    evidenceIds: ["ev.pass"],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  const bundle: TrustBundle = {
    schemaVersion: 3,
    source: "dispute-resolution-test",
    claims: [claim],
    evidence: [passingEvidence, failingEvidence],
    policies: [policy],
    events: [verifiedEvent, resolutionEvent],
    authorityTrace: [authorityTrace],
  };

  const validBundle = validateTrustBundle(bundle);
  const report = buildTrustReport(validBundle, {
    id: "report.dispute-resolution-test",
    now: new Date("2026-06-02T00:01:00.000Z"),
  });

  // The decision event must be preserved in report.events
  const found = report.events.find((e) => e.id === resolutionEvent.id);
  assert.ok(found, "resolution event must appear in report.events");
  assert.equal(found?.resolvesDispute, true);
  assert.equal(found?.authorityRef, "role:domain-expert");
  assert.equal(found?.notes, "Passing evidence is authoritative.");

  // The resolved claim must carry the decided status
  const reportClaim = report.claims.find((c) => c.id === claim.id);
  assert.equal(reportClaim?.status, "verified");
});

// ---------------------------------------------------------------------------
// 6. buildDisputeResolutionEvent shape
// ---------------------------------------------------------------------------

test("buildDisputeResolutionEvent produces correct event shape", () => {
  const event = buildDisputeResolutionEvent({
    claimId: "claim.x",
    decidedStatus: "rejected",
    actor: "actor:expert",
    authorityRef: "role:lead",
    rationale: "Incorrect claim.",
    evidenceIds: ["ev.1", "ev.2"],
    decidedAt: "2026-06-10T00:00:00.000Z",
  });

  assert.equal(event.claimId, "claim.x");
  assert.equal(event.status, "rejected");
  assert.equal(event.actor, "actor:expert");
  assert.equal(event.method, "dispute-resolution");
  assert.equal(event.resolvesDispute, true);
  assert.equal(event.authorityRef, "role:lead");
  assert.equal(event.notes, "Incorrect claim.");
  assert.deepEqual(event.evidenceIds, ["ev.1", "ev.2"]);
  assert.equal(event.createdAt, "2026-06-10T00:00:00.000Z");
});

test("buildDisputeResolutionEvent works without optional fields", () => {
  const event = buildDisputeResolutionEvent({
    claimId: "claim.x",
    decidedStatus: "assumed",
    actor: "actor:expert",
    decidedAt: "2026-06-10T00:00:00.000Z",
  });

  assert.equal(event.resolvesDispute, true);
  assert.equal(event.authorityRef, undefined);
  assert.equal(event.notes, undefined);
  assert.deepEqual(event.evidenceIds, []);
});

// ---------------------------------------------------------------------------
// 7. deriveClaimStatus with authorityTrace
// ---------------------------------------------------------------------------

test("deriveClaimStatus respects authorityTrace when folding dispute-resolution events", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: claim.id,
    decidedStatus: "verified",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Resolved.",
    evidenceIds: ["ev.pass"],
    decidedAt: "2026-06-02T00:00:00.000Z",
  });

  const withAuth = deriveClaimStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    events: [verifiedEvent, resolutionEvent],
    policies: [policy],
    now: new Date("2026-06-02T00:01:00.000Z"),
    authorityTrace: [authorityTrace],
  });
  assert.equal(withAuth.status, "verified");

  const withoutAuth = deriveClaimStatus({
    claim,
    evidence: [passingEvidence, failingEvidence],
    events: [verifiedEvent, resolutionEvent],
    policies: [policy],
    now: new Date("2026-06-02T00:01:00.000Z"),
    // no authorityTrace → resolution is ignored
  });
  assert.equal(withoutAuth.status, "disputed");
});
