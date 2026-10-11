/**
 * Spec Conformance Test — makes the Hachure spec's status-function.md executable.
 *
 * Loads each test vector from the published `hachure` package and asserts that
 * this implementation (buildTrustReport: the per-claim fold plus the derivation
 * ceiling) produces the expected per-claim statuses at the vector's fixed `now`,
 * under every status function version the vector applies to.
 *
 * A vector with a `statusFunctionVersions` array applies only to the versions
 * it lists; a vector without one applies to every version. Every supported
 * version ("2", "3" and "4") is run. Vectors are derived without validation,
 * which is the specification's "format assertion off": several vectors carry
 * non-`date-time` strings on purpose.
 *
 * Vectors are derived from `vector.input` as published. `validateTrustBundle`
 * is Surface's stricter read contract (referential integrity, validity-rule
 * shape) and refuses some schema-valid bundles the status function defines a
 * result for; those refusals are pinned below so a change to either side is
 * visible.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  buildTrustReport,
  deriveClaimStatus,
  deriveTrustStatus,
  statusFunctionVersion,
  supportedStatusFunctionVersions,
  validateTrustBundle,
  type StatusFunctionVersion,
  type TrustBundle,
} from "../src/index.js";

interface SpecTestVector {
  now: string;
  statusFunctionVersions?: string[];
  input: unknown;
  expect: {
    statusByClaimId: Record<string, string>;
  };
}

const CONFORMANCE_DIR = "node_modules/hachure/conformance";

const vectorFiles = (await readdir(CONFORMANCE_DIR))
  .filter((name) => name.startsWith("sf-") && name.endsWith(".json"))
  .sort();

async function loadVector(fileName: string): Promise<SpecTestVector> {
  return JSON.parse(await readFile(join(CONFORMANCE_DIR, fileName), "utf8")) as SpecTestVector;
}

function applies(vector: SpecTestVector, version: StatusFunctionVersion): boolean {
  return vector.statusFunctionVersions === undefined || vector.statusFunctionVersions.includes(version);
}

function derive(vector: SpecTestVector, version: StatusFunctionVersion): Record<string, string> {
  const report = buildTrustReport(vector.input as TrustBundle, {
    now: new Date(vector.now),
    statusFunctionVersion: version,
  });
  assert.equal(report.statusFunctionVersion, version);
  return Object.fromEntries(report.claims.map((claim) => [claim.id, claim.status]));
}

/**
 * Vectors `validateTrustBundle` refuses, with the reason. Pinned literally: a
 * vector leaving or joining this list is a contract change, not a test detail.
 */
const VALIDATION_REFUSALS: Record<string, RegExp> = {
  "sf-authority-window-before-v4.json": /expiresAt must be an ISO-8601 UTC date-time/,
  "sf-unparseable-event-time.json": /createdAt must be an ISO-8601 UTC date-time/,
  "sf-v3-dangling-policy-id.json": /references unknown policy policy\.does-not-exist/,
  "sf-v3-derivation-ceiling.json": /derives from unknown claim claim\.ceiling\.not-in-bundle/,
  "sf-v3-unevaluable-validity.json": /expiresAt must be an ISO-8601 UTC date-time/,
  "sf-v4-authority-window.json": /observedAt must be an ISO-8601 UTC date-time/,
  "sf-v4-timestamp-forms.json": /expiresAt must be an ISO-8601 UTC date-time/,
};

/**
 * Unversioned vectors (added in hachure 0.18.0) that Surface's version "2"
 * does not meet, with the claims it derives differently. Surface's "2" is
 * kept exactly as it was so records resolved under it re-derive unchanged:
 * it compares authority-trace bounds as ISO strings and orders an unparseable
 * event time as NaN, which Hachure's "2" never did. Pinned literally, so a
 * change to Surface's "2" or to the vectors is visible here.
 */
const SURFACE_V2_DIVERGENCES: Record<string, string[]> = {
  "sf-authority-window-before-v4.json": ["claim.before-v4.unparseable-event-after-1969", "claim.before-v4.unparseable-valid-from"],
  "sf-authority-window-instants.json": [
    "claim.revoked-at.no-millis-equal",
    "claim.revoked-at.offset-later",
    "claim.valid-from.no-millis-equal",
    "claim.valid-from.offset-earlier",
    "claim.valid-from.offset-later",
    "claim.valid-until.event-no-millis-equal",
    "claim.valid-until.offset-earlier",
  ],
  "sf-unparseable-event-time.json": ["claim.event-time.unparseable-listed-first"],
};

/**
 * `sf-v3-*` vectors whose expected statuses this implementation also derives
 * under version "2", because it applied these two rules before version "3"
 * named them: an invalidation with a non-terminal status collapses to `stale`,
 * and the derivation ceiling uses this ordering and counts a missing input as
 * `unknown`. Every other `sf-v3-*` vector must derive differently under "2".
 */
const V3_VECTORS_ALREADY_MET_UNDER_V2 = new Set([
  "sf-v3-derivation-ceiling.json",
  "sf-v3-invalidation-nonterminal.json",
]);

