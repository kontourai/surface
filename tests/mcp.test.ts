import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string | null;
  result?: any;
  error?: { code: number; message: string };
}

test("surface mcp serves trust state over the Model Context Protocol", async () => {
  const server = spawn("node", ["bin/surface.mjs", "mcp", "--input", "examples/surface-example-bundle.json"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = collectResponses(server.stdout);

  try {
    send(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "surface-tests", version: "0.0.0" },
      },
    });
    const initialize = await responses.next(1);
    assert.equal(initialize.result.serverInfo.name, "kontour-surface");
    assert.equal(initialize.result.protocolVersion, "2025-06-18");
    assert.ok(initialize.result.capabilities.tools);
    // SEP-1865: resources back the ui:// trust panel, and the MCP Apps
    // capability extension is advertised.
    assert.ok(initialize.result.capabilities.resources);
    assert.ok(initialize.result.capabilities.extensions?.["io.modelcontextprotocol/ui"]);

    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    send(server, { jsonrpc: "2.0", id: 2, method: "ping" });
    const ping = await responses.next(2);
    assert.deepEqual(ping.result, {});

    send(server, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const toolsList = await responses.next(3);
    const toolNames = toolsList.result.tools.map((tool: { name: string }) => tool.name).sort();
    assert.deepEqual(toolNames, [
      "surface_get_claim",
      "surface_missing_evidence",
      "surface_policy",
      "surface_stale_claims",
      "surface_summary",
      "surface_waiver_validity",
    ]);
    for (const tool of toolsList.result.tools) {
      assert.equal(typeof tool.description, "string");
      assert.equal(tool.inputSchema.type, "object");
    }
    // surface_summary advertises its SEP-1865 UI resource in BOTH the flat
    // canonical key and the nested convenience shape, so one server renders in
    // the official Apps hosts (ChatGPT/Claude) and in Station alike.
    const summaryTool = toolsList.result.tools.find(
      (tool: { name: string }) => tool.name === "surface_summary",
    );
    assert.equal(summaryTool._meta["ui/resourceUri"], "ui://surface/trust-panel/summary");
    assert.equal(summaryTool._meta.ui.resourceUri, "ui://surface/trust-panel/summary");

    send(server, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "surface_summary", arguments: {} } });
    const summary = await responses.next(4);
    assert.equal(summary.result.isError, false);
    // First content entry must be the text summary
    assert.equal(summary.result.content[0].type, "text");
    assert.match(summary.result.content[0].text, /Kontour Surface report/);
    assert.match(summary.result.content[0].text, /Claims: 4/);
    // Second content entry is the MCP UI resource
    assert.equal(summary.result.content.length, 2);
    const summaryUiResource = summary.result.content[1];
    assert.equal(summaryUiResource.type, "resource");
    assert.equal(summaryUiResource.resource.uri, "ui://surface/trust-panel/summary");
    assert.equal(summaryUiResource.resource.mimeType, "text/html;profile=mcp-app");
    assert.ok(summaryUiResource.resource.text.includes("<surface-trust-panel>"));
    assert.ok(summaryUiResource.resource.text.includes("surface-trust-panel"));
    // Report data is embedded in the HTML
    assert.ok(summaryUiResource.resource.text.includes("field-attested-records"));

    send(server, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "surface_stale_claims", arguments: {} } });
    const stale = await responses.next(5);
    assert.equal(stale.result.isError, false);
    const staleClaims = JSON.parse(stale.result.content[0].text);
    assert.ok(Array.isArray(staleClaims));
    assert.ok(staleClaims.some((claim: { claimId: string }) => claim.claimId.includes("registration-status")));

    send(server, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "surface_get_claim", arguments: { claimId: "claim.field-attested-records.registration-status" } },
    });
    const drilldown = await responses.next(6);
    assert.equal(drilldown.result.isError, false);
    // First content entry must be the text drilldown
    assert.equal(drilldown.result.content[0].type, "text");
    const claimView = JSON.parse(drilldown.result.content[0].text);
    assert.equal(claimView.claim.id, "claim.field-attested-records.registration-status");
    assert.ok(Array.isArray(claimView.evidence));
    assert.ok(claimView.derivation);
    // Second content entry is the MCP UI resource
    assert.equal(drilldown.result.content.length, 2);
    const claimUiResource = drilldown.result.content[1];
    assert.equal(claimUiResource.type, "resource");
    assert.equal(
      claimUiResource.resource.uri,
      "ui://surface/trust-panel/claim-claim.field-attested-records.registration-status",
    );
    assert.equal(claimUiResource.resource.mimeType, "text/html;profile=mcp-app");
    assert.ok(claimUiResource.resource.text.includes("<surface-trust-panel>"));
    // Report data containing the claim is embedded
    assert.ok(claimUiResource.resource.text.includes("field-attested-records"));

    send(server, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "surface_get_claim", arguments: { claimId: "claim.does-not-exist" } },
    });
    const missingClaim = await responses.next(7);
    assert.equal(missingClaim.result.isError, true);
    assert.match(missingClaim.result.content[0].text, /Unknown claim/);

    send(server, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "not_a_tool", arguments: {} } });
    const unknownTool = await responses.next(8);
    assert.equal(unknownTool.error?.code, -32602);
    assert.match(unknownTool.error?.message ?? "", /Unknown tool/);

    // SEP-1865 declared-resource path: list + read the trust panel resource.
    send(server, { jsonrpc: "2.0", id: 9, method: "resources/list" });
    const resourcesList = await responses.next(9);
    const listed = resourcesList.result.resources;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].uri, "ui://surface/trust-panel/summary");
    assert.equal(listed[0].mimeType, "text/html;profile=mcp-app");

    send(server, {
      jsonrpc: "2.0",
      id: 10,
      method: "resources/read",
      params: { uri: "ui://surface/trust-panel/summary" },
    });
    const resourceRead = await responses.next(10);
    const contents = resourceRead.result.contents;
    assert.equal(contents.length, 1);
    assert.equal(contents[0].uri, "ui://surface/trust-panel/summary");
    assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
    assert.ok(contents[0].text.includes("surface-trust-panel"));
    // The report data is embedded in the read resource (no extra round-trip).
    assert.ok(contents[0].text.includes("field-attested-records"));

    send(server, {
      jsonrpc: "2.0",
      id: 11,
      method: "resources/read",
      params: { uri: "ui://surface/does-not-exist" },
    });
    const unknownResource = await responses.next(11);
    assert.equal(unknownResource.error?.code, -32602);

    send(server, { jsonrpc: "2.0", id: 12, method: "no/such/method" });
    const unknownMethod = await responses.next(12);
    assert.equal(unknownMethod.error?.code, -32601);
  } finally {
    server.stdin.end();
    await once(server, "exit");
  }
});

