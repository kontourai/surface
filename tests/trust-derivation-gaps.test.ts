/**
 * Transparency gaps that keep a claim from presenting as healthy when status
 * function v2 still derives `verified`: failed checks labelled `cited`,
 * required checks that report no result, and claims with no resolved
 * verification policy.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrustAnalyticsProjection,
  buildTrustReport,
  checkpointFromReport,
  validateTrustBundle,
  type Evidence,
  type TrustBundle,
  type VerificationPolicy,
} from "../src/index.js";

const T = "2026-05-01T00:00:00.000Z";
const now = new Date("2026-05-02T00:00:00.000Z");

const policy: VerificationPolicy = {
  id: "policy.api",
  claimType: "api",
  requiredEvidence: ["test_output"],
  acceptanceCriteria: ["tests pass"],
  reviewAuthority: "ci",
  validityRule: { kind: "manual" },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "high",
};

function evidence(id: string, extra: Partial<Evidence> = {}): Evidence {
  return {
    id, claimId: "claim.api", evidenceType: "test_output", method: "validation", sourceRef: "ci",
    excerptOrSummary: "tests", observedAt: T, collectedBy: "ci", ...extra,
  };
}

function bundle(items: Evidence[], options: { policies?: VerificationPolicy[]; verificationPolicyId?: string } = {}): TrustBundle {
  return validateTrustBundle({
    schemaVersion: 5,
    source: "trust-derivation-gaps",
    claims: [{
      id: "claim.api", subjectType: "service", subjectId: "svc", facet: "api", claimType: "api",
      fieldOrBehavior: "rate limit", value: true, createdAt: T, updatedAt: T,
      ...(options.verificationPolicyId ? { verificationPolicyId: options.verificationPolicyId } : {}),
    }],
    evidence: items,
    policies: options.policies ?? [policy],
    events: [{ id: "event.verified", claimId: "claim.api", status: "verified", actor: "ci", method: "validation", evidenceIds: items.map((item) => item.id), createdAt: T }],
  });
}

const gapsFor = (report: ReturnType<typeof buildTrustReport>) => report.transparencyGaps.filter((gap) => gap.claimId === "claim.api");

test("a blocking failed check labelled cited produces a blocking policy_violation gap", () => {
  const report = buildTrustReport(bundle([
    evidence("evidence.pass", { passing: true }),
    evidence("evidence.cited-fail", { passing: false, blocking: true, supportStrength: "cited" }),
  ]), { now });
  // A cited failure is not counterevidence for status...
  assert.equal(report.claims[0]!.status, "verified");
  // ...but it no longer disappears from every output.
  const gap = gapsFor(report).find((item) => item.evidenceIds?.includes("evidence.cited-fail"));
  assert.equal(gap?.type, "policy_violation");
  assert.equal(gap?.blocking, true);
  assert.equal(gap?.id, "claim.api.gap.evidence-evidence.cited-fail");
});

test("a required check that reports no result produces a blocking gap and leaves status unchanged", () => {
  const report = buildTrustReport(bundle([evidence("evidence.result-less")]), { now });
  assert.equal(report.claims[0]!.status, "verified");
  const gap = gapsFor(report).find((item) => item.id === "claim.api.gap.check-result-missing-test_output");
  assert.ok(gap, "expected a check-result-missing gap");
  assert.equal(gap.type, "policy_violation");
  assert.equal(gap.blocking, true);
  assert.deepEqual(gap.evidenceIds, ["evidence.result-less"]);
});

test("passing checks, reported failures, and source excerpts without passing keep their previous gaps", () => {
  assert.deepEqual(gapsFor(buildTrustReport(bundle([evidence("evidence.pass", { passing: true })]), { now })), []);

  // A reported non-blocking failure keeps its own non-blocking gap only.
  const softFail = gapsFor(buildTrustReport(bundle([evidence("evidence.soft", { passing: false, blocking: false })]), { now }));
  assert.deepEqual(softFail.map((gap) => [gap.id, gap.blocking]), [["claim.api.gap.evidence-evidence.soft", false]]);

  const excerptPolicy = { ...policy, requiredEvidence: ["source_excerpt" as const] };
  const excerpt = buildTrustReport(bundle([evidence("evidence.excerpt", { evidenceType: "source_excerpt", method: "extraction" })], { policies: [excerptPolicy] }), { now });
  assert.equal(excerpt.claims[0]!.status, "verified");
  assert.deepEqual(gapsFor(excerpt), []);
});

test("a verified claim with evidence but no resolved policy carries a blocking no-verification-policy gap", () => {
  const report = buildTrustReport(bundle([evidence("evidence.pass", { passing: true })], { policies: [] }), { now });
  assert.equal(report.claims[0]!.status, "verified");
  assert.deepEqual(gapsFor(report).map((gap) => [gap.id, gap.type, gap.blocking]), [
    ["claim.api.gap.no-verification-policy", "policy_violation", true],
  ]);

  // Without evidence the existing no-evidence/no-policy gap still applies, alone.
  const bare = buildTrustReport(bundle([], { policies: [] }), { now });
  assert.equal(bare.claims[0]!.status, "verified");
  assert.deepEqual(gapsFor(bare).map((gap) => [gap.id, gap.type, gap.blocking]), [
    ["claim.api.gap.provenance-gap", "provenance_gap", true],
  ]);
});

test("the no-policy gap survives checkpoint replay and reaches the analytics projection", () => {
  const input = bundle([evidence("evidence.pass", { passing: true })], { policies: [] });
  const checkpoint = checkpointFromReport(buildTrustReport(input, { now }));
  const probes: boolean[] = [];
  const replayed = buildTrustReport(input, { now, since: checkpoint, instrument: (probe) => probes.push(probe.fromCheckpoint) });
  assert.deepEqual(probes, [true], "the claim must be served from the checkpoint");
  assert.ok(gapsFor(replayed).some((gap) => gap.id === "claim.api.gap.no-verification-policy" && gap.blocking));

  const analytics = buildTrustAnalyticsProjection(replayed);
  assert.equal(analytics.totals.transparencyGaps, 1);
  assert.equal(analytics.transparencyGaps.byType.policy_violation, 1);
});

test("a verificationPolicyId naming an absent policy produces a blocking gap even when claim-type resolution finds another", () => {
  // validateTrustBundle rejects the dangling reference, so build the report from an unvalidated bundle.
  const input = { ...bundle([evidence("evidence.pass", { passing: true })]) };
  input.claims = [{ ...input.claims[0]!, verificationPolicyId: "policy.missing" }];
  const report = buildTrustReport(input, { now });
  assert.equal(report.claims[0]!.status, "verified");
  const gap = gapsFor(report).find((item) => item.id === "claim.api.gap.unresolved-verification-policy");
  assert.equal(gap?.blocking, true);
  assert.equal(gap?.type, "policy_violation");
});
