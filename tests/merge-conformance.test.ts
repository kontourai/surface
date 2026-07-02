/**
 * Merge conformance harness — makes hachure `merge.md` executable against the
 * reference implementation (`mergeBundlesDetailed` + `buildTrustReport`).
 *
 * Loads each vector from the published `hachure` package's `conformance/merge/`
 * subdirectory and asserts, for the MERGED bundle:
 *   1. `mergedClaimIds`      — the sorted union of all claim ids (never collapsed);
 *   2. `collisions`          — the sorted {collection, id} collision set;
 *   3. `statusByClaimId`     — each claim's derived status on the merged bundle.
 *
 * Any conforming independent implementation of the merge semantics must produce
 * the same outputs for these inputs. This is the test that closes the gap
 * merge.md §12 names: the spec repo's own `npm test` validates vector *shape*,
 * not code *execution* — this harness executes them.
 *
 * `hachure` ^0.9.0 (the installed devDependency) ships `conformance/merge/`
 * with all 4 named vectors, so this harness runs them for real on every
 * `npm test`; the branch below is not exercised in normal CI. It is kept as a
 * defensive fallback — not a live deferral — for the unlikely case a future
 * hachure bump ever ships without `conformance/merge/` again: rather than
 * fail the whole suite on a missing optional fixture directory, it skips with
 * a clear marker instead of silently reporting zero conformance coverage.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildTrustReport, mergeBundlesDetailed, validateTrustBundle } from "../src/index.js";

interface MergeTestVector {
  now: string;
  inputs: unknown[];
  expect: {
    mergedClaimIds: string[];
    collisions: { collection: string; id: string }[];
    statusByClaimId: Record<string, string>;
  };
}

const MERGE_CONFORMANCE_DIR = "node_modules/hachure/conformance/merge";

const mergeDirPresent = existsSync(MERGE_CONFORMANCE_DIR);

if (!mergeDirPresent) {
  // Defensive fallback only (see the module comment above) — not expected to
  // trigger with the currently installed hachure ^0.9.0, which ships this
  // directory.
  test(
    "merge conformance vectors (SKIPPED: hachure conformance/merge/ is absent from the installed package)",
    { skip: "node_modules/hachure/conformance/merge/ is absent from the installed hachure version — reinstall/update the hachure devDependency to restore conformance coverage." },
    () => {
      assert.fail("unreachable — skipped");
    },
  );
} else {
  const vectorFiles = (await readdir(MERGE_CONFORMANCE_DIR))
    .filter((name) => name.endsWith(".json"))
    .sort();

  test("hachure package ships at least the 4 named merge conformance vectors", () => {
    const required = [
      "merge-agree-values.json",
      "merge-conflict-value.json",
      "merge-conflict-status.json",
      "merge-collision-order-independence.json",
    ];
    for (const name of required) {
      assert.ok(
        vectorFiles.includes(name),
        `expected merge conformance vector ${name}; found: ${vectorFiles.join(", ")}`,
      );
    }
  });

  for (const fileName of vectorFiles) {
    test(`merge conformance: ${fileName}`, async () => {
      const vector: MergeTestVector = JSON.parse(
        await readFile(join(MERGE_CONFORMANCE_DIR, fileName), "utf8"),
      );

      const inputs = vector.inputs.map((b) => validateTrustBundle(b));
      const { bundle: merged, collisions } = mergeBundlesDetailed(inputs);
      const validated = validateTrustBundle(merged);

      // (1) mergedClaimIds — sorted union, never collapsed by claim identity.
      assert.deepEqual(
        validated.claims.map((c) => c.id).sort(),
        [...vector.expect.mergedClaimIds].sort(),
        `${fileName}: mergedClaimIds mismatch`,
      );

      // (2) collision set — order-independent {collection, id}, sorted.
      const actualCollisions = collisions
        .map((c) => ({ collection: c.collection, id: c.id }))
        .filter(
          (c, i, a) => a.findIndex((x) => x.collection === c.collection && x.id === c.id) === i,
        )
        .sort((x, y) => `${x.collection}:${x.id}`.localeCompare(`${y.collection}:${y.id}`));
      const expectedCollisions = [...vector.expect.collisions].sort((x, y) =>
        `${x.collection}:${x.id}`.localeCompare(`${y.collection}:${y.id}`),
      );
      assert.deepEqual(actualCollisions, expectedCollisions, `${fileName}: collision set mismatch`);

      // (3) statusByClaimId — derived on the MERGED bundle at the vector's `now`.
      const report = buildTrustReport(validated, { now: new Date(vector.now) });
      for (const [claimId, expectedStatus] of Object.entries(vector.expect.statusByClaimId)) {
        const claim = report.claims.find((c) => c.id === claimId);
        assert.ok(claim !== undefined, `${fileName}: expected claim ${claimId} not in merged report`);
        assert.equal(
          claim.status,
          expectedStatus,
          `${fileName}: claim ${claimId} — expected "${expectedStatus}", got "${claim.status}" at now=${vector.now}`,
        );
      }
    });
  }
}
