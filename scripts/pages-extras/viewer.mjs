// The Trust Snapshot Viewer page, carried over from the pre-docs-kit site
// builder (scripts/pages-site/viewer.mjs). docs-kit renders only sanitized
// Markdown, so this page is added to the Pages site by build-pages-extras.mjs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const siteBaseUrl = "https://kontourai.github.io/surface/";
const githubRepoUrl = "https://github.com/kontourai/surface";
const npmPackageUrl = "https://www.npmjs.com/package/@kontourai/surface";

// The Surface mark, read from the installed @kontourai/ui so the page draws the
// package's mark rather than a copy of it. The logo renders at 1.6rem and the
// favicon at 16-32px, so both take the frameless mark: ui's DESIGN.md keeps the
// badge variant for endorsements and hero use from 32px.
const surfaceMarkSvg = readFileSync(createRequire(import.meta.url).resolve("@kontourai/ui/icons/surface.svg"), "utf8").trim();
const surfaceMarkParts = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/.exec(surfaceMarkSvg);
if (!surfaceMarkParts) throw new Error("The installed @kontourai/ui icons/surface.svg is not a single <svg> element.");
// The root's width and height are dropped: the logo is sized by viewer.css.
const surfaceMarkAttributes = surfaceMarkParts[1].replace(/\s(?:width|height)="[^"]*"/g, "");
const surfaceMarkContent = surfaceMarkParts[2];

const logoMark = `<svg class="logo"${surfaceMarkAttributes} aria-hidden="true">${surfaceMarkContent}</svg>`;
// A standalone SVG has no text color for the mark's currentColor to inherit, so
// the favicon sets it: Surface's brand color for each mode (--k-brand under
// .theme-surface), each at least 3:1 against that mode's tab strip.
const faviconSvg = `<svg${surfaceMarkAttributes}><style>svg{color:#0f6b52}@media (prefers-color-scheme:dark){svg{color:#14a37a}}</style>${surfaceMarkContent}</svg>`;

export function renderViewerPage() {
  const body = `<article>
    <h1>Trust Snapshot Viewer</h1>
    <p>Inspect any derived Kontour Surface trust report without installing anything. Paste the JSON output of <code>surface report</code> (or <code>buildTrustReport</code>), or load a file. Everything runs in your browser — the report never leaves this page.</p>
    <div class="viewer-controls">
      <label class="button-secondary viewer-file">Load report file<input id="viewer-file" type="file" accept=".json,application/json"></label>
      <button class="button-primary" id="viewer-sample" type="button">Load sample report</button>
    </div>
    <label class="viewer-label" for="viewer-input">Or paste report JSON</label>
    <textarea id="viewer-input" rows="6" spellcheck="false" placeholder='{"id": "surface-…", "claims": […], "evidence": […] }'></textarea>
    <p class="viewer-error" id="viewer-error" hidden></p>
    <surface-trust-panel id="viewer-panel"></surface-trust-panel>
    <p>This viewer embeds the same read-only <code>&lt;surface-trust-panel&gt;</code> element any product can ship — see the <a href="docs/reference/trust-panel.html">Trust Panel embed guide</a>. To generate a report of your own, start with <a href="docs/guides/getting-started.html">Getting Started</a>.</p>
  </article>`;

  const script = `<script type="module">
import "./surface-trust-panel.js";
(() => {
  const panel = document.getElementById("viewer-panel");
  const input = document.getElementById("viewer-input");
  const errorBox = document.getElementById("viewer-error");

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function loadText(text) {
    if (!text.trim()) return;
    try {
      panel.report = JSON.parse(text);
      showError("");
    } catch (error) {
      showError("Could not parse JSON: " + error.message);
    }
  }

  input.addEventListener("input", () => loadText(input.value));

  document.getElementById("viewer-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      input.value = text;
      loadText(text);
    });
  });

  document.getElementById("viewer-sample").addEventListener("click", async () => {
    try {
      const response = await fetch("sample-report.json");
      const text = await response.text();
      input.value = text;
      loadText(text);
    } catch (error) {
      showError("Could not load the sample report: " + error.message);
    }
  });
})();
</script>`;

  const title = "Trust Snapshot Viewer | Kontour Surface";
  const description =
    "Inspect a Kontour Surface trust report in your browser: claims, evidence, freshness, and transparency gaps. Local-only — reports never leave the page.";
  return `<!doctype html>
<html lang="en" class="theme-surface">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${siteBaseUrl}viewer.html">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Kontour Surface">
  <meta property="og:url" content="${siteBaseUrl}viewer.html">
  <meta property="og:image" content="${siteBaseUrl}og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3efe3">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#101511">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(faviconSvg)}">
  <link rel="stylesheet" href="vendor/kontourai-ui/tokens/index.css">
  <link rel="stylesheet" href="viewer.css">
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="terrain"></div>
  <header>
    <a class="brand" href="index.html">${logoMark}<span>Kontour Surface</span></a>
    <span class="header-links"><a class="repo-link" href="index.html">Docs</a><a class="repo-link" href="${githubRepoUrl}">GitHub</a></span>
  </header>
  <div class="layout viewer-layout">
    <main id="content">
      ${body}
    </main>
  </div>
  <footer>
    <p class="footer-tagline">Bring trust to the surface.</p>
    <p>Kontour Surface — product transparency for humans and AI agents.</p>
    <p class="footer-links"><a href="index.html">Docs</a><a href="${githubRepoUrl}">GitHub</a><a href="${npmPackageUrl}">npm</a><a href="${githubRepoUrl}/blob/main/LICENSE">Apache-2.0</a></p>
  </footer>
  ${script}
</body>
</html>
`;
}