test("surface mcp --no-ui omits the UI resource entry", async () => {
  const server = spawn(
    "node",
    ["bin/surface.mjs", "mcp", "--input", "examples/surface-example-bundle.json", "--no-ui"],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const responses = collectResponses(server.stdout);

  try {
    send(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "surface-tests", version: "0.0.0" },
      },
    });
    const noUiInitialize = await responses.next(1);
    // --no-ui suppresses the resources capability and the MCP Apps extension.
    assert.equal(noUiInitialize.result.capabilities.resources, undefined);
    assert.equal(noUiInitialize.result.capabilities.extensions, undefined);
    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    // No UI resources are advertised, and tools carry no SEP-1865 _meta.
    send(server, { jsonrpc: "2.0", id: 10, method: "resources/list" });
    const noUiResources = await responses.next(10);
    assert.equal(noUiResources.result.resources.length, 0);

    send(server, { jsonrpc: "2.0", id: 11, method: "tools/list" });
    const noUiTools = await responses.next(11);
    const noUiSummary = noUiTools.result.tools.find(
      (tool: { name: string }) => tool.name === "surface_summary",
    );
    assert.equal(noUiSummary._meta, undefined);

    send(server, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "surface_summary", arguments: {} } });
    const summary = await responses.next(2);
    assert.equal(summary.result.isError, false);
    assert.equal(summary.result.content.length, 1);
    assert.equal(summary.result.content[0].type, "text");
    assert.match(summary.result.content[0].text, /Kontour Surface report/);

    send(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "surface_get_claim", arguments: { claimId: "claim.field-attested-records.registration-status" } },
    });
    const drilldown = await responses.next(3);
    assert.equal(drilldown.result.isError, false);
    assert.equal(drilldown.result.content.length, 1);
    assert.equal(drilldown.result.content[0].type, "text");
    const claimView = JSON.parse(drilldown.result.content[0].text);
    assert.equal(claimView.claim.id, "claim.field-attested-records.registration-status");
  } finally {
    server.stdin.end();
    await once(server, "exit");
  }
});

