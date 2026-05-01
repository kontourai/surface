import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustReport, validateTrustInput } from "../src/index.js";
import type { Claim, TrustInput, VerificationPolicy } from "../src/index.js";

const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
  subjectType: "veritas.repo",
  subjectId: "repo-A",
  surface: "veritas.developer-proof",
  claimType: "release-status",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

const basePolicy: Omit<VerificationPolicy, "id" | "claimType"> = {
  requiredEvidence: [],
  requiredProof: [],
  reviewAuthority: "owner",
  validityRule: { kind: "manual" },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "medium",
};

function makeInput(overrides: Partial<TrustInput>): TrustInput {
  return {
    schemaVersion: 3,
    source: "incompat-test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

test("incompatibleValues fires a contradiction for same-subject claim pair", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" },
      { ...baseClaim, id: "claim-b", fieldOrBehavior: "channel", value: "withdrawn" },
    ],
    policies: [
      {
        ...basePolicy,
        id: "policy-release",
        claimType: "release-status",
        incompatibleValues: [
          { values: ["ga", "withdrawn"], message: "A release cannot be GA and withdrawn." },
        ],
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-1", now: new Date("2026-04-26T00:00:00.000Z") });
  const contradictions = report.faultLines.filter((fl) => fl.type === "contradiction");
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].policyId, "policy-release");
  assert.match(contradictions[0].message, /GA and withdrawn/);
  assert.equal((contradictions[0].metadata as Record<string, unknown>).source, "policy.incompatibleValues");
});

test("incompatibleStatuses fires a contradiction across same-subject claim pair", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "claim-a", fieldOrBehavior: "shipped", value: true },
      { ...baseClaim, id: "claim-b", fieldOrBehavior: "shipped", value: true },
    ],
    policies: [
      {
        ...basePolicy,
        id: "policy-release",
        claimType: "release-status",
        incompatibleStatuses: [
          { statuses: ["verified", "rejected"] },
        ],
      },
    ],
    events: [
      {
        id: "ev-a",
        claimId: "claim-a",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
      {
        id: "ev-b",
        claimId: "claim-b",
        status: "rejected",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-2", now: new Date("2026-04-26T00:00:00.000Z") });
  const contradictions = report.faultLines.filter((fl) => fl.type === "contradiction");
  assert.equal(contradictions.length, 1);
  assert.equal((contradictions[0].metadata as Record<string, unknown>).source, "policy.incompatibleStatuses");
  assert.equal(contradictions[0].policyId, "policy-release");
});

test("incompatibleValues fires across canonical subjects linked via identityLinks", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      {
        ...baseClaim,
        id: "claim-a",
        subjectId: "repo-A",
        fieldOrBehavior: "channel",
        value: "ga",
      },
      {
        ...baseClaim,
        id: "claim-b",
        subjectType: "attested-record.provider",
        subjectId: "provider-X",
        fieldOrBehavior: "channel",
        value: "withdrawn",
      },
    ],
    policies: [
      {
        ...basePolicy,
        id: "policy-release",
        claimType: "release-status",
        incompatibleValues: [{ values: ["ga", "withdrawn"] }],
      },
    ],
    identityLinks: [
      {
        subjects: [
          { subjectType: "veritas.repo", subjectId: "repo-A" },
          { subjectType: "attested-record.provider", subjectId: "provider-X" },
        ],
        reason: "Verified handoff",
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-3", now: new Date("2026-04-26T00:00:00.000Z") });
  const contradictions = report.faultLines.filter((fl) => fl.type === "contradiction");
  assert.equal(contradictions.length, 1, "linked subjects should be treated as one canonical group");
  const meta = contradictions[0].metadata as Record<string, unknown>;
  assert.equal(meta.peerClaimId, "claim-b");
  assert.equal(typeof meta.subjectKey, "string");
});

test("incompatibleValues does not fire when subjects are unrelated", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      {
        ...baseClaim,
        id: "claim-a",
        subjectId: "repo-A",
        fieldOrBehavior: "channel",
        value: "ga",
      },
      {
        ...baseClaim,
        id: "claim-b",
        subjectId: "repo-DIFFERENT",
        fieldOrBehavior: "channel",
        value: "withdrawn",
      },
    ],
    policies: [
      {
        ...basePolicy,
        id: "policy-release",
        claimType: "release-status",
        incompatibleValues: [{ values: ["ga", "withdrawn"] }],
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-4", now: new Date("2026-04-26T00:00:00.000Z") });
  const contradictions = report.faultLines.filter((fl) => fl.type === "contradiction");
  assert.equal(contradictions.length, 0);
});

test("validator rejects incompatibleValues entries without exactly two values", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        policies: [
          {
            ...basePolicy,
            id: "policy-bad",
            claimType: "release-status",
            incompatibleValues: [{ values: ["ga"] } as never],
          },
        ],
      })),
    /exactly two values/,
  );
});

test("validator rejects incompatibleStatuses entries with unsupported status", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        policies: [
          {
            ...basePolicy,
            id: "policy-bad",
            claimType: "release-status",
            incompatibleStatuses: [{ statuses: ["verified", "approved"] } as never],
          },
        ],
      })),
    /unsupported status: approved/,
  );
});

test("validator rejects incompatibleStatuses entries without exactly two statuses", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        policies: [
          {
            ...basePolicy,
            id: "policy-bad",
            claimType: "release-status",
            incompatibleStatuses: [{ statuses: ["verified", "rejected", "stale"] } as never],
          },
        ],
      })),
    /exactly two statuses/,
  );
});
