import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

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
    ]);
    for (const tool of toolsList.result.tools) {
      assert.equal(typeof tool.description, "string");
      assert.equal(tool.inputSchema.type, "object");
    }

    send(server, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "surface_summary", arguments: {} } });
    const summary = await responses.next(4);
    assert.equal(summary.result.isError, false);
    assert.match(summary.result.content[0].text, /Kontour Surface report/);
    assert.match(summary.result.content[0].text, /Claims: 4/);

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
    const claimView = JSON.parse(drilldown.result.content[0].text);
    assert.equal(claimView.claim.id, "claim.field-attested-records.registration-status");
    assert.ok(Array.isArray(claimView.evidence));
    assert.ok(claimView.derivation);

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

    send(server, { jsonrpc: "2.0", id: 9, method: "resources/list" });
    const unknownMethod = await responses.next(9);
    assert.equal(unknownMethod.error?.code, -32601);
  } finally {
    server.stdin.end();
    await once(server, "exit");
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
