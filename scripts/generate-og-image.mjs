// Regenerates the static Open Graph card committed at
// scripts/pages-site/assets/og-image.png (copied to docs-site/ by the docs
// build). Run manually after brand changes: node scripts/generate-og-image.mjs
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const html = `<!doctype html>
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
      <path d="M12 4.5c4.7 0 8 2.6 8 6.1 0 4.2-3.9 8.9-8 8.9s-8-4.7-8-8.9c0-3.5 3.3-6.1 8-6.1Z"/>
      <path d="M12 8.1c2.8 0 4.8 1.4 4.8 3.4 0 2.4-2.2 5-4.8 5s-4.8-2.6-4.8-5c0-2 2-3.4 4.8-3.4Z"/>
      <path d="M12 11.6c1 0 1.7.5 1.7 1.2 0 .9-.8 1.8-1.7 1.8s-1.7-.9-1.7-1.8c0-.7.7-1.2 1.7-1.2Z"/>
    </svg>
    Kontour Surface
  </div>
  <h1>Show your work.<br>Earn trust.</h1>
  <p>The open trust format that connects evidence provenance to the claims products ask humans and AI agents to trust.</p>
</body></html>`;

await mkdir("scripts/pages-site/assets", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: "scripts/pages-site/assets/og-image.png" });
await browser.close();
console.log("Wrote scripts/pages-site/assets/og-image.png");
