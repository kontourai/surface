import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

const pages = [
  ["index", "docs/index.md", "Kontour Surface"],
  ["built-on-surface", "docs/built-on-surface.md", "What Builds on Surface"],
  ["walkthrough", "docs/guides/walkthrough.md", "Walkthrough"],
  ["vision", "docs/vision.md", "Vision"],
  ["principles", "docs/principles.md", "Principles"],
  ["concepts", "docs/concepts.md", "Concepts"],
  ["use-cases", "docs/use-cases.md", "Use Cases"],
  ["architecture", "docs/architecture.md", "Architecture"],
  ["developer-architecture", "docs/architecture/developer-architecture.md", "Developer Architecture"],
  ["surface-foundation", "docs/architecture/surface-foundation.md", "Surface Foundation"],
  ["cli", "docs/cli.md", "CLI"],
  ["claim-authoring", "docs/claim-authoring.md", "Claim Authoring"],
  ["extension-api", "docs/extension-api.md", "Extension API"],
  ["analytics", "docs/analytics.md", "Trust Analytics"],
  ["minimum-trust-panel", "docs/specs/minimum-trust-panel.md", "Minimum Trust Panel"],
  ["minimum-surface-console", "docs/specs/minimum-surface-console.md", "Minimum Surface Console"],
  ["open-trust-format", "docs/specs/open-trust-format.md", "Open Trust Format"],
  ["disclosure-requirements", "docs/specs/disclosure-requirements.md", "Disclosure Requirements"],
  ["transparency-capabilities", "docs/specs/transparency-capabilities.md", "Transparency Capabilities"],
  ["producer-extension-limits", "docs/specs/producer-extension-limits.md", "Producer Extension Limits"],
  ["adapters", "docs/adapters.md", "Adapters"],
  ["schemas", "docs/schemas.md", "Schemas"],
  ["schema-versioning", "docs/schema-versioning.md", "Schema Versioning"],
  ["fixtures", "docs/fixtures.md", "Fixtures"],
  ["roadmap", "docs/roadmap.md", "Roadmap"],
  ["linked-data-roadmap", "docs/linked-data-roadmap.md", "Linked-Data Roadmap"],
  ["integration-plan", "docs/integration-plan.md", "Integration Plan"],
  ["grounding-audit", "docs/grounding-audit.md", "Grounding Audit"],
  ["resource-contract-audit", "docs/resource-contract-audit.md", "Resource Contract Audit"],
  ["brand-language", "docs/brand-language.md", "Brand Language"],
  ["adr-0001-vocabulary-migration", "docs/adr/0001-vocabulary-migration.md", "ADR 0001"],
];
const githubSourceBaseUrl = "https://github.com/kontourai/surface/blob/main/";
const pageSlugBySource = new Map(pages.map(([slug, source]) => [normalize(source), slug]));

await mkdir("docs-site", { recursive: true });
await cleanDocsSite();
await writeFile("docs-site/styles.css", buildStyles());

for (const [slug, source, title] of pages) {
  const markdown = await readFile(source, "utf8");
  await writeFile(join("docs-site", `${slug}.html`), renderPage({ slug, source, title, markdown }));
}

console.log(`Built ${pages.length} docs pages in docs-site/`);

async function cleanDocsSite() {
  const entries = await readdir("docs-site", { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".html") || entry.name === "styles.css"))
      .map((entry) => rm(join("docs-site", entry.name), { force: true })),
  );
}

