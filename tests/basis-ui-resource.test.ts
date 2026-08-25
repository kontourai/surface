import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { composeBasisProjection } from "../src/basis/composer.js";
import { parseBasisComposition } from "../src/basis/parser.js";
import { MCP_APPS_PROTOCOL_VERSION, buildBasisPanelAppToolMeta, buildBasisPanelUiResource, buildTrustPanelUiResource } from "../src/mcp-ui/trust-panel-resource.js";

test("Basis MCP Apps resource is self-contained and accepts only a parsed snapshot", async () => {
  const fixture = JSON.parse(await readFile("examples/fixtures/station-basis-context.json", "utf8"));
  const parsed = parseBasisComposition(fixture);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const resource = buildBasisPanelUiResource(composeBasisProjection(parsed.value), { uri: "ui://surface/basis/answer" });
  assert.equal(resource.resource.mimeType, "text/html;profile=mcp-app");
  assert.equal(resource.resource.uri, "ui://surface/basis/answer");
  assert.equal(MCP_APPS_PROTOCOL_VERSION, "2026-01-26");
  assert.deepEqual(buildBasisPanelAppToolMeta(resource.resource.uri), { ui: { resourceUri: "ui://surface/basis/answer" } });
  assert.match(resource.resource.text, /mode="basis"/);
  assert.match(resource.resource.text, /default-src 'none'/);
  assert.match(resource.resource.text, /addEventListener\("message"/);
  assert.doesNotMatch(resource.resource.text, /<script[^>]+src=/u);
  assert.deepEqual(resource.resource._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
  assert.throws(() => buildBasisPanelUiResource(null, { uri: "https://example.test/not-an-app" }), TypeError);
  for (const uri of ["ui://", "ui://surface/bad\npath", "ui://surface/\0path", "ui://surface/\ud800"]) assert.throws(() => buildBasisPanelUiResource(null, { uri }), TypeError);
  const unavailable = buildBasisPanelUiResource(new Proxy({}, { ownKeys() { throw new Error("no"); } }), { uri: "ui://surface/basis/unavailable" });
  assert.match(unavailable.resource.text, /basis-unavailable/u);
});

test("legacy report MCP UI resource remains unchanged in mode and MIME", () => {
  const resource = buildTrustPanelUiResource({} as never, { uri: "ui://surface/trust-panel/summary" });
  assert.equal(resource.resource.mimeType, "text/html;profile=mcp-app");
  assert.match(resource.resource.text, /<surface-trust-panel><\/surface-trust-panel>/);
});
