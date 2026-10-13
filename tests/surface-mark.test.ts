import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildConsoleHtml } from "../src/console/shell.js";

// The Console header, the viewer, the badge and the Open Graph card must draw
// the Surface mark the installed @kontourai/ui ships, element for element, so a
// revert to an older mark fails here.

function pathElements(svg: string): string[] {
  return svg.match(/<path\b[^>]*\/>/g) ?? [];
}

function shapeElements(svg: string): string[] {
  return svg.match(/<(?:path|circle)\b[^>]*\/>/g) ?? [];
}

function firstMatch(html: string, pattern: RegExp, name: string): RegExpExecArray {
  const match = pattern.exec(html);
  assert.ok(match, `the page has no ${name}`);
  return match;
}

async function installedSurfaceMarkPaths(): Promise<string[]> {
  const paths = pathElements(await readFile("node_modules/@kontourai/ui/icons/surface.svg", "utf8"));
  assert.ok(paths.length > 0, "the installed @kontourai/ui icons/surface.svg has no paths");
  return paths;
}

test("the Console header draws the installed Surface mark at ui's 16px minimum", async () => {
  const expected = await installedSurfaceMarkPaths();
  const [mark] = firstMatch(buildConsoleHtml(), /<svg class="brand-mark"[\s\S]*?<\/svg>/, "Console header mark");

  assert.deepEqual(pathElements(mark), expected);
  // ui's DESIGN.md: 16px high is the minimum for every small-tier mark.
  const [, width, height] = firstMatch(mark, /\bwidth="(\d+)" height="(\d+)"/, "Console header mark size");
  assert.ok(Number(width) >= 16 && Number(height) >= 16, `the Console header mark renders at ${width}x${height}px, under 16px`);
});

test("the Trust Snapshot Viewer logo and favicon draw the installed Surface mark", async () => {
  const expected = await installedSurfaceMarkPaths();
  const { renderViewerPage } = await import(pathToFileURL(resolve("scripts/pages-extras/viewer.mjs")).href) as { renderViewerPage: () => string };
  const html = renderViewerPage();

  const [logo] = firstMatch(html, /<svg class="logo"[\s\S]*?<\/svg>/, "header logo");
  assert.deepEqual(pathElements(logo), expected);

  const [, faviconData] = firstMatch(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)">/, "SVG favicon");
  const favicon = decodeURIComponent(faviconData);
  assert.deepEqual(pathElements(favicon), expected);
  // A standalone SVG has no inherited text color, so currentColor must be set
  // inside the favicon or it draws black.
  assert.match(favicon, /<style>svg\{color:#[0-9a-f]{6}\}/);
});

test("the Built with Surface badge draws the installed Surface mark in one color", async () => {
  const expected = await installedSurfaceMarkPaths();
  const badge = await readFile("assets/built-with-surface.svg", "utf8");

  assert.deepEqual(pathElements(badge), expected);
  assert.match(badge, /<g color="#eafff6" fill="none" stroke="currentColor"/);
});

test("the Open Graph card generator draws the installed Surface badge mark", async () => {
  const expected = shapeElements(await readFile("node_modules/@kontourai/ui/icons/surface-badge.svg", "utf8"));
  assert.ok(expected.length > 0, "the installed @kontourai/ui icons/surface-badge.svg has no shapes");
  // Importing the generator does not write the card: it renders only when run directly.
  const { renderOgImageHtml } = await import(pathToFileURL(resolve("scripts/generate-og-image.mjs")).href) as { renderOgImageHtml: () => string };
  const html = renderOgImageHtml();

  const [, mark] = firstMatch(html, /<div class="brand">\s*(<svg\b[\s\S]*?<\/svg>)/, "brand mark in the Open Graph card");
  assert.deepEqual(shapeElements(mark), expected);
});
