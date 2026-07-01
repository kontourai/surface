import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addClaimStoreClaim,
  listClaimStore,
  removeClaimStoreClaim,
  updateClaimStoreClaim,
  validateClaimStoreAtPath,
} from "../src/index.js";

test("claim store transactions own load-mutate-save flow", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-claim-store-"));
  const path = join(dir, "claims.json");
  try {
    const added = addClaimStoreClaim(path, {
      surface: "release",
      claimType: "release-check",
      fieldOrBehavior: "tests",
      subjectType: "repo",
      subjectId: "surface",
    }, { now: "2026-05-01T00:00:00.000Z" });

    assert.equal(added.claim.id, "surface.release.tests");
    assert.equal(listClaimStore(path).claims.length, 1);

    updateClaimStoreClaim(path, added.claim.id, { impactLevel: "high" }, { now: "2026-05-01T00:01:00.000Z" });
    assert.equal(validateClaimStoreAtPath(path).claims[0].impactLevel, "high");

    removeClaimStoreClaim(path, added.claim.id);
    assert.equal(listClaimStore(path).claims.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
