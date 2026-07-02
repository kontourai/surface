import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { TrustBundle } from "../src/index.js";

const execFileAsync = promisify(execFile);

const baseClaim = {
  subjectType: "repo-governance.repo",
  subjectId: "repo-A",
  facet: "repo-governance.developer-evidence",
  claimType: "release-status",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

function bundle(overrides: Partial<TrustBundle>): TrustBundle {
  return {
    schemaVersion: 3,
    source: "producer",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

const producerA = bundle({
  source: "producer-a",
  claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" }],
  policies: [
    {
      id: "policy-release",
      claimType: "release-status",
      requiredEvidence: [],
      acceptanceCriteria: [],
      reviewAuthority: "owner",
      validityRule: { kind: "manual" },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "medium",
      incompatibleValues: [{ values: ["ga", "withdrawn"], message: "A release cannot be GA and withdrawn." }],
    },
  ],
});

const producerB = bundle({
  source: "producer-b",
  claims: [{ ...baseClaim, id: "claim-b", fieldOrBehavior: "channel", value: "withdrawn" }],
});

test("surface report --input is repeatable and merges before reporting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-merge-"));
  try {
    const aPath = join(dir, "producer-a.json");
    const bPath = join(dir, "producer-b.json");
    await writeFile(aPath, JSON.stringify(producerA), "utf8");
    await writeFile(bPath, JSON.stringify(producerB), "utf8");

    const merged = await execFileAsync("node", [
      "bin/surface.mjs",
      "report",
      "--input",
      aPath,
      "--input",
      bPath,
      "--run-id",
      "cli-merge",
    ]);

    const report = JSON.parse(merged.stdout);
    assert.equal(report.claims.length, 2);
    const contradictions = report.transparencyGaps.filter(
      (gap: { type: string }) => gap.type === "contradiction",
    );
    assert.equal(contradictions.length, 1);
    assert.equal(contradictions[0].policyId, "policy-release");
    // distinct producer sources are combined under the merged: prefix
    assert.equal(report.source, "merged:producer-a+producer-b");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("surface report with a single --input keeps the single-bundle source unchanged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-single-"));
  try {
    const aPath = join(dir, "producer-a.json");
    await writeFile(aPath, JSON.stringify(producerA), "utf8");

    const out = await execFileAsync("node", ["bin/surface.mjs", "report", "--input", aPath]);
    const report = JSON.parse(out.stdout);
    assert.equal(report.source, "producer-a");
    assert.equal(report.claims.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
