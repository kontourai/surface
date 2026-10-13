// Regenerates the static Open Graph card committed at
// scripts/pages-extras/og-image.png (copied to the Pages site root by
// npm run docs:extras). Run manually after brand changes: node scripts/generate-og-image.mjs
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

// The Surface mark, read from the installed @kontourai/ui. It renders at 52px
// here, so it takes the badge variant: ui's DESIGN.md keeps the badge for 32px
// and up, for endorsements and hero use. The root's width and height are
// dropped so the card's CSS sizes it.
const surfaceBadgeSvg = readFileSync(createRequire(import.meta.url).resolve("@kontourai/ui/icons/surface-badge.svg"), "utf8").trim();
if (!/^<svg\b[^>]*>[\s\S]*<\/svg>$/.test(surfaceBadgeSvg)) throw new Error("The installed @kontourai/ui icons/surface-badge.svg is not a single <svg> element.");
const surfaceMark = surfaceBadgeSvg.replace(/^<svg\b[^>]*>/, (root) => root.replace(/\s(?:width|height)="[^"]*"/g, ""));

export function renderOgImageHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body {
    margin: 0;
    width: 1200px;
    height: 630px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 96px;
    box-sizing: border-box;
    background: radial-gradient(circle at top left, rgba(15, 107, 82, 0.22), transparent 640px), #f3efe3;
    color: #17201b;
    font-family: Georgia, 'Times New Roman', serif;
  }
  .terrain {
    position: fixed; inset: 0; pointer-events: none; opacity: 0.2;
    background-image:
      repeating-radial-gradient(ellipse at 18% 22%, transparent 0 26px, rgba(36, 68, 52, 0.2) 27px 28px),
      repeating-radial-gradient(ellipse at 85% 8%, transparent 0 38px, rgba(36, 68, 52, 0.2) 39px 40px);
  }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
  svg { width: 52px; height: 52px; color: #0f6b52; }
  h1 { margin: 36px 0 18px; font-size: 88px; line-height: 0.98; letter-spacing: -0.04em; max-width: 950px; }
  p { margin: 0; font-size: 31px; line-height: 1.4; color: #51604f; max-width: 880px; }
</style></head>
<body>
  <div class="terrain"></div>
  <div class="brand">
    ${surfaceMark}
    Kontour Surface
  </div>
  <h1>Show your work.<br>Earn trust.</h1>
  <p>The open trust format that connects evidence provenance to the claims products ask humans and AI agents to trust.</p>
</body></html>`;
}

// Writes the card only when run directly, so tests can import the page.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await mkdir("scripts/pages-extras", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(renderOgImageHtml());
  await page.screenshot({ path: "scripts/pages-extras/og-image.png" });
  await browser.close();
  console.log("Wrote scripts/pages-extras/og-image.png");
}
