import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../src/cli.js";

async function withTempCwd(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "surface-cli-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    await fn(dir);
  } finally {
    process.chdir(previous);
    await rm(dir, { recursive: true, force: true });
  }
}

async function readStore(dir: string): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, "veritas.claims.json"), "utf8")) as unknown;
}

test("surface claim add creates veritas.claims.json in cwd", async () => {
  await withTempCwd(async (dir) => {
    await runCli(["claim", "add", "--type", "software-proof", "--surface", "veritas.proof-lane", "--subject-type", "repository", "--subject-id", "repo", "--field", "npm test"]);
    const store = readStore(dir) as Promise<{ claims: Array<{ id: string }> }>;
    assert.equal((await store).claims.length, 1);
  });
});

test("surface claim add generates id when not provided", async () => {
  await withTempCwd(async (dir) => {
    await runCli(["claim", "add", "--type", "software-proof", "--surface", "veritas.proof-lane", "--subject-type", "repository", "--subject-id", "Repo Name", "--field", "npm test"]);
    const store = await readStore(dir) as { claims: Array<{ id: string }> };
    assert.equal(store.claims[0]?.id, "repo-name.veritas-proof-lane.npm-test");
  });
});

test("surface claim add --id uses provided id", async () => {
  await withTempCwd(async (dir) => {
    await runCli(["claim", "add", "--id", "custom-claim", "--type", "software-proof", "--surface", "veritas.proof-lane", "--subject-type", "repository", "--subject-id", "repo", "--field", "npm test"]);
    const store = await readStore(dir) as { claims: Array<{ id: string }> };
    assert.equal(store.claims[0]?.id, "custom-claim");
  });
});

test("surface claim list prints claim ids", async () => {
  await withTempCwd(async () => {
    await runCli(["claim", "add", "--id", "listed-claim", "--type", "software-proof", "--surface", "veritas.proof-lane", "--subject-type", "repository", "--subject-id", "repo", "--field", "npm test"]);
    const writes: string[] = [];
    const previous = console.log;
    console.log = (value?: unknown) => { writes.push(String(value)); };
    try {
      await runCli(["claim", "list"]);
    } finally {
      console.log = previous;
    }
    assert.match(writes.join("\n"), /listed-claim/);
  });
});
