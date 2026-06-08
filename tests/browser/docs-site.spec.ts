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