test("hachure package ships the post-0.18 status vectors", () => {
  // Pinned literally (conformance/manifest.json L2 vectorCount at hachure 0.18.0).
  assert.equal(vectorFiles.length, 25, `found: ${vectorFiles.join(", ")}`);
  assert.equal(vectorFiles.filter((name) => name.startsWith("sf-v3-")).length, 8);
  assert.deepEqual(vectorFiles.filter((name) => name.startsWith("sf-v4-")), [
    "sf-v4-authority-window.json",
    "sf-v4-exact-instants.json",
    "sf-v4-timestamp-forms.json",
  ]);
  assert.ok(vectorFiles.includes("sf-authority-window-before-v4.json"));
  assert.ok(vectorFiles.includes("sf-runtime-observation-required.json"));
  // The schemaVersion 9 vectors (hachure 0.17.0) run under every version.
  assert.ok(vectorFiles.includes("sf-inconclusive-evidence.json"));
  assert.ok(vectorFiles.includes("sf-basis-fields-inert.json"));
});

test("statusFunctionVersion is '4'; '3' and '2' stay selectable", () => {
  assert.equal(statusFunctionVersion, "4");
  assert.deepEqual([...supportedStatusFunctionVersions], ["2", "3", "4"]);
});

test("implementation statusFunctionVersion matches the hachure spec package", async () => {
  // @ts-expect-error — the hachure package ships no TypeScript types
  const spec = (await import("hachure")) as { statusFunctionVersion: string; supportedStatusFunctionVersions: string[] };
  assert.equal(statusFunctionVersion, spec.statusFunctionVersion);
  assert.deepEqual([...supportedStatusFunctionVersions], [...spec.supportedStatusFunctionVersions]);
});

test("an unsupported statusFunctionVersion is refused, not defaulted", async () => {
  const vector = await loadVector("sf-verified-commit.json");
  assert.throws(
    () => buildTrustReport(vector.input as TrustBundle, { now: new Date(vector.now), statusFunctionVersion: "1" as StatusFunctionVersion }),
    /unsupported statusFunctionVersion "1"; supported: 2, 3, 4/,
  );
});

for (const version of supportedStatusFunctionVersions) {
  for (const fileName of vectorFiles) {
    test(`spec conformance [v${version}]: ${fileName}`, async (t) => {
      const vector = await loadVector(fileName);
      const expected = vector.expect.statusByClaimId;
      assert.ok(Object.keys(expected).length > 0, `${fileName}: vector must specify at least one expected status`);

      if (!applies(vector, version)) {
        // The vector does not apply to this version. It must still evaluate, and
        // (unless listed above) must derive differently, so that every v3 rule
        // it covers is shown to be a rule version "2" does not apply.
        const actual = derive(vector, version);
        const same = Object.entries(expected).every(([claimId, status]) => actual[claimId] === status);
        assert.equal(
          same,
          V3_VECTORS_ALREADY_MET_UNDER_V2.has(fileName),
          `${fileName}: under version ${version} derived ${JSON.stringify(actual)}`,
        );
        t.skip(`applies to statusFunctionVersions ${JSON.stringify(vector.statusFunctionVersions)} only`);
        return;
      }

      const actual = derive(vector, version);
      if (version === "2" && fileName in SURFACE_V2_DIVERGENCES) {
        const differing = Object.keys(expected).filter((claimId) => actual[claimId] !== expected[claimId]).sort();
        assert.deepEqual(differing, SURFACE_V2_DIVERGENCES[fileName], `${fileName}: Surface v2 divergences changed`);
        return;
      }
      for (const [claimId, expectedStatus] of Object.entries(expected)) {
        assert.ok(claimId in actual, `${fileName}: expected claim ${claimId} not found in report`);
        assert.equal(
          actual[claimId],
          expectedStatus,
          `${fileName} [v${version}]: claim ${claimId} — expected status "${expectedStatus}", got "${actual[claimId]}" at now=${vector.now}`,
        );
      }
    });
  }
}

for (const fileName of vectorFiles) {
  test(`spec vector read contract: ${fileName}`, async () => {
    const vector = await loadVector(fileName);
    const refusal = VALIDATION_REFUSALS[fileName];
    if (refusal === undefined) {
      const bundle = validateTrustBundle(structuredClone(vector.input));
      // A validated bundle derives the same statuses as the published input.
      for (const version of supportedStatusFunctionVersions) {
        const report = buildTrustReport(bundle, { now: new Date(vector.now), statusFunctionVersion: version });
        assert.deepEqual(
          Object.fromEntries(report.claims.map((claim) => [claim.id, claim.status])),
          derive(vector, version),
        );
      }
    } else {
      assert.throws(() => validateTrustBundle(structuredClone(vector.input)), refusal);
    }
  });
}

test("v3 refuses an invalid `now`; v2 does not", async () => {
  const vector = await loadVector("sf-verified-commit.json");
  const bundle = vector.input as TrustBundle;
  const claim = bundle.claims[0]!;
  const invalid = new Date("not-a-date");
  const args = { claim, evidence: bundle.evidence, events: bundle.events, policies: bundle.policies, now: invalid };

  assert.throws(() => deriveClaimStatus(args), /invalid now/);
  assert.throws(() => deriveClaimStatus({ ...args, statusFunctionVersion: "3" }), RangeError);
  assert.throws(() => buildTrustReport(bundle, { now: invalid }), /invalid now/);
  assert.throws(
    () => deriveTrustStatus({ claim, evidence: bundle.evidence, events: bundle.events, policy: bundle.policies[0], now: invalid }),
    /invalid now/,
  );
  // Version "2" does not refuse: every freshness comparison against NaN is false.
  assert.equal(deriveClaimStatus({ ...args, statusFunctionVersion: "2" }).status, "verified");
});
