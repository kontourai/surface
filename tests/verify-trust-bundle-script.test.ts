import { execFile } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("verify-trust-bundle usage identifies structural-only capability state", async () => {
  await assert.rejects(
    execFileAsync("node", ["scripts/verify-trust-bundle.mjs"]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const output = "stderr" in error ? String(error.stderr) : "";

      assert.match(output, /Capability state: structural-only/);
      assert.match(output, /Full Sigstore cryptographic verification is unavailable/);
      assert.match(output, /Usage: node scripts\/verify-trust-bundle\.mjs/);

      return true;
    },
  );
});
