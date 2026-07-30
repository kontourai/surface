import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import "../adapters/builtin.js";
import { buildTrustAnalyticsProjection } from "../analytics.js";
import { buildTrustPanelUiResource } from "../mcp-ui/trust-panel-resource.js";
import { formatTrustReportSummary } from "../report.js";
import type { TrustReport } from "../types.js";
import { projectClaimQuery, projectPolicyQuery } from "./query.js";
import { loadReport, requireValue, type QueryOptions } from "./shared.js";

const UI_RESOURCE_URI_META_KEY = "ui/resourceUri";
const UI_RESOURCE_MIME = "text/html;profile=mcp-app";
const UI_CAPABILITY_EXTENSION = "io.modelcontextprotocol/ui";
const SUMMARY_PANEL_URI = "ui://surface/trust-panel/summary";

const SERVER_INSTRUCTIONS =
  "Read portable trust state before relying on a claim: act on verified claims, reverify stale ones, escalate disputed ones, and treat transparency gaps as a reason to ask before acting.";

interface McpServerOptions {
  /**
   * Optional startup default. When omitted, every tool call supplies `input`.
   * Surface never silently falls back to example data.
   */
  input: string | undefined;
  adapter: string;
  noUi: boolean;
}

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  _meta?: Record<string, unknown>;
  run: (args: Record<string, unknown>, options: McpServerOptions) => Promise<unknown>;
}

const inputField = z
  .string()
  .optional()
  .describe(
    "Path to a trust input file for this call. Defaults to the input supplied when the server started. Required when the server started without --input.",
  );

const adapterField = z
  .string()
  .optional()
  .describe(
    'Optional registered adapter name for this call, such as "surface" or "veritas". Defaults to the server startup adapter.',
  );

const sharedToolShape = {
  input: inputField,
  adapter: adapterField,
};

/**
 * MCP Apps uses nested `_meta.ui` as its canonical metadata shape. The flat
 * key remains during the compatibility window for 2025-era Apps hosts.
 */
function uiResourceMeta(resourceUri: string): Record<string, unknown> {
  return {
    ui: { resourceUri, visibility: ["model", "app"] },
    [UI_RESOURCE_URI_META_KEY]: resourceUri,
  };
}

const tools: ToolDefinition[] = [
  {
    name: "surface_summary",
    title: "Trust report summary",
    description:
      "Derive the trust report for the configured input and return the human-readable summary: claim counts by status, producer surfaces, high-impact unsupported claims, stale and disputed claims, and transparency gap counts.",
    inputSchema: z.object(sharedToolShape),
    _meta: uiResourceMeta(SUMMARY_PANEL_URI),
    run: async (args, options) => {
      const report = await loadToolReport(args, options);
      return {
        _summary: formatTrustReportSummary(report),
        _report: report,
        _ui: options.noUi ? null : "summary",
      };
    },
  },
  {
    name: "surface_stale_claims",
    title: "Stale claims",
    description:
      "List claims whose verification is no longer current under their freshness policy. An agent should reverify these before relying on them.",
    inputSchema: z.object(sharedToolShape),
    run: async (args, options) =>
      buildTrustAnalyticsProjection(await loadToolReport(args, options)).staleClaims,
  },
  {
    name: "surface_missing_evidence",
    title: "Missing evidence",
    description:
      "List policy-required evidence that has not been supplied. These transparency gaps mark claims that are not safe to rely on yet.",
    inputSchema: z.object(sharedToolShape),
    run: async (args, options) =>
      buildTrustAnalyticsProjection(await loadToolReport(args, options)).evidenceRequirementGaps,
  },
  {
    name: "surface_get_claim",
    title: "Claim drilldown",
    description:
      "Return one claim with its evidence, verification events, policy, authority trace, transparency gaps, and derivation drilldown.",
    inputSchema: z.object({
      claimId: z.string().min(1).describe("The claim id to inspect."),
      ...sharedToolShape,
    }),
    run: async (args, options) => {
      const claimId = stringArg(args, "claimId");
      if (!claimId) throw new Error("surface_get_claim requires claimId");
      const report = await loadToolReport(args, options);
      const claimData = projectClaimQuery(report, claimId);
      if (options.noUi) return claimData;
      return { _claimData: claimData, _report: report, _ui: `claim-${claimId}` };
    },
  },
  {
    name: "surface_waiver_validity",
    title: "Waiver validity",
    description:
      "Derive waiver validity for every claim from claim.metadata.waiver: not-applicable, bare-assumed, complete-waiver, incomplete-waiver, stale-or-revoked-waiver, or command-backed-waiver-rejection. approverAuthenticated is always false. With claimId, returns just that claim's verdict; without it, returns the map for every claim in the report.",
    inputSchema: z.object({
      claimId: z.string().min(1).optional().describe("Optional claim id to inspect."),
      ...sharedToolShape,
    }),
    run: async (args, options) => {
      const report = await loadToolReport(args, options);
      const claimId = stringArg(args, "claimId");
      const byClaimId = report.waiverValidityByClaimId;
      if (claimId) {
        if (!Object.hasOwn(byClaimId, claimId)) throw new Error(`Unknown claim: ${claimId}`);
        return { [claimId]: byClaimId[claimId] };
      }
      return byClaimId;
    },
  },
  {
    name: "surface_policy",
    title: "Policy drilldown",
    description:
      "Inspect verification policies. With policyId or claimId, returns the policy with its claims, gaps, and authority trace; without arguments, returns every policy with claim ids and gap counts.",
    inputSchema: z.object({
      policyId: z.string().min(1).optional().describe("Optional policy id to inspect."),
      claimId: z.string().min(1).optional().describe("Optional claim id whose policy should be inspected."),
      ...sharedToolShape,
    }),
    run: async (args, options) => {
      const report = await loadToolReport(args, options);
      const queryOptions: QueryOptions = {
        input: options.input ?? "",
        adapter: options.adapter,
        policyId: stringArg(args, "policyId"),
        claimId: stringArg(args, "claimId"),
      };
      return projectPolicyQuery(report, queryOptions);
    },
  },
];

