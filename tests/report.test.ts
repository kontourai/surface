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
  assert.equal(report.summary.totalClaims, 4);
  assert.equal(report.summary.byStatus.verified, 2);
  assert.equal(report.summary.byStatus.stale, 1);
  assert.equal(report.summary.byStatus.unknown, 1);
  assert.deepEqual(report.summary.staleClaims, ["claim.campfit.registration-status"]);
  assert.match(formatTrustReportSummary(report), /Kontour Surface report test-report/);
});

test("rejects malformed trust input", () => {
  assert.throws(() => validateTrustInput({ source: "bad", claims: [] }), /Missing required array field: evidence/);
});

test("rejects malformed policy and event records", () => {
  assert.throws(
    () => validateTrustInput({
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
      source: "bad-enum",
      claims: [{
        id: "claim-1",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "surface",
        claimType: "software-proof",
        fieldOrBehavior: "proof",
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
      source: "bad-date",
      claims: [{
        id: "claim-1",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "surface",
        claimType: "software-proof",
        fieldOrBehavior: "proof",
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
      source: "extra",
      claims: [{
        id: "claim-1",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "surface",
        claimType: "software-proof",
        fieldOrBehavior: "proof",
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
      source: "bad-ref",
      claims: [],
      evidence: [{
        id: "evidence-1",
        claimId: "missing",
        evidenceType: "test_output",
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
