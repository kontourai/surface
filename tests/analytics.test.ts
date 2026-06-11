import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  buildTrustAnalyticsProjection,
  buildTrustReport,
  validateTrustBundle,
  type TrustBundle,
} from "../src/index.js";

const execFileAsync = promisify(execFile);

test("builds a deterministic trust analytics projection from a report", async () => {
  const raw = await readFile("examples/surface-fixtures.json", "utf8");
  const input = validateTrustBundle(JSON.parse(raw));
  const report = buildTrustReport(input, {
    id: "analytics-report",
    now: new Date("2026-04-25T00:00:00.000Z"),
  });

  const projection = buildTrustAnalyticsProjection(report);

  assert.equal(projection.reportId, "analytics-report");
  assert.equal(projection.totals.claims, 4);
  assert.equal(projection.totals.evidence, 5);
  assert.equal(projection.coverageBySurface.map((item) => item.surface).join(","), [
    "fact-resolution.financial-facts",
    "field-attested-records.public-data",
    "repo-governance.developer-evidence",
    "surface.roadmap",
  ].join(","));
  assert.deepEqual(
    projection.staleClaims.map((item) => item.claimId),
    ["claim.field-attested-records.registration-status"],
  );
  assert.equal(projection.transparencyGaps.bySeverity.high, 1);
  assert.equal(projection.evidenceGaps.some((gap) => gap.gapType === "freshness_breach"), true);
  assert.equal(projection.actionQueues.reverifyStale[0].claimId, "claim.field-attested-records.registration-status");
});

test("surfaces weak attestations without changing trust report status", async () => {
  const raw = await readFile("examples/surface-fixtures.json", "utf8");
  const input = validateTrustBundle(JSON.parse(raw));
  const report = buildTrustReport(input, {
    id: "analytics-report",
    now: new Date("2026-04-25T00:00:00.000Z"),
  });

  const projection = buildTrustAnalyticsProjection(report);
  const attestation = projection.attestationValidity.items.find((item) => {
    return item.evidenceId === "evidence.field-attested-records.admin-attestation";
  });

  assert.equal(report.claims.find((claim) => claim.id === "claim.field-attested-records.registration-status")?.status, "stale");
  assert.equal(projection.attestationValidity.totalAttestations, 1);
  assert.equal(projection.attestationValidity.weakAttestations, 1);
  assert.equal(attestation?.status, "weak");
  assert.deepEqual(attestation?.gaps, [
    "attestation_identity_unverified",
    "attestation_authority_unverified",
    "attestation_integrity_missing",
  ]);
  assert.equal(projection.evidenceRequirementGaps.some((gap) => gap.gapType === "attestation_identity_unverified"), true);
});

