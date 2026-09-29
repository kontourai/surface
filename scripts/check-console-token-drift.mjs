/**
 * check-console-token-drift.mjs
 *
 * Compares the --k-* token values embedded in src/console/styles/parts/01-tokens.css
 * against the @kontourai/ui installed dev dependency.
 *
 * The console's token block is a manual copy kept local so the published CLI is
 * standalone. This script prevents silent drift.
 *
 * Rules compared: raw colour/numeric tokens from the kit's :root dark block.
 * Soft tokens (color-mix expressions) and space/text/font tokens that differ
 * intentionally (rem vs px) are compared for structure only — values allowed to differ
 * if the prop is listed in ALLOWED_VALUE_DRIFTS.
 *
 * Missing kit tokens only warn, except the trust-state tokens (--k-trust-*) and
 * every token @kontourai/ui/trust-state.css (inlined into the Console) reads:
 * those fail, and the --k-trust-* values are also compared in both of the
 * Console's light blocks against the kit's [data-theme="light"] block.
 *
 * Exit 1 on drift; exit 0 if in sync.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consoleTokensPath = path.join(root, "src", "console", "styles", "parts", "01-tokens.css");
const kitTokensPath = path.join(root, "node_modules", "@kontourai", "ui", "tokens", "tokens.css");
const kitTrustStateCssPath = path.join(root, "node_modules", "@kontourai", "ui", "react", "trust-state.css");

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
  return extractBlockTokens(css, /:root\s*\{([^}]+)\}/);
}

function extractBlockTokens(css, blockPattern) {
  const blockMatch = css.match(blockPattern);
  if (!blockMatch) return new Map();
  const block = blockMatch[1];
  const tokens = new Map();
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*(--k-[\w-]+)\s*:\s*(.+?)\s*;/);
    if (m) tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

const [consoleCSS, kitCSS, kitTrustStateCSS] = await Promise.all([
  readFile(consoleTokensPath, "utf8"),
  readFile(kitTokensPath, "utf8"),
  readFile(kitTrustStateCssPath, "utf8"),
]);

const consoleTokens = extractRootTokens(consoleCSS);
const kitTokens = extractRootTokens(kitCSS);

// Tokens the Console cannot go without: every trust-state token, and every
// token the inlined trust-state chip rules read. A chip whose var() resolves to
// nothing silently loses its colour or line style, so these are errors.
const requiredTokens = new Set([
  ...[...kitTokens.keys()].filter((name) => name.startsWith("--k-trust-")),
  ...[...kitTrustStateCSS.matchAll(/var\((--k-[\w-]+)/g)].map((match) => match[1]),
]);
const kitTrustTokenCount = [...kitTokens.keys()].filter((name) => name.startsWith("--k-trust-")).length;
if (kitTrustTokenCount === 0) {
  console.error("The installed @kontourai/ui has no --k-trust-* tokens; the trust-state gate cannot run.");
  process.exit(1);
}
const missingRequired = [...requiredTokens].filter((name) => !consoleTokens.has(name));

// Light mode: the kit's [data-theme="light"] trust values must appear in both
// of the Console's light blocks (explicit data-theme, and the system fallback).
const kitLightTokens = extractBlockTokens(kitCSS, /\[data-theme="light"\]\s*\{([^}]+)\}/);
const consoleLightBlocks = {
  '[data-theme="light"]': extractBlockTokens(consoleCSS, /\n\[data-theme="light"\]\s*\{([^}]+)\}/),
  '@media (prefers-color-scheme: light)': extractBlockTokens(consoleCSS, /:root:not\(\[data-theme="dark"\]\)\s*\{([^}]+)\}/),
};
const lightDriftErrors = [];
for (const [name, kitValue] of kitLightTokens) {
  if (!name.startsWith("--k-trust-")) continue;
  for (const [blockName, block] of Object.entries(consoleLightBlocks)) {
    const consoleValue = block.get(name);
    if (consoleValue !== kitValue) {
      lightDriftErrors.push(`  ${blockName} ${name}:\n    kit:     ${kitValue}\n    console: ${consoleValue ?? "(missing)"}`);
    }
  }
}

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

const optionalMissing = missingInConsole.filter((name) => !requiredTokens.has(name));
if (optionalMissing.length) {
  console.warn("Console token block is missing these kit tokens (may need to add):");
  optionalMissing.forEach(n => console.warn("  " + n));
}

if (missingRequired.length || lightDriftErrors.length) {
  if (missingRequired.length) {
    console.error("Console token block is missing trust-state tokens the chip needs:");
    missingRequired.forEach(n => console.error("  " + n));
  }
  if (lightDriftErrors.length) {
    console.error("Console light-mode trust-state tokens diverge from @kontourai/ui:");
    lightDriftErrors.forEach(e => console.error(e));
  }
  console.error("\nTo fix: copy the kit's --k-trust-* values (and any token @kontourai/ui/trust-state.css reads) into src/console/styles/parts/01-tokens.css.");
  process.exit(1);
}

if (driftErrors.length) {
  console.error("Console token drift detected — values diverge from @kontourai/ui:");
  driftErrors.forEach(e => console.error(e));
  console.error("\nTo fix: update src/console/styles/parts/01-tokens.css to match the kit,");
  console.error("or add the token name to ALLOWED_VALUE_DRIFTS in scripts/check-console-token-drift.mjs");
  process.exit(1);
}

console.log("Console tokens are in sync with @kontourai/ui (" + kitTokens.size + " checked, " + ALLOWED_VALUE_DRIFTS.size + " allowed drifts).");
