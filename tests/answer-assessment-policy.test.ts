import assert from "node:assert/strict";
import test from "node:test";
import { buildTrustReport, evaluateAnswerAssessmentPolicy, ordinaryVerificationPolicy } from "../src/index.js";
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
    id: ordinaryVerificationPolicy.id,
    outcome: "satisfied",
    satisfied: true,
  });

  const legacy = buildTrustReport(bundle({}), { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.equal(evaluateAnswerAssessmentPolicy(legacy, "claim")?.satisfied, false);

  const noPolicy = buildTrustReport(bundle({ policy: false, supportStrength: "entails" }), { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.equal(evaluateAnswerAssessmentPolicy(noPolicy, "claim"), null);
});
