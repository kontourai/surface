import { renderToolPage } from "./page.mjs";

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
    <p>This viewer embeds the same read-only <code>&lt;surface-trust-panel&gt;</code> element any product can ship — see the <a href="trust-panel.html">Trust Panel embed guide</a>. To generate a report of your own, start with <a href="getting-started.html">Getting Started</a>.</p>
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

  return renderToolPage({
    slug: "viewer",
    title: "Trust Snapshot Viewer",
    description:
      "Inspect a Kontour Surface trust report in your browser: claims, evidence, freshness, and transparency gaps. Local-only — reports never leave the page.",
    body,
    extraScripts: script,
  });
}

// "Built with Surface" badge: an inspectability signal, not a certification mark.
export function buildBadgeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="172" height="36" viewBox="0 0 172 36" role="img" aria-label="Built with Surface">
  <rect width="172" height="36" rx="18" fill="#0f6b52"/>
  <g fill="none" stroke="#eafff6" stroke-width="1.6" stroke-linecap="round" transform="translate(10 6)">
    <path d="M12 4.5c4.7 0 8 2.6 8 6.1 0 4.2-3.9 8.9-8 8.9s-8-4.7-8-8.9c0-3.5 3.3-6.1 8-6.1Z"/>
    <path d="M12 8.1c2.8 0 4.8 1.4 4.8 3.4 0 2.4-2.2 5-4.8 5s-4.8-2.6-4.8-5c0-2 2-3.4 4.8-3.4Z"/>
    <path d="M12 11.6c1 0 1.7.5 1.7 1.2 0 .9-.8 1.8-1.7 1.8s-1.7-.9-1.7-1.8c0-.7.7-1.2 1.7-1.2Z"/>
  </g>
  <text x="44" y="23" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="13" font-weight="600" fill="#eafff6">Built with Surface</text>
</svg>
`;
}
