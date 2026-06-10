import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { pages } from "./pages.mjs";
import { renderPage } from "./page.mjs";
import { buildStyles } from "./styles.mjs";
import { renderViewerPage } from "./viewer.mjs";

const execFileAsync = promisify(execFile);

export async function buildDocsSite() {
  await mkdir("docs-site", { recursive: true });
  await cleanDocsSite();
  await writeFile("docs-site/styles.css", buildStyles());

  for (const [slug, source, title, description] of pages) {
    const markdown = await readFile(source, "utf8");
    await writeFile(join("docs-site", `${slug}.html`), renderPage({ slug, source, title, description, markdown }));
  }

  await writeFile("docs-site/viewer.html", renderViewerPage());
  await copyFile("dist/src/trust-panel/surface-trust-panel.js", "docs-site/surface-trust-panel.js");
  await copyFile("scripts/pages-site/assets/og-image.png", "docs-site/og-image.png");
  await rm("docs-site/assets", { recursive: true, force: true });
  await cp("assets", "docs-site/assets", { recursive: true });
  await copyFile("assets/built-with-surface.svg", "docs-site/built-with-surface.svg");
  await writeSampleReport();

  console.log(`Built ${pages.length + 1} docs pages in docs-site/`);
}

// The viewer's sample report is derived through the public CLI so it always
// matches current kernel behavior. `npm install` builds dist/ via prepare, so
// the binary is available wherever the docs build runs.
async function writeSampleReport() {
  const { stdout } = await execFileAsync("node", ["bin/surface.mjs", "report", "--input", "examples/surface-fixtures.json"]);
  await writeFile("docs-site/sample-report.json", stdout);
}

async function cleanDocsSite() {
  const entries = await readdir("docs-site", { withFileTypes: true });
  const generatedFiles = /\.(html|css|js|svg|png|json)$/;
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && generatedFiles.test(entry.name))
      .map((entry) => rm(join("docs-site", entry.name), { force: true })),
  );
}
