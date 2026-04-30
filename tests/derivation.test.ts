import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustReport, validateTrustInput, weakerStatus } from "../src/index.js";
import type { Claim, TrustInput } from "../src/index.js";

const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
  subjectType: "veritas.repo",
  subjectId: "repo-A",
  surface: "veritas.developer-proof",
  claimType: "software-proof",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

function makeInput(overrides: Partial<TrustInput>): TrustInput {
  return {
    schemaVersion: 3,
    source: "derivation-test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

test("weakerStatus orders rejected below verified", () => {
  assert.equal(weakerStatus("verified", "rejected"), "rejected");
  assert.equal(weakerStatus("stale", "verified"), "stale");
  assert.equal(weakerStatus("proposed", "unknown"), "unknown");
});

test("derived claim inherits the weakest input status", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "input-1", fieldOrBehavior: "passes", value: true },
      { ...baseClaim, id: "input-2", fieldOrBehavior: "passes", value: true },
      {
        ...baseClaim,
        id: "derived",
        fieldOrBehavior: "release-ready",
        value: true,
        derivedFrom: ["input-1", "input-2"],
      },
    ],
    events: [
      {
        id: "ev-1",
        claimId: "input-1",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
      {
        id: "ev-2",
        claimId: "input-2",
        status: "rejected",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
      {
        id: "ev-derived",
        claimId: "derived",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-derived", now: new Date("2026-04-26T00:00:00.000Z") });
  const derived = report.claims.find((c) => c.id === "derived");
  assert.ok(derived);
  assert.equal(derived!.status, "rejected", "derived claim cannot be more confident than its rejected input");
});

test("derived claim inherits stale freshness from inputs", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "input-stale", fieldOrBehavior: "passes", value: true },
      {
        ...baseClaim,
        id: "derived",
        fieldOrBehavior: "release-ready",
        value: true,
        derivedFrom: ["input-stale"],
      },
    ],
    policies: [
      {
        id: "policy-stale",
        claimType: "software-proof",
        requiredEvidence: [],
        requiredProof: [],
        reviewAuthority: "owner",
        validityRule: { kind: "duration", durationDays: 1 },
        stalenessTriggers: [],
        conflictRules: [],
        impactLevel: "medium",
      },
    ],
    events: [
      {
        id: "ev-stale",
        claimId: "input-stale",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-01T00:00:00.000Z",
        verifiedAt: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "ev-derived",
        claimId: "derived",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
        verifiedAt: "2026-04-25T01:00:00.000Z",
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-stale", now: new Date("2026-04-26T00:00:00.000Z") });
  const derived = report.claims.find((c) => c.id === "derived");
  assert.equal(derived!.status, "stale", "derived claim should inherit stale ceiling from its input");
});

test("derived chains propagate transitively", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "leaf", fieldOrBehavior: "passes", value: true },
      {
        ...baseClaim,
        id: "middle",
        fieldOrBehavior: "passes",
        value: true,
        derivedFrom: ["leaf"],
      },
      {
        ...baseClaim,
        id: "top",
        fieldOrBehavior: "release-ready",
        value: true,
        derivedFrom: ["middle"],
      },
    ],
    events: [
      {
        id: "ev-leaf",
        claimId: "leaf",
        status: "disputed",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-chain", now: new Date("2026-04-26T00:00:00.000Z") });
  const top = report.claims.find((c) => c.id === "top");
  assert.equal(top!.status, "disputed", "transitive derivation should carry weakest input through the chain");
});

test("derivedFrom cycles are detected and emit unsupported_inference", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      {
        ...baseClaim,
        id: "claim-a",
        fieldOrBehavior: "passes",
        value: true,
        derivedFrom: ["claim-b"],
      },
      {
        ...baseClaim,
        id: "claim-b",
        fieldOrBehavior: "passes",
        value: true,
        derivedFrom: ["claim-a"],
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-cycle", now: new Date("2026-04-26T00:00:00.000Z") });
  const cycleFaults = report.faultLines.filter(
    (fl) => fl.type === "unsupported_inference" && (fl.metadata as Record<string, unknown> | undefined)?.source === "derivation.cycle",
  );
  assert.ok(cycleFaults.length >= 1, "expected at least one cycle fault line");
});

test("validator rejects derivedFrom referencing the claim itself", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        claims: [
          {
            ...baseClaim,
            id: "self-ref",
            fieldOrBehavior: "passes",
            value: true,
            derivedFrom: ["self-ref"],
          },
        ],
      })),
    /cannot list itself/,
  );
});

test("validator rejects derivedFrom referencing unknown claim", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        claims: [
          {
            ...baseClaim,
            id: "claim-a",
            fieldOrBehavior: "passes",
            value: true,
            derivedFrom: ["does-not-exist"],
          },
        ],
      })),
    /derives from unknown claim/,
  );
});
