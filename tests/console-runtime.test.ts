/**
 * Issue #2 — Surface Console runtime unit coverage.
 *
 * The console runtime owns the domain orchestration (read-model loading, run
 * catalog, projection creation, HTML assembly, Claim Package authoring) that
 * used to live inside the HTTP server. These tests exercise every workflow
 * directly against `SurfaceConsoleRuntime` — with no HTTP server started —
 * which is the testability boundary the extraction exists to provide.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InvalidRunParamError, SurfaceConsoleRuntime } from "../src/console/runtime.js";

function readModel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    producer: { runId: "latest-run", sourceKind: "working-tree", timestamp: "2026-07-01T00:00:00.000Z" },
    summary: { claimCount: 1, statusCounts: { verified: 1 }, transparencyGapCount: 0, surfaceCounts: {} },
    evidence: [],
    transparencyGaps: [],
    claims: [{ id: "claim-1", status: "verified", fieldOrBehavior: "npm test", facet: "veritas.evidence-check", subjectId: "repo" }],
    ...overrides,
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "surface-runtime-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("loadReadModel reads the configured read-model artifact", async () => {
  await withTempDir(async (dir) => {
    const readModelPath = join(dir, "latest.json");
    await writeFile(readModelPath, JSON.stringify(readModel()));
    const runtime = new SurfaceConsoleRuntime({ readModelPath, storePath: join(dir, "store.json") });

    const loaded = (await runtime.loadReadModel()) as Record<string, unknown>;
    assert.equal((loaded.producer as Record<string, unknown>).runId, "latest-run");
  });
});

test("loadReadModel follows a surface-console-index indirection to the real read model", async () => {
  await withTempDir(async (dir) => {
    // The index lives under .surface/runs/; readModelPath is relative to repo root (3 dirs up).
    const runsDir = join(dir, ".surface", "runs");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(dir, "model.json"), JSON.stringify(readModel({ producer: { runId: "via-index" } })));
    await writeFile(join(runsDir, "latest.json"), JSON.stringify({ kind: "surface-console-index", readModelPath: "model.json" }));

    const runtime = new SurfaceConsoleRuntime({ readModelPath: join(runsDir, "latest.json"), storePath: join(dir, "store.json") });
    const loaded = (await runtime.loadReadModel()) as Record<string, unknown>;
    assert.equal((loaded.producer as Record<string, unknown>).runId, "via-index");
  });
});

test("loadReadModel rejects a traversal `?run=` param with InvalidRunParamError", async () => {
  await withTempDir(async (dir) => {
    const runtime = new SurfaceConsoleRuntime({ readModelPath: join(dir, "latest.json"), storePath: join(dir, "store.json") });
    await assert.rejects(() => runtime.loadReadModel("../../etc/passwd"), InvalidRunParamError);
    await assert.rejects(() => runtime.loadReadModel("has/slash"), InvalidRunParamError);
  });
});

test("buildConsoleModel and loadConsoleModel project the read model into a console view", async () => {
  await withTempDir(async (dir) => {
    const readModelPath = join(dir, "latest.json");
    await writeFile(readModelPath, JSON.stringify(readModel()));
    const runtime = new SurfaceConsoleRuntime({ readModelPath, storePath: join(dir, "store.json") });

    const model = (await runtime.loadConsoleModel()) as Record<string, unknown>;
    assert.ok(Array.isArray(model.claimCards));
    assert.equal((model.claimCards as unknown[]).length, 1);
    assert.ok(model.claimDetails, "projection carries the claim detail map");
  });
});

test("emptyConsoleModel returns a renderable empty state", () => {
  const runtime = new SurfaceConsoleRuntime({ theme: { brandName: "Veritas" } });
  const empty = runtime.emptyConsoleModel() as Record<string, unknown>;
  assert.equal((empty.project as Record<string, unknown>).name, "Veritas");
  assert.deepEqual(empty.claims, []);
});

test("listRuns enumerates archived runs newest-first; inputs mode yields none", async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, "latest.json"), JSON.stringify(readModel()));
    await writeFile(join(dir, "run-old.console.json"), JSON.stringify({
      producer: { runId: "old" }, generatedAt: "2026-07-01T00:00:00.000Z", summary: { claimCount: 2, statusCounts: { verified: 1 } },
    }));
    await writeFile(join(dir, "run-new.console.json"), JSON.stringify({
      producer: { runId: "new" }, generatedAt: "2026-07-05T00:00:00.000Z", summary: { claimCount: 3, statusCounts: { verified: 3 } },
    }));

    const runtime = new SurfaceConsoleRuntime({ readModelPath: join(dir, "latest.json"), storePath: join(dir, "store.json") });
    const runs = await runtime.listRuns();
    assert.deepEqual(runs.map((r) => r.runId), ["new", "old"]);
    assert.equal(runs[0].verifiedCount, 3);

    // Inputs mode has no per-run archive to enumerate.
    const merged = new SurfaceConsoleRuntime({ inputs: [join(dir, "bundle.json")], storePath: join(dir, "store.json") });
    assert.deepEqual(await merged.listRuns(), []);
  });
});

test("htmlModel renders the page from the read model, and falls back to empty on load error", async () => {
  await withTempDir(async (dir) => {
    const readModelPath = join(dir, "latest.json");
    await writeFile(readModelPath, JSON.stringify(readModel()));
    const runtime = new SurfaceConsoleRuntime({ readModelPath, storePath: join(dir, "store.json") });

    const ok = await runtime.htmlModel();
    assert.match(ok.html, /<!doctype html>/i);
    assert.ok(ok.readModel, "html built from a loaded read model");

    // Missing artifact → empty-state fallback, never throws.
    const broken = new SurfaceConsoleRuntime({ readModelPath: join(dir, "does-not-exist.json"), storePath: join(dir, "store.json") });
    const fallback = await broken.htmlModel();
    assert.equal(fallback.readModel, null);
    assert.match(fallback.html, /<!doctype html>/i);
  });
});

test("watchPaths tracks the read-model artifact + store, or the producer bundles in inputs mode", () => {
  const artifact = new SurfaceConsoleRuntime({ readModelPath: "/tmp/rm.json", storePath: "/tmp/store.json" });
  assert.deepEqual(artifact.watchPaths().map((p) => p.endsWith("rm.json") || p.endsWith("store.json")), [true, true]);

  const merged = new SurfaceConsoleRuntime({ inputs: ["/tmp/a.json", "/tmp/b.json"], storePath: "/tmp/store.json" });
  const paths = merged.watchPaths();
  assert.equal(paths.length, 3);
  assert.ok(paths.some((p) => p.endsWith("a.json")) && paths.some((p) => p.endsWith("b.json")) && paths.some((p) => p.endsWith("store.json")));
});

test("addClaim / updateClaim / removeClaim author the Claim Package store", async () => {
  await withTempDir(async (dir) => {
    const storePath = join(dir, "store.json");
    const runtime = new SurfaceConsoleRuntime({ readModelPath: join(dir, "latest.json"), storePath });

    const { claim } = runtime.addClaim({
      subjectId: "acme/widgets",
      subjectType: "repository",
      fieldOrBehavior: "canonical repository",
      claimType: "repo-metadata",
      facet: "governance.identity",
    });
    assert.equal(claim.subjectId, "acme/widgets");

    runtime.updateClaim(claim.id, { fieldOrBehavior: "canonical repo (updated)" });
    const afterUpdate = JSON.parse(await readFile(storePath, "utf8")) as Record<string, unknown>;
    const claims = afterUpdate.claims as Array<Record<string, unknown>>;
    assert.equal(claims.find((c) => c.id === claim.id)?.fieldOrBehavior, "canonical repo (updated)");

    runtime.removeClaim(claim.id);
    const afterRemove = JSON.parse(await readFile(storePath, "utf8")) as Record<string, unknown>;
    assert.equal((afterRemove.claims as unknown[]).length, 0);
  });
});

test("addClaim rejects a body missing required fields", async () => {
  await withTempDir(async (dir) => {
    const runtime = new SurfaceConsoleRuntime({ readModelPath: join(dir, "latest.json"), storePath: join(dir, "store.json") });
    assert.throws(() => runtime.addClaim({ subjectId: "x" }), /required/);
  });
});
