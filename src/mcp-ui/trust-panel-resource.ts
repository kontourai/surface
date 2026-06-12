import { TRUST_PANEL_JS } from "../trust-panel/trust-panel-module.generated.js";
import type { TrustReport } from "../types.js";

export interface TrustPanelUiResourceOptions {
  /** URI for the resource, e.g. "ui://surface/trust-panel/summary" */
  uri: string;
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
    _meta: { "mcpui.dev/ui-preferred-frame-size": [string, string] };
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
      _meta: { "mcpui.dev/ui-preferred-frame-size": ["480px", "640px"] },
    },
  };
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
${TRUST_PANEL_JS}
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
