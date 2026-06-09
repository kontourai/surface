import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const npmCache = path.join(root, ".npm-pack-cache");

test("packed npm artifact installs, imports, and exposes the CLI from a fresh consumer", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "surface-package-smoke-"));
  const packDestination = path.join(workspace, "pack");
  const consumer = path.join(workspace, "consumer");

  try {
    await mkdir(packDestination);
    await mkdir(consumer);

    const pack = await execFileAsync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", packDestination, "--cache", npmCache],
      { cwd: root, maxBuffer: 1024 * 1024 * 10 }
    );
    const [packEntry] = parsePackJson(pack.stdout);
    assert.ok(packEntry?.filename, "npm pack should report a tarball filename");

    await writeFile(
      path.join(consumer, "package.json"),
      JSON.stringify({ type: "module", private: true }, null, 2)
    );

    const tarball = path.join(packDestination, packEntry.filename);
    await execFileAsync(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", npmCache, tarball],
      { cwd: consumer, maxBuffer: 1024 * 1024 * 10 }
    );

    const importCheck = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          "import { TrustInputBuilder, buildTrustReport, validateTrustInput } from '@kontourai/surface';",
          "if (typeof TrustInputBuilder !== 'function') throw new Error('TrustInputBuilder missing');",
          "if (typeof buildTrustReport !== 'function') throw new Error('buildTrustReport missing');",
          "if (typeof validateTrustInput !== 'function') throw new Error('validateTrustInput missing');",
          "try {",
          "  await import('@kontourai/surface/dist/src/console/projection.js');",
          "  throw new Error('deep import unexpectedly resolved');",
          "} catch (error) {",
          "  if (!String(error.message).includes('Package subpath')) throw error;",
          "}",
          "console.log('surface import ok');",
        ].join("\n"),
      ],
      { cwd: consumer }
    );
    assert.match(importCheck.stdout, /surface import ok/);

    const indexDeclaration = await readFile(
      path.join(consumer, "node_modules", "@kontourai", "surface", "dist", "src", "index.d.ts"),
      "utf8"
    );
    assert.match(indexDeclaration, /export \* from "\.\/consumer-sdk\.js"/);
    assert.match(indexDeclaration, /export \* from "\.\/report\.js"/);
    assert.match(indexDeclaration, /export \* from "\.\/validate\.js"/);

    const [consumerSdkDeclaration, reportDeclaration, validateDeclaration] = await Promise.all([
      readFile(path.join(consumer, "node_modules", "@kontourai", "surface", "dist", "src", "consumer-sdk.d.ts"), "utf8"),
      readFile(path.join(consumer, "node_modules", "@kontourai", "surface", "dist", "src", "report.d.ts"), "utf8"),
      readFile(path.join(consumer, "node_modules", "@kontourai", "surface", "dist", "src", "validate.d.ts"), "utf8"),
    ]);
    assert.match(consumerSdkDeclaration, /TrustInputBuilder/);
    assert.match(reportDeclaration, /buildTrustReport/);
    assert.match(validateDeclaration, /validateTrustInput/);

    const cli = await execFileAsync(
      path.join(consumer, "node_modules", ".bin", "surface"),
      ["--help"],
      { cwd: consumer, maxBuffer: 1024 * 1024 * 10 }
    );
    assert.match(cli.stdout, /Usage:/);
    assert.match(cli.stdout, /surface report/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

function parsePackJson(output: string): Array<{ filename: string }> {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find npm pack JSON in output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1)) as Array<{ filename: string }>;
}
