import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const npmCache = path.join(root, ".npm-pack-cache");

test("packed npm artifact installs, imports, and serves modern plus legacy MCP from a fresh consumer", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "surface-package-smoke-"));
  const packDestination = path.join(workspace, "pack");
  const consumer = path.join(workspace, "consumer");

  try {
    await mkdir(packDestination);
    await mkdir(consumer);

    const pack = await execFileAsync(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        packDestination,
        "--cache",
        npmCache,
      ],
      { cwd: root, maxBuffer: 1024 * 1024 * 10 },
    );
    const [packEntry] = parsePackJson(pack.stdout);
    assert.ok(packEntry?.filename, "npm pack should report a tarball filename");

    await writeFile(
      path.join(consumer, "package.json"),
      JSON.stringify({ type: "module", private: true }, null, 2),
    );

    const tarball = path.join(packDestination, packEntry.filename);
    await execFileAsync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--cache",
        npmCache,
        tarball,
      ],
      { cwd: consumer, maxBuffer: 1024 * 1024 * 10 },
    );

    const importCheck = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          "import { TrustBundleBuilder, buildAnswerCardProjection, buildTrustReport, validateTrustBundle, explainClaim } from '@kontourai/surface';",
          "if (typeof TrustBundleBuilder !== 'function') throw new Error('TrustBundleBuilder missing');",
          "if (typeof buildAnswerCardProjection !== 'function') throw new Error('buildAnswerCardProjection missing');",
          "if (typeof buildTrustReport !== 'function') throw new Error('buildTrustReport missing');",
          "if (typeof validateTrustBundle !== 'function') throw new Error('validateTrustBundle missing');",
          "if (typeof explainClaim !== 'function') throw new Error('explainClaim missing');",
          "const root = await import('@kontourai/surface');",
          "if ('composeBasisProjection' in root) throw new Error('basis leaked through root barrel');",
          "const basis = await import('@kontourai/surface/basis');",
          "if (typeof basis.composeBasisProjection !== 'function') throw new Error('basis subpath missing');",
          "const basisView = await import('@kontourai/surface/basis/view');",
          "if (typeof basisView.buildBasisPanelViewModel !== 'function') throw new Error('basis view subpath missing');",
          "const basisMcp = await import('@kontourai/surface/basis/mcp');",
          "if (typeof basisMcp.buildBasisPanelUiResource !== 'function') throw new Error('basis mcp subpath missing');",
          "try {",
          "  await import('@kontourai/surface/dist/src/console/projection.js');",
          "  throw new Error('deep import unexpectedly resolved');",
          "} catch (error) {",
          "  if (!String(error.message).includes('Package subpath')) throw error;",
          "}",
          "console.log('surface import ok');",
        ].join("\n"),
      ],
      { cwd: consumer },
    );
    assert.match(importCheck.stdout, /surface import ok/);

    const installedPackageRoot = path.join(
      consumer,
      "node_modules",
      "@kontourai",
      "surface",
    );
    const indexDeclaration = await readFile(
      path.join(installedPackageRoot, "dist", "src", "index.d.ts"),
      "utf8",
    );
    assert.match(indexDeclaration, /export \* from "\.\/consumer-sdk\.js"/);
    assert.match(indexDeclaration, /export \* from "\.\/answer-card-projection\.js"/);
    assert.match(indexDeclaration, /export \* from "\.\/report\.js"/);
    assert.match(indexDeclaration, /export \* from "\.\/validate\.js"/);
    assert.doesNotMatch(indexDeclaration, /basis/);

    const [
      consumerSdkDeclaration,
      answerCardDeclaration,
      reportDeclaration,
      validateDeclaration,
    ] =
      await Promise.all([
        readFile(
          path.join(installedPackageRoot, "dist", "src", "consumer-sdk.d.ts"),
          "utf8",
        ),
        readFile(
          path.join(
            installedPackageRoot,
            "dist",
            "src",
            "answer-card-projection.d.ts",
          ),
          "utf8",
        ),
        readFile(
          path.join(installedPackageRoot, "dist", "src", "report.d.ts"),
          "utf8",
        ),
        readFile(
          path.join(installedPackageRoot, "dist", "src", "validate.d.ts"),
          "utf8",
        ),
      ]);
    assert.match(consumerSdkDeclaration, /TrustBundleBuilder/);
    assert.match(answerCardDeclaration, /buildAnswerCardProjection/);
    assert.match(reportDeclaration, /buildTrustReport/);
    assert.match(validateDeclaration, /validateTrustBundle/);

    const installedManifest = JSON.parse(
      await readFile(path.join(installedPackageRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    assert.deepEqual(
      installedManifest.dependencies ?? {},
      {},
      "packed Surface must not add required runtime dependencies",
    );

    const bundledNotices = await readFile(
      path.join(
        installedPackageRoot,
        "dist",
        "src",
        "commands",
        "mcp.js.LEGAL.txt",
      ),
      "utf8",
    );
    assert.match(bundledNotices, /@modelcontextprotocol\/server@2\.0\.0 \(MIT\)/);
    assert.match(bundledNotices, /zod@4\.2\.0 \(MIT\)/);
    assert.match(
      bundledNotices,
      /Permission is hereby granted, free of charge/,
    );

    const cliPath = path.join(consumer, "node_modules", ".bin", "surface");
    const cli = await execFileAsync(cliPath, ["--help"], {
      cwd: consumer,
      maxBuffer: 1024 * 1024 * 10,
    });
    assert.match(cli.stdout, /Usage:/);
    assert.match(cli.stdout, /surface report/);

    const installedFixture = path.join(
      installedPackageRoot,
      "examples",
      "surface-example-bundle.json",
    );
    await exerciseInstalledMcp(cliPath, installedFixture, consumer, "modern");
    await exerciseInstalledMcp(cliPath, installedFixture, consumer, "legacy");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function exerciseInstalledMcp(
  cliPath: string,
  fixturePath: string,
  cwd: string,
  era: "modern" | "legacy",
): Promise<void> {
  const server = spawn(cliPath, ["mcp", "--input", fixturePath], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = collectResponses(server.stdout);

  try {
    if (era === "modern") {
      send(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: { _meta: modernMeta() },
      });
      const discover = await responses.next(1);
      assert.deepEqual(discover.result.supportedVersions, ["2026-07-28"]);
      assert.equal(discover.result.resultType, "complete");
    } else {
      send(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "surface-packed-smoke", version: "0.0.0" },
        },
      });
      const initialize = await responses.next(1);
      assert.equal(initialize.result.protocolVersion, "2025-06-18");
      send(server, { jsonrpc: "2.0", method: "notifications/initialized" });
    }

    send(server, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: era === "modern" ? { _meta: modernMeta() } : {},
    });
    const tools = await responses.next(2);
    assert.ok(
      tools.result.tools.some(
        (tool: { name: string }) => tool.name === "surface_summary",
      ),
    );

    send(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        ...(era === "modern" ? { _meta: modernMeta() } : {}),
        name: "surface_summary",
        arguments: {},
      },
    });
    const summary = await responses.next(3);
    assert.equal(summary.result.isError, false);
    assert.match(summary.result.content[0].text, /Kontour Surface report/);

    send(server, {
      jsonrpc: "2.0",
      id: 4,
      method: "resources/read",
      params: {
        ...(era === "modern" ? { _meta: modernMeta() } : {}),
        uri: "ui://surface/trust-panel/summary",
      },
    });
    const resource = await responses.next(4);
    assert.equal(
      resource.result.contents[0].mimeType,
      "text/html;profile=mcp-app",
    );
  } finally {
    server.stdin.end();
    await once(server, "exit");
  }
}

function modernMeta() {
  return {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    },
    "io.modelcontextprotocol/clientInfo": {
      name: "surface-packed-smoke",
      version: "0.0.0",
    },
  };
}

function send(server: ReturnType<typeof spawn>, message: unknown): void {
  server.stdin!.write(`${JSON.stringify(message)}\n`);
}

function collectResponses(stdout: NodeJS.ReadableStream) {
  const byId = new Map<number, any>();
  const waiters = new Map<number, (response: any) => void>();
  const rl = createInterface({ input: stdout });
  rl.on("line", (line) => {
    if (line.trim() === "") return;
    const parsed = JSON.parse(line) as { id?: number };
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
    next(id: number): Promise<any> {
      const existing = byId.get(id);
      if (existing) {
        byId.delete(id);
        return Promise.resolve(existing);
      }
      return new Promise((resolveResponse, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out waiting for packed MCP response ${id}`)),
          15_000,
        );
        waiters.set(id, (response) => {
          clearTimeout(timer);
          resolveResponse(response);
        });
      });
    },
  };
}

function parsePackJson(output: string): Array<{ filename: string }> {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find npm pack JSON in output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1)) as Array<{ filename: string }>;
}
