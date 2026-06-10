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
