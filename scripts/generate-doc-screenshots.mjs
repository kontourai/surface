// Regenerates the documentation screenshots committed under
// assets/screenshots/ (copied to docs-site/assets/ by the docs build).
// Run after UI or brand changes, with dist/ and docs-site/ already built:
//   npm run build && npm run docs:build && node scripts/generate-doc-screenshots.mjs
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

await mkdir("assets/screenshots", { recursive: true });
const site = await serveDocsSite();
const browser = await chromium.launch();

try {
  await captureViewer(browser, site.url);
  await captureProductEmbed(browser, site.url);
  await captureConsole(browser);
} finally {
  await browser.close();
  site.close();
}
console.log("Wrote assets/screenshots/*.png");

async function captureViewer(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: "light" });
  await page.goto(`${baseUrl}/viewer.html`);
  await page.getByRole("button", { name: "Load sample report" }).click();
  const panel = page.locator("surface-trust-panel");
  await panel.locator("details.claim").first().locator("summary").click();
  await page.locator("article").screenshot({ path: "assets/screenshots/snapshot-viewer.png" });
  await panel.screenshot({ path: "assets/screenshots/trust-panel.png" });
  await page.close();
}

// A small fictional product page demonstrating the intended integration:
// the Built with Surface badge as the entry point to an embedded Trust Panel.
async function captureProductEmbed(browser, baseUrl) {
  const report = JSON.parse(await readFile("docs-site/sample-report.json", "utf8"));
  // Keep the demo focused: just the field-attested record claims.
  report.claims = report.claims.filter((claim) => String(claim.surface).startsWith("field-attested-records"));
  const html = `<!doctype html>
<html class="theme-surface"><head><meta charset="utf-8">
<link rel="stylesheet" href="${baseUrl}/vendor/console-kit/tokens/index.css">
<style>
  body { margin: 0; padding: 40px; background: #f3efe3; font-family: var(--k-font-ui, sans-serif); color: #17201b; }
  .product-card { max-width: 660px; margin: 0 auto; background: #fffcf1; border: 1px solid rgba(36,68,52,0.16); border-radius: 18px; padding: 28px; }
  h1 { margin: 0; font-family: var(--k-font-display, serif); font-size: 26px; }
  .meta { color: #657267; margin: 6px 0 14px; }
  .row { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 14px; }
  .row div { background: #fbf6e7; border: 1px solid rgba(36,68,52,0.16); border-radius: 10px; padding: 8px 12px; font-size: 14px; }
  .badge-row { display: flex; align-items: center; gap: 10px; margin: 18px 0; }
  .badge-row span { color: #657267; font-size: 13px; }
  surface-trust-panel { display: block; margin-top: 6px; }
</style></head>
<body>
  <div class="product-card">
    <h1>Denver Art Lab</h1>
    <p class="meta">Community studio · Denver, CO</p>
    <div class="row"><div>Registration: <strong>OPEN</strong></div><div>Last verified: Apr 22</div><div>Source: official site</div></div>
    <div class="badge-row">
      <img src="${baseUrl}/built-with-surface.svg" alt="Built with Surface" height="36">
      <span>Inspect the claims behind this listing</span>
    </div>
    <surface-trust-panel id="panel"></surface-trust-panel>
  </div>
  <script type="module">
    import "./surface-trust-panel.js";
    document.getElementById("panel").report = ${JSON.stringify(report)};
  </script>
</body></html>`;

  // Served same-origin from docs-site so the module import works, then removed.
  const demoPath = "docs-site/demo-embed.html";
  await writeFile(demoPath, html);
  try {
    const page = await browser.newPage({ viewport: { width: 760, height: 980 }, colorScheme: "light" });
    await page.goto(`${baseUrl}/demo-embed.html`);
    const panel = page.locator("surface-trust-panel");
    await panel.locator(".panel-title").waitFor();
    await panel.locator("details.claim").first().locator("summary").click();
    await page.locator(".product-card").screenshot({ path: "assets/screenshots/product-embed.png" });
    await page.close();
  } finally {
    await rm(demoPath, { force: true });
  }
}

async function captureConsole(browser) {
  const dir = await mkdtemp(join(tmpdir(), "surface-console-shot-"));
  const readModelPath = join(dir, "latest.console.json");
  await writeFile(readModelPath, JSON.stringify(consoleReadModel(), null, 2));
  const port = 4646;
  const child = spawn(
    process.execPath,
    ["bin/surface.mjs", "console", "--read-model", readModelPath, "--store", join(dir, "veritas.claims.json"), "--port", String(port)],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    await waitFor(`http://127.0.0.1:${port}/api/console-model`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector("#claimFeed .claim-card");
    await page.screenshot({ path: "assets/screenshots/surface-console.png" });
    await page.close();
  } finally {
    child.kill("SIGTERM");
    await rm(dir, { recursive: true, force: true });
  }
}

function consoleReadModel() {
  return {
    producer: {
      runId: "run-2026-06-10",
      timestamp: "2026-06-10T09:00:00.000Z",
      sourceKind: "working-tree",
      sourceScope: ["staged", "unstaged"],
    },
    summary: {
      claimCount: 3,
      statusCounts: { verified: 2, stale: 1 },
      transparencyGapCount: 1,
      attentionClaimIds: ["claim.api.rate-limit-tests"],
      surfaceCounts: { "api.guarantees": 2, "build.quality": 1 },
    },
    claims: [
      {
        id: "claim.api.contract-types",
        status: "verified",
        surface: "api.guarantees",
        claimType: "build",
        fieldOrBehavior: "API contract types compile",
        subjectType: "repository",
        subjectId: "acme/public-api",
        evidence: [{ excerptOrSummary: "tsc --noEmit passed for the API contract package." }],
        verificationPolicyId: "policy.build",
      },
      {
        id: "claim.build.lint",
        status: "verified",
        surface: "build.quality",
        claimType: "build",
        fieldOrBehavior: "lint gate",
        subjectType: "repository",
        subjectId: "acme/public-api",
        evidence: [{ excerptOrSummary: "eslint reported 0 errors on changed files." }],
        verificationPolicyId: "policy.build",
      },
      {
        id: "claim.api.rate-limit-tests",
        status: "stale",
        surface: "api.guarantees",
        claimType: "test",
        fieldOrBehavior: "rate-limit tests",
        subjectType: "repository",
        subjectId: "acme/public-api",
        transparencyGapIds: ["gap.rate-limit.stale"],
        evidence: [{ excerptOrSummary: "Last passing run predates the new commit on src/api." }],
        verificationPolicyId: "policy.test",
      },
    ],
  };
}

async function serveDocsSite() {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = join("docs-site", path === "/" ? "index.html" : path.slice(1));
    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(4747, "127.0.0.1", resolve));
  return { url: "http://127.0.0.1:4747", close: () => server.close() };
}

async function waitFor(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
