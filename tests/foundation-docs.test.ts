import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readDoc(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("first-contact docs preserve Surface as the product-neutral foundation", async () => {
  const [readme, architecture, foundation, cli] = await Promise.all([
    readDoc("README.md"),
    readDoc("docs/architecture.md"),
    readDoc("docs/architecture/surface-foundation.md"),
    readDoc("docs/cli.md"),
  ]);

  assert.match(readme, /foundation trust substrate/);
  assert.match(readme, /Product artifacts may embed `surface\.input`/);
  assert.match(readme, /Surface remains responsible for generated report fields/);
  assert.match(architecture, /Product systems sit above these layers/);
  assert.match(architecture, /product repos or packages/);
  assert.match(foundation, /## Product Layers Built On Surface/);
  assert.match(foundation, /## Foundation Contract/);
  assert.match(foundation, /Surface generates report-only fields after validation/);
  assert.match(foundation, /product layers may depend on Surface/);
  assert.match(cli, /registered adapters/);
  assert.match(cli, /A claim is only `verified` when a verification event and required evidence support it/);
});
