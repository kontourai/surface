import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const npmCache = path.join(root, ".npm-pack-cache");

// This file lives in tests/serial/ and must not run concurrently with the
// main suite: `npm pack` runs the `prepare` script even with
// `--ignore-scripts` (npm/cli behavior), and `prepare` rebuilds dist/ with
// `rm -rf`. Packing while parallel test processes are loading modules from
// dist/ makes them fail with ENOENT mid-run.

test("external adapter example builds and uses the public SDK", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "surface-external-adapter-"));
  const packDestination = path.join(workspace, "pack");
  const adapterExample = path.join(workspace, "external-adapter");

  try {
    await mkdir(packDestination);
    await cp(path.join(root, "examples", "external-adapter"), adapterExample, {
      recursive: true,
      filter: (source) => !source.split(path.sep).includes("node_modules") && !source.split(path.sep).includes("dist"),
    });
    await writeFile(
      path.join(adapterExample, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {},
        },
        null,
        2
      )
    );

    const pack = await execFileAsync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", packDestination, "--cache", npmCache],
      { cwd: root, maxBuffer: 1024 * 1024 * 10 }
    );
    const [packEntry] = parsePackJson(pack.stdout);
    assert.ok(packEntry?.filename, "npm pack should report a tarball filename");

    await execFileAsync(
      "npm",
      [
        "install",
        "--no-save",
        "--package-lock=false",
        "--omit=dev",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--cache",
        npmCache,
        path.join(packDestination, packEntry.filename),
      ],
      { cwd: adapterExample, maxBuffer: 1024 * 1024 * 10 }
    );

    await execFileAsync(
      path.join(root, "node_modules", ".bin", "tsc"),
      ["-p", path.join(adapterExample, "tsconfig.json"), "--typeRoots", path.join(root, "node_modules", "@types")],
      { cwd: root }
    );

    const { stdout } = await execFileAsync("node", ["dist/index.js"], {
      cwd: adapterExample,
    });
    const result = JSON.parse(stdout);

    assert.equal(result.source, "external-ticket-system:demo");
    assert.equal(result.totalClaims, 1);
    assert.equal(result.verified, 1);
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
