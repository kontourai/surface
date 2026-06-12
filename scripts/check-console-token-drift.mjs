/**
 * check-console-token-drift.mjs
 *
 * Compares the --k-* token values embedded in src/console/styles/parts/01-tokens.css
 * against the @kontourai/console-kit installed dev dependency.
 *
 * The console's token block is a manual copy kept local so the published CLI is
 * standalone. This script prevents silent drift.
 *
 * Rules compared: raw colour/numeric tokens from the kit's :root dark block.
 * Soft tokens (color-mix expressions) and space/text/font tokens that differ
 * intentionally (rem vs px) are compared for structure only — values allowed to differ
 * if the prop is listed in ALLOWED_VALUE_DRIFTS.
 *
 * Exit 1 on drift; exit 0 if in sync.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consoleTokensPath = path.join(root, "src", "console", "styles", "parts", "01-tokens.css");
const kitTokensPath = path.join(root, "node_modules", "@kontourai", "console-kit", "tokens", "tokens.css");

// Tokens where the console intentionally diverges from kit values (e.g. rem vs px,
// or console-specific font stack). Add names here to suppress false drift errors.
const ALLOWED_VALUE_DRIFTS = new Set([
  "--k-space-1", "--k-space-2", "--k-space-3", "--k-space-4", "--k-space-5", "--k-space-6",
  "--k-text-xs", "--k-text-sm", "--k-text-md", "--k-text-lg", "--k-text-xl", "--k-text-2xl",
  "--k-font-display", "--k-font-ui", "--k-font-mono",
  "--k-dur",
]);

function extractRootTokens(css) {
  // Extract tokens from the first :root { } block (dark defaults)
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) return new Map();
  const block = rootMatch[1];
  const tokens = new Map();
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*(--k-[\w-]+)\s*:\s*(.+?)\s*;/);
    if (m) tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

const [consoleCSS, kitCSS] = await Promise.all([
  readFile(consoleTokensPath, "utf8"),
  readFile(kitTokensPath, "utf8"),
]);

const consoleTokens = extractRootTokens(consoleCSS);
const kitTokens = extractRootTokens(kitCSS);

const driftErrors = [];
const missingInConsole = [];

for (const [name, kitValue] of kitTokens) {
  if (!consoleTokens.has(name)) {
    missingInConsole.push(name);
    continue;
  }
  const consoleValue = consoleTokens.get(name);
  if (ALLOWED_VALUE_DRIFTS.has(name)) continue;
  if (consoleValue !== kitValue) {
    driftErrors.push(`  ${name}:\n    kit:     ${kitValue}\n    console: ${consoleValue}`);
  }
}

if (missingInConsole.length) {
  console.warn("Console token block is missing these kit tokens (may need to add):");
  missingInConsole.forEach(n => console.warn("  " + n));
}

if (driftErrors.length) {
  console.error("Console token drift detected — values diverge from @kontourai/console-kit:");
  driftErrors.forEach(e => console.error(e));
  console.error("\nTo fix: update src/console/styles/parts/01-tokens.css to match the kit,");
  console.error("or add the token name to ALLOWED_VALUE_DRIFTS in scripts/check-console-token-drift.mjs");
  process.exit(1);
}

console.log("Console tokens are in sync with @kontourai/console-kit (" + kitTokens.size + " checked, " + ALLOWED_VALUE_DRIFTS.size + " allowed drifts).");
