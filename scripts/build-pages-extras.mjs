// Adds the Pages files docs-kit cannot render to an already-built docs site:
// the Trust Snapshot Viewer and what it loads, the Open Graph card it names,
// and the Built with Surface badge at its original root URL. They keep the
// URLs the pre-docs-kit site published them at.
//
//   DOCS_SITE_DIR=dist-pages npm run docs:extras
//
// docs-pages.yml (kontourai/.github) runs this after `docs-kit build` and fails
// the deploy if it changes anything docs-kit wrote, so every file here is
// created exclusively: an existing file is an error, never overwritten.
// Needs dist/ (`npm run build`, which `pnpm install` runs through prepare).
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";

import { buildStyles } from "./pages-extras/styles.mjs";
import { renderViewerPage } from "./pages-extras/viewer.mjs";

const siteDir = process.env.DOCS_SITE_DIR;
if (!siteDir) {
  console.error("build-pages-extras: set DOCS_SITE_DIR to the docs site directory.");
  process.exit(2);
}

const uiTokensDir = join("node_modules", "@kontourai", "ui", "tokens");

// The viewer switches light and dark with prefers-color-scheme, but the kit's
// light values live under [data-theme="light"], so trust-state chips would
// keep the kit's dark defaults on a light page. Read the kit's --k-trust-*
// declarations for both modes from the installed package.
async function kitTrustTokens() {
  const tokens = (await readFile(join(uiTokensDir, "tokens.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const declarations = (pattern) =>
    [...(tokens.match(pattern)?.[1] ?? "").matchAll(/(--k-trust-[\w-]+)\s*:\s*([^;]+);/g)].map((match) => `${match[1]}: ${match[2].trim()};`);
  const lightTrustTokens = declarations(/\[data-theme="light"\]\s*\{([^}]*)\}/);
  const darkTrustTokens = declarations(/:root\s*\{([^}]*)\}/);
  if (lightTrustTokens.length === 0 || darkTrustTokens.length === 0) throw new Error("The installed @kontourai/ui has no --k-trust-* tokens.");
  return { lightTrustTokens, darkTrustTokens };
}

// The viewer has no navigation column, so its main column spans the layout.
const viewerLayout = `
.viewer-layout {
  grid-template-columns: minmax(0, 1fr);
  width: min(960px, calc(100% - 2rem));
}
`;

const written = [];

async function add(path, contents) {
  const target = join(siteDir, path);
  await mkdir(dirname(target), { recursive: true });
  // "wx" refuses an existing file instead of replacing docs-kit output.
  await writeFile(target, contents, { flag: "wx" });
  written.push(path);
}

async function addTree(sourceDir, targetDir) {
  for (const entry of await readdir(sourceDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const source = join(entry.parentPath, entry.name);
    await add(join(targetDir, relative(sourceDir, source)), await readFile(source));
  }
}

// The sample report is derived through the public CLI so it always matches
// current kernel behavior.
async function sampleReport() {
  const { stdout } = await promisify(execFile)("node", ["bin/surface.mjs", "report", "--input", "examples/surface-example-bundle.json"], { maxBuffer: 16 * 1024 * 1024 });
  JSON.parse(stdout);
  return stdout;
}

await add("viewer.html", renderViewerPage());
await add("viewer.css", buildStyles(await kitTrustTokens()) + viewerLayout);
await add("surface-trust-panel.js", await readFile(join("dist", "src", "trust-panel", "surface-trust-panel.js")));
await add("sample-report.json", await sampleReport());
await addTree(uiTokensDir, join("vendor", "kontourai-ui", "tokens"));
await add("og-image.png", await readFile(join("scripts", "pages-extras", "og-image.png")));
await add("built-with-surface.svg", await readFile(join("assets", "built-with-surface.svg")));

console.log(`build-pages-extras: added ${written.length} files to ${siteDir}`);
