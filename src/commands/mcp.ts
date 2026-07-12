import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildTrustAnalyticsProjection } from "../analytics.js";
import { formatTrustReportSummary } from "../report.js";
import type { TrustReport } from "../types.js";
import { loadReport, requireValue, type QueryOptions } from "./shared.js";
import { projectClaimQuery, projectPolicyQuery } from "./query.js";
import { buildTrustPanelUiResource } from "../mcp-ui/trust-panel-resource.js";

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

// MCP Apps extension (SEP-1865). The canonical, on-the-wire resource pointer is
// the FLAT `_meta["ui/resourceUri"]` key (what the official `registerAppTool`
// emits and what ChatGPT/Claude read); the nested `_meta.ui.resourceUri` is the
// convenience shape some hosts (e.g. Station) read. We emit both so one server
// renders everywhere. Resources carry the MCP Apps HTML profile mimetype, and
// the server advertises the `io.modelcontextprotocol/ui` capability extension.
const UI_RESOURCE_URI_META_KEY = "ui/resourceUri";
const UI_RESOURCE_MIME = "text/html;profile=mcp-app";
const UI_CAPABILITY_EXTENSION = "io.modelcontextprotocol/ui";
const SUMMARY_PANEL_URI = "ui://surface/trust-panel/summary";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface McpServerOptions {
  /**
   * The optional startup default trust input. Undefined when the server is
   * launched input-agnostic (no `--input`), in which case every tool call must
   * supply its own `input`. There is deliberately no baked-in example fallback:
   * an unconfigured server reports that honestly rather than serving demo data.
   */
  input: string | undefined;
  adapter: string;
  noUi: boolean;
}

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // SEP-1865 UI metadata advertised in tools/list (omitted under --no-ui).
  _meta?: Record<string, unknown>;
  run: (args: Record<string, unknown>, options: McpServerOptions) => Promise<unknown>;
}

// The SEP-1865 `_meta` for a tool whose UI is a declared `ui://` resource.
// Emits BOTH the flat canonical key and the nested convenience shape.
function uiResourceMeta(resourceUri: string): Record<string, unknown> {
  return {
    [UI_RESOURCE_URI_META_KEY]: resourceUri,
    ui: { resourceUri, visibility: ["model", "app"] },
  };
}

const sharedToolProperties = {
  input: {
    type: "string",
    description:
      "Path to a trust input file for THIS call. Defaults to the input the server was started with (--input), if any. When the server was started without --input it is input-agnostic and this argument is required; a call with no input configured returns an error. This is the supported way to point Surface at many, evolving trust inputs (e.g. per-task trust.bundle files) without restarting the server: pass the input path per call.",
  },
  adapter: {
    type: "string",
    description:
      "Optional registered adapter name for THIS call (e.g. \"surface\", \"veritas\"). Defaults to the adapter the server was started with. Use \"veritas\" to unwrap a Veritas evidence-record envelope.",
  },
};

