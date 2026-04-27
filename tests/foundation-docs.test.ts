import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readDoc(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("first-contact docs preserve Surface as the foundation for Veritas", async () => {
  const [readme, architecture, foundation, cli] = await Promise.all([
    readDoc("README.md"),
    readDoc("docs/architecture.md"),
    readDoc("docs/architecture/surface-foundation.md"),
    readDoc("docs/cli.md"),
  ]);

  assert.match(readme, /foundation trust substrate/);
  assert.match(readme, /Veritas artifacts may embed `surface\.input`/);
  assert.match(readme, /Surface remains responsible for generated report fields/);
  assert.match(architecture, /Product systems such as Veritas sit above these layers/);
  assert.match(architecture, /Current Veritas artifacts can also embed `surface\.input`/);
  assert.match(foundation, /## Veritas As A Product Layer/);
  assert.match(foundation, /## Foundation Contract/);
  assert.match(foundation, /Surface generates report-only fields after validation/);
  assert.match(cli, /Veritas artifacts may include `surface\.input`/);
  assert.match(cli, /Surface still validates the input and generates report-only fields/);
});
