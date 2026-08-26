import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const BUDGETS = {
  // Measured at v2: 6,315 -> 7,036 gzip bytes for explicit evidence, policy facts, and edge identity.
  "src/basis/view-index.ts": 7_036,
  // Measured at v2: 107,422 -> 109,082; MCP embeds the same closed parser/view.
  "src/basis/mcp.ts": 109_082,
  // Measured at v2: 10,912 -> 11,851 for reader-facing policy and edge disclosure.
  "src/trust-panel/surface-trust-panel.ts": 11_851,
} as const;

test("Basis browser delivery bundles stay within the checked gzip ratchet", async () => {
  for (const [entry, budget] of Object.entries(BUDGETS)) {
    const result = await build({ entryPoints: [entry], bundle: true, minify: true, platform: "browser", format: "esm", target: "es2022", legalComments: "none", write: false });
    const bytes = gzipSync(result.outputFiles[0]!.contents, { level: 9 }).byteLength;
    assert.ok(bytes <= budget, `${entry}: ${bytes} bundled gzip bytes exceeds ${budget}`);
  }
});
