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
