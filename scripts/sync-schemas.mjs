#!/usr/bin/env node
// Generate surface/schemas/ from the `hachure` dependency — the single normative
// source for the trust-format schemas (Hachure unification, ops#7/#9).
//
// surface ships schemas/ to consumers (package.json "files"), but the copies had
// drifted to Hachure 0.4.0 while surface depends on 0.5.x: the stale trust-bundle
// schema capped schemaVersion at [2,3] and would reject the v4 bundles surface's
// own validator accepts. This copies the canonical schemas verbatim and removes
// any orphan that hachure no longer ships, so the shipped schemas cannot drift.
//
// Run: npm run sync:schemas   (CI enforces sync via tests/schema-parity.test.ts)

import { readdirSync, copyFileSync, unlinkSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repoRoot, "node_modules", "hachure", "schemas");
const dstDir = join(repoRoot, "schemas");

const isSchema = (f) => f.endsWith(".schema.json");
const canonical = readdirSync(srcDir).filter(isSchema).sort();
if (canonical.length === 0) {
  console.error(`No schemas found in ${srcDir} — is the hachure dependency installed?`);
  process.exit(1);
}

mkdirSync(dstDir, { recursive: true });

const copied = [];
for (const file of canonical) {
  copyFileSync(join(srcDir, file), join(dstDir, file)); // verbatim bytes
  copied.push(file);
}

// Remove orphans: shipped schemas hachure no longer publishes (e.g. trust-report).
const canonicalSet = new Set(canonical);
const removed = [];
for (const file of readdirSync(dstDir).filter(isSchema)) {
  if (!canonicalSet.has(file)) {
    unlinkSync(join(dstDir, file));
    removed.push(file);
  }
}

console.log(`Synced ${copied.length} schema(s) from hachure: ${copied.join(", ")}`);
if (removed.length) console.log(`Removed ${removed.length} orphan(s): ${removed.join(", ")}`);
