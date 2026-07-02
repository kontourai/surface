import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import type { TrustBundle } from "../src/index.js";

const sharedClaim = {
  id: "claim.shared.repo-identity",
  subjectType: "repository",
  subjectId: "acme/widgets",
  facet: "governance.identity",
  claimType: "repo-metadata",
  fieldOrBehavior: "canonical repository",
  value: "acme/widgets",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function bundle(overrides: Partial<TrustBundle>): TrustBundle {
  return { schemaVersion: 5, source: "producer", claims: [], evidence: [], policies: [], events: [], ...overrides };
}

const ciProducer = bundle({
  source: "ci-producer:run-1",
  producerId: "ci-producer",
  claims: [
    { ...sharedClaim },
    {
      id: "claim.build.digest", subjectType: "artifact", subjectId: "acme/widgets@1.4.0",
      facet: "ci.build", claimType: "artifact-digest", fieldOrBehavior: "artifact digest",
      value: "sha256:aaaa", createdAt: "2026-07-01T09:05:00.000Z", updatedAt: "2026-07-01T09:05:00.000Z",
    },
  ],
});
const securityProducer = bundle({
  source: "security-producer:scan-1",
  producerId: "security-producer",
  claims: [
    { ...sharedClaim },
    {
      id: "claim.build.digest", subjectType: "artifact", subjectId: "acme/widgets@1.4.0",
      facet: "ci.build", claimType: "artifact-digest", fieldOrBehavior: "artifact digest",
      value: "sha256:9999", createdAt: "2026-07-01T09:05:00.000Z", updatedAt: "2026-07-01T09:05:00.000Z",
    },
  ],
});
const reviewProducer = bundle({
  source: "review-producer:pr-1", producerId: "review-producer", claims: [{ ...sharedClaim }],
});

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

test("surface console --input is repeatable, merges bundles, and serves a merged console model", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-console-merge-"));
  const port = await getFreePort();
  const storePath = join(dir, "veritas.claims.json");
  const ciPath = join(dir, "ci.json");
  const reviewPath = join(dir, "review.json");
  const securityPath = join(dir, "security.json");
  await writeFile(ciPath, JSON.stringify(ciProducer), "utf8");
  await writeFile(reviewPath, JSON.stringify(reviewProducer), "utf8");
  await writeFile(securityPath, JSON.stringify(securityProducer), "utf8");

  const child = spawn(
    process.execPath,
    [
      "bin/surface.mjs", "console",
      "--input", ciPath,
      "--input", reviewPath,
      "--input", securityPath,
      "--store", storePath,
      "--port", String(port),
    ],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout?.on("data", (c) => { output += String(c); });
  child.stderr?.on("data", (c) => { output += String(c); });

  try {
    await waitForConsole(`http://127.0.0.1:${port}/api/console-model`, () => child.exitCode, () => output);
    const response = await fetch(`http://127.0.0.1:${port}/api/console-model`);
    const model = await response.json() as {
      producers: string[];
      collisions: Array<{ id: string; keptProducer: string; droppedProducer: string }>;
      claims: Array<{ id: string; producers?: string[] }>;
    };

    // three distinct producers attributed, sorted, order-independent
    assert.deepEqual(model.producers, ["ci-producer", "review-producer", "security-producer"]);

    // the shared claim deduped to one and is attributed to all three producers
    const shared = model.claims.filter((claim) => claim.id === "claim.shared.repo-identity");
    assert.equal(shared.length, 1);
    assert.deepEqual(shared[0].producers, ["ci-producer", "review-producer", "security-producer"]);

    // the colliding digest is surfaced (not silently dropped) with named producers
    assert.equal(model.collisions.length, 1);
    assert.equal(model.collisions[0].id, "claim.build.digest");
    assert.equal(model.collisions[0].keptProducer, "security-producer");
    assert.equal(model.collisions[0].droppedProducer, "ci-producer");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 1500)).then(() => child.kill("SIGKILL")),
    ]);
    await rm(dir, { recursive: true, force: true });
  }
});
