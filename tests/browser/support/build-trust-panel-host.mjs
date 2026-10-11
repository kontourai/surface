// Builds the static host page the browser tests load <surface-trust-panel>
// into: dist/trust-panel-host/. It replaces the docs-site viewer page the
// tests used before the docs moved to docs-kit, and keeps what made that page a
// faithful host: the compiled panel module the npm package ships, the
// installed @kontourai/ui tokens, and a page theme that follows
// prefers-color-scheme with ui's light and dark --k-trust-* values.
// Run after `npm run build` (which empties dist/).
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = join("dist", "trust-panel-host");
const uiTokens = join("node_modules", "@kontourai", "ui", "tokens");

// ui's tokens are dark-first, with light values under [data-theme="light"].
// This page switches mode by media query instead, so lift the --k-trust-*
// declarations of both modes out of the installed kit.
async function kitTrustTokens() {
  const tokens = (await readFile(join(uiTokens, "tokens.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const declarations = (pattern) =>
    [...(tokens.match(pattern)?.[1] ?? "").matchAll(/(--k-trust-[\w-]+)\s*:\s*([^;]+);/g)].map((match) => `${match[1]}: ${match[2].trim()};`);
  const light = declarations(/\[data-theme="light"\]\s*\{([^}]*)\}/);
  const dark = declarations(/:root\s*\{([^}]*)\}/);
  if (light.length === 0 || dark.length === 0) throw new Error("The installed @kontourai/ui has no --k-trust-* tokens.");
  return { light, dark };
}

const { light, dark } = await kitTrustTokens();
const indent = (lines, pad) => lines.map((line) => `${pad}${line}`).join("\n");

const html = `<!doctype html>
<html lang="en" class="theme-surface">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Trust panel test host</title>
  <link rel="stylesheet" href="vendor/kontourai-ui/tokens/index.css">
  <style>
:root {
  color-scheme: light dark;
${indent(light, "  ")}
  --k-bg: #f3efe3;
  --k-text: #17201b;
  --k-text-muted: #657267;
  --k-panel: #fffcf1;
  --k-panel-raised: #fbf6e7;
  --k-line: rgba(36, 68, 52, 0.16);
  --k-brand: #0f6b52;
  /* ui's light-mode caution; the vendored tokens are dark-first. */
  --k-caution: #8a5a00;
  --host-panel: color-mix(in srgb, var(--k-panel) 78%, transparent);
}
@media (prefers-color-scheme: dark) {
  :root {
${indent(dark, "    ")}
    --k-bg: #101511;
    --k-text: #edf0e8;
    --k-text-muted: #a3ad9d;
    --k-panel: #151e17;
    --k-panel-raised: #1c281f;
    --k-line: rgba(212, 224, 204, 0.16);
    --k-brand: #7ee0bd;
    --k-caution: #f3b14b;
    --host-panel: color-mix(in srgb, var(--k-panel) 82%, transparent);
  }
}
body { margin: 0; padding: 1rem; font-family: var(--k-font-ui); color: var(--k-text); background: var(--k-bg); }
article { padding: 1.25rem; border: 1px solid var(--k-line); border-radius: 1.5rem; background: var(--host-panel); }
surface-trust-panel { display: block; margin: 1.5rem 0; }
  </style>
</head>
<body>
  <main>
    <article>
      <h1>Trust panel test host</h1>
      <surface-trust-panel id="viewer-panel"></surface-trust-panel>
    </article>
  </main>
  <script type="module">import "./surface-trust-panel.js";</script>
</body>
</html>
`;

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "vendor", "kontourai-ui"), { recursive: true });
await cp(uiTokens, join(out, "vendor", "kontourai-ui", "tokens"), { recursive: true });
await copyFile(join("dist", "src", "trust-panel", "surface-trust-panel.js"), join(out, "surface-trust-panel.js"));
await writeFile(join(out, "index.html"), html);
console.log(`Built the trust panel test host in ${out}/`);
