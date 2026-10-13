import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The viewer and the badge must draw the Surface mark the installed
// @kontourai/ui ships, path for path, so a revert to an older mark fails here.

function pathElements(svg: string): string[] {
  return svg.match(/<path\b[^>]*\/>/g) ?? [];
}

function firstMatch(html: string, pattern: RegExp, name: string): RegExpExecArray {
  const match = pattern.exec(html);
  assert.ok(match, `the viewer page has no ${name}`);
  return match;
}

async function installedSurfaceMarkPaths(): Promise<string[]> {
  const paths = pathElements(await readFile("node_modules/@kontourai/ui/icons/surface.svg", "utf8"));
  assert.ok(paths.length > 0, "the installed @kontourai/ui icons/surface.svg has no paths");
  return paths;
}

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
