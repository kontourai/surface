import { defineConfig, devices } from "@playwright/test";

const configuredPort = process.env.SURFACE_PLAYWRIGHT_PORT ?? "4181";
if (!/^[0-9]+$/.test(configuredPort) || Number(configuredPort) < 1 || Number(configuredPort) > 65535) {
  throw new Error("SURFACE_PLAYWRIGHT_PORT must be a port number from 1 to 65535");
}
const baseURL = `http://127.0.0.1:${configuredPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run build && rm -rf dist/pages-extras && DOCS_SITE_DIR=dist/pages-extras node scripts/build-pages-extras.mjs && python3 -m http.server ${configuredPort} --bind 127.0.0.1 --directory dist/pages-extras`,
    url: `${baseURL}/viewer.html`,
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
