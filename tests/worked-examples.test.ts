/**
 * The worked examples documented in docs/reference/examples.md: each shipped
 * bundle must validate against the vendored Hachure schemas and Surface's own
 * validator, declare the lowest schemaVersion its content needs, and derive
 * the statuses the documentation walks through.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";

import { buildTrustReport, checkBasisInvariants, validateTrustBundle, type TrustBundle } from "../src/index.js";
import { requiredBundleSchemaVersion } from "../src/bundle-schema-version.js";

const Ajv2020 = (Ajv2020Import as unknown as { default?: unknown }).default ?? Ajv2020Import;

function compileTrustBundleSchema() {
  const AjvCtor = Ajv2020 as new (opts: Record<string, unknown>) => {
    addSchema: (schema: unknown, key: string) => void;
    compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: unknown };
  };
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  for (const file of readdirSync("schemas").sort()) {
    if (!file.endsWith(".schema.json") || file === "trust-bundle.schema.json") continue;
    ajv.addSchema(JSON.parse(readFileSync(join("schemas", file), "utf8")), file);
  }
  return ajv.compile(JSON.parse(readFileSync(join("schemas", "trust-bundle.schema.json"), "utf8")));
}

const validateSchema = compileTrustBundleSchema();

const WORKED_EXAMPLES = ["examples/data-flow-privacy-claim.json", "examples/learned-rule-freshness.json"];

function readExample(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function statusesAt(bundle: TrustBundle, now: string): Record<string, string> {
  const report = buildTrustReport(bundle, { now: new Date(now) });
  return Object.fromEntries(report.claims.map((claim) => [claim.id, claim.status]));
}

function gapTypesAt(bundle: TrustBundle, now: string, claimId: string): string[] {
  const report = buildTrustReport(bundle, { now: new Date(now) });
  return report.transparencyGaps
    .filter((gap) => gap.claimId === claimId)
    .map((gap) => gap.type)
    .sort();
}

for (const path of WORKED_EXAMPLES) {
  test(`${path} is a valid bundle at the lowest schemaVersion its content needs`, () => {
    const raw = readExample(path);
    assert.equal(validateSchema(raw), true, JSON.stringify(validateSchema.errors));
    const bundle = validateTrustBundle(raw);
    assert.deepEqual(checkBasisInvariants(bundle), []);
    assert.equal(bundle.schemaVersion, requiredBundleSchemaVersion(bundle));
  });
}

test("the validators these examples rely on reject a corrupted copy", () => {
  // Negative control: if either validator stopped running, the tests above
  // would pass for any file.
  const corrupted = structuredClone(readExample(WORKED_EXAMPLES[0]!)) as { evidence: Array<Record<string, unknown>> };
  corrupted.evidence[0]!.evidenceType = "runtime_observaton";
  assert.equal(validateSchema(corrupted), false);
  assert.throws(() => validateTrustBundle(corrupted));
});

test("data-flow example: only a passing runtime marker run verifies the claim", () => {
  const bundle = validateTrustBundle(readExample("examples/data-flow-privacy-claim.json"));
  const a = "claim.data-flow.transcript-excerpts.deployment-a";
  const b = "claim.data-flow.transcript-excerpts.deployment-b";
  const c = "claim.data-flow.transcript-excerpts.deployment-c";

  assert.deepEqual(statusesAt(bundle, "2026-10-04T00:00:00.000Z"), {
    [a]: "verified",
    // A passing unit test against a network double is not a runtime observation.
    [b]: "proposed",
    // The later marker run found the marker outside the allowed destination.
    [c]: "disputed",
  });
  assert.deepEqual(gapTypesAt(bundle, "2026-10-04T00:00:00.000Z", b), ["policy_violation", "provenance_gap"]);
  assert.deepEqual(gapTypesAt(bundle, "2026-10-04T00:00:00.000Z", a), []);

  // The policy's seven-day window lapses on 2026-10-08T10:05Z.
  assert.equal(statusesAt(bundle, "2026-10-08T10:04:59.000Z")[a], "verified");
  assert.equal(statusesAt(bundle, "2026-10-09T00:00:00.000Z")[a], "stale");
  assert.deepEqual(gapTypesAt(bundle, "2026-10-09T00:00:00.000Z", a), ["freshness_breach"]);

  // The leaking deployment goes stale too (staleness is checked first), but
  // keeps its blocking gap for the failed run.
  assert.equal(statusesAt(bundle, "2026-10-09T00:00:00.000Z")[c], "stale");
  const leakGaps = buildTrustReport(bundle, { now: new Date("2026-10-09T00:00:00.000Z") }).transparencyGaps
    .filter((gap) => gap.claimId === c && gap.type === "policy_violation");
  assert.ok(leakGaps.length > 0 && leakGaps.every((gap) => gap.blocking === true));
});

test("learned-rule example: ratified rules go stale on their own clock, unratified ones never verify", () => {
  const bundle = validateTrustBundle(readExample("examples/learned-rule-freshness.json"));
  const ttlRule = "claim.agent-rule.open-pull-request";
  const expiringRule = "claim.agent-rule.release-freeze";
  const unratified = "claim.agent-rule.squash-commits";

  assert.deepEqual(statusesAt(bundle, "2026-10-06T00:00:00.000Z"), {
    [ttlRule]: "verified",
    [expiringRule]: "verified",
    [unratified]: "unknown",
  });
  // The missing human attestation is named as the reason.
  assert.deepEqual(gapTypesAt(bundle, "2026-10-06T00:00:00.000Z", unratified), ["policy_violation", "provenance_gap"]);

  // expiresAt 2026-10-16T00:00Z ends the freeze rule, well inside the policy's 365-day window.
  assert.equal(statusesAt(bundle, "2026-10-15T23:59:59.000Z")[expiringRule], "verified");
  assert.deepEqual(statusesAt(bundle, "2026-10-20T00:00:00.000Z"), {
    [ttlRule]: "verified",
    [expiringRule]: "stale",
    [unratified]: "unknown",
  });
  assert.deepEqual(gapTypesAt(bundle, "2026-10-20T00:00:00.000Z", expiringRule), ["freshness_breach"]);
  // The docs promise the stale rule's freshness gap is blocking, so a rule loader can refuse it.
  const freshnessGap = buildTrustReport(bundle, { now: new Date("2026-10-20T00:00:00.000Z") }).transparencyGaps
    .find((gap) => gap.claimId === expiringRule && gap.type === "freshness_breach");
  assert.equal(freshnessGap?.blocking, true);

  // ttlSeconds 15552000 (180 days) from the 2026-07-01T12:00Z ratification ends on 2026-12-28T12:00Z.
  assert.equal(statusesAt(bundle, "2026-12-28T11:59:59.000Z")[ttlRule], "verified");
  assert.equal(statusesAt(bundle, "2027-01-05T00:00:00.000Z")[ttlRule], "stale");
});
