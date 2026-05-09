import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getAdapter,
  listAdapters,
  registerAdapter,
  type Adapter,
  type TrustInput,
} from "../src/index.js";

const execFileAsync = promisify(execFile);

function minimalInput(source: string): TrustInput {
  return {
    schemaVersion: 2,
    source,
    claims: [],
    evidence: [],
    policies: [],
    events: [],
  };
}

test("adapter registry supports register, get, and list", () => {
  const adapter: Adapter = {
    name: "registry-test-adapter",
    defaultFixture: "examples/registry-test.json",
    adapt() {
      return minimalInput("registry-test");
    },
  };

  registerAdapter(adapter);

  assert.equal(getAdapter("registry-test-adapter"), adapter);
  assert.ok(listAdapters().some((item) => item.name === "registry-test-adapter"));
});

test("adapter registry rejects double registration", () => {
  const adapter: Adapter = {
    name: "registry-duplicate-adapter",
    adapt() {
      return minimalInput("registry-duplicate");
    },
  };

  registerAdapter(adapter);

  assert.throws(
    () => registerAdapter(adapter),
    /already registered: registry-duplicate-adapter/,
  );
});

test("CLI unknown adapter error lists registered adapters", async () => {
  await assert.rejects(
    execFileAsync("node", ["bin/surface.mjs", "report", "--adapter", "unknown"]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
      assert.match(stderr, /Unknown adapter: unknown/);
      assert.match(stderr, /fact-resolution/);
      assert.match(stderr, /field-attested-records/);
      assert.match(stderr, /surface/);
      assert.doesNotMatch(stderr, /veritas/);
      return true;
    },
  );
});
