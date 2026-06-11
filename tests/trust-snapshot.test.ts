import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrustReport, deriveTrustSnapshot, validateTrustBundle } from "../src/index.js";

test("deriveTrustSnapshot returns the Trust Snapshot pieces used by reports", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const input = validateTrustBundle(JSON.parse(raw));
  const now = new Date("2026-04-25T00:00:00.000Z");
  const snapshot = deriveTrustSnapshot(input, { now });
  const report = buildTrustReport(input, { id: "snapshot-test", now });

  assert.deepEqual(snapshot.claims, report.claims);
  assert.deepEqual(snapshot.evidenceRequirementsByClaimId, report.evidenceRequirementsByClaimId);
  assert.deepEqual(snapshot.transparencyGaps, report.transparencyGaps);
  assert.deepEqual(snapshot.subjectGroups, report.subjectGroups);
  assert.deepEqual(snapshot.claimGroupRollups, report.claimGroupRollups);
});
