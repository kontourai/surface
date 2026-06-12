/**
 * Browser-level tests for the MCP UI trust panel resource produced by
 * src/mcp-ui/trust-panel-resource.ts.
 *
 * Each test spawns the real MCP server over stdio (the same path as hosts
 * receive), extracts the HTML resource from a tool result, and renders it via
 * page.setContent — exercising the full round-trip without any external
 * network traffic.
 */
import { expect, test, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------------------
// MCP stdio helpers (mirrors the pattern in tests/mcp.test.ts)
// ---------------------------------------------------------------------------

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string | null;
  result?: { content?: unknown[]; isError?: boolean; [k: string]: unknown };
  error?: { code: number; message: string };
}

function mcpSend(server: ReturnType<typeof spawn>, message: unknown): void {
  server.stdin!.write(`${JSON.stringify(message)}\n`);
}

function collectMcpResponses(stdout: NodeJS.ReadableStream) {
  const byId = new Map<number, JsonRpcResponse>();
  const waiters = new Map<number, (r: JsonRpcResponse) => void>();
  const rl = createInterface({ input: stdout });
  rl.on("line", (line) => {
    if (line.trim() === "") return;
    const parsed = JSON.parse(line) as JsonRpcResponse;
    if (typeof parsed.id !== "number") return;
    const waiter = waiters.get(parsed.id);
    if (waiter) {
      waiters.delete(parsed.id);
      waiter(parsed);
    } else {
      byId.set(parsed.id, parsed);
    }
  });
  return {
    next(id: number): Promise<JsonRpcResponse> {
      const existing = byId.get(id);
      if (existing) {
        byId.delete(id);
        return Promise.resolve(existing);
      }
      return new Promise((res, rej) => {
        const timer = setTimeout(
          () => rej(new Error(`Timed out waiting for MCP response id=${id}`)),
          15_000,
        );
        waiters.set(id, (r) => {
          clearTimeout(timer);
          res(r);
        });
      });
    },
  };
}

/** Spawn the surface MCP server and perform the initialise handshake. */
async function startMcpServer(inputPath: string): Promise<{
  server: ReturnType<typeof spawn>;
  responses: ReturnType<typeof collectMcpResponses>;
  nextId: () => number;
  stop: () => Promise<void>;
}> {
  const server = spawn(
    process.execPath,
    ["bin/surface.mjs", "mcp", "--input", inputPath],
    { cwd: resolve("."), stdio: ["pipe", "pipe", "inherit"] },
  );
  const responses = collectMcpResponses(server.stdout!);
  let idCounter = 0;
  const nextId = () => ++idCounter;

  // Handshake
  const initId = nextId();
  mcpSend(server, {
    jsonrpc: "2.0",
    id: initId,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "browser-spec-helper", version: "0.0.0" },
    },
  });
  await responses.next(initId);
  mcpSend(server, { jsonrpc: "2.0", method: "notifications/initialized" });

  return {
    server,
    responses,
    nextId,
    stop: async () => {
      server.stdin!.end();
      await Promise.race([
        once(server, "exit"),
        new Promise<void>((res) => setTimeout(res, 2000)).then(() => server.kill("SIGKILL")),
      ]);
    },
  };
}

/** Extract the HTML from the UI resource entry (content[1]) of a tool result. */
function extractUiHtml(response: JsonRpcResponse): string {
  const content = response.result?.content as Array<{
    type: string;
    resource?: { text?: string; uri?: string };
  }>;
  if (!Array.isArray(content) || content.length < 2) {
    throw new Error(
      `Expected at least 2 content entries, got ${JSON.stringify(response.result?.content)}`,
    );
  }
  const resource = content[1];
  if (resource.type !== "resource" || typeof resource.resource?.text !== "string") {
    throw new Error(`content[1] is not a resource with text: ${JSON.stringify(resource)}`);
  }
  return resource.resource.text;
}

function extractUiUri(response: JsonRpcResponse): string {
  const content = response.result?.content as Array<{
    type: string;
    resource?: { uri?: string };
  }>;
  return content?.[1]?.resource?.uri ?? "";
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

interface ConsoleErrorCollector {
  errors: string[];
}

function collectConsoleErrors(page: Page): ConsoleErrorCollector {
  const col: ConsoleErrorCollector = { errors: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") col.errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    col.errors.push(err.message);
  });
  return col;
}

/**
 * Load the MCP UI HTML into the page and wait for the <surface-trust-panel>
 * custom element to be both defined and rendered.
 *
 * We use waitUntil: "load" so that the <script type="module"> block has
 * completed before setContent resolves — module scripts are deferred and run
 * before the load event, so this is safe.
 */
