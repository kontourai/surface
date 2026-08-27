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
