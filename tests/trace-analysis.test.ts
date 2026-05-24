import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeTrustTraces, buildTrustReport, validateTrustInput } from "../src/index.js";

test("analyzeTrustTraces classifies Evidence Trace and Authority Trace gaps", async () => {
  const raw = await readFile("examples/surface-fixtures.json", "utf8");
  const input = validateTrustInput(JSON.parse(raw));
  const report = buildTrustReport(input, {
    id: "trace-analysis",
    now: new Date("2026-04-25T00:00:00.000Z"),
  });

  const analysis = analyzeTrustTraces(report);
  const attestation = analysis.attestationValidity.items.find((item) => {
    return item.evidenceId === "evidence.field-attested-records.admin-attestation";
  });

  assert.equal(analysis.attestationValidity.totalAttestations, 1);
  assert.equal(attestation?.status, "weak");
  assert.deepEqual(attestation?.gaps, [
    "attestation_identity_unverified",
    "attestation_authority_unverified",
    "attestation_integrity_missing",
  ]);
  assert.equal(analysis.evidenceGaps.some((gap) => gap.gapType === "attestation_authority_unverified"), true);
});
