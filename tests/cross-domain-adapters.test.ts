import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  buildTrustReport,
  validateTrustInput,
} from "../src/index.js";
import { adaptFactResolutionExportToTrustInput } from "../examples/adapters/fact-resolution.js";
import { adaptFieldAttestedRecordsExportToTrustInput } from "../examples/adapters/field-attested-records.js";
import { adaptNpmAuditReportToTrustInput } from "../src/adapters/npm-audit.js";

const execFileAsync = promisify(execFile);

test("adapts field-attested records exports into verified, stale, disputed, proposed, and rejected claims", async () => {
  const raw = await readFile("examples/field-attested-records-export.json", "utf8");
  const input = validateTrustInput(adaptFieldAttestedRecordsExportToTrustInput(JSON.parse(raw)));
  const report = buildTrustReport(input, {
    id: "field-attested-records-example",
    now: new Date("2026-04-25T04:00:00.000Z"),
  });

  assert.equal(report.source, "field-attested-records:demo");
  assert.equal(report.summary.totalClaims, 9);
  assert.equal(report.summary.byStatus.verified, 4);
  assert.equal(report.summary.byStatus.stale, 1);
  assert.equal(report.summary.byStatus.disputed, 1);
  assert.equal(report.summary.byStatus.proposed, 1);
  assert.equal(report.summary.byStatus.rejected, 2);
  assert.equal(report.summary.bySurface["field-attested-records.public-data"], 2);
  assert.equal(report.summary.bySurface["field-attestation.review-flags"], 1);
});

test("adapts fact resolution exports into fact, return-package, assumption, comparison, and review-signal claims", async () => {
  const raw = await readFile("examples/fact-resolution-export.json", "utf8");
  const input = validateTrustInput(adaptFactResolutionExportToTrustInput(JSON.parse(raw)));
  const report = buildTrustReport(input, {
    id: "fact-resolution-example",
    now: new Date("2026-04-25T04:00:00.000Z"),
  });

  assert.equal(report.source, "fact-resolution:demo-case-2025");
  assert.equal(report.summary.totalClaims, 9);
  assert.equal(report.summary.byStatus.verified, 3);
  assert.equal(report.summary.byStatus.proposed, 2);
  assert.equal(report.summary.byStatus.unknown, 1);
  assert.equal(report.summary.byStatus.disputed, 3);
  assert.equal(report.summary.bySurface["fact-resolution.verified-facts"], 1);
  assert.equal(report.summary.bySurface["fact-resolution.review-signals"], 1);
});

test("CLI can report directly from generic example exports", async () => {
  const fieldAttestedRecords = await execFileAsync("node", [
    "bin/surface.mjs",
    "report",
    "--adapter",
    "field-attested-records",
    "--format",
    "summary",
    "--run-id",
    "cli-field-attested-records",
  ]);
  assert.match(fieldAttestedRecords.stdout, /Kontour Surface report cli-field-attested-records/);
  assert.match(fieldAttestedRecords.stdout, /Source: field-attested-records:demo/);
  assert.match(fieldAttestedRecords.stdout, /rejected: 2/);

  const factResolution = await execFileAsync("node", [
    "bin/surface.mjs",
    "report",
    "--adapter",
    "fact-resolution",
    "--format",
    "summary",
    "--run-id",
    "cli-fact-resolution",
  ]);
  assert.match(factResolution.stdout, /Kontour Surface report cli-fact-resolution/);
  assert.match(factResolution.stdout, /Source: fact-resolution:demo-case-2025/);
  assert.match(factResolution.stdout, /disputed: 3/);

  const npmAudit = await execFileAsync("node", [
    "bin/surface.mjs",
    "report",
    "--adapter",
    "npm-audit",
    "--format",
    "summary",
    "--run-id",
    "cli-npm-audit",
  ]);
  assert.match(npmAudit.stdout, /Kontour Surface report cli-npm-audit/);
  assert.match(npmAudit.stdout, /Source: npm-audit/);
  assert.match(npmAudit.stdout, /rejected: 1/);
});

