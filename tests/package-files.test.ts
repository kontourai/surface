import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type PackageJson = {
  exports?: Record<string, unknown>;
  files?: string[];
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

  assert.deepEqual(Object.keys(packageJson.exports ?? {}).sort(), [".", "./trust-panel/element"]);
  assert.equal(packageJson.types, "./dist/src/index.d.ts");
  assert.deepEqual(packageJson.exports?.["."], {
    types: "./dist/src/index.d.ts",
    import: "./dist/src/index.js",
  });
  // Stable subpath export for the dependency-free <surface-trust-panel> custom
  // element, so Flow's console drawer + the console plane can register it
  // without depending on the dist/ path.
  assert.deepEqual(packageJson.exports?.["./trust-panel/element"], {
    types: "./dist/src/trust-panel/surface-trust-panel.d.ts",
    import: "./dist/src/trust-panel/surface-trust-panel.js",
  });
});

test("package exports block unsupported deep imports", async () => {
  const importBlocked = (specifier: string) => import(specifier);

  await assert.rejects(
    importBlocked("@kontourai/surface/console/server"),
    (error: unknown) => error instanceof Error && error.message.includes("Package subpath")
  );
  await assert.rejects(
    importBlocked("@kontourai/surface/dist/src/console/projection.js"),
    (error: unknown) => error instanceof Error && error.message.includes("Package subpath")
  );
});

test("root public API does not re-export private Console internals", async () => {
  const publicIndex = await readFile("src/index.ts", "utf8");

  assert.match(publicIndex, /export \{ startConsoleServer \} from "\.\/console\/server\.js";/);
  assert.match(publicIndex, /export type \{ SurfaceConsoleConfig, SurfaceConsoleTheme, SurfaceConsoleVocab \} from "\.\/console\/types\.js";/);
  for (const privateExport of [
    "./console/assets.generated.js",
    "./console/client/",
    "./console/projection.js",
    "./console/script.js",
    "./console/styles.js",
    "./console/shell.js",
  ]) {
    assert.equal(publicIndex.includes(privateExport), false, `${privateExport} should stay private`);
  }
});

test("package scripts are classified active repo workflows", async () => {
  const [packageJson, sourceModuleAudit] = await Promise.all([
    readPackageJson(),
    readFile("docs/audits/source-module-audit.md", "utf8"),
  ]);
  const scriptNames = Object.keys(packageJson.scripts ?? {}).sort();

  assert.deepEqual(scriptNames, [
    "build",
    "build:console-assets",
    "build:trust-panel-module",
    "check:console-assets",
    "check:console-token-drift",
    "check:content-boundary",
    "check:doc-links",
    "check:generated-boundaries",
    "check:package-contents",
    "check:trust-panel-module",
    "check:ui-assets",
    "docs:build",
    "prepare",
    "release:trust-bundle",
    "setup:repo-hooks",
    "surface:report",
    "surface:summary",
    "sync:ui-assets",
    "test",
    "test:browser",
    "test:coverage",
    "test:external-adapter",
    "test:package-smoke",
    "typecheck",
    "validate:repo-hooks",
    "verify",
    "verify:trust-bundle",
  ]);
  assert.match(packageJson.scripts?.verify ?? "", /check-content-boundary/);
  assert.match(packageJson.scripts?.verify ?? "", /check:doc-links/);
  assert.match(packageJson.scripts?.verify ?? "", /check:generated-boundaries/);
  assert.match(packageJson.scripts?.verify ?? "", /check:package-contents/);
  assert.match(packageJson.scripts?.verify ?? "", /test:external-adapter/);
  assert.match(packageJson.scripts?.verify ?? "", /test:package-smoke/);
  assert.match(packageJson.scripts?.verify ?? "", /test:browser/);
  assert.match(packageJson.scripts?.prepare ?? "", /npm run build/);
  for (const scriptName of scriptNames) {
    assert.match(sourceModuleAudit, new RegExp(`\\| \`${scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\` \\|`));
  }
});
