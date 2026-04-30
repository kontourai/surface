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

test("identityLinks let the kernel surface contradictions across adapter outputs", async () => {
  // Pull real claim shapes from two adapters, then ask the kernel: "if these
  // two systems are talking about the same subject, do their claims agree?"
  // Surface answers without either adapter knowing about the other.
  const campfitRaw = JSON.parse(await readFile("examples/campfit-trust-export.json", "utf8"));
  const campfitInput = adaptCampfitTrustExportToTrustInput(campfitRaw);
  const campfitClaim = campfitInput.claims.find((c) => c.subjectType === "camp");
  assert.ok(campfitClaim, "expected at least one camp claim from the campfit adapter");

  // Build a synthetic "release-channel" claim that holds an incompatible value
  // against the campfit camp. The two claims live on different subject types
  // and would otherwise look unrelated; identityLinks tell the kernel they are
  // the same real subject.
  const policyId = "cross-domain.release-channel";
  const releaseClaim = {
    id: "claim.release-channel.denver-art-lab",
    subjectType: "release-channel",
    subjectId: "release:denver-art-lab",
    surface: "release.public-data",
    claimType: "public-data-field",
    fieldOrBehavior: "registrationStatus",
    value: "CLOSED",
    createdAt: campfitClaim.createdAt,
    updatedAt: campfitClaim.updatedAt,
    impactLevel: campfitClaim.impactLevel,
    verificationPolicyId: policyId,
  };

  // Repoint the campfit claim at the cross-domain policy so both claims share
  // it. We clone the claim to avoid mutating the adapter's output.
  const linkedCampfitClaim = { ...campfitClaim, verificationPolicyId: policyId };
  const merged = validateTrustInput({
    schemaVersion: 3,
    source: "cross-domain-integration",
    claims: [linkedCampfitClaim, releaseClaim],
    evidence: campfitInput.evidence.filter((e) => e.claimId === campfitClaim.id),
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
          { subjectType: "camp", subjectId: campfitClaim.subjectId },
          { subjectType: "release-channel", subjectId: releaseClaim.subjectId },
        ],
        reason: "Camp listing and release channel describe the same real subject.",
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
