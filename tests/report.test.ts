import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrustReport, formatTrustReportSummary, validateTrustInput } from "../src/index.js";

test("builds a canonical trust report from validation fixtures", async () => {
  const raw = await readFile("examples/surface-fixtures.json", "utf8");
  const input = validateTrustInput(JSON.parse(raw));
  const report = buildTrustReport(input, {
    id: "test-report",
    now: new Date("2026-04-25T00:00:00.000Z"),
  });

  assert.equal(report.id, "test-report");
  assert.equal(report.schemaVersion, 3);
  assert.equal(report.summary.totalClaims, 4);
  assert.equal(report.summary.byStatus.verified, 2);
  assert.equal(report.summary.byStatus.stale, 1);
  assert.equal(report.summary.byStatus.unknown, 1);
  assert.equal(report.evidenceRequirementsByClaimId["claim.repo-governance.api-proof"].requiredMethods?.[0], "validation");
  assert.equal(report.summary.transparencyGapsByType.freshness_breach, 1);
  assert.equal(report.transparencyGaps.some((line) => line.claimId === "claim.field-attested-records.registration-status" && line.type === "freshness_breach"), true);
  assert.deepEqual(report.summary.staleClaims, ["claim.field-attested-records.registration-status"]);
  assert.match(formatTrustReportSummary(report), /Kontour Surface report test-report/);
});

test("rejects malformed trust input", () => {
  assert.throws(() => validateTrustInput({ source: "bad", claims: [] }), /Missing required schemaVersion/);
  assert.throws(() => validateTrustInput({ schemaVersion: 1, source: "bad", claims: [] }), /v1-to-v2 migration/);
  assert.throws(() => validateTrustInput({ schemaVersion: 2, source: "bad", claims: [] }), /Missing required array field: evidence/);
});

test("rejects malformed policy and event records", () => {
  assert.throws(
    () => validateTrustInput({
      schemaVersion: 2,
      source: "bad-policy",
      claims: [],
      evidence: [],
      policies: [{ id: "policy-1", claimType: "x", reviewAuthority: "owner", impactLevel: "high" }],
      events: [],
    }),
    /Missing required array field: requiredEvidence/,
  );

  assert.throws(
    () => validateTrustInput({
      schemaVersion: 2,
      source: "bad-event",
      claims: [],
      evidence: [],
      policies: [],
      events: [{ id: "event-1", claimId: "claim-1", status: "verified", actor: "owner", method: "manual", createdAt: "now" }],
    }),
    /Missing required array field: evidenceIds/,
  );
});

test("rejects unsupported enum values, bad timestamps, and extra fields", () => {
  assert.throws(
    () => validateTrustInput({
      schemaVersion: 2,
      source: "bad-enum",
      claims: [{
        id: "claim-1",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "surface",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        status: "totally_verified",
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      }],
      evidence: [],
      policies: [],
      events: [],
    }),
    /status contains unsupported value/,
  );

  assert.throws(
    () => validateTrustInput({
      schemaVersion: 2,
      source: "bad-date",
      claims: [{
        id: "claim-1",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "surface",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "not-a-date",
        updatedAt: "2026-04-25T00:00:00.000Z",
      }],
      evidence: [],
      policies: [],
      events: [],
    }),
    /createdAt must be an ISO-8601 UTC date-time/,
  );

  assert.throws(
    () => validateTrustInput({
      schemaVersion: 2,
      source: "extra",
      claims: [{
        id: "claim-1",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "surface",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
        surprise: true,
      }],
      evidence: [],
      policies: [],
      events: [],
    }),
    /contains unsupported field: surprise/,
  );
});

test("rejects broken claim, evidence, and event references", () => {
  assert.throws(
    () => validateTrustInput({
      schemaVersion: 2,
      source: "bad-ref",
      claims: [],
      evidence: [{
        id: "evidence-1",
        claimId: "missing",
        evidenceType: "test_output",
        method: "validation",
        sourceRef: "test",
        excerptOrSummary: "passed",
        observedAt: "2026-04-25T00:00:00.000Z",
        collectedBy: "tester",
      }],
      policies: [],
      events: [],
    }),
    /references unknown claim/,
  );
});

test("requires evidence methods in schema v2 inputs", () => {
  assert.throws(
    () => validateTrustInput({
      schemaVersion: 2,
      source: "missing-method",
      claims: [{
        id: "claim-1",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "surface",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      }],
      evidence: [{
        id: "evidence-1",
        claimId: "claim-1",
        evidenceType: "test_output",
        sourceRef: "test",
        excerptOrSummary: "passed",
        observedAt: "2026-04-25T00:00:00.000Z",
        collectedBy: "tester",
      }],
      policies: [],
      events: [],
    }),
    /Evidence evidence-1 is missing required method.*observation.*validation/,
  );
});

test("accepts optional evidence passing and blocking fields", () => {
  const input = validateTrustInput({
    schemaVersion: 3,
    source: "evidence-eval",
    claims: [{
      id: "claim-1",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "evidence",
      value: true,
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
    }],
    evidence: [{
      id: "evidence-1",
      claimId: "claim-1",
      evidenceType: "test_output",
      method: "validation",
      sourceRef: "test",
      excerptOrSummary: "soft failure",
      observedAt: "2026-04-25T00:00:00.000Z",
      collectedBy: "tester",
      passing: false,
      blocking: false,
    }],
    policies: [],
    events: [],
  });

  assert.equal(input.evidence[0].passing, false);
  assert.equal(input.evidence[0].blocking, false);
});

