import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrustPanelProjection, buildTrustReport, validateTrustBundle } from "../src/index.js";

test("Trust Panel projection scopes Viewer disclosure to one claim", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const report = buildTrustReport(validateTrustBundle(JSON.parse(raw)), {
    now: new Date("2026-04-25T00:00:00.000Z"),
  });
  const claimId = report.claims[0].id;

  const projection = buildTrustPanelProjection(report, { claimId });

  assert.equal(projection.totalClaims, 1);
  assert.deepEqual(projection.claims.map((claim) => claim.id), [claimId]);
  assert.equal(projection.statusCounts[report.claims[0].status], 1);
  assert.deepEqual(
    projection.claims[0].evidence.map((item) => item.claimId),
    projection.claims[0].evidence.map(() => claimId),
  );
  assert.deepEqual(
    projection.claims[0].transparencyGaps.map((item) => item.claimId),
    projection.claims[0].transparencyGaps.map(() => claimId),
  );
});

test("Trust Panel projection rejects unknown scoped claim", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const report = buildTrustReport(validateTrustBundle(JSON.parse(raw)));

  assert.throws(() => buildTrustPanelProjection(report, { claimId: "missing" }), /Unknown claim: missing/);
});