function renderPage({ slug, source, title, markdown }) {
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

function markdownToHtml(markdown, source) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let listType = null;
  let inCode = false;
  let inTable = false;
  let codeLang = "";
  let codeLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("```")) {
      if (inCode) {
        if (codeLang === "mermaid") {
          out.push(`<pre class="mermaid">${escapeHtml(codeLines.join("\n"))}</pre>`);
        } else {
          out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        }
        codeLines = [];
        inCode = false;
        codeLang = "";
      } else {
        closeList();
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (isTableHeader(line, lines[index + 1])) {
      closeList();
      const headers = splitTableRow(line);
      out.push("<table>");
      out.push(`<thead><tr>${headers.map((cell) => `<th>${escapeInline(cell, source)}</th>`).join("")}</tr></thead>`);
      out.push("<tbody>");
      inTable = true;
      continue;
    }
    if (inTable && isTableSeparator(line)) {
      continue;
    }
    if (inTable && isTableRow(line)) {
      out.push(`<tr>${splitTableRow(line).map((cell) => `<td>${escapeInline(cell, source)}</td>`).join("")}</tr>`);
      continue;
    }
    if (inTable) {
      closeTable();
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1>${escapeInline(line.slice(2), source)}</h1>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${escapeInline(line.slice(3), source)}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${escapeInline(line.slice(4), source)}</h3>`);
    } else if (line.startsWith("- ")) {
      openList("ul");
      out.push(`<li>${escapeInline(line.slice(2), source)}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      openList("ol");
      out.push(`<li>${escapeInline(line.replace(/^\d+\.\s+/, ""), source)}</li>`);
    } else if (line.trim() === "") {
      closeList();
      closeTable();
    } else {
      closeList();
      out.push(`<p>${escapeInline(line, source)}</p>`);
    }
  }
  closeList();
  closeTable();
  return out.join("\n");

  function openList(type) {
    if (listType === type) {
      return;
    }
    closeList();
    if (type === "ul") {
      out.push("<ul>");
    } else {
      out.push("<ol>");
    }
    listType = type;
  }

  function closeList() {
    if (listType === "ul") {
      out.push("</ul>");
      listType = null;
    } else if (listType === "ol") {
      out.push("</ol>");
      listType = null;
    }
  }

  function closeTable() {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  }
}

function isTableHeader(line, nextLine) {
  return isTableRow(line) && isTableSeparator(nextLine ?? "");
}

