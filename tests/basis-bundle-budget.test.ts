import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const BUDGETS = {
  "src/basis/view-index.ts": 6_315,
  "src/basis/mcp.ts": 107_422,
  "src/trust-panel/surface-trust-panel.ts": 10_912,
} as const;

test("Basis browser delivery bundles stay within the checked gzip ratchet", async () => {
  for (const [entry, budget] of Object.entries(BUDGETS)) {
    const result = await build({ entryPoints: [entry], bundle: true, minify: true, platform: "browser", format: "esm", target: "es2022", legalComments: "none", write: false });
    const bytes = gzipSync(result.outputFiles[0]!.contents, { level: 9 }).byteLength;
    assert.ok(bytes <= budget, `${entry}: ${bytes} bundled gzip bytes exceeds ${budget}`);
  }
});
