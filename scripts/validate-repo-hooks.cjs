#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { accessSync, constants, readFileSync } = require("node:fs");
const { join } = require("node:path");

const HOOKS_PATH = ".githooks";
const PRE_PUSH = ".githooks/pre-push";
const EXPECTED_VALIDATE_COMMAND = "npm run validate:repo-hooks";
const EXPECTED_VERIFY_COMMAND = "npm run verify";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function read(path) {
  return readFileSync(path, "utf8");
}

function includesAll(content, values) {
  return values.every((value) => content.includes(value));
}

const repoRoot = git(["rev-parse", "--show-toplevel"]);
const packageJson = JSON.parse(read(join(repoRoot, "package.json")));
const hookBody = read(join(repoRoot, PRE_PUSH));
const setupBody = read(join(repoRoot, "scripts/setup-repo-hooks.cjs"));
const readme = read(join(repoRoot, "README.md"));
const docsIndex = read(join(repoRoot, "docs/README.md"));
const repoHooksDoc = read(join(repoRoot, "docs/maintenance/repo-hooks.md"));
const failures = [];

function check(label, condition, detail) {
  if (!condition) {
    failures.push({ label, detail });
  }
}

let hooksPath = "";
try {
  hooksPath = git(["config", "--local", "--get", "core.hooksPath"]);
} catch {
  hooksPath = "";
}

check("git-config-hooks-path", hooksPath === HOOKS_PATH, `expected core.hooksPath=${HOOKS_PATH}, found ${hooksPath || "(unset)"}`);

try {
  accessSync(join(repoRoot, PRE_PUSH), constants.X_OK);
} catch {
  check("pre-push-executable", false, `${PRE_PUSH} is missing or not executable`);
}

check("pre-push-portable-shell", hookBody.startsWith("#!/bin/sh\nset -eu\n"), `${PRE_PUSH} must use portable sh with set -eu`);
const meaningfulHookLines = hookBody
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const expectedHookLines = [
  "set -eu",
  'HOOK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
  'REPO_ROOT=$(CDPATH= cd -- "$HOOK_DIR/.." && pwd)',
  'cd "$REPO_ROOT"',
  'echo "Running Surface pre-push verification..."',
  EXPECTED_VALIDATE_COMMAND,
  EXPECTED_VERIFY_COMMAND,
];
check(
  "pre-push-command-sequence",
  meaningfulHookLines.join("\n") === expectedHookLines.join("\n"),
  `${PRE_PUSH} command sequence drifted. Expected:\n${expectedHookLines.join("\n")}\nActual:\n${meaningfulHookLines.join("\n")}`
);
check("pre-push-relative-root", includesAll(hookBody, ["HOOK_DIR=", "REPO_ROOT=", "cd \"$REPO_ROOT\""]), `${PRE_PUSH} must resolve the repo root from the hook location`);
check("setup-target-path", setupBody.includes(`const HOOKS_PATH = "${HOOKS_PATH}"`), "setup script must write the repo-local hooks path");
check("setup-no-absolute-hook-path", !setupBody.includes(`${repoRoot}/.git/hooks`), "setup script must not preserve an absolute local hooks path");
check("setup-validates-executable", includesAll(setupBody, ["constants.X_OK", PRE_PUSH]), "setup script must require an executable pre-push hook");
check("package-setup-script", packageJson.scripts?.["setup:repo-hooks"] === "node scripts/setup-repo-hooks.cjs", "package.json must expose setup:repo-hooks");
check("package-validate-script", packageJson.scripts?.["validate:repo-hooks"] === "node scripts/validate-repo-hooks.cjs", "package.json must expose validate:repo-hooks");
check("docs-readme-setup", includesAll(readme, ["npm run setup:repo-hooks", "npm run validate:repo-hooks", "core.hooksPath=.githooks"]), "README must document setup, validation, and expected hooksPath");
check("docs-index-link", docsIndex.includes("repo-hooks.md"), "docs index must link repo hook docs");
check("docs-hook-boundary", includesAll(repoHooksDoc, [
  "local contributor safeguards",
  "not Surface Console",
  "not projection",
  "not runtime adapter",
  "not product behavior",
]), "repo hook docs must state the contributor-tooling/product boundary");
check("docs-drift-commands", includesAll(repoHooksDoc, [
  "npm run setup:repo-hooks",
  "npm run validate:repo-hooks",
  "npm run verify",
  "core.hooksPath=.githooks",
]), "repo hook docs must include setup, validation, verify, and expected hooksPath");

if (failures.length > 0) {
  console.error("Repo hook validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure.label}: ${failure.detail}`);
  }
  process.exit(1);
}

console.log("Repo hook validation passed.");
