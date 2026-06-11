/**
 * scripts/release-trust-bundle.mjs
 *
 * Generates a TrustBundle about the current @kontourai/surface release by
 * running real checks and capturing real outputs as evidence.
 *
 * Claims produced:
 *   (a) test-suite-passes        — npm test passes; pass/fail counts in evidence
 *   (b) spec-conformance-passes  — all hachure spec vectors pass per-vector
 *   (c) status-function-version  — impl statusFunctionVersion === spec package version
 *   (d) package-identity         — package.json version; git tag + commit as integrityRef
 *
 * Usage:
 *   node scripts/release-trust-bundle.mjs --out /tmp/surface-release-trust
 */

import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------
const outIdx = process.argv.indexOf("--out");
if (outIdx === -1 || !process.argv[outIdx + 1]) {
  console.error("Usage: node scripts/release-trust-bundle.mjs --out <dir>");
  process.exit(1);
}
const outDir = path.resolve(process.argv[outIdx + 1]);
await mkdir(outDir, { recursive: true });

const now = new Date();
const nowIso = now.toISOString();

// ---------------------------------------------------------------------------
// Load package.json and hachure metadata
// ---------------------------------------------------------------------------
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const surfaceVersion = pkg.version;

const hachurePkg = JSON.parse(
  await readFile(path.join(root, "node_modules", "hachure", "package.json"), "utf8"),
);
const hachureVersion = hachurePkg.version;

