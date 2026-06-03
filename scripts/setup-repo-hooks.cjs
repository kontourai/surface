#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { accessSync, constants } = require("node:fs");
const { join } = require("node:path");

const HOOKS_PATH = ".githooks";
const PRE_PUSH = ".githooks/pre-push";

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message) {
  console.error(`Repo hook setup failed: ${message}`);
  process.exit(1);
}

let repoRoot;
try {
  repoRoot = git(["rev-parse", "--show-toplevel"]);
} catch {
  fail("run this command inside the Surface Git worktree.");
}

try {
  accessSync(join(repoRoot, PRE_PUSH), constants.X_OK);
} catch {
  fail(`${PRE_PUSH} must exist and be executable before configuring hooks.`);
}

let currentHooksPath = "";
try {
  currentHooksPath = git(["config", "--local", "--get", "core.hooksPath"]);
} catch {
  currentHooksPath = "";
}

if (currentHooksPath !== HOOKS_PATH) {
  git(["config", "--local", "core.hooksPath", HOOKS_PATH]);
  console.log(`Updated local core.hooksPath from ${currentHooksPath || "(unset)"} to ${HOOKS_PATH}.`);
} else {
  console.log(`Local core.hooksPath is already ${HOOKS_PATH}.`);
}

console.log("Surface repo hooks are configured.");
