import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrustAnalyticsProjection,
  buildTrustReport,
  validateTrustInput,
  type AuthorityTrace,
  type TrustInput,
} from "../src/index.js";

function makeInput(overrides: Partial<TrustInput> = {}): TrustInput {
  return {
    schemaVersion: 3,
    source: "authority-trace-test",
    claims: [{
      id: "claim.record.status",
      subjectType: "record",
      subjectId: "record-1",
      surface: "public-data.records",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "OPEN",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      impactLevel: "high",
      verificationPolicyId: "policy.record-status",
    }],
    evidence: [{
      id: "evidence.record.attestation",
      claimId: "claim.record.status",
      evidenceType: "attestation",
      method: "attestation",
      sourceRef: "review-log",
      excerptOrSummary: "Record steward approved the status.",
      observedAt: "2026-05-01T00:05:00.000Z",
      collectedBy: "actor:record-steward-1",
      integrityRef: "sha256:attestation",
      metadata: {
        actor: {
          id: "actor:record-steward-1",
          identityProof: "oidc:directory:record-steward-1",
        },
      },
    }],
    policies: [{
      id: "policy.record-status",
      claimType: "record-field",
      requiredEvidence: ["attestation"],
      requiredMethods: ["attestation"],
      acceptanceCriteria: ["authorized steward review"],
      reviewAuthority: "role:record-steward",
      validityRule: { kind: "manual" },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "high",
    }],
    events: [{
      id: "event.record.attestation",
      claimId: "claim.record.status",
      status: "verified",
      actor: "actor:record-steward-1",
      method: "attestation",
      evidenceIds: ["evidence.record.attestation"],
      createdAt: "2026-05-01T00:05:00.000Z",
    }],
    ...overrides,
  };
}

const validAuthorityTrace: AuthorityTrace = {
  id: "authority.record-steward-1",
  subject: { subjectType: "record", subjectId: "record-1" },
  actorRef: "actor:record-steward-1",
  authorityType: "role",
  authorityRef: "role:record-steward",
  sourceRef: "directory:records-team",
  observedAt: "2026-05-01T00:04:00.000Z",
  evidenceIds: ["evidence.record.attestation"],
  claimIds: ["claim.record.status"],
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  integrityRef: "sha256:directory-entry",
  metadata: { directoryTenant: "records" },
};

test("validates and preserves authorityTrace from TrustInput to TrustReport", () => {
  const input = validateTrustInput(makeInput({ authorityTrace: [{ ...validAuthorityTrace }] }));
  const report = buildTrustReport(input, {
    id: "authority-report",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });

  assert.deepEqual(report.authorityTrace, [{ ...validAuthorityTrace }]);
  assert.equal(report.claims[0].status, "verified");
});

test("reports an empty authorityTrace for inputs that omit the field", () => {
  const input = validateTrustInput(makeInput());
  const report = buildTrustReport(input, {
    id: "authority-empty-report",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });

  assert.deepEqual(report.authorityTrace, []);
});

test("rejects malformed authorityTrace records", () => {
  assert.throws(
    () => validateTrustInput({ ...makeInput(), authorityTrace: [{ ...validAuthorityTrace, actorRef: "" }] }),
    /Missing required string field: actorRef/,
  );
  assert.throws(
    () => validateTrustInput({ ...makeInput(), authorityTrace: [{ ...validAuthorityTrace, authorityType: "readiness" }] }),
    /authorityType contains unsupported value/,
  );
  assert.throws(
    () => validateTrustInput({ ...makeInput(), authorityTrace: [{ ...validAuthorityTrace, observedAt: "today" }] }),
    /observedAt must be an ISO-8601 UTC date-time/,
  );
  assert.throws(
    () => validateTrustInput({ ...makeInput(), authorityTrace: [{ ...validAuthorityTrace, extra: true }] }),
    /contains unsupported field: extra/,
  );
  assert.throws(
    () => validateTrustInput({ ...makeInput(), authorityTrace: [{ ...validAuthorityTrace, evidenceIds: ["missing-evidence"] }] }),
    /Authority trace authority.record-steward-1 references unknown evidence missing-evidence/,
  );
  assert.throws(
    () => validateTrustInput({ ...makeInput(), authorityTrace: [{ ...validAuthorityTrace, claimIds: ["missing-claim"] }] }),
    /Authority trace authority.record-steward-1 references unknown claim missing-claim/,
  );
});

test("first-class authorityTrace satisfies attestation authority without metadata authoritySource", () => {
  const input = validateTrustInput(makeInput({ authorityTrace: [{ ...validAuthorityTrace }] }));
  const report = buildTrustReport(input, {
    id: "authority-backed-attestation",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);

  assert.equal(projection.totals.authorityTrace, 1);
  assert.equal(projection.authorityTrace.activeRecords, 1);
  assert.equal(projection.attestationValidity.validAttestations, 1);
  assert.deepEqual(projection.attestationValidity.items[0].authorityTraceIds, ["authority.record-steward-1"]);
  assert.deepEqual(projection.attestationValidity.items[0].gaps, []);
});

test("authorityTrace must match policy reviewAuthority to satisfy attestation authority", () => {
  const input = validateTrustInput(makeInput({
    authorityTrace: [{
      ...validAuthorityTrace,
      id: "authority.unrelated-role",
      authorityRef: "role:unrelated-reviewer",
    }],
  }));
  const report = buildTrustReport(input, {
    id: "authority-mismatch-attestation",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);

  assert.deepEqual(projection.attestationValidity.items[0].authorityTraceIds, ["authority.unrelated-role"]);
  assert.deepEqual(projection.attestationValidity.items[0].gaps, ["attestation_authority_unverified"]);
});
