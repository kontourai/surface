import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const BUDGETS = {
  // Measured at Basis v2: 7,036 -> 7,962 gzip bytes for the parallel closed
  // parser and reviewed-source facts; the adapter itself remains a separate opt-in entry.
  // 8,474 with the reviewed-source choice (not-chosen review and chosen-over rivals).
  "src/basis/view-index.ts": 8_800,
  // MCP embeds the v2-capable parser/view and the Trust Panel module (measured
  // 110,269 gzip bytes; 110,916 with the reviewed-source choice; 112,919 with
  // @kontourai/ui's trust-state chip in the panel, #274).
  "src/basis/mcp.ts": 113_400,
  // The shared Trust Panel embeds the same parser (measured 12,769 gzip bytes;
  // 13,264 with the reviewed-source choice; 14,789 with @kontourai/ui's
  // trust-state renderer and chip CSS with light fallbacks bundled in, #274).
  "src/trust-panel/surface-trust-panel.ts": 15_200,
  // Display names + claim basis view (measured 3,919 gzip bytes); bundling for
  // platform "browser" also proves the subpath pulls in no Node-only module.
  "src/display.ts": 4_400,
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
