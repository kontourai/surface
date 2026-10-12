import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflowPath = ".github/workflows/publish-npm.yml";
const verifierPath = "scripts/verify-release-trust-bundle.sh";

async function makeFakeCosign(directory: string): Promise<string> {
  const fakeCosignPath = join(directory, "fake-cosign.sh");
  await writeFile(fakeCosignPath, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "printf '%s\\n' \"$@\" > \"$COSIGN_CAPTURE\"",
    "exit \"${COSIGN_EXIT_CODE:-0}\"",
    "",
  ].join("\n"));
  await chmod(fakeCosignPath, 0o755);
  return fakeCosignPath;
}

function runVerifier(bundleDirectory: string, env: NodeJS.ProcessEnv) {
  return spawnSync(verifierPath, [bundleDirectory], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("publish workflow always runs the fail-closed verifier without absolute hashFiles", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const verificationStep = workflow.match(/- name: Verify signature with cosign \(fail-closed\)([\s\S]*?)(?=\n      - name: Upload to GitHub Release)/)?.[1];

  assert.equal(workflow.includes("hashFiles("), false);
  assert.ok(verificationStep, "the verification step must precede release upload");
  assert.equal(/^\s+if:/m.test(verificationStep), false);
  assert.match(verificationStep, /run: scripts\/verify-release-trust-bundle\.sh \/tmp\/surface-trust-bundle/);
  assert.match(verificationStep, /working-directory: surface/);
});

async function ancestryStepScript(): Promise<string> {
  const workflow = await readFile(workflowPath, "utf8");
  const block = workflow.match(/- name: Verify Tagged Commit Is On Main\n {8}run: \|\n((?: {10}.*\n|\n)+)/)?.[1];
  assert.ok(block, "the publish workflow must keep its main-ancestry step");
  return block.split("\n").map((line) => line.slice(10)).join("\n");
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "init.defaultBranch=main", "-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

test("main-ancestry check does not shallow-fetch main", async () => {
  const commands = (await ancestryStepScript()).split("\n").filter((line) => !line.trimStart().startsWith("#"));
  assert.equal(commands.some((line) => /git fetch\b.*--depth/.test(line)), false);
});

// A dispatch checks out the tag with full history; main has usually moved on
// since. The step must accept a tagged commit behind main's tip and still
// refuse one that is not on main at all.
test("main-ancestry check accepts a tag behind main's tip and refuses one off main", async () => {
  const script = await ancestryStepScript();
  const directory = await mkdtemp(join(tmpdir(), "surface-ancestry-"));
  try {
    const origin = join(directory, "origin.git");
    const seed = join(directory, "seed");
    git(directory, "init", "-q", "--bare", origin);
    git(directory, "init", "-q", seed);
    for (const n of ["1", "2"]) {
      await writeFile(join(seed, "f"), n);
      git(seed, "add", "f");
      git(seed, "commit", "-qm", n);
    }
    git(seed, "tag", "v1.0.0");
    git(seed, "checkout", "-q", "-b", "side");
    await writeFile(join(seed, "f"), "side");
    git(seed, "commit", "-qam", "side");
    git(seed, "tag", "v9.9.9");
    git(seed, "checkout", "-q", "main");
    for (const n of ["3", "4"]) {
      await writeFile(join(seed, "f"), n);
      git(seed, "commit", "-qam", n);
    }
    git(seed, "push", "-q", origin, "main", "v1.0.0", "v9.9.9");

    const runAt = (tag: string) => {
      const workspace = join(directory, `ws-${tag}`);
      git(directory, "clone", "-q", `file://${origin}`, workspace);
      git(workspace, "checkout", "-q", tag);
      return spawnSync("bash", ["-e", "-c", script], {
        cwd: workspace,
        encoding: "utf8",
        env: { ...process.env, GITHUB_SHA: git(workspace, "rev-parse", "HEAD") },
      });
    };

    const behindTip = runAt("v1.0.0");
    assert.equal(behindTip.status, 0, behindTip.stderr);
    const offMain = runAt("v9.9.9");
    assert.equal(offMain.status, 1);
    assert.match(offMain.stderr, /is not reachable/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("present Sigstore bundle invokes cosign with the release workflow identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "surface-sigstore-present-"));
  try {
    const capturePath = join(directory, "cosign-args.txt");
    const fakeCosignPath = await makeFakeCosign(directory);
    await writeFile(join(directory, "trust-bundle.json"), "{}");
    await writeFile(join(directory, "trust-bundle.sigstore.json"), "{}");

    const result = runVerifier(directory, {
      COSIGN_BIN: fakeCosignPath,
      COSIGN_CAPTURE: capturePath,
      GITHUB_REPOSITORY: "kontourai/surface",
      GITHUB_REF: "refs/tags/v3.2.0",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readFile(capturePath, "utf8")).trim().split("\n"), [
      "verify-blob",
      "--bundle",
      join(directory, "trust-bundle.sigstore.json"),
      "--certificate-identity",
      "https://github.com/kontourai/surface/.github/workflows/publish-npm.yml@refs/tags/v3.2.0",
      "--certificate-oidc-issuer",
      "https://token.actions.githubusercontent.com",
      join(directory, "trust-bundle.json"),
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("present Sigstore bundle propagates a cosign verification failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "surface-sigstore-failure-"));
  try {
    const fakeCosignPath = await makeFakeCosign(directory);
    await writeFile(join(directory, "trust-bundle.json"), "{}");
    await writeFile(join(directory, "trust-bundle.sigstore.json"), "{}");

    const result = runVerifier(directory, {
      COSIGN_BIN: fakeCosignPath,
      COSIGN_CAPTURE: join(directory, "cosign-args.txt"),
      COSIGN_EXIT_CODE: "23",
      GITHUB_REPOSITORY: "kontourai/surface",
      GITHUB_REF: "refs/tags/v3.2.0",
    });

    assert.equal(result.status, 23);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("absent Sigstore bundle skips verification successfully", async () => {
  const directory = await mkdtemp(join(tmpdir(), "surface-sigstore-absent-"));
  try {
    const result = runVerifier(directory, {
      COSIGN_BIN: join(directory, "must-not-run"),
      GITHUB_REPOSITORY: "kontourai/surface",
      GITHUB_REF: "refs/tags/v3.2.0",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Signing skipped: no Sigstore bundle was produced\./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The Sigstore bundle a release uploads, serialised the way the release script
// writes it. The fixture is the bundle published with the v3.2.0 release.
test("release script serialises the signed Sigstore bundle to the wire shape cosign reads", async () => {
  const root = `file://${process.cwd()}/`;
  const published = JSON.parse(await readFile(new URL("tests/fixtures/release-trust-bundle.sigstore.json", root), "utf8"));
  const { bundleFromJSON } = await import("@sigstore/bundle");
  const { sigstoreBundleJson } = await import(new URL("scripts/sigstore-bundle-json.mjs", root).href) as { sigstoreBundleJson: (bundle: unknown) => unknown };
  const inMemory = bundleFromJSON(published);
  const serialised = JSON.parse(JSON.stringify(sigstoreBundleJson(inMemory)));
  assert.deepEqual(serialised, published);
  assert.equal(typeof serialised.verificationMaterial.certificate.rawBytes, "string");
});
