import { expect, test, type Page } from "@playwright/test";

test("renders the Surface homepage with trust vocabulary and navigation", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/index.html");
  const heroGrid = page.locator(".hero-grid");

  await expect(page.locator(".brand")).toHaveText("Kontour Surface");
  await expect(page.getByRole("heading", { name: "Show your work. Earn trust." })).toBeVisible();
  await expect(heroGrid.getByText("Claims", { exact: true })).toBeVisible();
  await expect(heroGrid.getByText("Evidence Trace", { exact: true })).toBeVisible();
  await expect(heroGrid.getByText("Trust Snapshot", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Minimum Trust Panel" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Minimum Surface Console" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("renders transparency spec pages with active navigation", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/minimum-trust-panel.html");

  await expect(page).toHaveTitle(/Minimum Trust Panel \| Kontour Surface/);
  await expect(page.getByRole("heading", { name: "Minimum Trust Panel" })).toBeVisible();
  await expect(page.locator("nav a[aria-current='page']")).toHaveText("Minimum Trust Panel");
  await expect(page.getByRole("main")).toContainText(/claim|evidence|trust/i);

  await page.getByRole("navigation").getByRole("link", { name: "Minimum Surface Console" }).click();
  await expect(page).toHaveURL(/minimum-surface-console\.html$/);
  await expect(page.getByRole("heading", { name: "Minimum Surface Console" })).toBeVisible();
  await expect(page.locator("nav a[aria-current='page']")).toHaveText("Minimum Surface Console");
  expect(consoleErrors).toEqual([]);
});

test("renders developer architecture route with navigation and Mermaid diagrams", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/developer-architecture.html");

  await expect(page).toHaveTitle(/Developer Architecture \| Kontour Surface/);
  await expect(page.getByRole("heading", { name: "Developer Architecture" })).toBeVisible();
  await expect(page.locator("nav a[aria-current='page']")).toHaveText("Developer Architecture");
  await expect(page.getByRole("main")).toContainText("Flow Agents");
  await expect(page.getByRole("main")).toContainText("Builder Kit");
  await expect(page.getByRole("main").getByRole("link", { name: "Concepts" }).first()).toHaveAttribute("href", "concepts.html");
  await expect(page.getByRole("main").getByRole("link", { name: "Resource Contract Audit" }).first()).toHaveAttribute(
    "href",
    "resource-contract-audit.html",
  );
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

  await page.getByRole("navigation").getByRole("link", { name: "Architecture", exact: true }).click();
  await expect(page).toHaveURL(/architecture\.html$/);
  await page.getByRole("navigation").getByRole("link", { name: "Developer Architecture" }).click();
  await expect(page).toHaveURL(/developer-architecture\.html$/);
  expect(consoleErrors).toEqual([]);
});

test("renders Resource Contract Audit tables and source links safely", async ({ page }) => {
  const consoleErrors = await loadDocsPage(page, "/resource-contract-audit.html");

  await expect(page).toHaveTitle(/Resource Contract Audit \| Kontour Surface/);
  await expect(page.getByRole("heading", { name: "Resource Contract Audit" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "CLI" }).first()).toHaveAttribute("href", "cli.html");
  await expect(page.getByRole("main").getByRole("link", { name: "Surface Console" }).first()).toHaveAttribute(
    "href",
    "https://github.com/kontourai/surface/blob/main/docs/reference/console.md",
  );
  await expect(page.getByRole("main").getByRole("link", { name: "src/types.ts" }).first()).toHaveAttribute(
    "href",
    "https://github.com/kontourai/surface/blob/main/src/types.ts",
  );
  await expect(page.getByRole("main").getByRole("link", { name: "schemas/" }).first()).toHaveAttribute(
    "href",
    "https://github.com/kontourai/surface/blob/main/schemas/",
  );

  const cliRow = page.locator("article table tbody tr").filter({ hasText: "CLI report JSON and query outputs" });
  await expect(cliRow).toHaveCount(1);
  await expect(cliRow.locator("td")).toHaveCount(6);
  await expect(cliRow.locator("td").nth(2)).toContainText("json|summary|linked|analytics");
  await expect(page.locator('article a[href="console.md"]')).toHaveCount(0);
  await expect(page.locator('article a[href^="../src"]')).toHaveCount(0);
  await expect(page.locator('article a[href^="../schemas"]')).toHaveCount(0);
  await expect(page.locator('article a[href^="../examples"]')).toHaveCount(0);
  await expectNoUnsafeHrefs(page);
  expect(consoleErrors).toEqual([]);
});

test("keeps docs navigation and primary content inside the mobile viewport", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium-mobile", "mobile-only layout check");
  const consoleErrors = await loadDocsPage(page, "/index.html");

  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();

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
