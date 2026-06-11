import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrustReport, formatTrustReportSummary, validateTrustBundle } from "../src/index.js";

test("builds a canonical trust report from the validation example bundle", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const input = validateTrustBundle(JSON.parse(raw));
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
  assert.throws(() => validateTrustBundle({ source: "bad", claims: [] }), /Missing required schemaVersion/);
  assert.throws(() => validateTrustBundle({ schemaVersion: 1, source: "bad", claims: [] }), /v1-to-v2 migration/);
  assert.throws(() => validateTrustBundle({ schemaVersion: 2, source: "bad", claims: [] }), /Missing required array field: evidence/);
});

test("rejects malformed policy and event records", () => {
  assert.throws(
    () => validateTrustBundle({
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
    () => validateTrustBundle({
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
    () => validateTrustBundle({
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
    () => validateTrustBundle({
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
    () => validateTrustBundle({
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
    () => validateTrustBundle({
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
    () => validateTrustBundle({
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
  const input = validateTrustBundle({
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

test("validates optional ordinal claim materiality", () => {
  const baseInput = {
    schemaVersion: 3,
    source: "materiality-validation",
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
    evidence: [],
    policies: [],
    events: [],
  };

  assert.equal(validateTrustBundle(baseInput).claims[0].materiality, undefined);
  for (const materiality of ["low", "medium", "high"]) {
    const input = validateTrustBundle({
      ...baseInput,
      claims: [{ ...baseInput.claims[0], id: `claim-${materiality}`, materiality }],
    });
    assert.equal(input.claims[0].materiality, materiality);
  }
  assert.throws(
    () => validateTrustBundle({ ...baseInput, claims: [{ ...baseInput.claims[0], materiality: "critical" }] }),
    /materiality contains unsupported value: critical/,
  );
  assert.throws(
    () => validateTrustBundle({ ...baseInput, claims: [{ ...baseInput.claims[0], materiality: 3 }] }),
    /Missing required string field: materiality/,
  );
});

test("carries ordinal materiality from claims to generated transparency gaps", () => {
  const input = validateTrustBundle({
    schemaVersion: 3,
    source: "materiality-report",
    claims: [{
      id: "claim-high",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "evidence",
      value: true,
      materiality: "high",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-evidence",
    }, {
      id: "claim-absent",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "other evidence",
      value: true,
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-evidence",
    }],
    evidence: [],
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
      impactLevel: "medium",
    }],
    events: [],
  });

  const report = buildTrustReport(input, { id: "materiality-report", now: new Date("2026-04-25T00:00:00.000Z") });
  const highGap = report.transparencyGaps.find((gap) => gap.claimId === "claim-high" && gap.type === "provenance_gap");
  const absentGap = report.transparencyGaps.find((gap) => gap.claimId === "claim-absent" && gap.type === "provenance_gap");

  assert.equal(report.claims.find((claim) => claim.id === "claim-high")?.materiality, "high");
  assert.equal(highGap?.materiality, "high");
  assert.equal(Object.hasOwn(absentGap ?? {}, "materiality"), false);
});

test("contradiction gaps use only the owning claim materiality", () => {
  const input = validateTrustBundle({
    schemaVersion: 3,
    source: "materiality-contradictions",
    claims: [{
      id: "claim-owner-absent",
      subjectType: "record",
      subjectId: "record-1",
      surface: "surface",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "open",
      impactLevel: "high",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-status",
    }, {
      id: "claim-peer-high",
      subjectType: "record",
      subjectId: "record-1",
      surface: "surface",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "closed",
      impactLevel: "high",
      materiality: "high",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-status",
    }],
    evidence: [],
    policies: [{
      id: "policy-status",
      claimType: "record-field",
      requiredEvidence: [],
      requiredMethods: [],
      acceptanceCriteria: ["status consistency"],
      reviewAuthority: "ops",
      validityRule: { kind: "manual" },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "high",
      incompatibleValues: [{ values: ["open", "closed"] }],
    }],
    events: [],
  });

  const report = buildTrustReport(input, { id: "materiality-contradictions", now: new Date("2026-04-25T00:00:00.000Z") });
  const contradictionGap = report.transparencyGaps.find((gap) => gap.type === "contradiction");

  assert.equal(contradictionGap?.claimId, "claim-owner-absent");
  assert.equal(Object.hasOwn(contradictionGap ?? {}, "materiality"), false);
});

test("evidence transparency-gap hints inherit owning claim materiality", () => {
  const input = validateTrustBundle({
    schemaVersion: 3,
    source: "materiality-evidence-hints",
    claims: [{
      id: "claim-hinted",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "evidence",
      value: true,
      materiality: "medium",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      verificationPolicyId: "policy-evidence",
    }],
    evidence: [{
      id: "evidence-hint",
      claimId: "claim-hinted",
      evidenceType: "test_output",
      method: "validation",
      sourceRef: "npm test",
      excerptOrSummary: "passed with a hint",
      observedAt: "2026-04-25T00:00:00.000Z",
      collectedBy: "tester",
      metadata: {
        transparencyGapHints: [{ id: "gap-from-hint", type: "unsupported_inference", severity: "high" }],
      },
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
      impactLevel: "medium",
    }],
    events: [],
  });

  const report = buildTrustReport(input, { id: "materiality-evidence-hints", now: new Date("2026-04-25T00:00:00.000Z") });
  const hintGap = report.transparencyGaps.find((gap) => gap.id === "gap-from-hint");

  assert.equal(hintGap?.claimId, "claim-hinted");
  assert.equal(hintGap?.materiality, "medium");
});

test("producerStatus is only emitted when derived status diverges", () => {
  const input = validateTrustBundle({
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
  const input = validateTrustBundle({
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

test("reputation integrity example keeps suspicion distinct from accusation", async () => {
  const raw = await readFile("examples/reputation-integrity-trust-export.json", "utf8");
  const input = validateTrustBundle(JSON.parse(raw));
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
