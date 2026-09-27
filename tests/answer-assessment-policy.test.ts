import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildTrustReport, evaluateAnswerAssessmentPolicy, ordinaryVerificationPolicy, projectReviewedExtractionEvidence, type ReviewedExtractionEvidenceInput } from "../src/index.js";
import type { TrustBundle } from "../src/types.js";

function bundle(input: { policy?: boolean; supportStrength?: "entails" | "cited" }): TrustBundle {
  return {
    schemaVersion: 5,
    source: "fixture:authorized-bundle",
    claims: [{ id: "claim", subjectType: "answer", subjectId: "answer", claimType: ordinaryVerificationPolicy.claimType, fieldOrBehavior: "answer", value: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", verificationPolicyId: input.policy === false ? undefined : ordinaryVerificationPolicy.id }],
    evidence: [{ id: "evidence", claimId: "claim", supportStrength: input.supportStrength, evidenceType: "test_output", method: "validation", sourceRef: "fixture", excerptOrSummary: "explicit support", observedAt: "2026-01-01T00:00:00.000Z", collectedBy: "fixture", passing: true }],
    policies: input.policy === false ? [] : [ordinaryVerificationPolicy],
    events: [{ id: "verified", claimId: "claim", status: "verified", actor: "owner", method: "review", evidenceIds: ["evidence"], createdAt: "2026-01-01T00:00:00.000Z" }],
  };
}

test("owner assessment requires resolved policy and explicit entailing evidence", () => {
  const explicit = buildTrustReport(bundle({ supportStrength: "entails" }), { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.deepEqual(evaluateAnswerAssessmentPolicy(explicit, "claim"), {
    version: "surface.answer-assessment-policy/v1",
    id: ordinaryVerificationPolicy.id,
    evaluatedAt: "2026-01-02T00:00:00.000Z",
    outcome: "satisfied",
    satisfied: true,
    reasons: [],
  });

  const legacy = buildTrustReport(bundle({}), { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.equal(evaluateAnswerAssessmentPolicy(legacy, "claim")?.satisfied, false);

  const noPolicy = buildTrustReport(bundle({ policy: false, supportStrength: "entails" }), { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.equal(evaluateAnswerAssessmentPolicy(noPolicy, "claim"), null);

  const stale = buildTrustReport(bundle({ supportStrength: "entails" }), { now: new Date("2026-01-02T00:00:00.000Z") });
  stale.claims[0]!.status = "stale";
  assert.equal(evaluateAnswerAssessmentPolicy(stale, "claim")?.outcome, "not-satisfied");

  const failed = buildTrustReport(bundle({ supportStrength: "entails" }), { now: new Date("2026-01-02T00:00:00.000Z") });
  failed.evidence[0]!.passing = false;
  assert.equal(evaluateAnswerAssessmentPolicy(failed, "claim")?.outcome, "not-satisfied");
});

test("answer policy evaluates only declared entails across renamed profiles and required evidence facts", () => {
  const profile = { ...ordinaryVerificationPolicy, id: "product.answer-profile/v9", requiredEvidence: ["test_output" as const], requiredMethods: ["validation" as const] };
  const mixed = bundle({ supportStrength: "entails" });
  mixed.claims[0]!.verificationPolicyId = profile.id;
  mixed.policies = [profile];
  mixed.evidence = [
    { ...mixed.evidence[0]!, id: "cited-required", supportStrength: "cited" },
    { ...mixed.evidence[0]!, id: "entails-wrong-type", supportStrength: "entails", evidenceType: "source_excerpt", method: "observation" },
  ];
  const requiredMixed = buildTrustReport(mixed, { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.ok(evaluateAnswerAssessmentPolicy(requiredMixed, "claim")?.reasons.includes("required-evidence-unmet"));

  const citedOnly = bundle({ supportStrength: "cited" });
  citedOnly.claims[0]!.verificationPolicyId = profile.id;
  citedOnly.policies = [profile];
  assert.equal(evaluateAnswerAssessmentPolicy(buildTrustReport(citedOnly, { now: new Date("2026-01-02T00:00:00.000Z") }), "claim")?.satisfied, false);

  const undeclaredOnly = bundle({});
  undeclaredOnly.claims[0]!.verificationPolicyId = profile.id;
  undeclaredOnly.policies = [profile];
  assert.equal(evaluateAnswerAssessmentPolicy(buildTrustReport(undeclaredOnly, { now: new Date("2026-01-02T00:00:00.000Z") }), "claim")?.satisfied, false);

  const renamedExplicit = bundle({ supportStrength: "entails" });
  renamedExplicit.claims[0]!.verificationPolicyId = profile.id;
  renamedExplicit.policies = [profile];
  assert.equal(evaluateAnswerAssessmentPolicy(buildTrustReport(renamedExplicit, { now: new Date("2026-01-02T00:00:00.000Z") }), "claim")?.satisfied, true);
});

test("assessment bundle identity remains the caller-authorized immutable report handle", () => {
  const left = bundle({ supportStrength: "entails" });
  const right = bundle({ supportStrength: "entails" });
  right.claims[0] = { ...right.claims[0]!, subjectId: "another-answer" };
  const at = new Date("2026-01-02T00:00:00.000Z");
  const leftReport = buildTrustReport(left, { now: at, id: "authorized-bundle-a" });
  const rightReport = buildTrustReport(right, { now: at, id: "authorized-bundle-b" });
  assert.notEqual(leftReport.id, rightReport.id);
});

async function reviewedBundle(claimValue: unknown): Promise<TrustBundle> {
  const input = JSON.parse(await readFile(new URL("tests/fixtures/reviewed-extraction-evidence.v1.json", `file://${process.cwd()}/`), "utf8")) as ReviewedExtractionEvidenceInput;
  const evidence = projectReviewedExtractionEvidence(input).evidence;
  const policy = { ...ordinaryVerificationPolicy, requiredEvidence: ["source_excerpt" as const] };
  return {
    schemaVersion: 5,
    source: "fixture:reviewed-answer",
    claims: [{ id: input.claimId, subjectType: "record", subjectId: "fixture", claimType: ordinaryVerificationPolicy.claimType, fieldOrBehavior: "title", value: claimValue, createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:05:00.000Z", verificationPolicyId: ordinaryVerificationPolicy.id }],
    evidence: [evidence],
    policies: [policy],
    events: [{ id: "event.review", claimId: input.claimId, status: "verified", actor: "reviewer:fixture", method: "review", evidenceIds: [evidence.id], createdAt: "2026-07-20T00:05:00.000Z" }],
  };
}

test("answer assessment refuses a claim whose value differs from the reviewed extraction value", async () => {
  const now = new Date("2026-07-21T00:00:00.000Z");
  const beta = buildTrustReport(await reviewedBundle("Beta"), { now });
  // Status function v2 does not read claim values, so the claim still derives verified.
  assert.equal(beta.claims[0]!.status, "verified");
  const outcome = evaluateAnswerAssessmentPolicy(beta, "claim.directory.title");
  assert.equal(outcome?.outcome, "not-satisfied");
  assert.deepEqual(outcome?.reasons, ["value-unbound"]);

  const alpha = buildTrustReport(await reviewedBundle("Alpha"), { now });
  assert.equal(evaluateAnswerAssessmentPolicy(alpha, "claim.directory.title")?.outcome, "satisfied");
});
