/**
 * ADR 0003 step 2 — deriveClaimStatus parity test.
 *
 * Loads the standard example bundle, runs buildTrustReport, then for each claim in
 * the report asserts that deriveClaimStatus called directly with the same
 * inputs produces the identical status.  This proves the two code paths are
 * equivalent and that extracting the function was a pure refactor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildTrustReport,
  deriveClaimStatus,
  validateTrustBundle,
  STATUS_FUNCTION_VERSION,
} from "../src/index.js";

test("deriveClaimStatus matches buildTrustReport per-claim status for all example bundle claims", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const bundle = validateTrustBundle(JSON.parse(raw));
  const now = new Date("2026-04-25T00:00:00.000Z");
  const report = buildTrustReport(bundle, { now });

  for (const reportClaim of report.claims) {
    const evidence = bundle.evidence.filter((e) => e.claimId === reportClaim.id);
    const result = deriveClaimStatus({
      claim: reportClaim,
      evidence,
      events: bundle.events,
      policies: bundle.policies,
      now,
    });
    assert.equal(
      result.status,
      reportClaim.status,
      `Status mismatch for claim ${reportClaim.id}: deriveClaimStatus=${result.status}, report=${reportClaim.status}`,
    );
  }
});

test("STATUS_FUNCTION_VERSION is a non-empty string", () => {
  assert.equal(typeof STATUS_FUNCTION_VERSION, "string");
  assert.ok(STATUS_FUNCTION_VERSION.length > 0);
});

test("deriveClaimStatus includes the resolved policyId", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const bundle = validateTrustBundle(JSON.parse(raw));
  const now = new Date("2026-04-25T00:00:00.000Z");

  // claim.repo-governance.api-proof has verificationPolicyId set
  const claim = bundle.claims.find((c) => c.id === "claim.repo-governance.api-proof")!;
  const evidence = bundle.evidence.filter((e) => e.claimId === claim.id);
  const result = deriveClaimStatus({ claim, evidence, events: bundle.events, policies: bundle.policies, now });
  assert.equal(result.policyId, "policy.software-evidence.commit");
});
