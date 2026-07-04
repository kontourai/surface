import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addClaimToStore,
  createFileClaimStoreAdapter,
  emptyClaimStore,
  validateClaimStore,
  type ClaimDefinition,
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

test("createFileClaimStoreAdapter().load() resolves to an empty store when the file does not exist", async () => {
  const adapter = createFileClaimStoreAdapter(join(tmpdir(), `missing-${Date.now()}.json`));
  assert.equal(adapter.name, "file");
  const store = await adapter.load();
  assert.deepEqual(store, { schemaVersion: 1, producer: "veritas", claims: [], policies: [] });
});

test("createFileClaimStoreAdapter save/load round-trips a ClaimStore and stays valid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-store-adapter-"));
  try {
    const path = join(dir, "veritas.claims.json");
    const adapter = createFileClaimStoreAdapter(path);
    const store = addClaimToStore(emptyClaimStore(), claim);

    await adapter.save(store);
    const loaded = await adapter.load();

    assert.deepEqual(loaded, store);
    // Round-tripping through the adapter must not bypass validation: the
    // loaded store still passes validateClaimStore on its own terms.
    assert.deepEqual(validateClaimStore(loaded), loaded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("createFileClaimStoreAdapter load() rejects the same invalid shapes validateClaimStore rejects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-store-adapter-"));
  try {
    const path = join(dir, "bad.json");
    const adapter = createFileClaimStoreAdapter(path);

    await writeFile(path, JSON.stringify({ schemaVersion: 2, producer: "veritas", claims: [], policies: [] }));
    await assert.rejects(() => adapter.load(), /Unsupported claim store schemaVersion/);

    await writeFile(path, JSON.stringify({ schemaVersion: 1, producer: "veritas", claims: {}, policies: [] }));
    await assert.rejects(() => adapter.load(), /claims array/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("createFileClaimStoreAdapter save() rejects an invalid store instead of writing it to disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-store-adapter-"));
  try {
    const path = join(dir, "veritas.claims.json");
    const adapter = createFileClaimStoreAdapter(path);
    const invalidStore = { schemaVersion: 1, producer: "", claims: [], policies: [] };

    await assert.rejects(() => adapter.save(invalidStore as unknown as Parameters<typeof adapter.save>[0]), /producer string/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
