/**
 * Hachure schemaVersion 8: the calibrated `conclusionConfidence` rules.
 *
 * `validateTrustBundle` is hand-written, so its verdict is compared case by
 * case with the specification's own: the vendored trust-bundle JSON schema
 * (Ajv) plus the two ordering rules JSON Schema cannot express, which the
 * `hachure` package checks in `validateConclusionConfidence`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";

import { TrustBundleBuilder, mergeBundlesDetailed, validateTrustBundle, type SchemaVersion, type TrustBundle } from "../src/index.js";

const Ajv2020 = (Ajv2020Import as unknown as { default?: unknown }).default ?? Ajv2020Import;
const schemasDir = "schemas";

function compileSchema(rootFile: string) {
  const AjvCtor = Ajv2020 as new (opts: Record<string, unknown>) => {
    addSchema: (schema: unknown, key: string) => void;
    compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: unknown };
  };
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  for (const file of readdirSync(schemasDir).sort()) {
    if (!file.endsWith(".schema.json") || file === rootFile) continue;
    ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, file), "utf8")), file);
  }
  return ajv.compile(JSON.parse(readFileSync(join(schemasDir, rootFile), "utf8")));
}

const schemaValid = compileSchema("trust-bundle.schema.json");
// @ts-expect-error — the hachure package ships no TypeScript types
const hachure = (await import("hachure")) as { validateConclusionConfidence: (bundle: unknown) => unknown[] };

const AT = "2026-09-01T00:00:00.000Z";
const CALIBRATION = { tableRef: "calibration/answers", tableVersion: "2026-09" };

function bundleWith(conclusionConfidence: unknown, schemaVersion: number): Record<string, unknown> {
  return {
    schemaVersion,
    source: "schema-v8-test",
    claims: [{
      id: "claim.confidence", subjectType: "answer", subjectId: "a1", claimType: "answer", fieldOrBehavior: "correct",
      value: true, createdAt: AT, updatedAt: AT,
      ...(conclusionConfidence === undefined ? {} : { conclusionConfidence }),
    }],
    evidence: [], policies: [], events: [],
  };
}

function specAccepts(bundle: unknown): boolean {
  return schemaValid(bundle) && hachure.validateConclusionConfidence(bundle).length === 0;
}

function surfaceAccepts(bundle: unknown): boolean {
  try {
    validateTrustBundle(structuredClone(bundle));
    return true;
  } catch {
    return false;
  }
}

/** [name, conclusionConfidence, accepted at schemaVersion 8]. The literal verdict is pinned beside the derived one. */
const CASES: Array<[string, unknown, boolean]> = [
  ["absent", undefined, true],
  ["comfort zone only", { comfortZone: { within: true } }, true],
  ["value with calibration", { value: 0.8, calibration: CALIBRATION }, true],
  ["value without calibration", { value: 0.8 }, false],
  ["value with method but no calibration", { value: 0.8, method: "ensemble-disagreement" }, false],
  ["calibration without value", { calibration: CALIBRATION }, true],
  ["full calibration", { value: 0.8, calibration: { ...CALIBRATION, method: "isotonic", sampleSize: 400, boundMethod: "wilson" } }, true],
  ["calibration missing tableVersion", { value: 0.8, calibration: { tableRef: "t" } }, false],
  ["calibration missing tableRef", { value: 0.8, calibration: { tableVersion: "1" } }, false],
  ["calibration empty tableRef", { value: 0.8, calibration: { tableRef: "", tableVersion: "1" } }, false],
  ["calibration unknown key", { value: 0.8, calibration: { ...CALIBRATION, extra: 1 } }, false],
  ["calibration sampleSize zero", { value: 0.8, calibration: { ...CALIBRATION, sampleSize: 0 } }, false],
  ["calibration sampleSize fractional", { value: 0.8, calibration: { ...CALIBRATION, sampleSize: 1.5 } }, false],
  ["calibration method not a string", { value: 0.8, calibration: { ...CALIBRATION, method: 3 } }, false],
  ["calibration not an object", { value: 0.8, calibration: "table" }, false],
  ["interval around value", { value: 0.5, calibration: CALIBRATION, interval: { low: 0.2, high: 0.9 } }, true],
  ["degenerate interval at value", { value: 0.2, calibration: CALIBRATION, interval: { low: 0.2, high: 0.2 } }, true],
  ["interval without value", { interval: { low: 0.2, high: 0.9 } }, true],
  ["interval low above high", { interval: { low: 0.9, high: 0.2 } }, false],
  ["value below interval", { value: 0.1, calibration: CALIBRATION, interval: { low: 0.2, high: 0.9 } }, false],
  ["value above interval", { value: 0.95, calibration: CALIBRATION, interval: { low: 0.2, high: 0.9 } }, false],
  ["interval high above 1", { interval: { low: 0.2, high: 1.2 } }, false],
  ["interval low below 0", { interval: { low: -0.1, high: 0.9 } }, false],
  ["interval missing high", { interval: { low: 0.2 } }, false],
  ["interval unknown key", { interval: { low: 0.2, high: 0.9, mid: 0.5 } }, false],
  ["value above 1", { value: 1.5, calibration: CALIBRATION }, false],
  ["value not a number", { value: "0.8", calibration: CALIBRATION }, false],
  ["unknown key", { value: 0.8, calibration: CALIBRATION, score: 1 }, false],
  ["comfort zone missing within", { comfortZone: { reason: "novel" } }, false],
];