/**
 * Serve both MCP eras from one product definition. `serveStdio` owns the
 * opening exchange: `server/discover` pins a 2026-07-28 instance; legacy
 * `initialize` pins a fresh legacy instance from this same factory.
 */
export async function runMcp(args: string[]): Promise<void> {
  const options = parseMcpArgs(args);
  const serverVersion = await readPackageVersion();
  const inputClosed = new Promise<void>((resolveClosed) => {
    process.stdin.once("end", resolveClosed);
    process.stdin.once("close", resolveClosed);
  });

  const handle = serveStdio(() => createSurfaceMcpServer(options, serverVersion), {
    legacy: "serve",
    onerror: (error) => {
      process.stderr.write(`surface mcp: ${sanitizeDiagnostic(error.message)}\n`);
    },
  });

  await inputClosed;
  await handle.close();
}

function createSurfaceMcpServer(options: McpServerOptions, serverVersion: string): McpServer {
  const server = new McpServer(
    {
      name: "kontour-surface",
      title: "Kontour Surface",
      version: serverVersion,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: options.noUi
        ? {}
        : {
            extensions: {
              [UI_CAPABILITY_EXTENSION]: {},
            },
          },
      cacheHints: {
        "server/discover": { ttlMs: 0, cacheScope: "private" },
        "tools/list": { ttlMs: 0, cacheScope: "private" },
        "resources/list": { ttlMs: 0, cacheScope: "private" },
        "resources/read": { ttlMs: 0, cacheScope: "private" },
      },
    },
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(options.noUi || !tool._meta ? {} : { _meta: tool._meta }),
      },
      async (args) => runTool(tool, args as Record<string, unknown>, options),
    );
  }

  if (!options.noUi) {
    server.registerResource(
      "surface-trust-panel",
      SUMMARY_PANEL_URI,
      {
        title: "Surface trust panel",
        description: "Interactive trust panel for the configured trust report.",
        mimeType: UI_RESOURCE_MIME,
        cacheHint: { ttlMs: 0, cacheScope: "private" },
      },
      async (uri) => {
        if (!options.input) {
          throw new Error(
            "No trust input configured. Start the server with `surface mcp --input <file>` to serve the trust panel resource.",
          );
        }
        const report = await loadReport({ input: options.input, adapter: options.adapter });
        const { resource } = buildTrustPanelUiResource(report, { uri: uri.href });
        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: resource.text,
              _meta: resource._meta,
            },
          ],
        };
      },
    );
  }

  return server;
}

async function runTool(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  options: McpServerOptions,
): Promise<CallToolResult> {
  try {
    const result = await tool.run(args, options);
    return { content: buildToolContent(result, options), isError: false };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: stripUnsafeRenderingChars(text) }],
      isError: true,
    };
  }
}

const UNSAFE_TEXT_CHARS_RE =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u0080-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/g;

function stripUnsafeRenderingChars(text: string): string {
  return text.replace(UNSAFE_TEXT_CHARS_RE, "");
}

function sanitizeDiagnostic(text: string): string {
  return stripUnsafeRenderingChars(text).replaceAll(/\s*\r?\n\s*/g, " ").trim();
}

function buildToolContent(
  result: unknown,
  options: McpServerOptions,
): CallToolResult["content"] {
  if (result !== null && typeof result === "object" && "_ui" in result) {
    const uiResult = result as {
      _ui: string | null;
      _report?: TrustReport;
      _summary?: unknown;
      _claimData?: unknown;
    };
    const textPayload =
      uiResult._summary !== undefined ? uiResult._summary : uiResult._claimData;
    const text = stripUnsafeRenderingChars(
      typeof textPayload === "string" ? textPayload : JSON.stringify(textPayload, null, 2),
    );
    const content: CallToolResult["content"] = [{ type: "text", text }];
    if (!options.noUi && uiResult._ui !== null && uiResult._report !== undefined) {
      const uri =
        uiResult._ui === "summary"
          ? SUMMARY_PANEL_URI
          : `ui://surface/trust-panel/claim-${uiResult._ui.slice("claim-".length)}`;
      content.push(buildTrustPanelUiResource(uiResult._report, { uri }));
    }
    return content;
  }

  const text = stripUnsafeRenderingChars(
    typeof result === "string" ? result : JSON.stringify(result, null, 2),
  );
  return [{ type: "text", text }];
}

async function loadToolReport(
  args: Record<string, unknown>,
  options: McpServerOptions,
): Promise<TrustReport> {
  const input = stringArg(args, "input");
  const adapter = stringArg(args, "adapter");
  const resolvedInput = input ? resolve(input) : options.input;
  if (!resolvedInput) {
    throw new Error(
      "No trust input configured. Pass `input` on this call, or start the server with `surface mcp --input <file>`.",
    );
  }
  return loadReport({
    input: resolvedInput,
    adapter: adapter ?? options.adapter,
  });
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function parseMcpArgs(args: string[]): McpServerOptions {
  let input: string | undefined;
  let adapter = "surface";
  let noUi = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") input = resolve(requireValue(args, ++index, "--input"));
    else if (arg === "--adapter") adapter = requireValue(args, ++index, "--adapter");
    else if (arg === "--no-ui") noUi = true;
    else throw new Error(`Unknown mcp argument: ${arg}`);
  }

  return { input, adapter, noUi };
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
