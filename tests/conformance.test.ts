import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildTrustReport, validateTrustBundle } from "../src/index.js";

interface ConformanceExpectation {
  valid: boolean;
  statusByClaimId?: Record<string, string>;
  transparencyGapTypesByClaimId?: Record<string, string[]>;
  errorIncludes?: string;
}

interface ConformanceCase {
  name: string;
  input: string;
  expect: ConformanceExpectation;
}

interface ConformanceManifest {
  suite: string;
  version: number;
  cases: ConformanceCase[];
}

const manifest = JSON.parse(await readFile("conformance/manifest.json", "utf8")) as ConformanceManifest;

test("conformance manifest names the suite and at least one case per outcome", () => {
  assert.equal(manifest.suite, "kontour-surface-conformance");
  assert.ok(manifest.cases.length >= 4);
  assert.ok(manifest.cases.some((entry) => entry.expect.valid));
  assert.ok(manifest.cases.some((entry) => !entry.expect.valid));
});

for (const conformanceCase of manifest.cases) {
  test(`conformance: ${conformanceCase.name}`, async () => {
    const raw = JSON.parse(await readFile(join("conformance", conformanceCase.input), "utf8"));

    if (!conformanceCase.expect.valid) {
      assert.throws(
        () => validateTrustBundle(raw),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(
            error.message.includes(conformanceCase.expect.errorIncludes ?? ""),
            `expected error containing ${conformanceCase.expect.errorIncludes}, got: ${error.message}`,
          );
          return true;
        },
      );
      return;
    }

    const report = buildTrustReport(validateTrustBundle(raw));

    for (const [claimId, expectedStatus] of Object.entries(conformanceCase.expect.statusByClaimId ?? {})) {
      const claim = report.claims.find((candidate) => candidate.id === claimId);
      assert.ok(claim, `case ${conformanceCase.name} expects claim ${claimId}`);
      assert.equal(claim.status, expectedStatus, `case ${conformanceCase.name}, claim ${claimId}`);
    }

    for (const [claimId, expectedTypes] of Object.entries(conformanceCase.expect.transparencyGapTypesByClaimId ?? {})) {
      const actualTypes = report.transparencyGaps
        .filter((gap) => gap.claimId === claimId)
        .map((gap) => gap.type)
        .sort();
      assert.deepEqual(actualTypes, [...expectedTypes].sort(), `case ${conformanceCase.name}, claim ${claimId}`);
    }
  });
}