for (const [name, confidence, acceptedAt8] of CASES) {
  test(`schemaVersion 8 conclusionConfidence: ${name}`, () => {
    const bundle = bundleWith(confidence, 8);
    assert.equal(specAccepts(bundle), acceptedAt8, "specification verdict (schema + ordering rules)");
    assert.equal(surfaceAccepts(bundle), acceptedAt8, "validateTrustBundle verdict");
  });
}

test("schemaVersion 8 is accepted and round-trips", () => {
  const bundle = validateTrustBundle(bundleWith({ value: 0.8, calibration: CALIBRATION }, 8));
  assert.equal(bundle.schemaVersion, 8);
  assert.deepEqual(bundle.claims[0]!.conclusionConfidence?.calibration, CALIBRATION);
  assert.throws(() => validateTrustBundle(bundleWith(undefined, 9)), /Unsupported schemaVersion 9: expected 2, 3, 4, 5, 6, 7, or 8/);
});

test("the v8 rules do not apply before schemaVersion 8, but a calibration object is always checked", () => {
  for (const schemaVersion of [5, 7]) {
    // `value` without `calibration` stays valid, as the schema states for earlier versions.
    const uncalibrated = bundleWith({ value: 0.8 }, schemaVersion);
    assert.equal(specAccepts(uncalibrated), true);
    assert.equal(surfaceAccepts(uncalibrated), true);
    // The interval bound rule is version-gated too.
    const wide = bundleWith({ interval: { low: 0.2, high: 1.2 } }, schemaVersion);
    assert.equal(specAccepts(wide), true);
    assert.equal(surfaceAccepts(wide), true);
    // The calibration object's own shape is not gated.
    const badCalibration = bundleWith({ value: 0.8, calibration: { tableRef: "t" } }, schemaVersion);
    assert.equal(specAccepts(badCalibration), false);
    assert.equal(surfaceAccepts(badCalibration), false);
  }
});

function emptyBundle(source: string, schemaVersion: SchemaVersion = 5): TrustBundle {
  return { schemaVersion, source, claims: [], evidence: [], policies: [], events: [] };
}

test("emitters stamp schemaVersion 8 only when a claim names its calibration table", () => {
  const calibrated = validateTrustBundle(bundleWith({ value: 0.8, calibration: CALIBRATION }, 8));
  const uncalibrated = validateTrustBundle(bundleWith({ value: 0.8 }, 5));
  const runtime = validateTrustBundle(JSON.parse(readFileSync("examples/runtime-observation-policy.json", "utf8")));

  // Merge re-derives the declaration from content: 8 for the v8 field, whatever the inputs declared.
  assert.equal(mergeBundlesDetailed([calibrated, emptyBundle("other")]).bundle.schemaVersion, 8);
  assert.equal(mergeBundlesDetailed([calibrated, runtime]).bundle.schemaVersion, 8);
  // Uncalibrated confidence is not a v8 feature: promoting it to 8 would make it invalid.
  assert.equal(mergeBundlesDetailed([uncalibrated, emptyBundle("other")]).bundle.schemaVersion, 5);
  assert.equal(mergeBundlesDetailed([uncalibrated, runtime]).bundle.schemaVersion, 7);
  assert.equal(schemaValid(mergeBundlesDetailed([calibrated, runtime]).bundle), true, JSON.stringify(schemaValid.errors));

  const claim = calibrated.claims[0]!;
  assert.equal(new TrustBundleBuilder({ source: "sdk" }).addClaim(claim).build().schemaVersion, 8);
  assert.equal(new TrustBundleBuilder({ source: "sdk" }).addClaim(uncalibrated.claims[0]!).build().schemaVersion, 5);
  assert.throws(
    () => new TrustBundleBuilder({ source: "sdk", schemaVersion: 7 }).addClaim(claim).build(),
    /schemaVersion 7 is insufficient for conclusionConfidence\.calibration; declare schemaVersion 8/,
  );
  assert.equal(new TrustBundleBuilder({ source: "sdk", schemaVersion: 8 }).addClaim(claim).build().schemaVersion, 8);
});
