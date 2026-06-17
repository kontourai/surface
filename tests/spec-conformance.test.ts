/**
 * Spec Conformance Test — makes the Hachure spec's status-function.md executable.
 *
 * Loads each test vector from the published `hachure` package and asserts that the reference
 * implementation (deriveClaimStatus via buildTrustReport) produces the expected
 * per-claim statuses at the test vector's fixed `now` timestamp.
 *
 * Any conforming independent implementation of status function version "1" must
 * produce the same outputs for these inputs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { buildTrustReport, validateTrustBundle, statusFunctionVersion } from "../src/index.js";

interface SpecTestVector {
  now: string;
  input: unknown;
  expect: {
    statusByClaimId: Record<string, string>;
  };
}

const CONFORMANCE_DIR = "node_modules/hachure/conformance";

const vectorFiles = (await readdir(CONFORMANCE_DIR))
  .filter((name) => name.startsWith("sf-") && name.endsWith(".json"))
  .sort();

test("hachure package contains at least five test vector files", () => {
  assert.ok(
    vectorFiles.length >= 5,
    `Expected at least 5 test vector files, found ${vectorFiles.length}: ${vectorFiles.join(", ")}`,
  );
});

test("statusFunctionVersion is '2'", () => {
  assert.equal(statusFunctionVersion, "2");
});

test("implementation statusFunctionVersion matches the hachure spec package", async () => {
  // @ts-expect-error — the hachure package ships no TypeScript types
  const spec = (await import("hachure")) as { statusFunctionVersion: string };
  assert.equal(statusFunctionVersion, spec.statusFunctionVersion);
});

for (const fileName of vectorFiles) {
  test(`spec conformance: ${fileName}`, async () => {
    const raw: SpecTestVector = JSON.parse(
      await readFile(join(CONFORMANCE_DIR, fileName), "utf8"),
    );

    const bundle = validateTrustBundle(raw.input);
    const now = new Date(raw.now);
    const report = buildTrustReport(bundle, { now });

    const statusByClaimId = raw.expect.statusByClaimId;
    assert.ok(
      Object.keys(statusByClaimId).length > 0,
      `${fileName}: test vector must specify at least one expected status`,
    );

    for (const [claimId, expectedStatus] of Object.entries(statusByClaimId)) {
      const claim = report.claims.find((c) => c.id === claimId);
      assert.ok(
        claim !== undefined,
        `${fileName}: expected claim ${claimId} not found in report`,
      );
      assert.equal(
        claim.status,
        expectedStatus,
        `${fileName}: claim ${claimId} — expected status "${expectedStatus}", got "${claim.status}" at now=${raw.now}`,
      );
    }
  });
}
