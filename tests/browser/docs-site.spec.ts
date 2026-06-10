import { expect, test, type Page } from "@playwright/test";

test("renders the Surface homepage with trust vocabulary and navigation", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/index.html");
  const heroGrid = page.locator(".hero-grid");

  await expect(page.locator(".brand")).toHaveText("Kontour Surface");
  await expect(page.getByRole("heading", { name: "Show your work. Earn trust." })).toBeVisible();
  await expect(heroGrid.getByText("Claims", { exact: true })).toBeVisible();
  await expect(heroGrid.getByText("Evidence Trace", { exact: true })).toBeVisible();
  await expect(heroGrid.getByText("Trust Snapshot", { exact: true })).toBeVisible();
  await expect(page.locator(".hero-actions a.button-primary")).toHaveAttribute("href", "getting-started.html");
  expect(consoleErrors).toEqual([]);
});

test("ships page metadata, favicon, and theme colors for sharing and mobile chrome", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/concepts.html");

  await expect(page).toHaveTitle(/Concepts \| Kontour Surface/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /trust vocabulary/i);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Concepts \| Kontour Surface/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Kontour Surface");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /^data:image\/svg\+xml,/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=device-width/);
  expect(consoleErrors).toEqual([]);
});

test("renders transparency spec pages with grouped active navigation", async ({ page }) => {
  test.skip(test.info().project.name === "chromium-mobile", "desktop sidebar navigation check");
  const consoleErrors = await loadDocsPage(page, "/minimum-trust-panel.html");
  const sideNav = page.locator("nav.site-nav");

  await expect(page).toHaveTitle(/Minimum Trust Panel \| Kontour Surface/);
  await expect(page.getByRole("heading", { name: "Minimum Trust Panel" })).toBeVisible();
  await expect(sideNav.locator('a[aria-current="page"]')).toHaveText("Minimum Trust Panel");
  await expect(sideNav.getByRole("heading", { name: "Specs" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/claim|evidence|trust/i);

  await sideNav.getByRole("link", { name: "Minimum Surface Console" }).click();
  await expect(page).toHaveURL(/minimum-surface-console\.html$/);
  await expect(page.getByRole("heading", { name: "Minimum Surface Console" })).toBeVisible();
  await expect(sideNav.locator('a[aria-current="page"]')).toHaveText("Minimum Surface Console");
  expect(consoleErrors).toEqual([]);
});

test("renders developer architecture route with navigation and Mermaid diagrams", async ({ page }) => {
  test.skip(test.info().project.name === "chromium-mobile", "desktop sidebar navigation check");
  const consoleErrors = await loadDocsPage(page, "/developer-architecture.html");

  await expect(page).toHaveTitle(/Developer Architecture \| Kontour Surface/);
  await expect(page.getByRole("heading", { name: "Developer Architecture" })).toBeVisible();
  await expect(page.locator('nav.site-nav a[aria-current="page"]')).toHaveText("Developer Architecture");
  await expect(page.getByRole("main")).toContainText("Flow Agents");
  await expect(page.getByRole("main")).toContainText("Builder Kit");
  await expect(page.getByRole("main").getByRole("link", { name: "Concepts" }).first()).toHaveAttribute("href", "concepts.html");
  const tables = page.locator("article table");
  await expect(tables).toHaveCount(2);
  await expect(tables.nth(0).locator("th").first()).toHaveText("System");
  await expect(tables.nth(1).locator("th").first()).toHaveText("Area");
  const surfaceRow = tables.nth(0).locator("tbody tr").nth(0);
  const veritasRow = tables.nth(0).locator("tbody tr").nth(1);
  await expect(surfaceRow.locator("td").first()).toHaveText("Surface");
  await expect(surfaceRow).toContainText("Trust Reports");
  await expect(surfaceRow).toContainText("Flow gates");
  await expect(veritasRow.locator("td").first()).toHaveText("Veritas");
  await expect(veritasRow).toContainText("governance");
  await expect(veritasRow).toContainText("Surface trust state");
  await expect(page.locator("article ol li")).toHaveCount(5);
  await expect(page.locator("article ol li").first()).toContainText("Concepts");
  await expect(page.locator("pre.mermaid")).toHaveCount(3);
  const mermaidBlocksAreRenderable = await page.locator("pre.mermaid").evaluateAll((blocks) =>
    blocks.every((block) => block.textContent?.includes("flowchart") || block.textContent?.includes("sequenceDiagram") || block.querySelector("svg")),
  );
  expect(mermaidBlocksAreRenderable).toBe(true);
  await expect(page.locator('script[type="module"]')).toHaveCount(1);
  const mermaidScript = await page.locator('script[type="module"]').evaluate((node) => node.textContent ?? "");
  expect(mermaidScript).toContain("mermaid.initialize");
  await expectNoUnsafeHrefs(page);

  await page.locator("nav.site-nav").getByRole("link", { name: "Architecture", exact: true }).click();
  await expect(page).toHaveURL(/architecture\.html$/);
  expect(consoleErrors).toEqual([]);
});

test("maps repo-relative links to GitHub source and keeps hrefs safe", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/getting-started.html");

  await expect(page).toHaveTitle(/Getting Started \| Kontour Surface/);
  await expect(page.getByRole("main").getByRole("link", { name: "External Adapter Example" }).first()).toHaveAttribute(
    "href",
    "https://github.com/kontourai/surface/blob/main/examples/external-adapter/README.md",
  );
  await expect(page.getByRole("main").getByRole("link", { name: "Concepts" }).first()).toHaveAttribute("href", "concepts.html");
  await expect(page.locator('article a[href^="../"]')).toHaveCount(0);
  await expectNoUnsafeHrefs(page);
  expect(consoleErrors).toEqual([]);
});

test("snapshot viewer renders a sample report through the trust panel element", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/viewer.html");

  await expect(page.getByRole("heading", { name: "Trust Snapshot Viewer" })).toBeVisible();
  await page.getByRole("button", { name: "Load sample report" }).click();

  const panel = page.locator("surface-trust-panel");
  await expect(panel.locator(".panel-title")).toHaveText("Surface Transparency");
  await expect(panel.locator(".chip").first()).toBeVisible();
  await expect(panel.locator("details.claim")).toHaveCount(4);

  const firstClaim = panel.locator("details.claim").first();
  await firstClaim.locator("summary").click();
  await expect(firstClaim.locator(".claim-body")).toContainText("Evidence");

  await page.locator("#viewer-input").fill('{"claims": "not-an-array"}');
  await expect(panel.locator(".error")).toContainText("does not look like a trust report");
  expect(consoleErrors).toEqual([]);
});

