import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildTrustAnalyticsProjection,
  buildTrustReport,
  validateTrustInput,
  type IntegrityAnchor,
  type TrustInput,
} from "../src/index.js";

const evidenceAnchor: IntegrityAnchor = {
  id: "anchor.attestation.hash",
  kind: "hash",
  algorithm: "sha256",
  value: "sha256:attestation",
  sourceRef: "review-log",
  observedAt: "2026-05-01T00:05:00.000Z",
  verificationStatus: "unverified",
  metadata: { producer: "records-producer" },
};

const authorityAnchor: IntegrityAnchor = {
  id: "anchor.directory-entry.log",
  kind: "transparency_log",
  algorithm: "rekor-v1",
  value: "rekor:records-team:directory-entry",
  sourceRef: "directory:records-team",
  observedAt: "2026-05-01T00:04:00.000Z",
  verificationStatus: "unverified",
};

function makeInput(overrides: Partial<TrustInput> = {}): TrustInput {
  return {
    schemaVersion: 3,
    source: "integrity-anchor-test",
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
      currentIntegrityRef: "sha256:claim-snapshot",
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
    authorityTrace: [{
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
      verifiedAt: "2026-05-01T00:05:00.000Z",
    }],
    ...overrides,
  };
}

test("legacy string integrity refs and missing structured anchors remain valid", () => {
  const input = validateTrustInput(makeInput());
  const report = buildTrustReport(input, {
    id: "legacy-integrity-ref",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);

  assert.equal(report.claims[0].currentIntegrityRef, "sha256:claim-snapshot");
  assert.equal(report.evidence[0].integrityRef, "sha256:attestation");
  assert.equal(report.evidence[0].integrityAnchor, undefined);
  assert.equal(projection.attestationValidity.items[0].integrityRef, "sha256:attestation");
  assert.deepEqual(projection.attestationValidity.items[0].gaps, []);
});

test("structured anchors in examples validate beside legacy refs", async () => {
  const raw = await readFile("examples/authority-trace-export.json", "utf8");
  const input = validateTrustInput(JSON.parse(raw));

  assert.equal(input.evidence[0].integrityRef, "sha256:attestation");
  assert.equal(input.evidence[0].integrityAnchor?.verificationStatus, "unverified");
  assert.equal(input.authorityTrace?.[0].integrityRef, "sha256:directory-entry");
  assert.equal(input.authorityTrace?.[0].integrityAnchor?.kind, "transparency_log");
});

test("trust input schema uses strict claim and evidence item schemas", async () => {
  const raw = await readFile("schemas/trust-input.schema.json", "utf8");
  const schema = JSON.parse(raw) as {
    properties: {
      claims: { items: { $ref?: string; type?: string } };
      evidence: { items: { $ref?: string; type?: string } };
    };
  };

  assert.deepEqual(schema.properties.claims.items, { $ref: "claim.schema.json" });
  assert.deepEqual(schema.properties.evidence.items, { $ref: "evidence.schema.json" });
});

test("unverified structured anchors validate and project as inspectable metadata", () => {
  const input = validateTrustInput(makeInput({
    evidence: [{ ...makeInput().evidence[0], integrityAnchor: evidenceAnchor }],
    authorityTrace: [{ ...makeInput().authorityTrace![0], integrityAnchor: authorityAnchor }],
  }));
  const report = buildTrustReport(input, {
    id: "unverified-anchor-projection",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);

  assert.equal(report.claims[0].status, "verified");
  assert.equal(projection.authorityTrace.records[0].integrityAnchor?.verificationStatus, "unverified");
  assert.equal(projection.attestationValidity.items[0].integrityAnchor?.id, "anchor.attestation.hash");
  assert.equal(projection.attestationValidity.items[0].status, "valid");
  assert.deepEqual(projection.attestationValidity.items[0].gaps, []);
});

test("structured anchors alone do not satisfy attestation integrity or alter claim truth", () => {
  const input = validateTrustInput(makeInput({
    claims: [{
      ...makeInput().claims[0],
      currentIntegrityRef: undefined,
      currentIntegrityAnchor: {
        id: "anchor.claim.current",
        kind: "external_ref",
        algorithm: "uri",
        value: "urn:claim-snapshot:record-1",
        sourceRef: "claim-snapshot-log",
        verificationStatus: "unverified",
      },
    }],
    evidence: [{
      ...makeInput().evidence[0],
      integrityRef: undefined,
      integrityAnchor: evidenceAnchor,
    }],
    authorityTrace: [{
      ...makeInput().authorityTrace![0],
      integrityRef: undefined,
      integrityAnchor: authorityAnchor,
    }],
  }));
  const report = buildTrustReport(input, {
    id: "anchor-without-legacy-integrity",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);
  const attestation = projection.attestationValidity.items[0];

  assert.equal(report.claims[0].status, "verified");
  assert.equal(report.claims[0].currentIntegrityAnchor?.verificationStatus, "unverified");
  assert.equal(attestation.integrityRef, undefined);
  assert.equal(attestation.integrityAnchor?.verificationStatus, "unverified");
  assert.equal(attestation.status, "weak");
  assert.deepEqual(attestation.gaps, ["attestation_integrity_missing"]);
  assert.equal(
    projection.evidenceRequirementGaps.some((gap) => gap.gapType === "attestation_integrity_missing"),
    true,
  );
});

test("malformed present anchors fail validation with useful errors", () => {
  const baseEvidence = makeInput().evidence[0];
  const cases: Array<{ name: string; integrityAnchor: unknown; message: RegExp }> = [
    {
      name: "non-object",
      integrityAnchor: "sha256:attestation",
      message: /evidence evidence\.record\.attestation integrityAnchor must be an object/,
    },
    {
      name: "missing required field",
      integrityAnchor: { ...evidenceAnchor, value: undefined },
      message: /Missing required string field: value/,
    },
    {
      name: "unsupported kind",
      integrityAnchor: { ...evidenceAnchor, kind: "merkle_root" },
      message: /kind contains unsupported value/,
    },
    {
      name: "unsupported status",
      integrityAnchor: { ...evidenceAnchor, verificationStatus: "trusted" },
      message: /verificationStatus contains unsupported value/,
    },
    {
      name: "bad date",
      integrityAnchor: { ...evidenceAnchor, observedAt: "today" },
      message: /observedAt must be an ISO-8601 UTC date-time/,
    },
    {
      name: "unknown field",
      integrityAnchor: { ...evidenceAnchor, proof: "inline" },
      message: /evidence evidence\.record\.attestation integrityAnchor contains unsupported field: proof/,
    },
  ];

  for (const { name, integrityAnchor, message } of cases) {
    assert.throws(
      () => validateTrustInput(makeInput({
        evidence: [{ ...baseEvidence, integrityAnchor } as TrustInput["evidence"][number]],
      })),
      message,
      name,
    );
  }
});