test("recognizes actor-backed attestations with identity, authority, freshness, and integrity", () => {
  const input: TrustBundle = {
    schemaVersion: 3,
    source: "analytics:attestation",
    claims: [{
      id: "claim.attested.valid",
      subjectType: "record",
      subjectId: "record-1",
      surface: "records.public-data",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "OPEN",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      impactLevel: "high",
      verificationPolicyId: "policy.record-field.attestation",
    }],
    evidence: [{
      id: "evidence.attested.valid",
      claimId: "claim.attested.valid",
      evidenceType: "attestation",
      method: "attestation",
      sourceRef: "attestation-log",
      excerptOrSummary: "Domain expert attested the record status.",
      observedAt: "2026-05-01T00:05:00.000Z",
      collectedBy: "did:web:example.com:alice",
      integrityRef: "sha256:attestation",
      metadata: {
        actor: {
          id: "did:web:example.com:alice",
          identityProof: "oidc:example-idp:alice",
          authoritySource: "directory:domain-experts",
        },
        validUntil: "2026-06-01T00:00:00.000Z",
        contentHash: "sha256:attestation",
      },
    }],
    policies: [{
      id: "policy.record-field.attestation",
      claimType: "record-field",
      requiredEvidence: ["attestation"],
      requiredMethods: ["attestation"],
      requiresCorroboration: false,
      acceptanceCriteria: ["domain expert attestation"],
      reviewAuthority: "domain expert",
      validityRule: { kind: "manual" },
      stalenessTriggers: ["source changes"],
      conflictRules: ["newer value conflicts"],
      impactLevel: "high",
    }],
    events: [{
      id: "event.attested.valid",
      claimId: "claim.attested.valid",
      status: "verified",
      actor: "did:web:example.com:alice",
      method: "attestation",
      evidenceIds: ["evidence.attested.valid"],
      createdAt: "2026-05-01T00:05:00.000Z",
      verifiedAt: "2026-05-01T00:05:00.000Z",
    }],
  };

  const report = buildTrustReport(validateTrustBundle(input), {
    id: "valid-attestation",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);

  assert.equal(projection.attestationValidity.totalAttestations, 1);
  assert.equal(projection.attestationValidity.validAttestations, 1);
  assert.equal(projection.attestationValidity.items[0].status, "valid");
  assert.deepEqual(projection.attestationValidity.items[0].gaps, []);
});

test("orders and filters review queue items by ordinal materiality", () => {
  const input: TrustBundle = {
    schemaVersion: 3,
    source: "analytics:materiality",
    claims: [{
      id: "claim.low",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "low evidence",
      value: true,
      impactLevel: "high",
      materiality: "low",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    }, {
      id: "claim.high",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "high evidence",
      value: true,
      impactLevel: "high",
      materiality: "high",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    }, {
      id: "claim.medium",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "medium evidence",
      value: true,
      impactLevel: "high",
      materiality: "medium",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    }],
    evidence: [],
    policies: [],
    events: [],
  };

  const report = buildTrustReport(validateTrustBundle(input), {
    id: "materiality-queues",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);

  assert.deepEqual(
    projection.actionQueues.reviewNow.map((item) => item.claimId),
    ["claim.high", "claim.medium", "claim.low"],
  );
  assert.deepEqual(
    projection.transparencyGaps.items.map((item) => item.materiality),
    ["high", "medium", "low"],
  );
  assert.deepEqual(
    projection.actionQueues.reviewNow.filter((item) => item.materiality === "high").map((item) => item.claimId),
    ["claim.high"],
  );
});

test("analytics carries materiality on generated derived-claim gaps", () => {
  const input: TrustBundle = {
    schemaVersion: 3,
    source: "analytics:derived-materiality",
    claims: [{
      id: "claim.medium-cycle",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "medium cycle",
      value: true,
      impactLevel: "high",
      materiality: "medium",
      derivedFrom: ["claim.high-cycle"],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    }, {
      id: "claim.high-cycle",
      subjectType: "repo",
      subjectId: "repo-1",
      surface: "surface",
      claimType: "software-evidence",
      fieldOrBehavior: "high cycle",
      value: true,
      impactLevel: "high",
      materiality: "high",
      derivedFrom: ["claim.medium-cycle"],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    }],
    evidence: [],
    policies: [],
    events: [],
  };

  const report = buildTrustReport(validateTrustBundle(input), {
    id: "derived-materiality-analytics",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);
  const cycleGaps = projection.transparencyGaps.items.filter((item) => item.type === "unsupported_inference");

  assert.deepEqual(
    [...new Set(cycleGaps.map((item) => item.materiality))],
    ["high", "medium"],
  );
  assert.deepEqual(
    [...new Set(cycleGaps.filter((item) => item.materiality === "high").map((item) => item.claimId))],
    ["claim.high-cycle"],
  );
});

test("analytics sorts and filters contradiction gaps by owning claim materiality only", () => {
  const input: TrustBundle = {
    schemaVersion: 3,
    source: "analytics:contradiction-materiality",
    claims: [{
      id: "claim.absent-owner",
      subjectType: "record",
      subjectId: "record-1",
      surface: "records",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "open",
      impactLevel: "high",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      verificationPolicyId: "policy.record-status",
    }, {
      id: "claim.high-owner",
      subjectType: "record",
      subjectId: "record-2",
      surface: "records",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "open",
      impactLevel: "high",
      materiality: "high",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      verificationPolicyId: "policy.record-status",
    }, {
      id: "claim.high-peer",
      subjectType: "record",
      subjectId: "record-1",
      surface: "records",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "closed",
      impactLevel: "high",
      materiality: "high",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      verificationPolicyId: "policy.record-status",
    }, {
      id: "claim.low-peer",
      subjectType: "record",
      subjectId: "record-2",
      surface: "records",
      claimType: "record-field",
      fieldOrBehavior: "status",
      value: "closed",
      impactLevel: "high",
      materiality: "low",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      verificationPolicyId: "policy.record-status",
    }],
    evidence: [],
    policies: [{
      id: "policy.record-status",
      claimType: "record-field",
      requiredEvidence: [],
      requiredMethods: [],
      requiresCorroboration: false,
      acceptanceCriteria: ["statuses do not conflict"],
      reviewAuthority: "ops",
      validityRule: { kind: "manual" },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "high",
      incompatibleValues: [{ values: ["open", "closed"] }],
    }],
    events: [],
  };

  const report = buildTrustReport(validateTrustBundle(input), {
    id: "contradiction-materiality-analytics",
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);

  assert.deepEqual(
    projection.actionQueues.resolveConflicts.map((item) => [item.claimId, item.materiality]),
    [["claim.high-owner", "high"], ["claim.absent-owner", undefined]],
  );
  assert.deepEqual(
    projection.actionQueues.resolveConflicts.filter((item) => item.materiality === "high").map((item) => item.claimId),
    ["claim.high-owner"],
  );
});

test("CLI exposes projection-backed trust query commands", async () => {
  const stale = await execFileAsync("node", ["bin/surface.mjs", "stale", "--run-id", "query-test"]);
  const staleClaims = JSON.parse(stale.stdout);
  assert.equal(staleClaims[0].claimId, "claim.field-attested-records.registration-status");

  const missing = await execFileAsync("node", ["bin/surface.mjs", "missing", "--run-id", "query-test"]);
  const gaps = JSON.parse(missing.stdout);
  assert.equal(gaps.some((gap: { gapType: string }) => gap.gapType === "attestation_identity_unverified"), true);

  const get = await execFileAsync("node", [
    "bin/surface.mjs",
    "get",
    "--claim-id",
    "claim.field-attested-records.registration-status",
    "--run-id",
    "query-test",
  ]);
  const claimView = JSON.parse(get.stdout);
  assert.equal(claimView.claim.id, "claim.field-attested-records.registration-status");
  assert.equal(claimView.evidence.length, 2);

  const policy = await execFileAsync("node", [
    "bin/surface.mjs",
    "policy",
    "--claim-id",
    "claim.field-attested-records.registration-status",
    "--run-id",
    "query-test",
  ]);
  const policyView = JSON.parse(policy.stdout);
  assert.equal(policyView.policy.id, "policy.public-data-field.short-lived");
  assert.equal(policyView.gaps.some((gap: { gapType: string }) => gap.gapType === "freshness_breach"), true);
});
