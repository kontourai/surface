import { pages } from "./pages.mjs";
import { escapeHtml } from "./inline.mjs";
import { markdownToHtml } from "./markdown.mjs";

export function renderPage({ slug, source, title, markdown }) {
  const nav = pages
    .map(([pageSlug, , pageTitle]) => `<a ${pageSlug === slug ? 'aria-current="page"' : ""} href="${pageSlug}.html">${pageTitle}</a>`)
    .join("");
  const hasMermaid = /```mermaid\s/.test(markdown);
  return `<!doctype html>
<html lang="en" class="theme-surface">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Kontour Surface</title>
  <link rel="stylesheet" href="vendor/console-kit/tokens/index.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="terrain"></div>
  <header>
    <a class="brand" href="index.html">Kontour Surface</a>
    <nav>${nav}</nav>
  </header>
  <main>
    ${slug === "index" ? hero() : ""}
    <article>${markdownToHtml(markdown, source)}</article>
  </main>
  <footer>Product transparency for humans and AI agents.</footer>
  ${hasMermaid ? mermaidScript() : ""}
</body>
</html>`;
}

function hero() {
  return `<section class="hero">
    <p class="eyebrow">Product transparency for the AI era</p>
    <h1>Show your work. Earn trust.</h1>
    <p>Kontour Surface connects evidence provenance to the claims products ask humans and agents to trust.</p>
    <div class="hero-grid">
      <span>Claims</span><span>Evidence Trace</span><span>Freshness</span><span>Conflicts</span><span>Transparency Gaps</span><span>Trust Snapshot</span>
    </div>
  </section>`;
}

function mermaidScript() {
  return `<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, securityLevel: "strict" });
</script>`;
}