test("keeps docs navigation and primary content inside the mobile viewport", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium-mobile", "mobile-only layout check");
  const consoleErrors = await loadDocsPage(page, "/index.html");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("nav.site-nav")).toBeHidden();

  const mobileNav = page.locator("details.mobile-nav");
  await expect(mobileNav).toBeVisible();
  await mobileNav.locator("summary").click();
  const gettingStartedLink = mobileNav.getByRole("link", { name: "Getting Started" });
  await expect(gettingStartedLink).toBeVisible();
  const linkBox = await gettingStartedLink.boundingBox();
  expect(linkBox).not.toBeNull();
  if (linkBox) {
    expect(linkBox.height).toBeGreaterThanOrEqual(44);
  }

  const viewport = page.viewportSize();
  const headerBox = await page.locator("header").boundingBox();
  const mainBox = await page.locator("main").boundingBox();
  expect(viewport).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(mainBox).not.toBeNull();

  if (viewport && headerBox && mainBox) {
    expect(headerBox.x).toBeGreaterThanOrEqual(0);
    expect(mainBox.x).toBeGreaterThanOrEqual(0);
    expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(mainBox.x + mainBox.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  expect(consoleErrors).toEqual([]);
});

test("avoids horizontal overflow on table- and code-heavy pages at mobile width", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium-mobile", "mobile-only layout check");

  for (const path of ["/schemas.html", "/cli.html", "/use-cases.html", "/viewer.html"]) {
    const consoleErrors = await loadDocsPage(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
    expect(consoleErrors).toEqual([]);
  }
});

async function loadDocsPage(page: Page, path: string): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto(path);
  await expect(page.locator("body")).toBeVisible();
  return consoleErrors;
}

async function expectNoUnsafeHrefs(page: Page): Promise<void> {
  const unsafeHrefs = await page.locator("a[href]").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => /^(javascript|data|vbscript):/i.test(href) || href.startsWith("//")),
  );
  expect(unsafeHrefs).toEqual([]);
}
