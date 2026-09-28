/**
 * Drift gate for Surface's copies of @kontourai/ui's trust-state chip styles.
 *
 * The Console (standalone CLI) and the Trust Panel (dependency-free shadow-DOM
 * module) cannot import ui's stylesheet at runtime, so each carries a copy of
 * its `.trust-state` rules. These tests read the installed @kontourai/ui and
 * fail when a copy's selectors, declarations, or order differ from the kit's,
 * when a Trust Panel fallback is not the kit's light-mode token value, or when
 * the MCP resource's host token block drifts from the kit's trust tokens.
 * The markup and glyphs are held to ui's own <k-trust-state> element by the
 * browser suites (tests/browser/support/ui-trust-state.ts is the oracle).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TRUST_STATES = ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected", "revoked"];

type Rule = { selector: string; declarations: string[] };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function trustStateRules(css: string): Rule[] {
  const rules: Rule[] = [];
  for (const match of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]!.trim().replace(/\s+/g, " ");
    if (!selector.includes(".trust-state")) continue;
    const declarations = match[2]!
      .split(";")
      .map((declaration) => declaration.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    rules.push({ selector, declarations });
  }
  return rules;
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

async function kit(): Promise<{ rules: Rule[]; dark: Map<string, string>; light: Map<string, string> }> {
  const [styles, tokens] = await Promise.all([
    readFile("node_modules/@kontourai/ui/react/styles.css", "utf8"),
    readFile("node_modules/@kontourai/ui/tokens/tokens.css", "utf8"),
  ]);
  const rules = trustStateRules(styles);
  // Pinned independently of the kit: one rule per state, so a kit or parser
  // change that yields no rules cannot pass as "in sync".
  for (const state of TRUST_STATES) {
    assert.ok(rules.some((rule) => rule.selector === `.trust-state--${state} .trust-state__chip`), `kit has no rule for ${state}`);
  }
  return {
    rules,
    dark: tokenBlock(tokens, /:root\s*\{([^}]*)\}/),
    light: tokenBlock(tokens, /\[data-theme="light"\]\s*\{([^}]*)\}/),
  };
}

function panelCss(source: string): string {
  const match = source.match(/const PANEL_CSS = `([\s\S]*?)`;/);
  assert.ok(match, "expected PANEL_CSS in the trust panel source");
  return match[1]!;
}

test("the Console's trust-state rules are an exact copy of @kontourai/ui's", async () => {
  const { rules } = await kit();
  const copy = trustStateRules(await readFile("src/console/styles/parts/11-trust-state.css", "utf8"));
  assert.deepEqual(copy, rules);

  // Nothing else in the Console restyles the chip's own elements.
  const others = await Promise.all(
    ["02-base-header.css", "03-layout-feed.css", "04-detail-sheet.css", "05-context-help.css", "06-gaps.css", "07-evidence-details.css", "08-authoring-modal.css", "09-responsive.css", "10-multi-producer.css"].map((file) =>
      readFile(`src/console/styles/parts/${file}`, "utf8"),
    ),
  );
  for (const css of others) assert.deepEqual(trustStateRules(css), []);
});

test("the Trust Panel's trust-state rules copy @kontourai/ui's, with its light-mode values as fallbacks", async () => {
  const { rules, dark, light } = await kit();
  const copy = trustStateRules(panelCss(await readFile("src/trust-panel/surface-trust-panel.ts", "utf8")));
  const fallbacks: Array<[string, string]> = [];
  const withoutFallbacks = copy.map((rule) => ({
    selector: rule.selector,
    declarations: rule.declarations.map((declaration) =>
      declaration.replace(/var\((--k-[\w-]+)(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_whole, name: string, fallback: string | undefined) => {
        assert.ok(fallback, `${rule.selector}: ${name} has no fallback; the panel must render without host tokens`);
        fallbacks.push([name, fallback.trim()]);
        return `var(${name})`;
      }),
    ),
  }));
  assert.deepEqual(withoutFallbacks, rules);
  assert.ok(fallbacks.length > 0);
  for (const [name, fallback] of fallbacks) {
    const expected = light.get(name) ?? dark.get(name);
    assert.equal(fallback, expected, `${name} fallback`);
  }
});

test("the MCP trust-panel resource's host tokens carry the kit's trust inks and fills in light and dark", async () => {
  const { dark, light } = await kit();
  const source = await readFile("src/mcp-ui/trust-panel-resource.ts", "utf8");
  const hostLight = tokenBlock(source, /<style>\s*:root\s*\{([^}]*)\}/);
  const hostDark = tokenBlock(source, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/);
  for (const state of TRUST_STATES) {
    for (const name of [`--k-trust-${state}`, `--k-trust-${state}-fill`]) {
      assert.equal(hostLight.get(name), light.get(name), `light ${name}`);
      assert.equal(hostDark.get(name), dark.get(name), `dark ${name}`);
    }
  }
});
