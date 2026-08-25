import { TRUST_PANEL_JS } from "../trust-panel/trust-panel-module.generated.js";
import { BASIS_MCP_APP_JS } from "./basis-app-module.generated.js";
import type { TrustReport } from "../types.js";
import { parseBasisProjection } from "../basis/parser.js";

export interface TrustPanelUiResourceOptions {
  /** URI for the resource, e.g. "ui://surface/trust-panel/summary" */
  uri: string;
}

export interface BasisPanelUiResourceOptions {
  /** URI for the resource, e.g. "ui://surface/basis/answer" */
  uri: string;
}
export const MCP_APPS_PROTOCOL_VERSION = "2026-01-26" as const;
export function buildBasisPanelAppToolMeta(uri: string): { ui: { resourceUri: string } } {
  assertMcpAppUri(uri);
  return { ui: { resourceUri: uri } };
}
export interface BasisPanelUiResource {
  type: "resource";
  resource: { uri: string; mimeType: "text/html;profile=mcp-app"; text: string; _meta: { ui: { csp: { connectDomains: string[]; resourceDomains: string[] } } } };
}

/**
 * Builds the MCP UI resource entry that embeds the trust panel as a fully
 * self-contained HTML document.  Hosts that understand MCP UI render it
 * interactively; hosts that do not understand it silently ignore it — the
 * text content entry in the tool result remains first and complete.
 *
 * The HTML makes no network requests: the trust panel JS is inlined, the
 * report data is inlined as a JSON island, and all CSS tokens are resolved
 * locally via :root custom properties.
 */
export function buildTrustPanelUiResource(
  report: TrustReport,
  opts: TrustPanelUiResourceOptions,
): {
  type: "resource";
  resource: {
    uri: string;
    mimeType: string;
    text: string;
    _meta: {
      ui: {
        csp: {
          connectDomains: string[];
          resourceDomains: string[];
        };
      };
      "mcpui.dev/ui-preferred-frame-size": [string, string];
    };
  };
} {
  const reportJson = safeJsonStringify(report);
  const html = buildHtml(reportJson);
  return {
    type: "resource",
    resource: {
      uri: opts.uri,
      mimeType: "text/html;profile=mcp-app",
      text: html,
      _meta: {
        ui: {
          // The document is deliberately self-contained. An empty policy is
          // both accurate and a fail-closed default for Apps hosts.
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
        "mcpui.dev/ui-preferred-frame-size": ["480px", "640px"],
      },
    },
  };
}

/**
 * Builds a portable MCP Apps resource for an already supplied Basis snapshot.
 * It deliberately does not fetch owner data: the host mediates tool results and
 * may push a replacement snapshot over the Apps postMessage bridge.
 */
export function buildBasisPanelUiResource(
  projection: unknown,
  opts: BasisPanelUiResourceOptions,
): BasisPanelUiResource {
  assertMcpAppUri(opts.uri);
  const parsed = parseBasisProjection(projection);
  const projectionJson = safeJsonStringify(parsed.ok ? parsed.value : null);
  return {
    type: "resource",
    resource: {
      uri: opts.uri,
      mimeType: "text/html;profile=mcp-app",
      text: buildBasisHtml(projectionJson),
      _meta: {
        ui: { csp: { connectDomains: [], resourceDomains: [] } },
      },
    },
  };
}

function assertMcpAppUri(uri: unknown): asserts uri is string {
  if (typeof uri !== "string" || uri.length < 6 || uri.length > 4_096 || /[\p{Cc}\p{Z}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(uri)) throw new TypeError("Basis MCP Apps resources require a bounded ui:// URI.");
  for (let index = 0; index < uri.length; index += 1) {
    const unit = uri.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) { const low = uri.charCodeAt(index + 1); if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError("Basis MCP Apps resources require well-formed Unicode."); index += 1; }
    else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError("Basis MCP Apps resources require well-formed Unicode.");
  }
  if (new TextEncoder().encode(uri).byteLength > 4_096) throw new TypeError("Basis MCP Apps resources require a bounded ui:// URI.");
  let parsed: URL;
  try { parsed = new URL(uri); } catch { throw new TypeError("Basis MCP Apps resources require a valid ui:// URI."); }
  if (parsed.protocol !== "ui:" || parsed.hostname.length === 0 || parsed.username || parsed.password || parsed.port || parsed.href !== uri) throw new TypeError("Basis MCP Apps resources require a canonical ui:// URI.");
}

/**
 * JSON.stringify with <, >, and & escaped as Unicode escapes so the JSON
 * string is safe to embed directly inside a <script> element without closing
 * it prematurely or triggering HTML parsers.
 */
function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

/**
 * Escapes a JavaScript source string so it is safe to embed verbatim inside
 * an HTML <script> element.
 *
 * The HTML parser terminates a <script> block when it encounters "</script"
 * (case-insensitive) regardless of JavaScript string or template literal
 * context.  The universally-safe fix is to replace every "</" sequence with
 * "<\/" — the backslash-escaped forward slash is valid JavaScript in both
 * string literals and template literals, and it is invisible to the HTML
 * tokeniser.
 *
 * We also escape "<!--" for the same reason (legacy HTML comment handling in
 * browsers can cause the parser to treat it as the start of an HTML comment
 * inside a <script> block).
 */
function safeInlineScript(js: string): string {
  return js.replaceAll("</", "<\\/").replaceAll("<!--", "<\\!--");
}

function buildHtml(reportJson: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Surface Trust Panel</title>
<style>
:root {
  --k-font-ui: system-ui, sans-serif;
  --k-text: #17201b;
  --k-text-muted: #657267;
  --k-panel: #fffcf1;
  --k-panel-raised: #fbf6e7;
  --k-line: rgba(36,68,52,0.16);
  --k-positive: #0f8f66;
  --k-caution: #a86612;
  --k-negative: #c24141;
}

@media (prefers-color-scheme: dark) {
  :root {
    --k-text: #e2ede6;
    --k-text-muted: #9ab09f;
    --k-panel: #141c17;
    --k-panel-raised: #1d2820;
    --k-line: rgba(180,220,195,0.14);
    --k-positive: #3ecf9c;
    --k-caution: #e09a3a;
    --k-negative: #f07070;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  padding: 1rem;
  background: var(--k-panel);
  color: var(--k-text);
  font-family: var(--k-font-ui);
}
</style>
</head>
<body>
<surface-trust-panel></surface-trust-panel>
<script type="application/json" id="surface-report-data">${reportJson}</script>
<script type="module">
${safeInlineScript(TRUST_PANEL_JS)}
const dataEl = document.getElementById("surface-report-data");
const panel = document.querySelector("surface-trust-panel");
if (dataEl && panel) {
  try {
    panel.report = JSON.parse(dataEl.textContent || "null");
  } catch (err) {
    panel.report = null;
  }
}
</script>
</body>
</html>`;
}

function buildBasisHtml(projectionJson: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Basis</title><style>body{margin:0;padding:1rem;background:#fffcf1;color:#17201b;font-family:system-ui,sans-serif}*{box-sizing:border-box}</style>
</head><body><surface-trust-panel mode="basis"></surface-trust-panel>
<script type="application/json" id="surface-basis-data">${projectionJson}</script><script type="module">
${safeInlineScript(TRUST_PANEL_JS)}
${safeInlineScript(BASIS_MCP_APP_JS)}
</script></body></html>`;
}
