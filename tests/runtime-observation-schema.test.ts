import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";

import {
  buildTrustReport,
  mergeBundlesDetailed,
  validateTrustBundle,
  type TrustBundle,
} from "../src/index.js";

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

function emptyBundle(source: string): TrustBundle {
  return { schemaVersion: 5, source, claims: [], evidence: [], policies: [], events: [] };
}

test("merge declares 7 for v7 vocabulary and validates against the current trust-bundle schema", () => {
  const runtime = validateTrustBundle(
    JSON.parse(readFileSync("examples/runtime-observation-policy.json", "utf8")),
  );
  const merged = mergeBundlesDetailed([runtime, emptyBundle("pure-v5")]).bundle;

  assert.equal(merged.schemaVersion, 7);
  const validate = compileSchema("trust-bundle.schema.json");
  assert.equal(validate(merged), true, JSON.stringify(validate.errors));
});

test("merge keeps pure-v5 content at schemaVersion 5", () => {
  const merged = mergeBundlesDetailed([emptyBundle("a"), emptyBundle("b")]).bundle;
  assert.equal(merged.schemaVersion, 5);
});

test("runtime-observation report stays version 5 and validates against the current report extension schema", () => {
  const runtime = validateTrustBundle(
    JSON.parse(readFileSync("examples/runtime-observation-policy.json", "utf8")),
  );
  const report = buildTrustReport(runtime, { now: new Date("2026-06-10T00:00:00.000Z") });

  assert.equal(report.schemaVersion, 5);
  const validate = compileSchema("trust-report-waivers.schema.json");
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});