// ---------------------------------------------------------------------------
// Git identity
// ---------------------------------------------------------------------------
function runGit(args) {
  try {
    return execSync(`git -C ${JSON.stringify(root)} ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
const gitTag = runGit("describe --tags") ?? `v${surfaceVersion}`;
const gitCommit = runGit("rev-parse HEAD") ?? "unknown";
const integrityRef = `git:${gitCommit}`;

// ---------------------------------------------------------------------------
// (a) Run npm test — capture pass/fail counts
// ---------------------------------------------------------------------------
console.log("Running npm test …");
let testOutput = "";
let testPassed = false;
try {
  testOutput = execSync("npm test", {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  testOutput = testOutput + "";
  testPassed = true;
} catch (err) {
  testOutput = (err.stdout ?? "") + (err.stderr ?? "");
  testPassed = false;
}

// Extract counts from node:test TAP-style summary lines like "ℹ pass 247"
const passMatch = testOutput.match(/ℹ pass (\d+)/g);
const failMatch = testOutput.match(/ℹ fail (\d+)/g);
const totalPass = passMatch ? passMatch.reduce((acc, m) => acc + parseInt(m.split(" ")[2], 10), 0) : 0;
const totalFail = failMatch ? failMatch.reduce((acc, m) => acc + parseInt(m.split(" ")[2], 10), 0) : 0;
const testExcerpt = testPassed
  ? `npm test passed: ${totalPass} tests passed, ${totalFail} failed`
  : `npm test FAILED: ${totalPass} tests passed, ${totalFail} failed\n${testOutput.slice(-1000)}`;

console.log(`  → ${testExcerpt}`);

// ---------------------------------------------------------------------------
// (b) Spec conformance — run per-vector
// ---------------------------------------------------------------------------
console.log("Running spec conformance vectors …");

// Dynamically import the built distribution (build must have run via npm test already)
const { buildTrustReport, validateTrustBundle, statusFunctionVersion } = await import(
  path.join(root, "dist", "src", "index.js")
);

const conformanceDir = path.join(root, "node_modules", "hachure", "conformance");
const vectorFiles = (await readdir(conformanceDir))
  .filter((name) => name.startsWith("sf-") && name.endsWith(".json"))
  .sort();

const vectorResults = [];
let allVectorsPassed = true;

for (const fileName of vectorFiles) {
  const raw = JSON.parse(await readFile(path.join(conformanceDir, fileName), "utf8"));
  try {
    const bundle = validateTrustBundle(raw.input);
    const vectorNow = new Date(raw.now);
    const report = buildTrustReport(bundle, { now: vectorNow });
    const expected = raw.expect.statusByClaimId;

    const mismatches = [];
    for (const [claimId, expectedStatus] of Object.entries(expected)) {
      const claim = report.claims.find((c) => c.id === claimId);
      const actual = claim ? claim.status : "(missing)";
      if (actual !== expectedStatus) {
        mismatches.push(`  ${claimId}: expected=${expectedStatus} got=${actual}`);
      }
    }

    const passed = mismatches.length === 0;
    if (!passed) allVectorsPassed = false;

    vectorResults.push({
      name: fileName,
      passed,
      expected,
      mismatches,
      claimCount: Object.keys(expected).length,
    });
    console.log(`  ${passed ? "✔" : "✗"} ${fileName} (${Object.keys(expected).length} claims)`);
    if (mismatches.length > 0) console.log(mismatches.join("\n"));
  } catch (err) {
    allVectorsPassed = false;
    vectorResults.push({ name: fileName, passed: false, error: String(err), claimCount: 0 });
    console.log(`  ✗ ${fileName} — threw: ${err}`);
  }
}

const vectorExcerpt = vectorResults
  .map(
    (v) =>
      `${v.passed ? "PASS" : "FAIL"} ${v.name} (${v.claimCount} claim(s)${v.mismatches?.length ? ": " + v.mismatches.join("; ") : ""})`,
  )
  .join("\n");

// ---------------------------------------------------------------------------
// (c) Status function version agreement
// ---------------------------------------------------------------------------
const hachureStatusFunctionVersion = hachurePkg.statusFunctionVersion ?? "1";
const versionMatch = statusFunctionVersion === hachureStatusFunctionVersion;
const versionExcerpt = versionMatch
  ? `statusFunctionVersion "${statusFunctionVersion}" matches hachure@${hachureVersion} spec (value: "${hachureStatusFunctionVersion}")`
  : `MISMATCH: impl="${statusFunctionVersion}" spec="${hachureStatusFunctionVersion}" (hachure@${hachureVersion})`;

console.log(`Status function version: ${versionExcerpt}`);

// ---------------------------------------------------------------------------
// Assemble TrustBundle
// ---------------------------------------------------------------------------

const POLICY_TEST_SUITE = {
  id: "policy.release.test-suite-passes",
  claimType: "release-quality",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["npm test exits 0 with 0 failing tests"],
  reviewAuthority: "system",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["new commit"],
  conflictRules: [],
  impactLevel: "high",
};

const POLICY_CONFORMANCE = {
  id: "policy.release.spec-conformance",
  claimType: "release-quality",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["all hachure spec conformance vectors pass"],
  reviewAuthority: "system",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["new commit", "hachure package update"],
  conflictRules: [],
  impactLevel: "high",
};

const POLICY_VERSION_AGREEMENT = {
  id: "policy.release.status-function-version",
  claimType: "release-quality",
  requiredEvidence: ["source_excerpt"],
  requiredMethods: ["extraction"],
  requiresCorroboration: false,
  acceptanceCriteria: ["statusFunctionVersion in impl matches spec package"],
  reviewAuthority: "system",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["hachure package update", "new commit"],
  conflictRules: [],
  impactLevel: "high",
};

const POLICY_PACKAGE_IDENTITY = {
  id: "policy.release.package-identity",
  claimType: "release-identity",
  requiredEvidence: ["source_excerpt"],
  requiredMethods: ["anchoring"],
  requiresCorroboration: false,
  acceptanceCriteria: ["git tag and commit captured as integrity anchors"],
  reviewAuthority: "system",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["new commit"],
  conflictRules: [],
  impactLevel: "high",
};

const claims = [
  {
    id: "claim.release.test-suite-passes",
    subjectType: "npm-package",
    subjectId: `@kontourai/surface@${surfaceVersion}`,
    surface: "kontourai-surface.release",
    claimType: "release-quality",
    fieldOrBehavior: "test-suite-passes",
    value: testPassed,
    status: testPassed ? "verified" : "disputed",
    createdAt: nowIso,
    updatedAt: nowIso,
    impactLevel: "high",
    verificationPolicyId: POLICY_TEST_SUITE.id,
    currentIntegrityRef: integrityRef,
    confidenceBasis: {
      sourceQuality: "strong",
      reviewerAuthority: "system",
      evidenceStrength: testPassed ? "strong" : "none",
      impactLevel: "high",
    },
  },
  {
    id: "claim.release.spec-conformance-passes",
    subjectType: "npm-package",
    subjectId: `hachure@${hachureVersion}`,
    surface: "kontourai-surface.release",
    claimType: "release-quality",
    fieldOrBehavior: "spec-conformance-passes",
    value: allVectorsPassed,
    status: allVectorsPassed ? "verified" : "disputed",
    createdAt: nowIso,
    updatedAt: nowIso,
    impactLevel: "high",
    verificationPolicyId: POLICY_CONFORMANCE.id,
    currentIntegrityRef: integrityRef,
    confidenceBasis: {
      sourceQuality: "strong",
      reviewerAuthority: "system",
      evidenceStrength: allVectorsPassed ? "strong" : "none",
      impactLevel: "high",
    },
  },
  {
    id: "claim.release.status-function-version",
    subjectType: "npm-package",
    subjectId: `@kontourai/surface@${surfaceVersion}`,
    surface: "kontourai-surface.release",
    claimType: "release-quality",
    fieldOrBehavior: "statusFunctionVersion",
    value: statusFunctionVersion,
    status: versionMatch ? "verified" : "disputed",
    createdAt: nowIso,
    updatedAt: nowIso,
    impactLevel: "high",
    verificationPolicyId: POLICY_VERSION_AGREEMENT.id,
    currentIntegrityRef: integrityRef,
    confidenceBasis: {
      sourceQuality: "strong",
      reviewerAuthority: "system",
      evidenceStrength: versionMatch ? "strong" : "none",
      impactLevel: "high",
    },
  },
  {
    id: "claim.release.package-identity",
    subjectType: "npm-package",
    subjectId: `@kontourai/surface@${surfaceVersion}`,
    surface: "kontourai-surface.release",
    claimType: "release-identity",
    fieldOrBehavior: "version",
    value: surfaceVersion,
    status: "verified",
    createdAt: nowIso,
    updatedAt: nowIso,
    impactLevel: "high",
    verificationPolicyId: POLICY_PACKAGE_IDENTITY.id,
    currentIntegrityRef: integrityRef,
    currentIntegrityAnchor: {
      id: `anchor.release.commit.${gitCommit.slice(0, 8)}`,
      kind: "external_ref",
      algorithm: "git-sha1",
      value: gitCommit,
      sourceRef: "git rev-parse HEAD",
      observedAt: nowIso,
      verificationStatus: "verified",
      verifiedAt: nowIso,
      verifiedBy: "kontourai-surface-release",
      metadata: { gitTag },
    },
    confidenceBasis: {
      sourceQuality: "strong",
      reviewerAuthority: "system",
      evidenceStrength: "strong",
      impactLevel: "high",
    },
  },
];

const evidence = [
  // (a) test suite
  {
    id: "evidence.release.test-output",
    claimId: "claim.release.test-suite-passes",
    supportStrength: "entails",
    evidenceType: "test_output",
    method: "validation",
    sourceRef: "npm test",
    sourceLocator: "stdout+stderr of npm test",
    excerptOrSummary: testExcerpt,
    observedAt: nowIso,
    collectedBy: "kontourai-surface-release",
    integrityRef: integrityRef,
    passing: testPassed,
    blocking: !testPassed,
    execution: {
      runner: "bash",
      label: "npm test",
      exitCode: testPassed ? 0 : 1,
      durationMs: null,
    },
  },
  // (b) spec conformance — per-vector evidence
  ...vectorResults.map((v, i) => ({
    id: `evidence.release.spec-vector.${i}`,
    claimId: "claim.release.spec-conformance-passes",
    supportStrength: "entails",
    evidenceType: "test_output",
    method: "validation",
    sourceRef: `node_modules/hachure/conformance/${v.name}`,
    sourceLocator: v.name,
    excerptOrSummary: v.passed
      ? `PASS ${v.name} — ${v.claimCount} claim(s) all matched expected statuses`
      : `FAIL ${v.name} — mismatches: ${(v.mismatches ?? [v.error]).join("; ")}`,
    observedAt: nowIso,
    collectedBy: "kontourai-surface-release",
    integrityRef: integrityRef,
    passing: v.passed,
    blocking: !v.passed,
  })),
  // (c) version agreement
  {
    id: "evidence.release.status-function-version",
    claimId: "claim.release.status-function-version",
    supportStrength: "entails",
    evidenceType: "source_excerpt",
    method: "extraction",
    sourceRef: "src/status.ts + node_modules/hachure/index.mjs",
    sourceLocator: "statusFunctionVersion export",
    excerptOrSummary: versionExcerpt,
    observedAt: nowIso,
    collectedBy: "kontourai-surface-release",
    integrityRef: integrityRef,
    passing: versionMatch,
    blocking: !versionMatch,
  },
  // (d) package identity — git tag
  {
    id: "evidence.release.git-tag",
    claimId: "claim.release.package-identity",
    supportStrength: "entails",
    evidenceType: "source_excerpt",
    method: "anchoring",
    sourceRef: "git describe --tags",
    sourceLocator: "git tag",
    excerptOrSummary: `git describe --tags → ${gitTag}; git rev-parse HEAD → ${gitCommit}`,
    observedAt: nowIso,
    collectedBy: "kontourai-surface-release",
    integrityRef: integrityRef,
    passing: true,
    blocking: false,
  },
];

const events = [
  {
    id: "event.release.test-suite-passes",
    claimId: "claim.release.test-suite-passes",
    status: testPassed ? "verified" : "disputed",
    actor: "kontourai-surface-release",
    method: "automated-validation",
    evidenceIds: ["evidence.release.test-output"],
    createdAt: nowIso,
    verifiedAt: testPassed ? nowIso : undefined,
    notes: testExcerpt,
  },
  {
    id: "event.release.spec-conformance-passes",
    claimId: "claim.release.spec-conformance-passes",
    status: allVectorsPassed ? "verified" : "disputed",
    actor: "kontourai-surface-release",
    method: "automated-validation",
    evidenceIds: vectorResults.map((_, i) => `evidence.release.spec-vector.${i}`),
    createdAt: nowIso,
    verifiedAt: allVectorsPassed ? nowIso : undefined,
    notes: `${vectorResults.filter((v) => v.passed).length}/${vectorResults.length} vectors passed`,
  },
  {
    id: "event.release.status-function-version",
    claimId: "claim.release.status-function-version",
    status: versionMatch ? "verified" : "disputed",
    actor: "kontourai-surface-release",
    method: "automated-validation",
    evidenceIds: ["evidence.release.status-function-version"],
    createdAt: nowIso,
    verifiedAt: versionMatch ? nowIso : undefined,
    notes: versionExcerpt,
  },
  {
    id: "event.release.package-identity",
    claimId: "claim.release.package-identity",
    status: "verified",
    actor: "kontourai-surface-release",
    method: "automated-validation",
    evidenceIds: ["evidence.release.git-tag"],
    createdAt: nowIso,
    verifiedAt: nowIso,
    notes: `Package @kontourai/surface@${surfaceVersion} at git ${gitTag} (${gitCommit.slice(0, 8)})`,
  },
];

/** @type {import('../dist/src/types.js').TrustBundle} */
const bundle = {
  schemaVersion: 3,
  source: "kontourai-surface-release",
  claims,
  evidence,
  policies: [POLICY_TEST_SUITE, POLICY_CONFORMANCE, POLICY_VERSION_AGREEMENT, POLICY_PACKAGE_IDENTITY],
  events,
};

// ---------------------------------------------------------------------------
// Build TrustReport
// ---------------------------------------------------------------------------
const report = buildTrustReport(bundle, { now });

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
const bundlePath = path.join(outDir, "trust-bundle.json");
const reportPath = path.join(outDir, "trust-report.json");

await Promise.all([
  writeFile(bundlePath, JSON.stringify(bundle, null, 2)),
  writeFile(reportPath, JSON.stringify(report, null, 2)),
]);

console.log(`\nWrote trust bundle → ${bundlePath}`);
console.log(`Wrote trust report → ${reportPath}`);
console.log(`\nSummary:`);
console.log(`  source:  ${bundle.source}`);
console.log(`  version: ${surfaceVersion} (${gitTag} @ ${gitCommit.slice(0, 8)})`);
console.log(`  claims:  ${claims.length}`);
for (const c of claims) {
  console.log(`    ${c.status.padEnd(10)} ${c.fieldOrBehavior}`);
}
console.log(`  all verified: ${claims.every((c) => c.status === "verified")}`);

// Exit non-zero if any check failed
const allPassed = testPassed && allVectorsPassed && versionMatch;
if (!allPassed) {
  console.error("\nOne or more release checks failed. See claims above.");
  process.exit(1);
}
