import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, ".npm-pack-cache");

const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json", "--cache", cache], {
  cwd: root,
  maxBuffer: 1024 * 1024 * 10,
});

const packEntries = parsePackJson(stdout);
if (packEntries.length !== 1) {
  throw new Error(`Expected one npm pack entry, found ${packEntries.length}.`);
}

const files = packEntries[0].files.map((file) => file.path).sort();
const fileSet = new Set(files);

const requiredFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "bin/surface.mjs",
  "dist/src/index.js",
  "dist/src/index.d.ts",
  "dist/src/console/assets.generated.js",
  "dist/src/console/script.js",
  "dist/src/console/styles.js",
  "schemas/trust-input.schema.json",
  "schemas/trust-report.schema.json",
  "docs/reference/console.md",
  "examples/external-adapter/src/index.ts",
];

for (const requiredFile of requiredFiles) {
  if (!fileSet.has(requiredFile)) throw new Error(`Missing expected package file: ${requiredFile}`);
}

const forbiddenPatterns = [
  /^node_modules\//,
  /^docs-site\//,
  /^test-results\//,
  /^playwright-report\//,
  /^\.agents\//,
  /^\.flow-agents\//,
  /^\.surface\//,
  /^dist\/tests\//,
  /^dist\/bin\//,
  /^dist\/examples\//,
  /^tests\//,
  /^scripts\//,
  /^src\//,
  /^examples\/external-adapter\/dist\//,
  /^examples\/external-adapter\/node_modules\//,
  /node_modules/,
];

for (const file of files) {
  const forbiddenPattern = forbiddenPatterns.find((pattern) => pattern.test(file));
  if (forbiddenPattern) throw new Error(`Unexpected package file matched ${forbiddenPattern}: ${file}`);
}

console.log(`Package contents check passed: ${files.length} files.`);

function parsePackJson(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find npm pack JSON in output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1));
}