async function renderTrustPanelHtml(page: Page, html: string): Promise<void> {
  await page.setContent(html, { waitUntil: "load" });
  // The connectedCallback renders synchronously, but give a short wait for
  // the shadow DOM to be populated.
  await page.waitForFunction(
    () => {
      const el = document.querySelector("surface-trust-panel");
      return (
        typeof customElements !== "undefined" &&
        customElements.get("surface-trust-panel") !== undefined &&
        el?.shadowRoot?.querySelector(".panel") !== null
      );
    },
    { timeout: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// The example bundle path (used by tests 1–3)
// ---------------------------------------------------------------------------
const EXAMPLE_BUNDLE = resolve("examples/surface-example-bundle.json");

// ---------------------------------------------------------------------------
// Test 1 — RENDER: summary resource from surface_summary
// ---------------------------------------------------------------------------
test(
  "renders surface_summary MCP UI resource: element upgrades, claims visible, no console errors, no external requests",
  async ({ page }) => {
    const col = collectConsoleErrors(page);

    // Track any external network requests (the resource must be self-contained).
    // setContent uses about:blank as the document URL; the only "requests" fired
    // are the document itself plus any resources the page tries to load.
    const externalRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.startsWith("about:") && !url.startsWith("data:") && url !== "") {
        externalRequests.push(url);
      }
    });

    const mcp = await startMcpServer(EXAMPLE_BUNDLE);
    let html: string;
    try {
      const id = mcp.nextId();
      mcpSend(mcp.server, {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "surface_summary", arguments: {} },
      });
      const resp = await mcp.responses.next(id);
      expect(resp.result?.isError).toBe(false);
      html = extractUiHtml(resp);
    } finally {
      await mcp.stop();
    }

    // Sanity check on the HTML itself before rendering.
    expect(html).toContain("<surface-trust-panel>");
    expect(html).toContain("surface-report-data");

    await renderTrustPanelHtml(page, html);

    // 1. Custom element is defined.
    const isDefined = await page.evaluate(
      () => customElements.get("surface-trust-panel") !== undefined,
    );
    expect(isDefined).toBe(true);

    // 2. Panel title is rendered inside the shadow DOM.
    const panelTitle = await page.evaluate(() => {
      const el = document.querySelector("surface-trust-panel");
      return el?.shadowRoot?.querySelector(".panel-title")?.textContent ?? null;
    });
    expect(panelTitle).toBe("Surface Trust Panel");

    // 3. Claim fields from the example bundle are visible.
    const shadowText = await page.evaluate(() => {
      const el = document.querySelector("surface-trust-panel");
      return el?.shadowRoot?.textContent ?? "";
    });
    expect(shadowText).toContain("registrationStatus");
    expect(shadowText).toContain("field-attested-records");

    // 4. At least one status chip is rendered.
    const chipCount = await page.evaluate(() => {
      const el = document.querySelector("surface-trust-panel");
      return el?.shadowRoot?.querySelectorAll(".chip").length ?? 0;
    });
    expect(chipCount).toBeGreaterThan(0);

    // 5. No console errors.
    expect(col.errors).toEqual([]);

    // 6. No external network requests (self-contained HTML).
    expect(externalRequests).toEqual([]);
  },
);

// ---------------------------------------------------------------------------
// Test 2 — CLAIM VARIANT: surface_get_claim resource
// ---------------------------------------------------------------------------
test(
  "renders surface_get_claim MCP UI resource: claim-specific content visible in shadow root",
  async ({ page }) => {
    const col = collectConsoleErrors(page);
    const externalRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.startsWith("about:") && !url.startsWith("data:") && url !== "") {
        externalRequests.push(url);
      }
    });

    const mcp = await startMcpServer(EXAMPLE_BUNDLE);
    let html: string;
    let claimUri: string;
    try {
      const id = mcp.nextId();
      const claimId = "claim.field-attested-records.registration-status";
      mcpSend(mcp.server, {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "surface_get_claim", arguments: { claimId } },
      });
      const resp = await mcp.responses.next(id);
      expect(resp.result?.isError).toBe(false);
      html = extractUiHtml(resp);
      claimUri = extractUiUri(resp);
    } finally {
      await mcp.stop();
    }

    // URI must encode the claim id.
    expect(claimUri).toMatch(/trust-panel\/claim-.*registration-status/);

    await renderTrustPanelHtml(page, html);

    // Claim field content is visible in the shadow DOM.
    const shadowText = await page.evaluate(() => {
      const el = document.querySelector("surface-trust-panel");
      return el?.shadowRoot?.textContent ?? "";
    });
    expect(shadowText).toContain("registrationStatus");

    // Evidence excerpt is present.
    expect(shadowText).toContain("Registration is open");

    // No console errors, no external network requests.
    expect(col.errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  },
);

