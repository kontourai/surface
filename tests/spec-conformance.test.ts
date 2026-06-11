/**
 * Spec Conformance Test — makes spec/status-function.md executable.
 *
 * Loads each fixture from spec/conformance/ and asserts that the reference
 * implementation (deriveClaimStatus via buildTrustReport) produces the expected
 * per-claim statuses at the fixture's fixed `now` timestamp.
 *
 * Any conforming independent implementation of STATUS_FUNCTION_VERSION "1" must
 * produce the same outputs for these inputs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { buildTrustReport, validateTrustBundle, STATUS_FUNCTION_VERSION } from "../src/index.js";

interface SpecFixture {
  now: string;
  input: unknown;
  expect: {
    statusByClaimId: Record<string, string>;
  };
}

const CONFORMANCE_DIR = "spec/conformance";

const fixtureFiles = (await readdir(CONFORMANCE_DIR))
  .filter((name) => name.startsWith("sf-") && name.endsWith(".json"))
  .sort();

test("spec/conformance/ contains at least five fixture files", () => {
  assert.ok(
    fixtureFiles.length >= 5,
    `Expected at least 5 fixture files, found ${fixtureFiles.length}: ${fixtureFiles.join(", ")}`,
  );
});

test("STATUS_FUNCTION_VERSION is '1'", () => {
  assert.equal(STATUS_FUNCTION_VERSION, "1");
});

for (const fileName of fixtureFiles) {
  test(`spec conformance: ${fileName}`, async () => {
    const raw: SpecFixture = JSON.parse(
      await readFile(join(CONFORMANCE_DIR, fileName), "utf8"),
    );

    const bundle = validateTrustBundle(raw.input);
    const now = new Date(raw.now);
    const report = buildTrustReport(bundle, { now });

    const statusByClaimId = raw.expect.statusByClaimId;
    assert.ok(
      Object.keys(statusByClaimId).length > 0,
      `${fileName}: fixture must specify at least one expected status`,
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