function isTableRow(line) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableSeparator(line) {
  if (!isTableRow(line)) {
    return false;
  }
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let inCode = false;
  const content = line.trim().slice(1, -1);

  for (const char of content) {
    if (char === "`") {
      inCode = !inCode;
      cell += char;
    } else if (char === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function resolveHref(href, source) {
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("#")) {
    return href;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return "#";
  }

  const hashIndex = href.indexOf("#");
  const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
  if (!isConservativeRelativePath(pathPart)) {
    return "#";
  }

  const target = normalize(join(dirname(source), pathPart));
  if (target.startsWith("..") || target.startsWith("/")) {
    return "#";
  }

  if (pathPart.endsWith(".md")) {
    const slug = pageSlugBySource.get(target);
    if (slug) {
      return `${slug}.html${fragment ? `#${fragment}` : ""}`;
    }
    return githubSourceUrl(target, fragment);
  }

  if (!hasFileExtension(pathPart) && !pathPart.includes("/")) {
    return href;
  }

  return githubSourceUrl(target, fragment);
}

function isConservativeRelativePath(pathPart) {
  return pathPart !== "" && !pathPart.startsWith("/") && !pathPart.startsWith("//") && !pathPart.includes("\\") && !/[\u0000-\u001f]/.test(pathPart);
}

function hasFileExtension(pathPart) {
  return /\/?[^/]+\.[^/.]+$/.test(pathPart);
}

function githubSourceUrl(path, fragment) {
  return `${githubSourceBaseUrl}${encodeURI(path)}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function escapeInline(text, source) {
  const placeholders = [];
  const withPlaceholders = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
    const safeLabel = escapeInline(label, source);
    const safeHref = escapeAttribute(resolveHref(href, source));
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(`<a href="${safeHref}">${safeLabel}</a>`);
    return token;
  });

  let escaped = escapeHtml(withPlaceholders)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  placeholders.forEach((html, index) => {
    escaped = escaped.replace(`\u0000${index}\u0000`, html);
  });
  return escaped;
}

function mermaidScript() {
  return `<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, securityLevel: "strict" });
</script>`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildStyles() {
  return `:root {
  color-scheme: light dark;
  --k-font-display: ui-serif, Georgia, Cambria, "Times New Roman", serif;
  --k-font-ui: ui-serif, Georgia, Cambria, "Times New Roman", serif;
  --k-bg: #f3efe3;
  --k-text: #17201b;
  --k-text-muted: #657267;
  --k-panel: #fffcf1;
  --k-panel-raised: #fbf6e7;
  --k-line: rgba(36, 68, 52, 0.16);
  --k-brand: #0f6b52;
  --surface-panel: color-mix(in srgb, var(--k-panel) 78%, transparent);
  --surface-panel-raised: color-mix(in srgb, var(--k-panel-raised) 82%, transparent);
  --surface-accent-secondary: color-mix(in srgb, var(--k-caution) 72%, var(--k-negative));
  --surface-brand-glow: color-mix(in srgb, var(--k-brand) 18%, transparent);
  --surface-code-bg: color-mix(in srgb, var(--k-text) 8%, transparent);
}

@media (prefers-color-scheme: dark) {
  :root {
    --k-bg: #101511;
    --k-text: #edf0e8;
    --k-text-muted: #a3ad9d;
    --k-panel: #151e17;
    --k-panel-raised: #1c281f;
    --k-line: rgba(212, 224, 204, 0.16);
    --k-brand: #7ee0bd;
    --surface-panel: color-mix(in srgb, var(--k-panel) 82%, transparent);
    --surface-panel-raised: color-mix(in srgb, var(--k-panel-raised) 82%, transparent);
    --surface-accent-secondary: color-mix(in srgb, var(--k-caution) 52%, var(--k-negative));
    --surface-brand-glow: color-mix(in srgb, var(--k-brand) 18%, transparent);
    --surface-code-bg: color-mix(in srgb, var(--k-text) 8%, transparent);
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--k-font-display);
  color: var(--k-text);
  background: radial-gradient(circle at top left, var(--surface-brand-glow), transparent 28rem), var(--k-bg);
  line-height: 1.6;
}
.terrain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image:
    repeating-radial-gradient(ellipse at 20% 20%, transparent 0 18px, var(--k-line) 19px 20px),
    repeating-radial-gradient(ellipse at 80% 10%, transparent 0 28px, var(--k-line) 29px 30px);
  mask-image: linear-gradient(to bottom, black, transparent 75%);
}
header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 1rem clamp(1rem, 4vw, 4rem);
  background: color-mix(in srgb, var(--k-bg) 84%, transparent);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--k-line);
}
.brand {
  color: var(--k-text);
  font-weight: 800;
  letter-spacing: -0.03em;
  text-decoration: none;
  font-size: 1.2rem;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: flex-end;
}
nav a {
  color: var(--k-text-muted);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.9rem;
}
nav a[aria-current="page"], nav a:hover {
  color: var(--k-text);
  border-color: var(--k-line);
  background: var(--surface-panel);
}
main {
  position: relative;
  width: min(1040px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 4rem 0;
}
.hero {
  padding: clamp(2rem, 6vw, 6rem);
  border: 1px solid var(--k-line);
  border-radius: 2rem;
  background: linear-gradient(135deg, var(--surface-panel), color-mix(in srgb, var(--surface-panel) 70%, transparent));
  box-shadow: var(--k-shadow);
}
.eyebrow {
  color: var(--surface-accent-secondary);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
}
.hero h1 {
  max-width: 780px;
  font-size: clamp(2.5rem, 8vw, 5.8rem);
  line-height: 0.92;
  letter-spacing: -0.08em;
  margin: 0;
}
.hero p {
  max-width: 720px;
  font-size: 1.2rem;
}
.hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.75rem;
  margin-top: 2rem;
}
.hero-grid span {
  border: 1px solid var(--k-line);
  border-radius: 1rem;
  padding: 0.9rem;
  background: var(--surface-panel-raised);
  font-weight: 700;
}
article {
  margin-top: 2rem;
  padding: clamp(1.25rem, 4vw, 3rem);
  border: 1px solid var(--k-line);
  border-radius: 1.5rem;
  background: var(--surface-panel);
}
h1, h2, h3 {
  line-height: 1.05;
  letter-spacing: -0.04em;
}
h1 { font-size: clamp(2rem, 5vw, 3.8rem); }
h2 { margin-top: 2.2rem; font-size: 2rem; }
a { color: var(--k-brand); }
ol, ul {
  padding-left: 1.4rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  overflow-wrap: anywhere;
}
th, td {
  vertical-align: top;
  padding: 0.75rem;
  border: 1px solid var(--k-line);
}
th {
  text-align: left;
  background: var(--surface-panel-raised);
}
code {
  font-family: var(--k-font-mono);
  font-size: 0.92em;
}
pre {
  overflow: auto;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--k-line);
  background: var(--surface-code-bg);
}
pre.mermaid {
  background: var(--surface-panel-raised);
  white-space: pre;
}
footer {
  position: relative;
  padding: 2rem;
  text-align: center;
  color: var(--k-text-muted);
}
`;
}
