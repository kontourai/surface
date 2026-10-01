/**
 * Status function version selection: "3" is the default, "2" stays selectable
 * so a record resolved under it can be re-derived, and derived state is never
 * carried across versions.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrustReport,
  checkpointFromReport,
  deriveClaimStatus,
  deriveTrustStatus,
  resolveInquiry,
  resolvePolicyForClaim,
  type Claim,
  type Evidence,
  type TrustBundle,
  type VerificationEvent,
  type VerificationPolicy,
} from "../src/index.js";
import { evaluateClaimEvidence } from "../src/claim-evaluation.js";

const AT = "2026-05-01T00:00:00.000Z";
const now = new Date("2026-05-02T00:00:00.000Z");

const claim: Claim = {
  id: "claim.api", subjectType: "service", subjectId: "svc", facet: "api", claimType: "api",
  fieldOrBehavior: "ratelimit", value: true, createdAt: AT, updatedAt: AT,
};
// A check that reports no result: verified under "2", proposed under "3".
const resultLess: Evidence = {
  id: "evidence.check", claimId: "claim.api", evidenceType: "test_output", method: "validation", sourceRef: "ci",
  excerptOrSummary: "tests", observedAt: AT, collectedBy: "ci",
};
const policy: VerificationPolicy = {
  id: "policy.api", claimType: "api", requiredEvidence: ["test_output"], acceptanceCriteria: ["tests pass"],
  reviewAuthority: "ci", validityRule: { kind: "manual" }, stalenessTriggers: [], conflictRules: [], impactLevel: "high",
};
const verified: VerificationEvent = {
  id: "event.verified", claimId: "claim.api", status: "verified", actor: "ci", method: "validation",
  evidenceIds: ["evidence.check"], createdAt: AT,
};
const bundle: TrustBundle = { schemaVersion: 5, source: "status-function-version", claims: [claim], evidence: [resultLess], policies: [policy], events: [verified] };

test("the report records the version it was derived with", () => {
  const current = buildTrustReport(bundle, { now });
  assert.deepEqual([current.statusFunctionVersion, current.claims[0]!.status], ["3", "proposed"]);
  const v2 = buildTrustReport(bundle, { now, statusFunctionVersion: "2" });
  assert.deepEqual([v2.statusFunctionVersion, v2.claims[0]!.status], ["2", "verified"]);
});

test("a checkpoint is served only to a derivation under the version that produced it", () => {
  const served = (since: ReturnType<typeof checkpointFromReport>, statusFunctionVersion: "2" | "3") => {
    const probes: boolean[] = [];
    const report = buildTrustReport(bundle, { now, since, statusFunctionVersion, instrument: (probe) => probes.push(probe.fromCheckpoint) });
    return { fromCheckpoint: probes, status: report.claims[0]!.status };
  };
  const v2Checkpoint = checkpointFromReport(buildTrustReport(bundle, { now, statusFunctionVersion: "2" }));
  const v3Checkpoint = checkpointFromReport(buildTrustReport(bundle, { now }));

  // Same version: the claim is served from the checkpoint.
  assert.deepEqual(served(v2Checkpoint, "2"), { fromCheckpoint: [true], status: "verified" });
  assert.deepEqual(served(v3Checkpoint, "3"), { fromCheckpoint: [true], status: "proposed" });
  // Across versions the checkpoint's `verified` must not leak into a v3 report, or the reverse.
  assert.deepEqual(served(v2Checkpoint, "3"), { fromCheckpoint: [false], status: "proposed" });
  assert.deepEqual(served(v3Checkpoint, "2"), { fromCheckpoint: [false], status: "verified" });
});

test("resolveInquiry records the selected version and answers under it", () => {
  const inquiry = {
    id: "inquiry.1", question: "Is the rate limit enforced?", askedBy: "test", askedAt: AT,
    target: { subjectType: "service", subjectId: "svc", fieldOrBehavior: "ratelimit" },
  };
  const current = resolveInquiry(bundle, inquiry, { now });
  assert.deepEqual([current.statusFunctionVersion, current.answer?.status], ["3", "proposed"]);
  const v2 = resolveInquiry(bundle, inquiry, { now, statusFunctionVersion: "2" });
  assert.deepEqual([v2.statusFunctionVersion, v2.answer?.status], ["2", "verified"]);
});

test("policy resolution: a dangling verificationPolicyId resolves nothing under v3 and falls back under v2", () => {
  const dangling = { ...claim, verificationPolicyId: "policy.missing" };
  assert.equal(resolvePolicyForClaim(dangling, [policy]), undefined);
  assert.equal(resolvePolicyForClaim(dangling, [policy], { statusFunctionVersion: "2" })?.id, "policy.api");

  const passing = { ...resultLess, passing: true };
  const args = { claim: dangling, evidence: [passing], events: [verified], policies: [policy], now };
  assert.deepEqual(deriveClaimStatus(args), { status: "proposed", policyId: undefined });
  assert.deepEqual(deriveClaimStatus({ ...args, statusFunctionVersion: "2" }), { status: "verified", policyId: "policy.api" });
});

test("a policy that requires nothing is reported as the resolved policy but does not establish verified", () => {
  const empty = { ...policy, requiredEvidence: [] };
  const args = { claim, evidence: [{ ...resultLess, passing: true }], events: [verified], policies: [empty], now };
  assert.deepEqual(deriveClaimStatus(args), { status: "proposed", policyId: "policy.api" });
  assert.deepEqual(deriveClaimStatus({ ...args, statusFunctionVersion: "2" }), { status: "verified", policyId: "policy.api" });
  // Requiring only a method is still a requirement.
  const methodOnly = { ...empty, requiredMethods: ["validation" as const] };
  assert.equal(deriveClaimStatus({ ...args, policies: [methodOnly] }).status, "verified");
});

test("an evaluation computed for another version is refused rather than trusted", () => {
  const evaluation = evaluateClaimEvidence({ entailingEvidence: [resultLess], policy, statusFunctionVersion: "2" });
  assert.equal(evaluation.requirementUnmet, false);
  assert.equal(evaluateClaimEvidence({ entailingEvidence: [resultLess], policy }).requirementUnmet, true);
  assert.throws(
    () => deriveTrustStatus({ claim, evidence: [resultLess], policy, events: [verified], now, evaluation }),
    /computed for statusFunctionVersion 2, not 3/,
  );
});
