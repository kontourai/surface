import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

test("renders standalone Surface Console with embedded Console Kit tokens", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  const consoleServer = await startSurfaceConsole();

  try {
    await page.goto(consoleServer.url);

    await expect(page).toHaveTitle("Surface Console");
    await expect(page.locator("body.console-page.theme-surface")).toBeVisible();
    await expect(page.locator("#projectName")).toHaveText("Kontour Surface");
    await expect(page.locator("#runLabel")).toHaveText("browser-fixture");
    await expect(page.locator("#consoleMetrics [data-metric-filter='all']")).toContainText("Claims");
    await expect(page.locator("#claimFeed .claim-card")).toHaveCount(2);
    await expect(page.locator("#claimFeed")).toContainText("npm test");
    await expect(page.locator("#attentionChip")).toBeVisible();

    // Theme toggle is present in the header
    await expect(page.locator("#themeToggle")).toBeVisible();

    const tokenState = await page.evaluate(() => {
      const styles = getComputedStyle(document.body);
      return {
        brand: styles.getPropertyValue("--k-brand").trim(),
        kBg: styles.getPropertyValue("--k-bg").trim(),
        bgAlias: styles.getPropertyValue("--bg").trim(),
        uiFont: styles.getPropertyValue("--k-font-ui").trim(),
        bodyBackground: styles.backgroundColor,
        bodyFont: styles.fontFamily,
        fitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });

    expect(tokenState.brand).toMatch(/^#(?:14a37a|0f6b52)$/);
    expect(tokenState.bgAlias).toBe(tokenState.kBg);
    expect(tokenState.uiFont).toContain("Inter");
    expect(tokenState.bodyFont).toContain("Inter");
    expect(tokenState.bodyBackground).not.toBe("");
    expect(tokenState.fitsViewport).toBe(true);
    expect(consoleErrors).toEqual([]);
  } finally {
    await consoleServer.stop();
  }
});

test("theme toggle flips data-theme attribute and persists across reload", async ({ page }) => {
  const consoleServer = await startSurfaceConsole();

  try {
    await page.goto(consoleServer.url);

    // Read initial theme
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(["light", "dark"]).toContain(initialTheme);

    // Click toggle
    await page.locator("#themeToggle").click();

    // Theme should have flipped
    const flippedTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(flippedTheme).not.toBe(initialTheme);
    expect(["light", "dark"]).toContain(flippedTheme);

    // Persisted in localStorage
    const stored = await page.evaluate(() =>
      localStorage.getItem("surface-theme")
    );
    expect(stored).toBe(flippedTheme);

    // Reload — should restore the flipped theme
    await page.reload();
    const themeAfterReload = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(themeAfterReload).toBe(flippedTheme);
  } finally {
    await consoleServer.stop();
  }
});

test("empty state renders with producer command against zero-claim fixture", async ({ page }) => {
  const consoleServer = await startSurfaceConsole({ emptyClaims: true });

  try {
    await page.goto(consoleServer.url);

    // The designed empty state should be visible
    await expect(page.locator("#emptyStateSetup")).toBeVisible();
    // It should contain the producer command
    await expect(page.locator("#emptyStateCmd")).toBeVisible();
    await expect(page.locator("#emptyStateCmd")).toContainText("npx surface console");
    // Copy button should be present
    await expect(page.locator(".empty-setup-copy-btn")).toBeVisible();
    // Descriptive body text
    await expect(page.locator(".empty-setup-body")).toBeVisible();
  } finally {
    await consoleServer.stop();
  }
});

function collectConsoleErrors(page: Page): string[] {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  return consoleErrors;
}

async function startSurfaceConsole(opts: { emptyClaims?: boolean } = {}): Promise<{ url: string; stop: () => Promise<void> }> {
  const port = await getFreePort();
  const dir = await mkdtemp(join(tmpdir(), "surface-console-browser-"));
  const readModelPath = join(dir, "latest.console.json");
  const storePath = join(dir, "veritas.claims.json");
  await writeFile(readModelPath, `${JSON.stringify(opts.emptyClaims ? consoleReadModelEmpty() : consoleReadModel(), null, 2)}\n`);

  const child = spawn(
    process.execPath,
    ["bin/surface.mjs", "console", "--read-model", readModelPath, "--store", storePath, "--port", String(port)],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  try {
    await waitForConsole(`http://127.0.0.1:${port}/api/console-model`, child, () => output);
  } catch (error) {
    child.kill("SIGTERM");
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  return {
    url: `http://127.0.0.1:${port}/`,
    stop: async () => {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1500)).then(() => child.kill("SIGKILL")),
      ]);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function waitForConsole(url: string, child: ChildProcess, output: () => string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (child.exitCode !== null) {
      throw new Error(`Surface Console exited early with code ${child.exitCode}:\n${output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error(`Surface Console did not start within 15s:\n${output()}`);
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  return address.port;
}

function consoleReadModel() {
  return {
    producer: {
      runId: "browser-fixture",
      timestamp: "2026-06-09T12:00:00.000Z",
      sourceKind: "working-tree",
      sourceScope: ["staged", "unstaged", "untracked"],
    },
    summary: {
      claimCount: 2,
      statusCounts: { verified: 1, stale: 1 },
      transparencyGapCount: 1,
      attentionClaimIds: ["claim.surface.npm-test"],
      surfaceCounts: { "surface.console": 2 },
    },
    claims: [
      {
        id: "claim.surface.types",
        status: "verified",
        surface: "surface.console",
        claimType: "build",
        fieldOrBehavior: "TypeScript declarations",
        subjectType: "repository",
        subjectId: "kontour-surface",
        evidence: [{ excerptOrSummary: "Declarations emitted successfully." }],
        verificationPolicyId: "policy.build",
      },
      {
        id: "claim.surface.npm-test",
        status: "stale",
        surface: "surface.console",
        claimType: "test",
        fieldOrBehavior: "npm test",
        subjectType: "repository",
        subjectId: "kontour-surface",
        transparencyGapIds: ["gap.npm-test.stale"],
        evidence: [{ excerptOrSummary: "Last test evidence is stale." }],
        verificationPolicyId: "policy.test",
      },
    ],
  };
}

function consoleReadModelEmpty() {
  return {
    producer: {
      runId: "browser-fixture-empty",
      timestamp: "2026-06-09T12:00:00.000Z",
      sourceKind: "working-tree",
      sourceScope: ["staged"],
    },
    summary: {
      claimCount: 0,
      statusCounts: {},
      transparencyGapCount: 0,
      attentionClaimIds: [],
      surfaceCounts: {},
    },
    claims: [],
  };
}
