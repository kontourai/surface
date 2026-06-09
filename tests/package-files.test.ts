import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type PackageJson = {
  files?: string[];
};

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile("package.json", "utf8")) as PackageJson;
}

test("package files whitelist excludes generated example output", async () => {
  const packageJson = await readPackageJson();
  const files = packageJson.files ?? [];

  assert.ok(files.includes("bin/"));
  assert.ok(files.includes("dist/src/"));
  assert.ok(files.includes("schemas/"));
  assert.ok(files.includes("docs/"));
  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("examples/*.json"));
  assert.ok(files.includes("examples/external-adapter/src/"));

  assert.equal(files.includes("examples/"), false);
  assert.equal(files.includes("examples/external-adapter/dist/"), false);
  assert.equal(files.includes("dist/examples/"), false);
  assert.equal(files.includes("dist/bin/"), false);
  assert.equal(files.some((entry) => entry.includes("node_modules")), false);
});
