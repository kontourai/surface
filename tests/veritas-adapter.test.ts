import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { adaptVeritasEvidenceToTrustInput, buildTrustReport, validateTrustInput } from "../src/index.js";

const execFileAsync = promisify(execFile);

test("adapts passing Veritas evidence into verified Surface claims", async () => {
  const raw = await readFile("examples/veritas-evidence.json", "utf8");
  const input = validateTrustInput(adaptVeritasEvidenceToTrustInput(JSON.parse(raw)));
  const report = buildTrustReport(input, {
    id: "veritas-pass",
    now: new Date("2026-04-25T03:50:00.000Z"),
  });

  assert.equal(report.source, "veritas:surface-veritas-pass");
  assert.equal(report.summary.totalClaims, 5);
  assert.equal(report.summary.byStatus.verified, 5);
  assert.equal(report.summary.bySurface["veritas.affected-surface"], 2);
  assert.equal(report.summary.bySurface["veritas.proof-lanes"], 1);
  assert.equal(report.summary.bySurface["veritas.policy-results"], 2);
});

test("adapts current Veritas proof-family and budget evidence", async () => {
  const raw = JSON.parse(await readFile("examples/veritas-evidence.json", "utf8"));
  raw.proof_family_results = [
    {
      id: "repo-governance",
      lane_id: "repo-verify",
      source_proof_lane_id: "repo-verify",
      manifest_path: ".veritas/proof-families/repo-governance.json",
      destination: "veritas-policy",
      owner: "repo-core",
      disposition: "required",
      blocking_status: "required",
      verification_weight: "blocking",
      selected: true,
      recent_catch_evidence: "policy evaluation caught missing governance docs",
      regression_severity: "high",
      false_positive_risk: "low",
      replacement_test_available: null,
      review_trigger: "review when policy pack changes",
      last_reviewed: "2026-04-25T03:40:00.000Z",
      evidence_basis: "recorded-catch-evidence",
      freshness_status: "current",
      rationale: "Protects repo governance behavior.",
    },
    {
      id: "legacy-marker",
      lane_id: "repo-verify",
      source_proof_lane_id: "repo-verify",
      manifest_path: ".veritas/proof-families/repo-governance.json",
      destination: "retire-or-soften",
      owner: null,
      disposition: "retire",
      blocking_status: "advisory",
      verification_weight: "informational",
      selected: false,
      recent_catch_evidence: "unknown",
      regression_severity: "low",
      false_positive_risk: "high",
      replacement_test_available: null,
      review_trigger: null,
      last_reviewed: null,
      evidence_basis: "unknown",
      freshness_status: "retiring",
      rationale: "Historical proof family is being retired.",
    },
  ];
  raw.verification_budget = {
    proof_lane_count: 1,
    selected_proof_lane_count: 1,
    proof_family_count: 2,
    required_family_count: 1,
    candidate_family_count: 0,
    advisory_family_count: 0,
    move_to_test_family_count: 0,
    retire_family_count: 1,
    upstream_candidate_count: 0,
    unknown_catch_evidence_family_ids: ["legacy-marker"],
    missing_review_trigger_family_ids: ["legacy-marker"],
    stale_family_ids: ["legacy-marker"],
    stale_or_unknown_family_ids: ["legacy-marker"],
    recommendation: "Review retiring proof families before promotion.",
  };

  const input = validateTrustInput(adaptVeritasEvidenceToTrustInput(raw));
  const report = buildTrustReport(input, {
    id: "veritas-proof-family",
    now: new Date("2026-04-25T03:50:00.000Z"),
  });

  assert.equal(report.summary.bySurface["veritas.proof-families"], 2);
  assert.equal(report.summary.bySurface["veritas.verification-budget"], 1);
  assert.ok(report.claims.some((claim) => claim.id.includes("legacy-marker") && claim.status === "superseded"));
  assert.ok(report.faultLines.some((faultLine) => faultLine.type === "freshness_breach"));
});

test("prefers embedded Veritas surface.input when present", async () => {
  const raw = JSON.parse(await readFile("examples/veritas-evidence.json", "utf8"));
  const derivedInput = validateTrustInput(adaptVeritasEvidenceToTrustInput(raw));
  raw.surface = { input: derivedInput };

  const embeddedInput = validateTrustInput(adaptVeritasEvidenceToTrustInput(raw));

  assert.deepEqual(embeddedInput, derivedInput);
  assert.equal((embeddedInput as unknown as Record<string, unknown>).faultLines, undefined);
  assert.equal((embeddedInput as unknown as Record<string, unknown>).proofRequirementsByClaimId, undefined);
});

test("adapts failing Veritas evidence into rejected proof and policy claims", async () => {
  const raw = await readFile("examples/veritas-evidence-fail.json", "utf8");
  const input = validateTrustInput(adaptVeritasEvidenceToTrustInput(JSON.parse(raw)));
  const report = buildTrustReport(input, {
    id: "veritas-fail",
    now: new Date("2026-04-25T03:50:00.000Z"),
  });

  assert.equal(report.summary.totalClaims, 3);
  assert.equal(report.summary.byStatus.verified, 1);
  assert.equal(report.summary.byStatus.rejected, 2);
  assert.deepEqual(report.summary.highImpactUnsupported, []);
});

test("rejects malformed Veritas evidence before trust report generation", () => {
  assert.throws(
    () => adaptVeritasEvidenceToTrustInput({ run_id: "missing-required-fields" }),
    /Veritas evidence missing string field: timestamp/,
  );
});

test("rejects legacy command-only Veritas evidence before trust report generation", async () => {
  const raw = await readFile("examples/veritas-evidence.json", "utf8");
  const legacy = JSON.parse(raw);
  delete legacy.selected_proof_lanes;

  assert.throws(
    () => adaptVeritasEvidenceToTrustInput(legacy),
    /selected_proof_lanes/,
  );
});

test("CLI can report directly from a Veritas evidence artifact", async () => {
  const { stdout } = await execFileAsync("node", [
    "bin/surface.mjs",
    "report",
    "--adapter",
    "veritas",
    "--input",
    "examples/veritas-evidence.json",
    "--format",
    "summary",
    "--run-id",
    "cli-veritas",
  ]);

  assert.match(stdout, /Kontour Surface report cli-veritas/);
  assert.match(stdout, /Source: veritas:surface-veritas-pass/);
  assert.match(stdout, /verified: 5/);
});
