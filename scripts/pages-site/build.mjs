import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { pages } from "./pages.mjs";
import { renderPage } from "./page.mjs";
import { buildStyles } from "./styles.mjs";

export async function buildDocsSite() {
  await mkdir("docs-site", { recursive: true });
  await cleanDocsSite();
  await writeFile("docs-site/styles.css", buildStyles());

  for (const [slug, source, title, description] of pages) {
    const markdown = await readFile(source, "utf8");
    await writeFile(join("docs-site", `${slug}.html`), renderPage({ slug, source, title, description, markdown }));
  }

  console.log(`Built ${pages.length} docs pages in docs-site/`);
}

async function cleanDocsSite() {
  const entries = await readdir("docs-site", { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".html") || entry.name === "styles.css"))
      .map((entry) => rm(join("docs-site", entry.name), { force: true })),
  );
}
