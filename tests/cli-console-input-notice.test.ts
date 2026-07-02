import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import type { TrustBundle } from "../src/index.js";

// Issue #107: passing --input together with --read-model/--store is
// documented behavior (README, docs/reference/console.md: any --input
// switches to the merge-and-project path, --input wins), but historically
// fired no runtime notice. `surface console` must emit a one-line stderr
// notice when both are supplied.

function bundle(overrides: Partial<TrustBundle>): TrustBundle {
  return { schemaVersion: 5, source: "producer", claims: [], evidence: [], policies: [], events: [], ...overrides };
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

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((r) => setTimeout(r, 1500)).then(() => child.kill("SIGKILL")),
  ]);
}

test("surface console emits a stderr notice when --input is combined with --read-model/--store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-console-notice-"));
  const port = await getFreePort();
  const inputPath = join(dir, "producer.bundle.json");
  const readModelPath = join(dir, "veritas.dashboard.json");
  const storePath = join(dir, "veritas.claims.json");
  await writeFile(inputPath, JSON.stringify(bundle({ source: "producer:run-1" })), "utf8");

  const child = spawn(
    process.execPath,
    [
      "bin/surface.mjs", "console",
      "--input", inputPath,
      "--read-model", readModelPath,
      "--store", storePath,
      "--port", String(port),
    ],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (c) => { stdout += String(c); });
  child.stderr?.on("data", (c) => { stderr += String(c); });

  try {
    await waitForConsole(`http://127.0.0.1:${port}/api/read-model`, () => child.exitCode, () => stdout + stderr);
    assert.match(stderr, /--input/);
    assert.match(stderr, /--read-model/);
    assert.match(stderr, /--store/);
    assert.match(stderr, /wins/);
  } finally {
    await stopChild(child);
    await rm(dir, { recursive: true, force: true });
  }
});

test("surface console emits no --input notice when only --input is supplied", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-console-notice-"));
  const port = await getFreePort();
  const inputPath = join(dir, "producer.bundle.json");
  await writeFile(inputPath, JSON.stringify(bundle({ source: "producer:run-1" })), "utf8");

  const child = spawn(
    process.execPath,
    ["bin/surface.mjs", "console", "--input", inputPath, "--port", String(port)],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (c) => { stdout += String(c); });
  child.stderr?.on("data", (c) => { stderr += String(c); });

  try {
    await waitForConsole(`http://127.0.0.1:${port}/api/read-model`, () => child.exitCode, () => stdout + stderr);
    assert.doesNotMatch(stderr, /--input was provided together/);
  } finally {
    await stopChild(child);
    await rm(dir, { recursive: true, force: true });
  }
});

test("surface console emits no --input notice when only --read-model/--store is supplied", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-console-notice-"));
  const port = await getFreePort();
  const readModelPath = join(dir, "veritas.dashboard.json");
  const storePath = join(dir, "veritas.claims.json");
  await writeFile(readModelPath, JSON.stringify({
    producer: { runId: "run-1", sourceKind: "working-tree", timestamp: "2026-07-01T00:00:00.000Z" },
    summary: { claimCount: 0, statusCounts: {}, transparencyGapCount: 0, surfaceCounts: {} },
    evidence: [],
    transparencyGaps: [],
    claims: [],
  }), "utf8");

  const child = spawn(
    process.execPath,
    ["bin/surface.mjs", "console", "--read-model", readModelPath, "--store", storePath, "--port", String(port)],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (c) => { stdout += String(c); });
  child.stderr?.on("data", (c) => { stderr += String(c); });

  try {
    await waitForConsole(`http://127.0.0.1:${port}/api/read-model`, () => child.exitCode, () => stdout + stderr);
    assert.doesNotMatch(stderr, /--input was provided together/);
  } finally {
    await stopChild(child);
    await rm(dir, { recursive: true, force: true });
  }
});
