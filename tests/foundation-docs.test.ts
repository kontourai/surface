import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readDoc(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("first-contact docs preserve Surface as the product-neutral foundation", async () => {
  const [readme, architecture, sourceAudit, foundation, cli, generatedArtifacts] = await Promise.all([
    readDoc("README.md"),
    readDoc("docs/architecture/index.md"),
    readDoc("docs/audits/source-module-audit.md"),
    readDoc("docs/architecture/surface-foundation.md"),
    readDoc("docs/reference/cli.md"),
    readDoc("docs/maintenance/generated-artifacts.md"),
  ]);

  assert.match(readme, /shared foundation under Kontour's products/);
  assert.match(readme, /Surface connects evidence provenance/);
  assert.match(readme, /Trust Snapshot/);
  assert.match(readme, /Product artifacts may embed `surface\.input`/);
  assert.match(readme, /Surface remains responsible for generated report fields/);
  assert.match(architecture, /Product systems sit above these layers/);
  assert.match(architecture, /product repos or packages/);
  assert.match(sourceAudit, /src\/index\.ts` is the only public module entrypoint/);
  assert.match(sourceAudit, /Consumers should import from `@kontourai\/surface`/);
  assert.match(sourceAudit, /`test:package-smoke` installs the packed tarball/);
  assert.match(sourceAudit, /Keep the source folders stable for now/);
  assert.match(foundation, /## Product Layers Built On Surface/);
  assert.match(foundation, /## Foundation Contract/);
  assert.match(foundation, /Surface generates report-only fields after validation/);
  assert.match(foundation, /product layers may depend on Surface/);
  assert.match(cli, /registered adapters/);
  assert.match(cli, /A claim is only `verified` when a verification event and required evidence support it/);
  assert.match(generatedArtifacts, /`npm run test:package-smoke` installs the packed tarball/);
  assert.match(generatedArtifacts, /fresh consumer project/);
  assert.match(generatedArtifacts, /`package\.json` is the source of truth for `exports`, `bin`, and `files`/);
  assert.match(generatedArtifacts, /`src\/index\.ts` is the source of truth for root module exports/);
  assert.match(generatedArtifacts, /`scripts\/check-package-contents\.mjs`/);
});
