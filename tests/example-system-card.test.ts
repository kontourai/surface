/**
 * Tests for examples/system-card — ensures the flagship demo cannot rot.
 *
 * Exercises:
 *   1. Bundle loads and validates cleanly.
 *   2. Per-claim statuses at T0 (2025-11-05) and T+35d (2025-12-10).
 *   3. Three inquiry outcomes: exact match, derived rule, unsupported.
 *   4. Dispute resolution: disputed baseline, flips to verified, re-disputed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTrustReport,
  resolveInquiry,
  buildDisputeResolutionEvent,
  validateTrustBundle,
  type TrustBundle,
  type DerivationRule,
  type Inquiry,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Load fixture
// ---------------------------------------------------------------------------

// Use cwd-relative path (tests run from repo root via npm test).
const rawBundle = JSON.parse(readFileSync("examples/system-card/bundle.json", "utf8")) as TrustBundle;

// ---------------------------------------------------------------------------
// Timestamps used across tests
// ---------------------------------------------------------------------------

/** T0: shortly after deployment — eval run is fresh (27 days old). */
const T0 = new Date("2025-11-05T12:00:00.000Z");

/** T_STALE: 35 days after the eval run — past the 30-day freshness window. */
const T_STALE = new Date("2025-12-10T12:00:00.000Z");

// ---------------------------------------------------------------------------
// DerivationRule used in inquiry tests (identical to run-demo.ts)
// ---------------------------------------------------------------------------

const productionReadyRule: DerivationRule = {
  id: "rule.production-ready",
  version: "1.0.0",
  name: "production-ready",
  target: {
    subjectType: "model",
    subjectId: "acme-support-agent-v2",
    fieldOrBehavior: "production-ready",
  },
  combinator: "all",
  requirements: [
    {
      target: {
        subjectType: "model",
        subjectId: "acme-support-agent-v2",
        fieldOrBehavior: "intent-classification-accuracy",
      },
      acceptedStatuses: ["verified"],
      predicate: { op: "gte", value: 0.90 },
    },
    {
      target: {
        subjectType: "model",
        subjectId: "acme-support-agent-v2",
        fieldOrBehavior: "red-team-review-completed",
      },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    },
    {
      target: {
        subjectType: "model",
        subjectId: "acme-support-agent-v2",
        fieldOrBehavior: "pii-filtering-enabled",
      },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function statusOf(bundle: TrustBundle, claimId: string, now: Date): string {
  const report = buildTrustReport(bundle, { now });
  const claim = report.claims.find((c) => c.id === claimId);
  assert.ok(claim, `claim ${claimId} not found in report`);
  return claim.status;
}

// ---------------------------------------------------------------------------
// 1. Bundle validation
// ---------------------------------------------------------------------------

test("system-card bundle loads and validates without errors", () => {
  // validateTrustBundle throws on invalid input; if it returns, the bundle is valid.
  assert.doesNotThrow(() => validateTrustBundle(rawBundle));
});

test("system-card bundle has exactly 5 claims and 7 evidence items", () => {
  assert.equal(rawBundle.claims.length, 5);
  assert.equal(rawBundle.evidence.length, 7);
});

// ---------------------------------------------------------------------------
// 2a. Per-claim statuses at T0
// ---------------------------------------------------------------------------

test("training-data-cutoff is verified at T0", () => {
  assert.equal(
    statusOf(rawBundle, "claim.acme-support-agent.training-data-cutoff", T0),
    "verified",
  );
});

test("intent-classification-accuracy is verified at T0 (within 30-day window)", () => {
  assert.equal(
    statusOf(rawBundle, "claim.acme-support-agent.intent-accuracy", T0),
    "verified",
  );
});

test("red-team-review-completed is verified at T0", () => {
  assert.equal(
    statusOf(rawBundle, "claim.acme-support-agent.red-team-review", T0),
    "verified",
  );
});

test("pii-filtering-enabled is disputed at T0 (blocking conflicting evidence)", () => {
  assert.equal(
    statusOf(rawBundle, "claim.acme-support-agent.pii-filtering", T0),
    "disputed",
  );
});

test("human-oversight-policy has no evidence — status is unknown or proposed at T0", () => {
  const status = statusOf(rawBundle, "claim.acme-support-agent.human-oversight-policy", T0);
  // No evidence, no verification event → should be proposed or unknown (unsupported gap).
  assert.ok(
    status === "unknown" || status === "proposed",
    `expected unknown or proposed, got ${status}`,
  );
});

// ---------------------------------------------------------------------------
// 2b. Transparency gaps visible at T0
// ---------------------------------------------------------------------------

test("transparency gaps include a gap for the unsupported human-oversight-policy claim at T0", () => {
  const report = buildTrustReport(rawBundle, { now: T0 });
  const policyGaps = report.transparencyGaps.filter(
    (g) => g.claimId === "claim.acme-support-agent.human-oversight-policy",
  );
  assert.ok(policyGaps.length > 0, "expected at least one transparency gap for human-oversight-policy");
});

test("transparency gaps include a policy_violation gap for pii-filtering-enabled at T0 (blocking evidence)", () => {
  const report = buildTrustReport(rawBundle, { now: T0 });
  // Blocking failing evidence raises a policy_violation gap (not a contradiction between two claims).
  const conflictGaps = report.transparencyGaps.filter(
    (g) => g.claimId === "claim.acme-support-agent.pii-filtering" && g.type === "policy_violation",
  );
  assert.ok(conflictGaps.length > 0, "expected a policy_violation gap for pii-filtering");
});

// ---------------------------------------------------------------------------
// 2c. Eval-score goes stale at T+35 days
// ---------------------------------------------------------------------------

test("intent-classification-accuracy is stale at T+35d (past 30-day window)", () => {
  assert.equal(
    statusOf(rawBundle, "claim.acme-support-agent.intent-accuracy", T_STALE),
    "stale",
  );
});

test("training-data-cutoff is still verified at T+35d (manual validity rule)", () => {
  assert.equal(
    statusOf(rawBundle, "claim.acme-support-agent.training-data-cutoff", T_STALE),
    "verified",
  );
});

// ---------------------------------------------------------------------------
// 3. Inquiry outcomes
// ---------------------------------------------------------------------------

test("exact-match inquiry on training-data-cutoff returns matched + verified at T0", () => {
  const inquiry: Inquiry = {
    id: "inq.training-cutoff",
    question: "What is the training data cutoff date?",
    target: {
      subjectType: "model",
      subjectId: "acme-support-agent-v2",
      fieldOrBehavior: "training-data-cutoff",
    },
    askedBy: "test",
    askedAt: T0.toISOString(),
  };
  const record = resolveInquiry(rawBundle, inquiry, { now: T0 });
  assert.equal(record.outcome, "matched");
  assert.equal(record.answer?.status, "verified");
  assert.equal(record.answer?.value, "2024-09-30");
});

test("derived inquiry on production-ready returns derived + not satisfied at T0 (pii disputed)", () => {
  const inquiry: Inquiry = {
    id: "inq.production-ready",
    question: "Is acme-support-agent-v2 production-ready?",
    target: {
      subjectType: "model",
      subjectId: "acme-support-agent-v2",
      fieldOrBehavior: "production-ready",
    },
    askedBy: "test",
    askedAt: T0.toISOString(),
  };
  const record = resolveInquiry(rawBundle, inquiry, {
    now: T0,
    rules: [productionReadyRule],
  });
  assert.equal(record.outcome, "derived");
  // pii-filtering is disputed → all-combinator fails → satisfied = false
  assert.equal(record.answer?.value, false);
  assert.equal(record.resolutionPath.ruleId, "rule.production-ready");
});

test("unsupported inquiry on bias-audit returns unsupported", () => {
  const inquiry: Inquiry = {
    id: "inq.bias-audit",
    question: "Has the model undergone a formal bias audit?",
    target: {
      subjectType: "model",
      subjectId: "acme-support-agent-v2",
      fieldOrBehavior: "bias-audit-completed",
    },
    askedBy: "test",
    askedAt: T0.toISOString(),
  };
  const record = resolveInquiry(rawBundle, inquiry, { now: T0 });
  assert.equal(record.outcome, "unsupported");
  assert.equal(record.answer, undefined);
});

// ---------------------------------------------------------------------------
// 4. Dispute resolution
// ---------------------------------------------------------------------------

test("pii-filtering flips to verified after authorized dispute-resolution event", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: "claim.acme-support-agent.pii-filtering",
    decidedStatus: "verified",
    actor: "acme-ai/incident-review-board",
    authorityRef: "role:incident-arbiter",
    rationale: "Hotfix deployed; residual risk accepted.",
    evidenceIds: [
      "ev.pii-filtering.config-attestation",
      "ev.pii-filtering.conflicting-incident",
    ],
    decidedAt: "2025-11-05T17:00:00.000Z",
  });

  const bundleAfterResolution: TrustBundle = {
    ...rawBundle,
    events: [...rawBundle.events, resolutionEvent],
  };

  const T_RESOLVED = new Date("2025-11-05T18:00:00.000Z");
  assert.equal(
    statusOf(bundleAfterResolution, "claim.acme-support-agent.pii-filtering", T_RESOLVED),
    "verified",
  );
});