test("producerStatus is only emitted when derived status diverges", () => {
  const input = validateTrustInput({
    schemaVersion: 3,
    source: "producer-status",
    claims: [{
      id: "claim-match",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "passing evidence",
      value: true,
      status: "verified",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-evidence",
    }, {
      id: "claim-diverged",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "missing evidence",
      value: true,
      status: "verified",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-evidence",
    }],
    evidence: [{
      id: "evidence-match",
      claimId: "claim-match",
      evidenceType: "test_output",
      method: "validation",
      sourceRef: "npm test",
      excerptOrSummary: "passed",
      observedAt: "2026-04-25T00:00:00.000Z",
      collectedBy: "tester",
      passing: true,
    }, {
      id: "evidence-diverged",
      claimId: "claim-diverged",
      evidenceType: "policy_rule",
      method: "validation",
      sourceRef: "policy",
      excerptOrSummary: "partial",
      observedAt: "2026-04-25T00:00:00.000Z",
      collectedBy: "tester",
    }],
    policies: [{
      id: "policy-evidence",
      claimType: "software-evidence",
      requiredEvidence: ["test_output"],
      requiredMethods: ["validation"],
      acceptanceCriteria: ["test output"],
      reviewAuthority: "ci",
      validityRule: { kind: "manual" },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "high",
    }],
    events: [{
      id: "event-match",
      claimId: "claim-match",
      status: "verified",
      actor: "ci",
      method: "validation",
      evidenceIds: ["evidence-match"],
      createdAt: "2026-04-25T00:00:00.000Z",
    }, {
      id: "event-diverged",
      claimId: "claim-diverged",
      status: "verified",
      actor: "ci",
      method: "validation",
      evidenceIds: ["evidence-diverged"],
      createdAt: "2026-04-25T00:00:00.000Z",
    }],
  });

  const report = buildTrustReport(input, { id: "producer-status", now: new Date("2026-04-25T00:00:00.000Z") });
  assert.equal(report.claims.find((item) => item.id === "claim-match")?.producerStatus, undefined);
  assert.equal(report.claims.find((item) => item.id === "claim-diverged")?.status, "proposed");
  assert.equal(report.claims.find((item) => item.id === "claim-diverged")?.producerStatus, "verified");
});

test("non-blocking evidence failures create non-blocking transparency gaps while preserving verified status", () => {
  const input = validateTrustInput({
    schemaVersion: 3,
    source: "non-blocking-failure",
    claims: [{
      id: "claim-soft-fail",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "evidence",
      value: true,
      status: "verified",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-evidence",
    }],
    evidence: [{
      id: "evidence-soft-fail",
      claimId: "claim-soft-fail",
      evidenceType: "test_output",
      method: "validation",
      sourceRef: "npm test",
      excerptOrSummary: "non-blocking check failed",
      observedAt: "2026-04-25T00:00:00.000Z",
      collectedBy: "tester",
      passing: false,
      blocking: false,
    }],
    policies: [{
      id: "policy-evidence",
      claimType: "software-evidence",
      requiredEvidence: ["test_output"],
      requiredMethods: ["validation"],
      acceptanceCriteria: ["test output"],
      reviewAuthority: "ci",
      validityRule: { kind: "manual" },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "high",
    }],
    events: [{
      id: "event-soft-fail",
      claimId: "claim-soft-fail",
      status: "verified",
      actor: "ci",
      method: "validation",
      evidenceIds: ["evidence-soft-fail"],
      createdAt: "2026-04-25T00:00:00.000Z",
    }],
  });

  const report = buildTrustReport(input, { id: "non-blocking-failure", now: new Date("2026-04-25T00:00:00.000Z") });
  const claim = report.claims.find((item) => item.id === "claim-soft-fail");
  const transparencyGap = report.transparencyGaps.find((item) => item.evidenceIds?.includes("evidence-soft-fail"));

  assert.equal(claim?.status, "verified");
  assert.equal(claim?.producerStatus, undefined);
  assert.equal(transparencyGap?.blocking, false);
});

test("reputation integrity fixture keeps suspicion distinct from accusation", async () => {
  const raw = await readFile("examples/reputation-integrity-trust-export.json", "utf8");
  const input = validateTrustInput(JSON.parse(raw));
  const report = buildTrustReport(input, {
    id: "reputation-integrity",
    now: new Date("2026-04-25T01:00:00.000Z"),
  });

  assert.equal(report.summary.totalClaims, 3);
  assert.equal(report.summary.byStatus.verified, 1);
  assert.equal(report.summary.byStatus.proposed, 1);
  assert.equal(report.summary.byStatus.unknown, 1);
  assert.equal(report.summary.transparencyGapsByType.unsupported_inference, 1);
  assert.equal(report.summary.transparencyGapsByType.corroboration_absent, 2);
  assert.equal(report.claims.find((claim) => claim.id === "claim.reputation.owner-intent")?.status, "unknown");
});
