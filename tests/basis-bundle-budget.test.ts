import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gzipSync } from "node:zlib";

const BUDGETS = {
  "dist/src/basis/view.js": 2_406,
  "dist/src/basis/mcp.js": 182,
  "dist/src/trust-panel/surface-trust-panel.js": 12_983,
} as const;

test("Basis viewer delivery bundles stay within the checked gzip ratchet", async () => {
  for (const [path, budget] of Object.entries(BUDGETS)) {
    const bytes = gzipSync(await readFile(path), { level: 9 }).byteLength;
    assert.ok(bytes <= budget, `${path}: ${bytes} gzip bytes exceeds ${budget}`);
  }
});
