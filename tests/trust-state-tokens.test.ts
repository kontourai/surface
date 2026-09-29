/**
 * Drift gate for the trust-state tokens Surface copies from @kontourai/ui.
 *
 * The chip itself (markup, glyphs, CSS) comes from ui at build time; only
 * token values are copied. The Console's token block is checked by
 * scripts/check-console-token-drift.mjs; this test checks the MCP trust-panel
 * resource's host token block, which carries the kit's trust inks and fills
 * for light and dark.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TRUST_STATES = ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected", "revoked"];

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function tokenBlock(css: string, pattern: RegExp): Map<string, string> {
  const block = stripComments(css).match(pattern);
  assert.ok(block, `expected a token block matching ${pattern}`);
  const tokens = new Map<string, string>();
  for (const declaration of block[1]!.split(";")) {
    const match = declaration.match(/(--k-[\w-]+)\s*:\s*([\s\S]+)/);
    if (match) tokens.set(match[1]!, match[2]!.trim().replace(/\s+/g, " "));
  }
  return tokens;
}

async function kit(): Promise<{ dark: Map<string, string>; light: Map<string, string> }> {
  const tokens = await readFile("node_modules/@kontourai/ui/tokens/tokens.css", "utf8");
  return {
    dark: tokenBlock(tokens, /:root\s*\{([^}]*)\}/),
    light: tokenBlock(tokens, /\[data-theme="light"\]\s*\{([^}]*)\}/),
  };
}

test("the MCP trust-panel resource's host tokens carry the kit's trust inks and fills in light and dark", async () => {
  const { dark, light } = await kit();
  const source = await readFile("src/mcp-ui/trust-panel-resource.ts", "utf8");
  const hostLight = tokenBlock(source, /<style>\s*:root\s*\{([^}]*)\}/);
  const hostDark = tokenBlock(source, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/);
  for (const state of TRUST_STATES) {
    for (const name of [`--k-trust-${state}`, `--k-trust-${state}-fill`]) {
      assert.ok(light.get(name) && dark.get(name), `the kit defines ${name}`);
      assert.equal(hostLight.get(name), light.get(name), `light ${name}`);
      assert.equal(hostDark.get(name), dark.get(name), `dark ${name}`);
    }
  }
});
