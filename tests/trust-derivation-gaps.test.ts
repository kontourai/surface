/**
 * Transparency gaps for failed checks labelled `cited`, required checks that
 * report no passing result, and claims with no resolved verification policy.
 * Status function "3" derives `proposed` for the last two and the gap states
 * why; under "2" the status stays `verified` and the gap is what keeps the
 * claim from presenting as healthy. Each test pins both versions.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrustAnalyticsProjection,
  buildTrustReport,
  checkpointFromReport,
  explainClaim,
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

test("a required check that reports no result derives proposed and produces one blocking gap", () => {
  const input = bundle([evidence("evidence.result-less")]);
  for (const [version, status] of [["3", "proposed"], ["2", "verified"]] as const) {
    const report = buildTrustReport(input, { now, statusFunctionVersion: version });
    assert.equal(report.claims[0]!.status, status, `status under version ${version}`);
    // The result-less check is reported once, by the check-result gap: not also as "missing" evidence.
    assert.deepEqual(gapsFor(report).map((item) => item.id), ["claim.api.gap.check-result-missing-test_output"]);
    const gap = gapsFor(report)[0]!;
    assert.equal(gap.type, "policy_violation");
    assert.equal(gap.blocking, true);
    assert.deepEqual(gap.evidenceIds, ["evidence.result-less"]);
  }
  assert.equal(buildTrustReport(input, { now }).statusFunctionVersion, "3");
});

test("a required method carried only by a result-less check is reported as unqualified, not missing", () => {
  const methodPolicy = { ...policy, requiredMethods: ["validation" as const] };
  const report = buildTrustReport(bundle([evidence("evidence.result-less")], { policies: [methodPolicy] }), { now });
  assert.equal(report.claims[0]!.status, "proposed");
  const gap = gapsFor(report).find((item) => item.id === "claim.api.gap.policy-violation");
  assert.match(gap?.message ?? "", /carried only by check evidence without a passing result: validation/);
  assert.doesNotMatch(gap?.message ?? "", /Missing required verification method/);
});

test("passing checks, reported failures, and source excerpts without passing keep their previous gaps", () => {
  assert.deepEqual(gapsFor(buildTrustReport(bundle([evidence("evidence.pass", { passing: true })]), { now })), []);

  // A reported non-blocking failure keeps its own non-blocking gap. Under "3"
  // it also leaves the requirement unmet, which is a blocking gap; under "2"
  // the type's presence satisfied the requirement.
  const softFailInput = bundle([evidence("evidence.soft", { passing: false, blocking: false })]);
  const softFail = buildTrustReport(softFailInput, { now });
  assert.equal(softFail.claims[0]!.status, "proposed");
  assert.deepEqual(gapsFor(softFail).map((gap) => [gap.id, gap.blocking, gap.message]), [
    ["claim.api.gap.check-result-missing-test_output", true, "Required test_output evidence reports no passing result."],
    ["claim.api.gap.evidence-evidence.soft", false, "Evidence explicitly reported a non-passing result."],
  ]);
  const softFailV2 = buildTrustReport(softFailInput, { now, statusFunctionVersion: "2" });
  assert.equal(softFailV2.claims[0]!.status, "verified");
  assert.deepEqual(gapsFor(softFailV2).map((gap) => [gap.id, gap.blocking]), [["claim.api.gap.evidence-evidence.soft", false]]);

  const excerptPolicy = { ...policy, requiredEvidence: ["source_excerpt" as const] };
  const excerpt = buildTrustReport(bundle([evidence("evidence.excerpt", { evidenceType: "source_excerpt", method: "extraction" })], { policies: [excerptPolicy] }), { now });
  assert.equal(excerpt.claims[0]!.status, "verified");
  assert.deepEqual(gapsFor(excerpt), []);
});

test("a verified event with no resolved policy derives proposed and carries a blocking no-verification-policy gap", () => {
  const withEvidence = bundle([evidence("evidence.pass", { passing: true })], { policies: [] });
  // Without evidence the existing no-evidence/no-policy gap still applies, alone.
  const bare = bundle([], { policies: [] });
  for (const [version, status] of [["3", "proposed"], ["2", "verified"]] as const) {
    const report = buildTrustReport(withEvidence, { now, statusFunctionVersion: version });
    assert.equal(report.claims[0]!.status, status, `status under version ${version}`);
    assert.deepEqual(gapsFor(report).map((gap) => [gap.id, gap.type, gap.blocking]), [
      ["claim.api.gap.no-verification-policy", "policy_violation", true],
    ]);

    const bareReport = buildTrustReport(bare, { now, statusFunctionVersion: version });
    assert.equal(bareReport.claims[0]!.status, status, `bare status under version ${version}`);
    assert.deepEqual(gapsFor(bareReport).map((gap) => [gap.id, gap.type, gap.blocking]), [
      ["claim.api.gap.provenance-gap", "provenance_gap", true],
    ]);
  }
});

test("a policy that requires nothing derives proposed and carries a blocking requires-nothing gap", () => {
  const emptyPolicy = { ...policy, requiredEvidence: [] };
  const input = bundle([evidence("evidence.pass", { passing: true })], { policies: [emptyPolicy] });
  const report = buildTrustReport(input, { now });
  assert.equal(report.claims[0]!.status, "proposed");
  assert.deepEqual(gapsFor(report).map((gap) => [gap.id, gap.type, gap.blocking, gap.policyId]), [
    ["claim.api.gap.verification-policy-requires-nothing", "policy_violation", true, "policy.api"],
  ]);
  // The resolved policy is still reported as the claim's requirement.
  assert.deepEqual(report.evidenceRequirementsByClaimId["claim.api"]?.requiredEvidenceTypes, []);

  const v2 = buildTrustReport(input, { now, statusFunctionVersion: "2" });
  assert.equal(v2.claims[0]!.status, "verified");
  assert.deepEqual(gapsFor(v2), []);
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

test("a verificationPolicyId naming an absent policy resolves no policy, derives proposed, and produces a blocking gap", () => {
  // validateTrustBundle rejects the dangling reference, so build the report from an unvalidated bundle.
  const input = { ...bundle([evidence("evidence.pass", { passing: true })]) };
  input.claims = [{ ...input.claims[0]!, verificationPolicyId: "policy.missing" }];
  const report = buildTrustReport(input, { now });
  // No fallback to the claim-type policy that is present in the bundle.
  assert.equal(report.claims[0]!.status, "proposed");
  assert.equal(report.evidenceRequirementsByClaimId["claim.api"], undefined);
  // One cause, one blocking gap: not also a no-verification-policy gap.
  assert.deepEqual(gapsFor(report).map((item) => [item.id, item.type, item.blocking]), [
    ["claim.api.gap.unresolved-verification-policy", "policy_violation", true],
  ]);

  // Version "2" falls back to the claim-type policy, which the evidence satisfies.
  const v2 = buildTrustReport(input, { now, statusFunctionVersion: "2" });
  assert.equal(v2.claims[0]!.status, "verified");
  assert.deepEqual(v2.evidenceRequirementsByClaimId["claim.api"]?.requiredEvidenceTypes, ["test_output"]);
  assert.ok(gapsFor(v2).some((item) => item.id === "claim.api.gap.unresolved-verification-policy" && item.blocking));
});

test("explainClaim reports each check's own result, so it agrees with the gap beside it", () => {
  const report = buildTrustReport(bundle([
    evidence("evidence.result-less"),
    evidence("evidence.failed", { passing: false, blocking: false }),
  ]), { now });
  const explanation = explainClaim(report, "claim.api");
  assert.equal(explanation.status, "proposed");
  // Neither item passed; reporting `true` here would contradict the check-result gap.
  assert.deepEqual(explanation.evidence.map((item) => item.passing), [null, false]);
  assert.ok(explanation.why.transparencyGaps.some((gap) => gap.id === "claim.api.gap.check-result-missing-test_output"));

  const passing = explainClaim(buildTrustReport(bundle([evidence("evidence.pass", { passing: true })]), { now }), "claim.api");
  assert.deepEqual(passing.evidence.map((item) => item.passing), [true]);
});
