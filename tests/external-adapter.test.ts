import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("external adapter example builds and uses the public SDK", async () => {
  const packageScope = "examples/external-adapter/node_modules/@kontourai";
  const packageLink = `${packageScope}/surface`;
  await mkdir(packageScope, { recursive: true });
  await rm(packageLink, { recursive: true, force: true });
  await symlink(resolve("."), packageLink, "dir");

  await execFileAsync("npm", ["run", "build"], {
    cwd: "examples/external-adapter",
  });

  const { stdout } = await execFileAsync("node", ["dist/index.js"], {
    cwd: "examples/external-adapter",
  });
  const result = JSON.parse(stdout);

  assert.equal(result.source, "external-ticket-system:demo");
  assert.equal(result.totalClaims, 1);
  assert.equal(result.verified, 1);
});
