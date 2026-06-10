import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildTrustAnalyticsProjection } from "../analytics.js";
import { formatTrustReportSummary } from "../report.js";
import type { TrustReport } from "../types.js";
import { loadReport, requireValue, type QueryOptions } from "./shared.js";
import { projectClaimQuery, projectPolicyQuery } from "./query.js";

/**
 * Minimal Model Context Protocol server over stdio.
 *
 * Implemented without an SDK dependency so the published package stays
 * dependency-free: newline-delimited JSON-RPC 2.0 with the MCP lifecycle
 * (initialize / initialized / ping) and the tools capability. Each tool call
 * re-derives the trust report from the configured input, so agents always
 * read current, deterministic trust state rather than a cached answer.
 */

const PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface McpServerOptions {
  input: string;
  adapter: string;
}

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, options: McpServerOptions) => Promise<unknown>;
}

const sharedToolProperties = {
  input: {
    type: "string",
    description: "Optional path to a trust input file. Defaults to the input the server was started with.",
  },
  adapter: {
    type: "string",
    description: "Optional registered adapter name. Defaults to the adapter the server was started with.",
  },
};

const tools: ToolDefinition[] = [
  {
    name: "surface_summary",
    title: "Trust report summary",
    description:
      "Derive the trust report for the configured input and return the human-readable summary: claim counts by status, producer surfaces, high-impact unsupported claims, stale and disputed claims, and transparency gap counts.",
    inputSchema: { type: "object", properties: { ...sharedToolProperties } },
    run: async (args, options) => formatTrustReportSummary(await loadToolReport(args, options)),
  },
  {
    name: "surface_stale_claims",
    title: "Stale claims",
    description:
      "List claims whose verification is no longer current under their freshness policy. An agent should reverify these before relying on them.",
    inputSchema: { type: "object", properties: { ...sharedToolProperties } },
    run: async (args, options) => buildTrustAnalyticsProjection(await loadToolReport(args, options)).staleClaims,
  },
  {
    name: "surface_missing_evidence",
    title: "Missing evidence",
    description:
      "List policy-required evidence that has not been supplied. These transparency gaps mark claims that are not safe to rely on yet.",
    inputSchema: { type: "object", properties: { ...sharedToolProperties } },
    run: async (args, options) =>
      buildTrustAnalyticsProjection(await loadToolReport(args, options)).evidenceRequirementGaps,
  },
  {
    name: "surface_get_claim",
    title: "Claim drilldown",
    description:
      "Return one claim with its evidence, verification events, policy, authority trace, transparency gaps, and derivation drilldown.",
    inputSchema: {
      type: "object",
      properties: {
        claimId: { type: "string", description: "The claim id to inspect." },
        ...sharedToolProperties,
      },
      required: ["claimId"],
    },
    run: async (args, options) => {
      const claimId = stringArg(args, "claimId");
      if (!claimId) throw new Error("surface_get_claim requires claimId");
      return projectClaimQuery(await loadToolReport(args, options), claimId);
    },
  },
  {
    name: "surface_policy",
    title: "Policy drilldown",
    description:
      "Inspect verification policies. With policyId or claimId, returns the policy with its claims, gaps, and authority trace; without arguments, returns every policy with claim ids and gap counts.",
    inputSchema: {
      type: "object",
      properties: {
        policyId: { type: "string", description: "Optional policy id to inspect." },
        claimId: { type: "string", description: "Optional claim id whose policy should be inspected." },
        ...sharedToolProperties,
      },
    },
    run: async (args, options) => {
      const report = await loadToolReport(args, options);
      const queryOptions: QueryOptions = {
        input: options.input,
        adapter: options.adapter,
        policyId: stringArg(args, "policyId"),
        claimId: stringArg(args, "claimId"),
      };
      return projectPolicyQuery(report, queryOptions);
    },
  },
];

export async function runMcp(args: string[]): Promise<void> {
  const options = parseMcpArgs(args);
  const serverVersion = await readPackageVersion();

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    void handleLine(line, options, serverVersion);
  });

  await new Promise<void>((resolveClosed) => {
    rl.on("close", resolveClosed);
  });
}

async function handleLine(line: string, options: McpServerOptions, serverVersion: string): Promise<void> {
  const trimmed = line.trim();
  if (trimmed === "") return;

  let message: JsonRpcRequest;
  try {
    message = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  const { id, method, params } = message;
  const isNotification = id === undefined;

  try {
    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "kontour-surface", title: "Kontour Surface", version: serverVersion },
          instructions:
            "Read portable trust state before relying on a claim: act on verified claims, reverify stale ones, escalate disputed ones, and treat transparency gaps as a reason to ask before acting.",
        },
      });
    } else if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (method === "tools/list") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })),
        },
      });
    } else if (method === "tools/call") {
      const name = typeof params?.name === "string" ? params.name : "";
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) {
        send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name || "(missing name)"}` } });
        return;
      }
      const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(toolArgs, options);
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: false } });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } });
      }
    } else if (isNotification) {
      // Lifecycle notifications such as notifications/initialized need no reply.
    } else {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method ?? "(none)"}` } });
    }
  } catch (error) {
    if (!isNotification) {
      const messageText = error instanceof Error ? error.message : String(error);
      send({ jsonrpc: "2.0", id, error: { code: -32603, message: messageText } });
    }
  }
}

async function loadToolReport(args: Record<string, unknown>, options: McpServerOptions): Promise<TrustReport> {
  const input = stringArg(args, "input");
  const adapter = stringArg(args, "adapter");
  return loadReport({
    input: input ? resolve(input) : options.input,
    adapter: adapter ?? options.adapter,
  });
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function parseMcpArgs(args: string[]): McpServerOptions {
  let input = resolve("examples/surface-fixtures.json");
  let adapter = "surface";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") input = resolve(requireValue(args, ++index, "--input"));
    else if (arg === "--adapter") adapter = requireValue(args, ++index, "--adapter");
    else throw new Error(`Unknown mcp argument: ${arg}`);
  }

  return { input, adapter };
}

async function readPackageVersion(): Promise<string> {
  try {
    const raw = await readFile(new URL("../../../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
