import { navGroups, siteBaseUrl } from "./pages.mjs";
import { escapeHtml } from "./inline.mjs";
import { markdownToHtml } from "./markdown.mjs";

const githubRepoUrl = "https://github.com/kontourai/surface";
const npmPackageUrl = "https://www.npmjs.com/package/@kontourai/surface";

// Contour-line mark: nested terrain rings in the Surface brand teal.
const logoMark = `<svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
  <path d="M12 4.5c4.7 0 8 2.6 8 6.1 0 4.2-3.9 8.9-8 8.9s-8-4.7-8-8.9c0-3.5 3.3-6.1 8-6.1Z"/>
  <path d="M12 8.1c2.8 0 4.8 1.4 4.8 3.4 0 2.4-2.2 5-4.8 5s-4.8-2.6-4.8-5c0-2 2-3.4 4.8-3.4Z"/>
  <path d="M12 11.6c1 0 1.7.5 1.7 1.2 0 .9-.8 1.8-1.7 1.8s-1.7-.9-1.7-1.8c0-.7.7-1.2 1.7-1.2Z"/>
</svg>`;

const faviconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2314a37a' stroke-width='1.7' stroke-linecap='round'><path d='M12 4.5c4.7 0 8 2.6 8 6.1 0 4.2-3.9 8.9-8 8.9s-8-4.7-8-8.9c0-3.5 3.3-6.1 8-6.1Z'/><path d='M12 8.1c2.8 0 4.8 1.4 4.8 3.4 0 2.4-2.2 5-4.8 5s-4.8-2.6-4.8-5c0-2 2-3.4 4.8-3.4Z'/><path d='M12 11.6c1 0 1.7.5 1.7 1.2 0 .9-.8 1.8-1.7 1.8s-1.7-.9-1.7-1.8c0-.7.7-1.2 1.7-1.2Z'/></svg>`;

export function renderPage({ slug, source, title, description, markdown }) {
  const hasMermaid = /```mermaid\s/.test(markdown);
  const pageTitle = slug === "index" ? "Kontour Surface — Show your work. Earn trust." : `${title} | Kontour Surface`;
  const body = `${slug === "index" ? hero() : ""}
      <article>${markdownToHtml(markdown, source)}</article>`;
  return renderShell({ slug, pageTitle, description, body, extraScripts: hasMermaid ? mermaidScript() : "" });
}

export function renderToolPage({ slug, title, description, body, extraScripts = "" }) {
  return renderShell({ slug, pageTitle: `${title} | Kontour Surface`, description, body, extraScripts });
}

function renderShell({ slug, pageTitle, description, body, extraScripts }) {
  const navSections = renderNavSections(slug);
  const safeDescription = escapeHtml(description);
  return `<!doctype html>
<html lang="en" class="theme-surface">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${siteBaseUrl}${slug === "index" ? "" : `${slug}.html`}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Kontour Surface">
  <meta property="og:url" content="${siteBaseUrl}${slug === "index" ? "" : `${slug}.html`}">
  <meta property="og:image" content="${siteBaseUrl}og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3efe3">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#101511">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${faviconSvg}">
  <link rel="stylesheet" href="vendor/kontourai-ui/tokens/index.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="terrain"></div>
  <header>
    <a class="brand" href="index.html">${logoMark}<span>Kontour Surface</span></a>
    <span class="header-links"><a class="repo-link" href="viewer.html">Snapshot Viewer</a><a class="repo-link" href="${githubRepoUrl}">GitHub</a></span>
  </header>
  <div class="layout">
    <details class="mobile-nav">
      <summary>Browse the docs</summary>
      <nav aria-label="Documentation menu">${navSections}</nav>
    </details>
    <nav class="site-nav" aria-label="Documentation">${navSections}</nav>
    <main id="content">
      ${body}
    </main>
  </div>
  <footer>
    <p class="footer-tagline">Bring trust to the surface.</p>
    <p>Kontour Surface — product transparency for humans and AI agents.</p>
    <p class="footer-links"><a href="${githubRepoUrl}">GitHub</a><a href="${npmPackageUrl}">npm</a><a href="viewer.html">Snapshot Viewer</a><a href="${githubRepoUrl}/blob/main/LICENSE">Apache-2.0</a></p>
  </footer>
  ${extraScripts}
</body>
</html>`;
}

function renderNavSections(activeSlug) {
  return navGroups
    .map(({ label, pages }) => {
      const links = pages
        .map(
          ([pageSlug, , pageTitle]) =>
            `<a ${pageSlug === activeSlug ? 'aria-current="page"' : ""} href="${pageSlug}.html">${escapeHtml(pageTitle)}</a>`,
        )
        .join("");
      return `<section><h2>${escapeHtml(label)}</h2>${links}</section>`;
    })
    .join("");
}

function hero() {
  return `<section class="hero">
    <p class="eyebrow">Product transparency for the AI era</p>
    <h1>Show your work. Earn trust.</h1>
    <p>Kontour Surface connects evidence provenance to the claims products ask humans and agents to trust — one open, inspectable shape for claims, evidence, freshness, and gaps.</p>
    <div class="hero-actions">
      <a class="button-primary" href="getting-started.html">Get started</a>
      <a class="button-secondary" href="${githubRepoUrl}">View on GitHub</a>
    </div>
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
