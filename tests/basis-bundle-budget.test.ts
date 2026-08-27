import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const BUDGETS = {
  // Measured at Basis v2: 7,036 -> 7,962 gzip bytes for the parallel closed
  // parser and reviewed-source facts; the adapter itself remains a separate opt-in entry.
  "src/basis/view-index.ts": 8_200,
  // MCP embeds the v2-capable parser/view (measured 110,269 gzip bytes).
  "src/basis/mcp.ts": 110_600,
  // The shared Trust Panel embeds the same parser (measured 12,769 gzip bytes).
  "src/trust-panel/surface-trust-panel.ts": 13_000,
} as const;

test("Basis browser delivery bundles stay within the checked gzip ratchet", async () => {
  for (const [entry, budget] of Object.entries(BUDGETS)) {
    const result = await build({ entryPoints: [entry], bundle: true, minify: true, platform: "browser", format: "esm", target: "es2022", legalComments: "none", write: false });
    const bytes = gzipSync(result.outputFiles[0]!.contents, { level: 9 }).byteLength;
    assert.ok(bytes <= budget, `${entry}: ${bytes} bundled gzip bytes exceeds ${budget}`);
  }
});

test("reviewed-source adapter remains a browser-only semantic boundary", async () => {
  const result = await build({ entryPoints: ["src/basis/reviewed-source.ts"], bundle: true, minify: true, platform: "browser", format: "esm", target: "es2022", legalComments: "none", write: false });
  const output = new TextDecoder().decode(result.outputFiles[0]!.contents);
  assert.doesNotMatch(output, /node:|node_modules\/(?:forage|traverse|survey)/u);
});