test("adapts npm audit exports into rejected package safety claims", async () => {
  const raw = await readFile("examples/npm-audit-export.json", "utf8");
  const input = validateTrustInput(adaptNpmAuditReportToTrustInput(JSON.parse(raw)));
  const report = buildTrustReport(input, {
    id: "npm-audit-example",
    now: new Date("2026-04-25T04:00:00.000Z"),
  });

  assert.equal(report.source, "npm-audit");
  assert.equal(report.summary.totalClaims, 1);
  assert.equal(report.summary.byStatus.rejected, 1);
  assert.equal(report.summary.bySurface["npm-audit.dependencies"], 1);
});

test("identityLinks let the kernel surface contradictions across adapter outputs", async () => {
  // Pull real-use-case-shaped claims from two examples, then ask the kernel: "if these
  // two systems are talking about the same subject, do their claims agree?"
  // Surface answers without either example knowing about the other.
  const fieldRecordsRaw = JSON.parse(await readFile("examples/field-attested-records-export.json", "utf8"));
  const fieldRecordsInput = adaptFieldAttestedRecordsExportToTrustInput(fieldRecordsRaw);
  const attestedRecordClaim = fieldRecordsInput.claims.find((c) => c.subjectType === "attested-record");
  assert.ok(attestedRecordClaim, "expected at least one record claim from the field-attested records example");

  // Build a synthetic alternate listing claim that holds an incompatible value
  // against the attested record. The two claims live on different subject types
  // and would otherwise look unrelated; identityLinks tell the kernel they are
  // the same real subject.
  const policyId = "cross-domain.alternate-listing";
  const releaseClaim = {
    id: "claim.alternate-listing.denver-art-lab",
    subjectType: "alternate-listing",
    subjectId: "listing:denver-art-lab",
    surface: "alternate-listing.public-data",
    claimType: "public-data-field",
    fieldOrBehavior: "registrationStatus",
    value: "CLOSED",
    createdAt: attestedRecordClaim.createdAt,
    updatedAt: attestedRecordClaim.updatedAt,
    impactLevel: attestedRecordClaim.impactLevel,
    verificationPolicyId: policyId,
  };

  // Repoint the field-attested claim at the cross-domain policy so both claims share
  // it. We clone the claim to avoid mutating the adapter's output.
  const linkedAttestedRecordClaim = { ...attestedRecordClaim, verificationPolicyId: policyId };
  const merged = validateTrustInput({
    schemaVersion: 3,
    source: "cross-domain-integration",
    claims: [linkedAttestedRecordClaim, releaseClaim],
    evidence: fieldRecordsInput.evidence.filter((e) => e.claimId === attestedRecordClaim.id),
    policies: [
      {
        id: policyId,
        claimType: "public-data-field",
        requiredEvidence: ["source_excerpt"],
        requiredProof: ["registration status"],
        reviewAuthority: "release",
        validityRule: { kind: "manual" },
        stalenessTriggers: [],
        conflictRules: [],
        impactLevel: "high",
        incompatibleValues: [
          { values: ["OPEN", "CLOSED"], message: "Same subject reports both OPEN and CLOSED registration." },
        ],
      },
    ],
    events: [],
    identityLinks: [
      {
        subjects: [
          { subjectType: "attested-record", subjectId: attestedRecordClaim.subjectId },
          { subjectType: "alternate-listing", subjectId: releaseClaim.subjectId },
        ],
        reason: "Attested record and alternate listing describe the same real subject.",
      },
    ],
  });

  const report = buildTrustReport(merged, {
    id: "cross-domain-link",
    now: new Date("2026-04-25T05:00:00.000Z"),
  });

  const contradictions = report.faultLines.filter((fl) => fl.type === "contradiction");
  assert.ok(contradictions.length >= 1, "expected at least one cross-domain contradiction");
  assert.equal(report.subjectGroups.length, 1, "the two subjects should collapse into one canonical group");
});
