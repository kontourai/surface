import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { stat, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  files?: string[];
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  types?: string;
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
  assert.ok(files.includes("LICENSE"));
  assert.ok(files.includes("examples/*.json"));
  assert.ok(files.includes("examples/external-adapter/src/"));

  assert.equal(files.includes("examples/"), false);
  assert.equal(files.includes("examples/external-adapter/dist/"), false);
  assert.equal(files.includes("dist/examples/"), false);
  assert.equal(files.includes("dist/bin/"), false);
  assert.equal(files.some((entry) => entry.includes("node_modules")), false);
});

test("package entrypoint exposes explicit ESM and TypeScript contracts", async () => {
  const packageJson = await readPackageJson();

  assert.equal(packageJson.types, "./dist/src/index.d.ts");
  assert.deepEqual(packageJson.exports?.["."], {
    types: "./dist/src/index.d.ts",
    import: "./dist/src/index.js",
  });
});

test("embedded console assets do not leak template literals into public declarations", async () => {
  const [assetDeclaration, scriptDeclaration, stylesDeclaration] = await Promise.all([
    stat("dist/src/console/assets.generated.d.ts"),
    stat("dist/src/console/script.d.ts"),
    stat("dist/src/console/styles.d.ts"),
  ]);

  assert.ok(assetDeclaration.size < 200, `asset declaration is too large: ${assetDeclaration.size}`);
  assert.ok(scriptDeclaration.size < 200, `script declaration is too large: ${scriptDeclaration.size}`);
  assert.ok(stylesDeclaration.size < 200, `styles declaration is too large: ${stylesDeclaration.size}`);
});

test("Surface Console assets are edited as source files and generated before build", async () => {
  const [packageJson, scriptModule, stylesModule, clientSource, styleSource] = await Promise.all([
    readPackageJson(),
    readFile("src/console/script.ts", "utf8"),
    readFile("src/console/styles.ts", "utf8"),
    readFile("src/console/client/index.js", "utf8"),
    readFile("src/console/styles/index.css", "utf8"),
  ]);

  assert.match(packageJson.scripts?.build ?? "", /build:console-assets/);
  assert.match(packageJson.scripts?.typecheck ?? "", /check:console-assets/);
  assert.equal(scriptModule.trim(), 'export { CONSOLE_SCRIPT } from "./assets.generated.js";');
  assert.equal(stylesModule.trim(), 'export { CONSOLE_CSS } from "./assets.generated.js";');
  assert.match(clientSource, /window\.__SURFACE_CONFIG__/);
  assert.match(styleSource, /SURFACE CONSOLE/);
});

test("Surface Console generated assets are synced with source assets", async () => {
  await execFileAsync("node", ["scripts/build-console-assets.mjs", "--check"]);
});

test("Console Kit stays a development asset source, not a runtime dependency", async () => {
  const packageJson = await readPackageJson();

  assert.equal(packageJson.devDependencies?.["@kontourai/console-kit"], "^0.1.1");
  assert.equal(packageJson.dependencies?.["@kontourai/console-kit"], undefined);
  assert.equal(packageJson.dependencies?.react, undefined);
  assert.equal(packageJson.peerDependencies?.react, undefined);
});

test("Console Kit docs assets sync from the installed public package", async () => {
  const script = await readFile("scripts/sync-console-kit-assets.mjs", "utf8");

  assert.match(script, /node_modules.+@kontourai.+console-kit/s);
  assert.equal(script.includes('path.resolve(root, "..", "console-kit")'), false);
  assert.equal(script.includes("kontourai workspace with ../console-kit"), false);
});
