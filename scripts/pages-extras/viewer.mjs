// The Trust Snapshot Viewer page, carried over from the pre-docs-kit site
// builder (scripts/pages-site/viewer.mjs). docs-kit renders only sanitized
// Markdown, so this page is added to the Pages site by build-pages-extras.mjs.
const siteBaseUrl = "https://kontourai.github.io/surface/";
const githubRepoUrl = "https://github.com/kontourai/surface";
const npmPackageUrl = "https://www.npmjs.com/package/@kontourai/surface";

// Contour-line mark and favicon from the old site shell.
const logoMark = `<svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
  <path d="M12 4.5c4.7 0 8 2.6 8 6.1 0 4.2-3.9 8.9-8 8.9s-8-4.7-8-8.9c0-3.5 3.3-6.1 8-6.1Z"/>
  <path d="M12 8.1c2.8 0 4.8 1.4 4.8 3.4 0 2.4-2.2 5-4.8 5s-4.8-2.6-4.8-5c0-2 2-3.4 4.8-3.4Z"/>
  <path d="M12 11.6c1 0 1.7.5 1.7 1.2 0 .9-.8 1.8-1.7 1.8s-1.7-.9-1.7-1.8c0-.7.7-1.2 1.7-1.2Z"/>
</svg>`;
const faviconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2314a37a' stroke-width='1.7' stroke-linecap='round'><path d='M12 4.5c4.7 0 8 2.6 8 6.1 0 4.2-3.9 8.9-8 8.9s-8-4.7-8-8.9c0-3.5 3.3-6.1 8-6.1Z'/><path d='M12 8.1c2.8 0 4.8 1.4 4.8 3.4 0 2.4-2.2 5-4.8 5s-4.8-2.6-4.8-5c0-2 2-3.4 4.8-3.4Z'/><path d='M12 11.6c1 0 1.7.5 1.7 1.2 0 .9-.8 1.8-1.7 1.8s-1.7-.9-1.7-1.8c0-.7.7-1.2 1.7-1.2Z'/></svg>`;


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
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${faviconSvg}">
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
