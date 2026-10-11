import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4181",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && rm -rf dist/pages-extras && DOCS_SITE_DIR=dist/pages-extras node scripts/build-pages-extras.mjs && python3 -m http.server 4181 --bind 127.0.0.1 --directory dist/pages-extras",
    url: "http://127.0.0.1:4181/viewer.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
