import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveTrustSnapshot,
  evidenceEntailsClaim,
  evidenceSupportStrength,
  partitionEvidenceBySupport,
  validateTrustBundle,
} from "../src/index.js";
import type { Claim, Evidence, TrustBundle, VerificationEvent, VerificationPolicy } from "../src/types.js";

const claim: Claim = {
  id: "claim.support-strength",
  subjectType: "record",
  subjectId: "record-1",
  facet: "records.public",
  claimType: "record-status",
  fieldOrBehavior: "status",
  value: "active",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  verificationPolicyId: "policy.record-status",
};

const policy: VerificationPolicy = {
  id: "policy.record-status",
  claimType: "record-status",
  requiredEvidence: ["source_excerpt"],
  requiredMethods: ["observation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["source states the current status"],
  reviewAuthority: "records system",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["source changes"],
  conflictRules: ["newer source conflicts"],
  impactLevel: "high",
};

const verifiedEvent: VerificationEvent = {
  id: "event.support-strength.verified",
  claimId: claim.id,
  status: "verified",
  actor: "records system",
  method: "source review",
  evidenceIds: ["evidence.support-strength"],
  createdAt: "2026-05-01T00:05:00.000Z",
  verifiedAt: "2026-05-01T00:05:00.000Z",
};

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "evidence.support-strength",
    claimId: claim.id,
    evidenceType: "source_excerpt",
    method: "observation",
    sourceRef: "records-export",
    excerptOrSummary: "Record page mentions record-1.",
    observedAt: "2026-05-01T00:01:00.000Z",
    collectedBy: "crawler",
    ...overrides,
  };
}

function inputWith(evidenceRecord: Evidence): TrustBundle {
  return {
    schemaVersion: 2,
    source: "support-strength:test",
    claims: [claim],
    evidence: [evidenceRecord],
    policies: [policy],
    events: [{ ...verifiedEvent, evidenceIds: [evidenceRecord.id] }],
  };
}

test("evidence support helper defaults omitted strength to entails", () => {
  const legacy = evidence();
  const cited = evidence({ id: "evidence.cited", supportStrength: "cited" });
  const entails = evidence({ id: "evidence.entails", supportStrength: "entails" });

  assert.equal(evidenceSupportStrength(legacy), "entails");
  assert.equal(evidenceEntailsClaim(legacy), true);
  assert.equal(evidenceSupportStrength(cited), "cited");
  assert.equal(evidenceEntailsClaim(cited), false);
  assert.deepEqual(partitionEvidenceBySupport([legacy, cited, entails]), {
    entailingEvidence: [legacy, entails],
    citedEvidence: [cited],
  });
});

test("validator accepts omitted, cited, and entails evidence support strength", () => {
  assert.equal(validateTrustBundle(inputWith(evidence())).evidence[0].supportStrength, undefined);
  assert.equal(validateTrustBundle(inputWith(evidence({ supportStrength: "cited" }))).evidence[0].supportStrength, "cited");
  assert.equal(validateTrustBundle(inputWith(evidence({ supportStrength: "entails" }))).evidence[0].supportStrength, "entails");
});

test("validator rejects unsupported evidence support strength", () => {
  assert.throws(
    () => validateTrustBundle(inputWith(evidence({ supportStrength: "weak" as Evidence["supportStrength"] }))),
    /Evidence evidence\.support-strength supportStrength contains unsupported value: weak/,
  );
});

test("cited-only evidence produces unsupported inference and does not verify", () => {
  const now = new Date("2026-05-01T00:10:00.000Z");
  const snapshot = deriveTrustSnapshot(validateTrustBundle(inputWith(evidence({ supportStrength: "cited" }))), { now });
  const gap = snapshot.transparencyGaps.find((item) => item.type === "unsupported_inference");

  assert.equal(snapshot.claims[0].status, "proposed");
  assert.ok(gap);
  assert.equal(gap.id, "claim.support-strength.gap.unsupported-inference");
  assert.equal(gap.claimId, claim.id);
  assert.deepEqual(gap.evidenceIds, ["evidence.support-strength"]);
  assert.equal(gap.policyId, policy.id);
  assert.equal(gap.blocking, true);
});

test("entailing and legacy evidence satisfy policy support", () => {
  const now = new Date("2026-05-01T00:10:00.000Z");
  const explicit = deriveTrustSnapshot(validateTrustBundle(inputWith(evidence({ supportStrength: "entails" }))), { now });
  const legacy = deriveTrustSnapshot(validateTrustBundle(inputWith(evidence())), { now });

  assert.equal(explicit.claims[0].status, "verified");
  assert.equal(explicit.transparencyGaps.some((item) => item.type === "unsupported_inference"), false);
  assert.equal(legacy.claims[0].status, "verified");
  assert.equal(legacy.transparencyGaps.some((item) => item.type === "unsupported_inference"), false);
});

test("corroboration requires two entailing evidence records", () => {
  const now = new Date("2026-05-01T00:10:00.000Z");
  const entailing = evidence({ id: "evidence.entails", supportStrength: "entails" });
  const cited = evidence({ id: "evidence.cited", supportStrength: "cited" });
  const snapshot = deriveTrustSnapshot(
    validateTrustBundle({
      schemaVersion: 2,
      source: "support-strength:test",
      claims: [claim],
      evidence: [entailing, cited],
      policies: [{ ...policy, requiresCorroboration: true }],
      events: [{ ...verifiedEvent, evidenceIds: [entailing.id, cited.id] }],
    }),
    { now },
  );

  assert.equal(snapshot.claims[0].status, "proposed");
});
