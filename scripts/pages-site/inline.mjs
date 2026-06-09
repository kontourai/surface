import { dirname, join, normalize } from "node:path";

import { githubSourceBaseUrl, pageSlugBySource } from "./pages.mjs";

export function renderInline(text, source) {
  const placeholders = [];
  const withPlaceholders = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
    const safeLabel = renderInline(label, source);
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

export function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resolveHref(href, source) {
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("#")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return "#";

  const hashIndex = href.indexOf("#");
  const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
  if (!isConservativeRelativePath(pathPart)) return "#";

  const target = normalize(join(dirname(source), pathPart));
  if (target.startsWith("..") || target.startsWith("/")) return "#";

  if (pathPart.endsWith(".md")) {
    const slug = pageSlugBySource.get(target);
    return slug ? `${slug}.html${fragment ? `#${fragment}` : ""}` : githubSourceUrl(target, fragment);
  }

  if (!hasFileExtension(pathPart) && !pathPart.includes("/")) return href;
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
