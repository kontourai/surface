import test from "node:test";
import assert from "node:assert/strict";
import { buildSurfaceConsoleProjection, emptySurfaceConsoleProjection } from "../src/console/projection.js";

test("buildSurfaceConsoleProjection derives Operator-facing metrics and narrative", () => {
  const projection = buildSurfaceConsoleProjection({
    producer: {
      runId: "run-1",
      sourceKind: "working-tree",
      sourceScope: ["staged", "unstaged", "untracked"],
      timestamp: "2026-05-22T12:00:00.000Z",
    },
    summary: {
      claimCount: 2,
      statusCounts: { verified: 1, unknown: 1 },
      transparencyGapCount: 3,
      surfaceCounts: { "veritas.evidence-check": 2 },
    },
    claims: [{
      id: "claim-1",
      status: "unknown",
      fieldOrBehavior: "npm test",
      claimType: "software-evidence",
      surface: "veritas.evidence-check",
      subjectId: "repo",
    }, {
      id: "claim-2",
      status: "verified",
      fieldOrBehavior: "lint",
      claimType: "software-evidence",
      surface: "veritas.evidence-check",
      subjectId: "repo",
    }],
  }, {
    vocab: { surfaceLabels: { "veritas.evidence-check": "Evidence Check" } },
  });

  assert.equal(projection.project.name, "Repo");
  assert.equal(projection.run.id, "run-1");
  assert.match(projection.run.meta, /Working tree/);
  assert.match(projection.narrative, /1 claim need attention/);
  assert.match(projection.narrative, /Evidence Check/);
  assert.deepEqual(projection.metrics.map((metric) => [metric.label, metric.value, metric.delta, metric.filter]), [
    ["Claims", "2", "", "all"],
    ["Verified", "1", "50%", "verified"],
    ["Attention", "1", "3 gaps", "attention"],
  ]);
});

test("emptySurfaceConsoleProjection carries a renderable empty state", () => {
  const projection = emptySurfaceConsoleProjection({ theme: { brandName: "Veritas" } });

  assert.equal(projection.project.name, "Veritas");
  assert.equal(projection.claims.length, 0);
  assert.equal(projection.readModel, null);
  assert.equal(projection.metrics[0]?.value, "0");
});
