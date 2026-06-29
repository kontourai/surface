import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireSchemaVersion } from "../src/validation/primitives.js";

// surface/schemas/ is shipped to consumers but must stay generated from the
// `hachure` dependency — the single normative source for the trust-format schemas
// (Hachure unification, ops#7/#9). These copies had drifted to Hachure 0.4.0 while
// surface depends on 0.5.x, so the shipped trust-bundle schema capped schemaVersion
// at [2,3] and would have rejected the v4 bundles surface's own validator accepts.
//
// This fails if a schema drifts (hand-edited, or hachure bumped without
// `npm run sync:schemas`) or if surface ships a schema hachure no longer publishes.

const SHIPPED_DIR = "schemas";
const CANONICAL_DIR = join("node_modules", "hachure", "schemas");
const isSchema = (f: string): boolean => f.endsWith(".schema.json");

const canonical = readdirSync(CANONICAL_DIR).filter(isSchema).sort();
const shipped = readdirSync(SHIPPED_DIR).filter(isSchema).sort();

test("ships every canonical hachure schema, byte-identical (no drift)", () => {
  assert.ok(canonical.length > 0, "hachure ships schemas to mirror");
  for (const file of canonical) {
    const want = readFileSync(join(CANONICAL_DIR, file), "utf8");
    const got = readFileSync(join(SHIPPED_DIR, file), "utf8");
    assert.equal(got, want, `${file} has drifted from hachure — run \`npm run sync:schemas\``);
  }
});

test("ships no schema hachure does not publish (no orphans)", () => {
  const canonicalSet = new Set(canonical);
  const orphans = shipped.filter((f) => !canonicalSet.has(f));
  assert.deepEqual(orphans, [], `orphan schema(s) not in hachure — run \`npm run sync:schemas\``);
});

test("trust-bundle schemaVersion enum stays in parity with the runtime validator", () => {
  const schema = JSON.parse(readFileSync(join(SHIPPED_DIR, "trust-bundle.schema.json"), "utf8")) as {
    properties: { schemaVersion: { enum: number[] } };
  };
  const accepted = schema.properties.schemaVersion.enum;
  assert.ok(Array.isArray(accepted) && accepted.length > 0, "schemaVersion enum is non-empty");
  // Every version the shipped schema advertises must be accepted by the validator,
  // and a version just past the enum must be rejected. The stale [2,3] copy broke
  // exactly this — the validator accepts 4.
  for (const version of accepted) {
    assert.equal(
      requireSchemaVersion({ schemaVersion: version }),
      version,
      `validator should accept schemaVersion ${version} that the shipped schema advertises`,
    );
  }
  const beyond = Math.max(...accepted) + 1;
  assert.throws(
    () => requireSchemaVersion({ schemaVersion: beyond }),
    `validator should reject schemaVersion ${beyond} that the shipped schema does not advertise`,
  );
});
