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

test("Kontour UI stays a development asset source, not a runtime dependency", async () => {
  const packageJson = await readPackageJson();

  assert.equal(packageJson.devDependencies?.["@kontourai/ui"], "^1.20.0");
  assert.equal(packageJson.dependencies?.["@kontourai/ui"], undefined);
  assert.equal(packageJson.devDependencies?.["@kontourai/console-kit"], undefined);
  assert.equal(packageJson.dependencies?.["@kontourai/console-kit"], undefined);
  assert.equal(packageJson.dependencies?.react, undefined);
  assert.equal(packageJson.peerDependencies?.react, undefined);
});

test("Kontour UI Pages assets come from the installed public package", async () => {
  const [script, ciWorkflow, docsWorkflow, publishWorkflow] = await Promise.all([
    readFile("scripts/build-pages-extras.mjs", "utf8"),
    readFile(".github/workflows/ci.yml", "utf8"),
    readFile(".github/workflows/docs.yml", "utf8"),
    readFile(".github/workflows/publish-npm.yml", "utf8"),
  ]);

  assert.match(script, /"node_modules", "@kontourai", "ui"/);
  assert.equal(script.includes('"..", "ui"'), false);
  for (const workflow of [ciWorkflow, docsWorkflow, publishWorkflow]) {
    assert.equal(workflow.includes("repository: kontourai/ui"), false);
    assert.equal(workflow.includes("path: ui"), false);
  }
});
