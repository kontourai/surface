import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const pages = [
  ["index", "README.md", "Kontour Surface"],
  ["vision", "docs/vision.md", "Vision"],
  ["principles", "docs/principles.md", "Principles"],
  ["concepts", "docs/concepts.md", "Concepts"],
  ["use-cases", "docs/use-cases.md", "Use Cases"],
  ["architecture", "docs/architecture.md", "Architecture"],
  ["surface-foundation", "docs/architecture/surface-foundation.md", "Surface Foundation"],
  ["cli", "docs/cli.md", "CLI"],
  ["schemas", "docs/schemas.md", "Schemas"],
  ["schema-versioning", "docs/schema-versioning.md", "Schema Versioning"],
  ["fixtures", "docs/fixtures.md", "Fixtures"],
  ["veritas-adapter", "docs/adapters/veritas.md", "Veritas Adapter"],
  ["field-attested-records", "docs/adapters/field-attested-records.md", "Field-Attested Records"],
  ["fact-resolution", "docs/adapters/fact-resolution.md", "Fact Resolution"],
  ["roadmap", "docs/roadmap.md", "Roadmap"],
  ["linked-data-roadmap", "docs/linked-data-roadmap.md", "Linked-Data Roadmap"],
  ["integration-plan", "docs/integration-plan.md", "Integration Plan"],
  ["grounding-audit", "docs/grounding-audit.md", "Grounding Audit"],
  ["brand-language", "docs/brand-language.md", "Brand Language"],
];

await mkdir("docs-site", { recursive: true });
await writeFile("docs-site/styles.css", buildStyles());

for (const [slug, source, title] of pages) {
  const markdown = await readFile(source, "utf8");
  await writeFile(join("docs-site", `${slug}.html`), renderPage({ slug, title, markdown }));
}

console.log(`Built ${pages.length} docs pages in docs-site/`);

function renderPage({ slug, title, markdown }) {
  const nav = pages
    .map(([pageSlug, , pageTitle]) => `<a ${pageSlug === slug ? 'aria-current="page"' : ""} href="${pageSlug}.html">${pageTitle}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Kontour Surface</title>
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
    <article>${markdownToHtml(markdown)}</article>
  </main>
  <footer>Evidence-backed systems for humans and AI agents.</footer>
</body>
</html>`;
}

function hero() {
  return `<section class="hero">
    <p class="eyebrow">Trust surfaces for AI-era products</p>
    <h1>Map what your product claims, what proves it, and where trust breaks down.</h1>
    <p>Kontour Surface turns claims, evidence, freshness, and conflicts into an inspectable layer for humans and agents.</p>
    <div class="hero-grid">
      <span>Claims</span><span>Evidence</span><span>Checks</span><span>Drift</span><span>Fault lines</span><span>Coverage</span>
    </div>
  </section>`;
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let inList = false;
  let inCode = false;
  let codeLines = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1>${escapeInline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${escapeInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${escapeInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${escapeInline(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${escapeInline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");

  function closeList() {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  }
}

function escapeInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
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
  --bg: #f3efe3;
  --text: #17201b;
  --muted: #657267;
  --panel: rgba(255, 252, 241, 0.78);
  --line: rgba(36, 68, 52, 0.16);
  --accent: #0f6b52;
  --accent-2: #c45d34;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101511;
    --text: #edf0e8;
    --muted: #a3ad9d;
    --panel: rgba(21, 30, 23, 0.82);
    --line: rgba(212, 224, 204, 0.16);
    --accent: #7ee0bd;
    --accent-2: #ff9a70;
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
  color: var(--text);
  background: radial-gradient(circle at top left, rgba(15, 107, 82, 0.18), transparent 28rem), var(--bg);
  line-height: 1.6;
}
.terrain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image:
    repeating-radial-gradient(ellipse at 20% 20%, transparent 0 18px, var(--line) 19px 20px),
    repeating-radial-gradient(ellipse at 80% 10%, transparent 0 28px, var(--line) 29px 30px);
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
  background: color-mix(in srgb, var(--bg) 84%, transparent);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--line);
}
.brand {
  color: var(--text);
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
  color: var(--muted);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.9rem;
}
nav a[aria-current="page"], nav a:hover {
  color: var(--text);
  border-color: var(--line);
  background: var(--panel);
}
main {
  position: relative;
  width: min(1040px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 4rem 0;
}
.hero {
  padding: clamp(2rem, 6vw, 6rem);
  border: 1px solid var(--line);
  border-radius: 2rem;
  background: linear-gradient(135deg, var(--panel), color-mix(in srgb, var(--panel) 70%, transparent));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.12);
}
.eyebrow {
  color: var(--accent-2);
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
  border: 1px solid var(--line);
  border-radius: 1rem;
  padding: 0.9rem;
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  font-weight: 700;
}
article {
  margin-top: 2rem;
  padding: clamp(1.25rem, 4vw, 3rem);
  border: 1px solid var(--line);
  border-radius: 1.5rem;
  background: var(--panel);
}
h1, h2, h3 {
  line-height: 1.05;
  letter-spacing: -0.04em;
}
h1 { font-size: clamp(2rem, 5vw, 3.8rem); }
h2 { margin-top: 2.2rem; font-size: 2rem; }
a { color: var(--accent); }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
}
pre {
  overflow: auto;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.08);
}
footer {
  position: relative;
  padding: 2rem;
  text-align: center;
  color: var(--muted);
}
@media (max-width: 720px) {
  header { align-items: flex-start; flex-direction: column; }
  main { padding-top: 2rem; }
}
`;
}
