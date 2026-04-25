import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  adaptCampfitTrustExportToTrustInput,
  adaptTaxesTrustExportToTrustInput,
  buildTrustReport,
  validateTrustInput,
} from "../src/index.js";

const execFileAsync = promisify(execFile);

test("adapts Campfit trust exports into verified, stale, disputed, proposed, and rejected claims", async () => {
  const raw = await readFile("examples/campfit-trust-export.json", "utf8");
  const input = validateTrustInput(adaptCampfitTrustExportToTrustInput(JSON.parse(raw)));
  const report = buildTrustReport(input, {
    id: "campfit-cross-domain",
    now: new Date("2026-04-25T04:00:00.000Z"),
  });

  assert.equal(report.source, "campfit:trust-export:denver-demo");
  assert.equal(report.summary.totalClaims, 9);
  assert.equal(report.summary.byStatus.verified, 4);
  assert.equal(report.summary.byStatus.stale, 1);
  assert.equal(report.summary.byStatus.disputed, 1);
  assert.equal(report.summary.byStatus.proposed, 1);
  assert.equal(report.summary.byStatus.rejected, 2);
  assert.equal(report.summary.bySurface["campfit.public-data"], 2);
  assert.equal(report.summary.bySurface["campfit.review-flags"], 1);
});

test("adapts taxes trust exports into fact, return-package, assumption, comparison, and review-signal claims", async () => {
  const raw = await readFile("examples/taxes-trust-export.json", "utf8");
  const input = validateTrustInput(adaptTaxesTrustExportToTrustInput(JSON.parse(raw)));
  const report = buildTrustReport(input, {
    id: "taxes-cross-domain",
    now: new Date("2026-04-25T04:00:00.000Z"),
  });

  assert.equal(report.source, "taxes:trust-export:anderson-2025");
  assert.equal(report.summary.totalClaims, 9);
  assert.equal(report.summary.byStatus.verified, 3);
  assert.equal(report.summary.byStatus.proposed, 2);
  assert.equal(report.summary.byStatus.unknown, 1);
  assert.equal(report.summary.byStatus.disputed, 3);
  assert.equal(report.summary.bySurface["taxes.verified-facts"], 1);
  assert.equal(report.summary.bySurface["taxes.review-signals"], 1);
});

test("CLI can report directly from Campfit and taxes trust exports", async () => {
  const campfit = await execFileAsync("node", [
    "bin/surface.mjs",
    "report",
    "--adapter",
    "campfit",
    "--format",
    "summary",
    "--run-id",
    "cli-campfit",
  ]);
  assert.match(campfit.stdout, /Kontour Surface report cli-campfit/);
  assert.match(campfit.stdout, /Source: campfit:trust-export:denver-demo/);
  assert.match(campfit.stdout, /rejected: 2/);

  const taxes = await execFileAsync("node", [
    "bin/surface.mjs",
    "report",
    "--adapter",
    "taxes",
    "--format",
    "summary",
    "--run-id",
    "cli-taxes",
  ]);
  assert.match(taxes.stdout, /Kontour Surface report cli-taxes/);
  assert.match(taxes.stdout, /Source: taxes:trust-export:anderson-2025/);
  assert.match(taxes.stdout, /disputed: 3/);
});