const tools: ToolDefinition[] = [
  {
    name: "surface_summary",
    title: "Trust report summary",
    description:
      "Derive the trust report for the configured input and return the human-readable summary: claim counts by status, producer surfaces, high-impact unsupported claims, stale and disputed claims, and transparency gap counts.",
    inputSchema: { type: "object", properties: { ...sharedToolProperties } },
    _meta: uiResourceMeta(SUMMARY_PANEL_URI),
    run: async (args, options) => {
      const report = await loadToolReport(args, options);
      return { _summary: formatTrustReportSummary(report), _report: report, _ui: options.noUi ? null : "summary" };
    },
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
      "Derive waiver validity for every claim from claim.metadata.waiver: not-applicable, bare-assumed, complete-waiver, incomplete-waiver, stale-or-revoked-waiver, or command-backed-waiver-rejection. approverAuthenticated is always false (approved_by is unauthenticated free text). With claimId, returns just that claim's verdict; without it, returns the map for every claim in the report.",
    inputSchema: {
      type: "object",
      properties: {
        claimId: { type: "string", description: "Optional claim id to inspect. Without it, every claim's verdict is returned." },
        ...sharedToolProperties,
      },
    },
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
        // The report is already loaded; projectPolicyQuery reads only
        // policyId/claimId. `input` is inert here but required by the shape.
        input: options.input ?? "",
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
          capabilities: {
            tools: { listChanged: false },
            // Resources back the SEP-1865 `ui://` trust panel (unless --no-ui).
            ...(options.noUi ? {} : { resources: { listChanged: false } }),
            // Advertise the MCP Apps extension so UI-aware hosts opt in.
            ...(options.noUi
              ? {}
              : { extensions: { [UI_CAPABILITY_EXTENSION]: {} } }),
          },
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
          tools: tools.map(({ name, title, description, inputSchema, _meta }) => ({
            name,
            title,
            description,
            inputSchema,
            // Advertise the SEP-1865 UI pointer unless UI is disabled.
            ...(options.noUi || !_meta ? {} : { _meta }),
          })),
        },
      });
    } else if (method === "resources/list") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          resources: options.noUi
            ? []
            : [
                {
                  uri: SUMMARY_PANEL_URI,
                  name: "Surface trust panel",
                  description:
                    "Interactive trust panel for the configured trust report (MCP Apps UI resource).",
                  mimeType: UI_RESOURCE_MIME,
                },
              ],
        },
      });
    } else if (method === "resources/read") {
      const uri = typeof params?.uri === "string" ? params.uri : "";
      if (options.noUi || uri !== SUMMARY_PANEL_URI) {
        send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown resource: ${uri || "(missing uri)"}` } });
        return;
      }
      if (!options.input) {
        send({ jsonrpc: "2.0", id, error: { code: -32602, message: "No trust input configured. Start the server with `surface mcp --input <file>` to serve the trust panel resource." } });
        return;
      }
      const report = await loadReport({ input: options.input, adapter: options.adapter });
      const { resource } = buildTrustPanelUiResource(report, { uri: SUMMARY_PANEL_URI });
      send({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [{ uri: SUMMARY_PANEL_URI, mimeType: UI_RESOURCE_MIME, text: resource.text }],
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
        const content = buildToolContent(result, options);
        send({ jsonrpc: "2.0", id, result: { content, isError: false } });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: stripUnsafeRenderingChars(text) }], isError: true },
        });
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

// MCP text-content boundary sanitizer -- applied at the single final
// text-content emission point for BOTH the success path (`buildToolContent`)
// and the tool-error path (the `tools/call` catch block below), so every
// `content[].text` this server emits is sanitized the same way regardless of
// whether the payload originated as an object, a bare string (e.g.
// `surface_summary`'s `_summary`), or a thrown error message (e.g. "Unknown
// claim: <id>"). This is scoped to the MCP text-content boundary only (not a
// codebase-wide free-text sanitizer -- `excerptOrSummary`,
// `TransparencyGap.message`, etc. are unchanged; see docs/reference/mcp.md).
//
// Iteration-2 re-review (review-security-r2.md, review-codex-r2.md) proved
// the earlier assumption that JSON string escaping alone "already
// neutralizes" C0 control characters (U+0000-U+001F, e.g. ESC/BEL) was
// incorrect: that only holds when a payload passes through *two* layers of
// `JSON.stringify` (once inside `buildToolContent` for an object payload,
// once again for the outer JSON-RPC envelope in `send()`) -- a client's
// single `JSON.parse` of the wire envelope only undoes the outer layer. A
// bare-string payload (`surface_summary`'s `_summary`, sourced from
// attacker-controlled `report.source`/claim-id lists via
// `formatTrustReportSummary`) only ever passes through one `JSON.stringify`
// layer, so a raw ESC/BEL byte survives a single client-side `JSON.parse`
// intact and reaches a terminal-rendering client uncooked. C0 controls are
// therefore stripped here directly rather than relied upon to be "encoded
// away" -- `\n`/`\t`/`\r` are deliberately preserved so legitimate
// multi-line summary text still renders.
//
// Also stripped: C1 control characters (U+0080-U+009F); the bidi format
// characters U+200E/U+200F (LRM/RLM), U+202A-U+202E (embedding/override),
// U+2066-U+2069 (isolates); U+061C (Arabic Letter Mark, another bidi format
// character omitted from the first pass); and the deprecated Unicode format
// characters U+206A-U+206F (symmetric-swapping/Arabic-form-shaping/digit-
// shape controls), which sit in the same "invisible rendering control" class
// as the bidi isolates immediately preceding them in the codepoint range.
const UNSAFE_TEXT_CHARS_RE =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u0080-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/g;

function stripUnsafeRenderingChars(text: string): string {
  return text.replace(UNSAFE_TEXT_CHARS_RE, "");
}

/**
 * Build the tool result content array.  For tools that embed a UI resource
 * the result object carries special private fields (_summary/_claimData for
 * the text, _report for the UI payload, _ui for the instance id suffix).
 * All other tools return a single text entry.
 */
function buildToolContent(
  result: unknown,
  options: McpServerOptions,
): Array<{ type: string; text?: string; resource?: unknown }> {
  if (result !== null && typeof result === "object" && "_ui" in (result as object)) {
    const r = result as { _ui: string | null; _report?: TrustReport; _summary?: unknown; _claimData?: unknown };
    // Extract the actual data payload for the text entry
    const textPayload = r._summary !== undefined ? r._summary : r._claimData;
    const text = stripUnsafeRenderingChars(
      typeof textPayload === "string" ? textPayload : JSON.stringify(textPayload, null, 2),
    );
    const content: Array<{ type: string; text?: string; resource?: unknown }> = [{ type: "text", text }];
    if (!options.noUi && r._ui !== null && r._report !== undefined) {
      const uri =
        r._ui === "summary"
          ? "ui://surface/trust-panel/summary"
          : `ui://surface/trust-panel/claim-${r._ui.slice("claim-".length)}`;
      content.push(buildTrustPanelUiResource(r._report, { uri }));
    }
    return content;
  }
  const text = stripUnsafeRenderingChars(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  return [{ type: "text", text }];
}

async function loadToolReport(args: Record<string, unknown>, options: McpServerOptions): Promise<TrustReport> {
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
  // No baked-in default: an unconfigured server is input-agnostic and takes the
  // input per tool call (issue #95). `--input` is an optional convenience default.
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

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
