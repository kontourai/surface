import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile("package.json", "utf8")) as PackageJson;
}

test("Console Kit stays a development asset source, not a runtime dependency", async () => {
  const packageJson = await readPackageJson();

  assert.equal(packageJson.devDependencies?.["@kontourai/console-kit"], "^0.1.1");
  assert.equal(packageJson.dependencies?.["@kontourai/console-kit"], undefined);
  assert.equal(packageJson.dependencies?.react, undefined);
  assert.equal(packageJson.peerDependencies?.react, undefined);
});

test("Console Kit docs assets sync from the installed public package", async () => {
  const [script, ciWorkflow, pagesWorkflow, publishWorkflow] = await Promise.all([
    readFile("scripts/sync-console-kit-assets.mjs", "utf8"),
    readFile(".github/workflows/ci.yml", "utf8"),
    readFile(".github/workflows/pages.yml", "utf8"),
    readFile(".github/workflows/publish-npm.yml", "utf8"),
  ]);

  assert.match(script, /node_modules.+@kontourai.+console-kit/s);
  assert.equal(script.includes('path.resolve(root, "..", "console-kit")'), false);
  assert.equal(script.includes("kontourai workspace with ../console-kit"), false);
  for (const workflow of [ciWorkflow, pagesWorkflow, publishWorkflow]) {
    assert.equal(workflow.includes("repository: kontourai/console-kit"), false);
    assert.equal(workflow.includes("path: console-kit"), false);
  }
});