// ---------------------------------------------------------------------------
// Test 3 — THEME: light vs dark CSS custom-property tokens differ
// ---------------------------------------------------------------------------
test(
  "applies light-mode tokens by default and dark-mode tokens when prefers-color-scheme is dark",
  async ({ page, browserName }) => {
    // emulateMedia for color scheme is reliable on Chromium; skip other browsers.
    if (browserName !== "chromium") {
      test.skip();
      return;
    }

    const mcp = await startMcpServer(EXAMPLE_BUNDLE);
    let html: string;
    try {
      const id = mcp.nextId();
      mcpSend(mcp.server, {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "surface_summary", arguments: {} },
      });
      const resp = await mcp.responses.next(id);
      html = extractUiHtml(resp);
    } finally {
      await mcp.stop();
    }

    // ---- Light mode ----
    await page.emulateMedia({ colorScheme: "light" });
    await renderTrustPanelHtml(page, html);

    const lightTokens = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        panel: styles.getPropertyValue("--k-panel").trim(),
        text: styles.getPropertyValue("--k-text").trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });

    // ---- Dark mode ----
    await page.emulateMedia({ colorScheme: "dark" });
    await renderTrustPanelHtml(page, html);

    const darkTokens = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        panel: styles.getPropertyValue("--k-panel").trim(),
        text: styles.getPropertyValue("--k-text").trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });

    // Light panel background token.
    expect(lightTokens.panel).toBe("#fffcf1");
    // Dark panel background token.
    expect(darkTokens.panel).toBe("#141c17");

    // Text token must differ between modes.
    expect(lightTokens.text).not.toBe(darkTokens.text);
    // Body background colour must differ.
    expect(lightTokens.bodyBg).not.toBe(darkTokens.bodyBg);
  },
);

// ---------------------------------------------------------------------------
// Test 4 — HOSTILE INPUT: XSS payloads in claim fields must not execute
// ---------------------------------------------------------------------------

const HOSTILE_CLAIM_ID = "claim.hostile.xss-check";
const HOSTILE_FIELD = "</script><script>window.__pwned=1</script>";
const HOSTILE_VALUE = '<img src=x onerror="window.__pwned=2">';

function hostileBundle(): string {
  return JSON.stringify(
    {
      schemaVersion: 3,
      source: "hostile-test-source",
      claims: [
        {
          id: HOSTILE_CLAIM_ID,
          subjectType: "test-subject",
          subjectId: "hostile-test-subject:xss",
          surface: "hostile.test-surface",
          claimType: "test-claim",
          fieldOrBehavior: HOSTILE_FIELD,
          value: HOSTILE_VALUE,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      evidence: [],
      policies: [],
      events: [],
    },
    null,
    2,
  );
}

test(
  "hostile XSS payloads in claim fields are rendered as escaped text, not executed",
  async ({ page }) => {
    const col = collectConsoleErrors(page);

    // Write hostile bundle to a temp file so the real MCP server can load it.
    const tmpDir = await mkdtemp(join(tmpdir(), "surface-hostile-"));
    const bundlePath = join(tmpDir, "hostile-bundle.json");
    try {
      await writeFile(bundlePath, hostileBundle(), "utf8");

      const mcp = await startMcpServer(bundlePath);
      let html: string;
      try {
        const summaryId = mcp.nextId();
        mcpSend(mcp.server, {
          jsonrpc: "2.0",
          id: summaryId,
          method: "tools/call",
          params: { name: "surface_summary", arguments: {} },
        });
        const summaryResp = await mcp.responses.next(summaryId);
        // Claims with no events will be status "unknown" — still a valid report.
        expect(summaryResp.result?.isError).toBe(false);
        html = extractUiHtml(summaryResp);
      } finally {
        await mcp.stop();
      }

      // --- Static checks on the HTML string before rendering ---

      // The JSON island must NOT contain literal "</script><script>" — the
      // safeJsonStringify helper escapes < and > as Unicode escapes.
      expect(html).not.toContain("</script><script>");
      // The hostile img tag must also be escaped in the JSON island.
      expect(html).not.toMatch(/<img\s+src=x\s+onerror=/);

      // --- Render and check for XSS execution ---
      await renderTrustPanelHtml(page, html);

      // XSS must not have fired — __pwned must remain undefined.
      const pwned = await page.evaluate(
        () => (window as unknown as Record<string, unknown>)["__pwned"],
      );
      expect(pwned).toBeUndefined();

      // The hostile strings must be visible as literal text in the shadow DOM
      // (HTML-escaped by the trust panel's escapeHtml function).
      const shadowText = await page.evaluate(() => {
        const el = document.querySelector("surface-trust-panel");
        return el?.shadowRoot?.textContent ?? "";
      });
      expect(shadowText).toContain("</script><script>window.__pwned=1</script>");
      expect(shadowText).toContain('<img src=x onerror="window.__pwned=2">');

      // No console errors (page errors would indicate eval/CSP violations).
      expect(col.errors).toEqual([]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  },
);
