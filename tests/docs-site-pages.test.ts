import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

type PageEntry = [slug: string, source: string, title: string, description: string];

test("docs maintainer index links every published source page", async () => {
  const [{ pages }, docsIndex] = await Promise.all([
    import(pathToFileURL("scripts/pages-site/pages.mjs").href) as Promise<{ pages: PageEntry[] }>,
    readFile("docs/README.md", "utf8"),
  ]);

  assert.ok(docsIndex.includes("scripts/pages-site/pages.mjs"));
  for (const [, source] of pages) {
    assert.match(docsIndex, new RegExp(escapeRegExp(toDocsReadmeLink(source))));
  }
});

function toDocsReadmeLink(source: string): string {
  return source.startsWith("docs/") ? source.slice("docs/".length) : source;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
