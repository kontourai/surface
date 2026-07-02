import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

// Issue #108: the legacy `/api/read-model` and `/api/console-model` endpoints
// resolve a `?run=` query param into a filesystem path within the runs
// archive directory. This must be constrained to the expected run-id shape —
// no absolute paths, no path separators, no `..` traversal — and reject
// anything else with 400, not silently resolve outside the archive.

function readModel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    producer: { runId: "latest-run", sourceKind: "working-tree", timestamp: "2026-07-01T00:00:00.000Z" },
    summary: { claimCount: 0, statusCounts: {}, transparencyGapCount: 0, surfaceCounts: {} },
    evidence: [],
    transparencyGaps: [],
    claims: [],
    ...overrides,
  };
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  await new Promise<void>((r) => server.close(() => r()));
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  return address.port;
}

async function waitForConsole(url: string, exitCode: () => number | null, output: () => string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (exitCode() !== null) throw new Error(`console exited early (${exitCode()}):\n${output()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`console did not start within 15s:\n${output()}`);
}

test("run= query param: traversal and absolute-path attempts are rejected with 400, a valid run id still works", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-console-run-"));
  const runsDir = join(dir, ".surface", "runs");
  await mkdir(runsDir, { recursive: true });
  const port = await getFreePort();
  const latestPath = join(runsDir, "latest.json");
  const goodRunPath = join(runsDir, "good-run-1.console.json");
  // A file living outside the runs archive, one level up — this is what a
  // traversal attempt could reach if `?run=` were not sanitized.
  const secretPath = join(dir, "secret.console.json");

  await writeFile(latestPath, JSON.stringify(readModel()), "utf8");
  await writeFile(goodRunPath, JSON.stringify(readModel({ producer: { runId: "good-run-1" } })), "utf8");
  await writeFile(secretPath, JSON.stringify(readModel({ producer: { runId: "secret" } })), "utf8");

  const child = spawn(
    process.execPath,
    ["bin/surface.mjs", "console", "--read-model", latestPath, "--store", join(dir, "veritas.claims.json"), "--port", String(port)],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout?.on("data", (c) => { output += String(c); });
  child.stderr?.on("data", (c) => { output += String(c); });

  try {
    await waitForConsole(`http://127.0.0.1:${port}/api/read-model`, () => child.exitCode, () => output);

    const traversalAttempts = [
      "../secret",
      "..%2Fsecret",
      "..\\secret",
      encodeURIComponent(secretPath), // absolute path
      "good-run-1/../../secret",
      "a/b",
    ];

    for (const attempt of traversalAttempts) {
      for (const endpoint of ["/api/read-model", "/api/console-model"]) {
        const response = await fetch(`http://127.0.0.1:${port}${endpoint}?run=${attempt}`);
        assert.equal(
          response.status,
          400,
          `expected 400 for ${endpoint}?run=${attempt}, got ${response.status}`,
        );
        const body = await response.json() as { error?: string };
        assert.ok(body.error, `expected an error message for ${endpoint}?run=${attempt}`);
      }
    }

    // A well-formed run id still resolves within the runs archive.
    const readModelResponse = await fetch(`http://127.0.0.1:${port}/api/read-model?run=good-run-1`);
    assert.equal(readModelResponse.status, 200);
    const goodModel = await readModelResponse.json() as { producer: { runId: string } };
    assert.equal(goodModel.producer.runId, "good-run-1");

    const consoleModelResponse = await fetch(`http://127.0.0.1:${port}/api/console-model?run=good-run-1`);
    assert.equal(consoleModelResponse.status, 200);

    // "latest" is still the documented sentinel for the default read model.
    const latestResponse = await fetch(`http://127.0.0.1:${port}/api/read-model?run=latest`);
    assert.equal(latestResponse.status, 200);
    const latestModel = await latestResponse.json() as { producer: { runId: string } };
    assert.equal(latestModel.producer.runId, "latest-run");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 1500)).then(() => child.kill("SIGKILL")),
    ]);
    await rm(dir, { recursive: true, force: true });
  }
});