test("surface_waiver_validity tool: tools/list entry and call round-trip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-mcp-waiver-"));
  const bundlePath = join(dir, "waiver-bundle.json");
  const waivedClaimId = "claim.waiver-test.waived";
  const bareClaimId = "claim.waiver-test.bare";
  await writeFile(
    bundlePath,
    JSON.stringify({
      schemaVersion: 3,
      source: "surface-mcp-waiver-validity-test",
      claims: [
        {
          id: waivedClaimId,
          subjectType: "test-subject",
          subjectId: "subject-waived",
          claimType: "test-claim",
          fieldOrBehavior: "status",
          value: "OK",
          status: "assumed",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          metadata: {
            waiver: {
              reason: "Deferred pending release.",
              approved_by: "actor:eng-lead-1",
              approved_at: "2026-06-01T00:00:00.000Z",
            },
          },
        },
        {
          id: bareClaimId,
          subjectType: "test-subject",
          subjectId: "subject-bare",
          claimType: "test-claim",
          fieldOrBehavior: "status",
          value: "OK",
          status: "assumed",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      evidence: [],
      policies: [],
      events: [],
    }),
    "utf8",
  );

  const server = spawn("node", ["bin/surface.mjs", "mcp", "--input", bundlePath, "--no-ui"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = collectResponses(server.stdout);

  try {
    send(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "surface-tests", version: "0.0.0" },
      },
    });
    await responses.next(1);
    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    send(server, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const toolsList = await responses.next(2);
    const waiverTool = toolsList.result.tools.find(
      (tool: { name: string }) => tool.name === "surface_waiver_validity",
    );
    assert.ok(waiverTool, "surface_waiver_validity must be listed");
    assert.equal(typeof waiverTool.description, "string");
    assert.equal(waiverTool.inputSchema.type, "object");
    assert.equal(waiverTool.inputSchema.properties.claimId.type, "string");

    // Call without claimId: every claim in the report gets a verdict.
    send(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: {} },
    });
    const all = await responses.next(3);
    assert.equal(all.result.isError, false);
    const allMap = JSON.parse(all.result.content[0].text);
    assert.equal(allMap[waivedClaimId].verdict, "complete-waiver");
    assert.equal(allMap[waivedClaimId].approverAuthenticated, false);
    assert.equal(allMap[waivedClaimId].waiver.reason, "Deferred pending release.");
    assert.equal(allMap[bareClaimId].verdict, "bare-assumed");
    assert.equal(allMap[bareClaimId].approverAuthenticated, false);
    assert.equal(allMap[bareClaimId].waiver, undefined);

    // Call with claimId: only that claim's verdict comes back.
    send(server, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: waivedClaimId } },
    });
    const filtered = await responses.next(4);
    assert.equal(filtered.result.isError, false);
    const filteredMap = JSON.parse(filtered.result.content[0].text);
    assert.deepEqual(Object.keys(filteredMap), [waivedClaimId]);
    assert.equal(filteredMap[waivedClaimId].verdict, "complete-waiver");

    // Unknown claimId is an error, mirroring surface_get_claim.
    send(server, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: "claim.does-not-exist" } },
    });
    const missing = await responses.next(5);
    assert.equal(missing.result.isError, true);
    assert.match(missing.result.content[0].text, /Unknown claim/);
  } finally {
    server.stdin.end();
    await once(server, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});

function send(server: ReturnType<typeof spawn>, message: unknown): void {
  server.stdin!.write(`${JSON.stringify(message)}\n`);
}

function collectResponses(stdout: NodeJS.ReadableStream) {
  const byId = new Map<number, JsonRpcResponse>();
  const waiters = new Map<number, (response: JsonRpcResponse) => void>();
  const rl = createInterface({ input: stdout });
  rl.on("line", (line) => {
    if (line.trim() === "") return;
    const parsed = JSON.parse(line) as JsonRpcResponse;
    if (typeof parsed.id !== "number") return;
    const waiter = waiters.get(parsed.id);
    if (waiter) {
      waiters.delete(parsed.id);
      waiter(parsed);
    } else {
      byId.set(parsed.id, parsed);
    }
  });

  return {
    next(id: number): Promise<JsonRpcResponse> {
      const existing = byId.get(id);
      if (existing) {
        byId.delete(id);
        return Promise.resolve(existing);
      }
      return new Promise((resolveResponse, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for response ${id}`)), 15_000);
        waiters.set(id, (response) => {
          clearTimeout(timer);
          resolveResponse(response);
        });
      });
    },
  };
}
