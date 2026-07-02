import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The shipped <surface-trust-panel> custom element (src/trust-panel/surface-trust-panel.ts)
// is a self-contained, dependency-free module with no imports from src/types.ts by design
// (it renders untrusted pasted JSON, so its shapes stay intentionally loose). That isolation
// means `npm run typecheck` cannot catch a stale field name inside it — the facet rename
// (Hachure 0.9.0: Claim.surface -> Claim.facet) has to be verified by inspecting the
// rendered output/source directly, both for the hand-written source and the generated
// module the runtime actually ships (src/trust-panel/trust-panel-module.generated.ts,
// built from the compiled dist output by scripts/build-trust-panel-module.mjs).

test("surface-trust-panel.ts source renders the claim facet, not the removed legacy `surface` field", async () => {
  const source = await readFile("src/trust-panel/surface-trust-panel.ts", "utf8");

  assert.match(source, /<dt>Facet<\/dt><dd>\$\{escapeHtml\(asText\(claim\.facet \?\? claim\.surface\)\)\}<\/dd>/);
  assert.doesNotMatch(source, /<dt>Surface<\/dt><dd>\$\{escapeHtml\(asText\(claim\.surface\)\)\}<\/dd>/);

  // TrustPanelClaim keeps `facet` as the primary field and `surface` only as a
  // read-tolerance fallback for pasted legacy-format reports.
  assert.match(source, /facet\?:\s*unknown;/);
});

test("the built trust-panel module (what MCP UI / the console drawer actually ship) renders Facet, not Surface", async () => {
  const generated = await readFile("src/trust-panel/trust-panel-module.generated.ts", "utf8");

  assert.match(generated, /<dt>Facet<\/dt><dd>/);
  assert.doesNotMatch(generated, /<dt>Surface<\/dt><dd>\$\{escapeHtml\(asText\(claim\.surface\)\)\}<\/dd>/);
});