test("pii-filtering is re-disputed after new blocking evidence arrives post-resolution", () => {
  const resolutionEvent = buildDisputeResolutionEvent({
    claimId: "claim.acme-support-agent.pii-filtering",
    decidedStatus: "verified",
    actor: "acme-ai/incident-review-board",
    authorityRef: "role:incident-arbiter",
    rationale: "Hotfix deployed.",
    evidenceIds: ["ev.pii-filtering.config-attestation"],
    decidedAt: "2025-11-05T17:00:00.000Z",
  });

  const newConflictingEvidence = {
    id: "ev.pii-filtering.second-incident",
    claimId: "claim.acme-support-agent.pii-filtering",
    supportStrength: "entails" as const,
    evidenceType: "test_output" as const,
    method: "observation" as const,
    sourceRef: "https://internal.acme.ai/incidents/INC-2025-1110",
    sourceLocator: "findings",
    excerptOrSummary:
      "INC-2025-1110: base64-encoded payloads bypass PII filter. Distinct from prior incident.",
    observedAt: "2025-11-10T14:00:00.000Z",
    collectedBy: "acme-ai/security-scanner",
    passing: false,
    blocking: true,
  };

  const bundleReDisputed: TrustBundle = {
    ...rawBundle,
    events: [...rawBundle.events, resolutionEvent],
    evidence: [...rawBundle.evidence, newConflictingEvidence],
  };

  const T_REDISPUTED = new Date("2025-11-10T15:00:00.000Z");
  assert.equal(
    statusOf(bundleReDisputed, "claim.acme-support-agent.pii-filtering", T_REDISPUTED),
    "disputed",
  );
});



