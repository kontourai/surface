import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("CLI help keeps documented command surface stable", async () => {
  const help = await execFileAsync("node", ["bin/surface.mjs", "--help"]);

  assert.match(help.stdout, /Usage:/);
  assert.match(help.stdout, /surface report \[--input examples\/surface-fixtures\.json\]/);
  assert.match(help.stdout, /surface console \[--read-model \.surface\/runs\/latest\.json\]/);
  assert.match(help.stdout, /surface claim add --type <claim-type>/);
  assert.match(help.stdout, /surface get --claim-id <claim-id>/);
  assert.match(help.stdout, /surface policy \[--policy-id <policy-id> \| --claim-id <claim-id>\]/);
});

test("CLI report summary remains available through the package bin", async () => {
  const report = await execFileAsync("node", [
    "bin/surface.mjs",
    "report",
    "--format",
    "summary",
    "--run-id",
    "cli-contract",
  ]);

  assert.match(report.stdout, /Kontour Surface report cli-contract/);
  assert.match(report.stdout, /Claims:/);
  assert.match(report.stdout, /Surfaces:/);
  assert.match(report.stdout, /Transparency gaps:/);
});
