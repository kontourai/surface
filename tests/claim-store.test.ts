import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addClaimToStore,
  emptyClaimStore,
  loadClaimStore,
  removeClaimFromStore,
  updateClaimInStore,
  validateClaimStore,
  type ClaimDefinition,
  type ClaimStore,
} from "../src/index.js";

const claim: ClaimDefinition = {
  id: "repo.proof.npm-test",
  facet: "veritas.evidence-check",
  claimType: "software-evidence",
  fieldOrBehavior: "npm test",
  subjectType: "repository",
  subjectId: "repo",
  impactLevel: "high",
  createdAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

test("loadClaimStore returns empty store when file does not exist", () => {
  const store = loadClaimStore(join(tmpdir(), `missing-${Date.now()}.json`));
  assert.deepEqual(store, { schemaVersion: 1, producer: "veritas", claims: [], policies: [] });
});

test("loadClaimStore loads a valid store from disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-store-"));
  try {
    const path = join(dir, "veritas.claims.json");
    await writeFile(path, `${JSON.stringify({ schemaVersion: 1, producer: "veritas", claims: [claim], policies: [] })}\n`);
    assert.equal(loadClaimStore(path).claims[0]?.id, claim.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadClaimStore rejects invalid store shape", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-store-"));
  try {
    const path = join(dir, "bad.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 2, producer: "veritas", claims: [], policies: [] }));
    assert.throws(() => loadClaimStore(path), /Unsupported claim store schemaVersion/);
    await writeFile(path, JSON.stringify({ schemaVersion: 1, producer: "veritas", claims: {}, policies: [] }));
    assert.throws(() => loadClaimStore(path), /claims array/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("addClaimToStore adds immutably and rejects duplicates", () => {
  const store = emptyClaimStore();
  const updated = addClaimToStore(store, claim);
  assert.equal(updated.claims.length, 1);
  assert.equal(store.claims.length, 0);
  assert.throws(() => addClaimToStore(updated, claim), /already exists/);
});

test("updateClaimInStore updates mutable fields and preserves identity fields", () => {
  const store = addClaimToStore(emptyClaimStore(), claim);
  const updated = updateClaimInStore(store, claim.id, { fieldOrBehavior: "npm run test", impactLevel: "critical" });
  assert.equal(updated.claims[0]?.fieldOrBehavior, "npm run test");
  assert.equal(updated.claims[0]?.impactLevel, "critical");
  assert.equal(updated.claims[0]?.id, claim.id);
  assert.equal(updated.claims[0]?.createdAt, claim.createdAt);
  assert.notEqual(updated.claims[0]?.updatedAt, claim.updatedAt);
  assert.equal(store.claims[0]?.fieldOrBehavior, "npm test");
  assert.throws(() => updateClaimInStore(store, "missing", { facet: "x" }), /not found/);
});

test("removeClaimFromStore removes immutably and rejects missing ids", () => {
  const store = addClaimToStore(emptyClaimStore(), claim);
  const updated = removeClaimFromStore(store, claim.id);
  assert.equal(updated.claims.length, 0);
  assert.equal(store.claims.length, 1);
  assert.throws(() => removeClaimFromStore(updated, claim.id), /not found/);
});

test("validateClaimStore passes valid stores and rejects non-object input", () => {
  const store: ClaimStore = { schemaVersion: 1, producer: "veritas", claims: [claim], policies: [] };
  assert.equal(validateClaimStore(store), store);
  assert.throws(() => validateClaimStore(null), /JSON object/);
});

test("loadClaimStore maps a legacy claim definition `surface` field onto `facet`, strips it, and warns once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-store-"));
  try {
    const path = join(dir, "veritas.claims.json");
    const legacyClaim = {
      id: "repo.proof.legacy",
      surface: "veritas.legacy-grouping",
      claimType: "software-evidence",
      fieldOrBehavior: "npm test",
      subjectType: "repository",
      subjectId: "repo",
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
    };
    await writeFile(
      path,
      `${JSON.stringify({ schemaVersion: 1, producer: "veritas", claims: [legacyClaim], policies: [] })}\n`,
    );

    const warnings: string[] = [];
    const previousWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    let store: ClaimStore;
    try {
      store = loadClaimStore(path);
    } finally {
      console.warn = previousWarn;
    }

    // Legacy entry retains its grouping: the value that used to live under
    // `surface` is readable under `facet` after load.
    assert.equal(store.claims[0]?.facet, "veritas.legacy-grouping");
    assert.ok(!("surface" in (store.claims[0] as unknown as Record<string, unknown>)), "surface must never be re-emitted");
    assert.ok(warnings.some((message) => /deprecated/.test(message) && /"surface"/.test(message) && /"facet"/.test(message)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("save/load round trip preserves formatted JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-store-"));
  try {
    const path = join(dir, "veritas.claims.json");
    const { saveClaimStore } = await import("../src/index.js");
    saveClaimStore(addClaimToStore(emptyClaimStore(), claim), path);
    assert.equal(JSON.parse(await readFile(path, "utf8")).claims[0].id, claim.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
