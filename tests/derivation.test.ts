import test from "node:test";
import assert from "node:assert/strict";
import { applyDerivation, buildTrustReport, validateTrustInput, weakerStatus } from "../src/index.js";
import type { Claim, TrustInput } from "../src/index.js";

const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
  subjectType: "repo-governance.repo",
  subjectId: "repo-A",
  surface: "repo-governance.developer-evidence",
  claimType: "software-evidence",
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
  assert.equal(weakerStatus("verified", "assumed"), "assumed");
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
        claimType: "software-evidence",
        requiredEvidence: [],
        acceptanceCriteria: [],
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
  assert.equal(report.summary.recomputeNeededClaims.includes("derived"), true);
  assert.deepEqual(
    report.changeRecords.map((record) => record.reason),
    ["input-stale"],
  );
});

test("structured derivation edges drive status ceiling and recompute records", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "wages", fieldOrBehavior: "w2.wages", value: 82000 },
      { ...baseClaim, id: "withholding", fieldOrBehavior: "w2.federalIncomeTaxWithheld", value: 9100 },
      {
        ...baseClaim,
        id: "withholding-position",
        fieldOrBehavior: "withholdingPosition",
        value: "withholding-present",
        derivationEdges: [
          {
            inputClaimId: "wages",
            method: "rule-application",
            role: "wage-input",
            supportStrength: "strong",
          },
          {
            inputClaimId: "withholding",
            method: "rule-application",
            role: "withholding-input",
            supportStrength: "strong",
          },
        ],
      },
    ],
    events: [
      {
        id: "ev-wages",
        claimId: "wages",
        status: "stale",
        actor: "survey-proof",
        method: "corrected-source-arrived",
        evidenceIds: [],
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "ev-withholding",
        claimId: "withholding",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "ev-derived",
        claimId: "withholding-position",
        status: "verified",
        actor: "rule-engine",
        method: "rule-application",
        evidenceIds: [],
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-structured-derive", now: new Date("2026-06-02T00:00:00.000Z") });
  const derived = report.claims.find((c) => c.id === "withholding-position");
  assert.equal(derived?.status, "stale");
  assert.deepEqual(report.summary.recomputeNeededClaims, ["withholding-position"]);
  assert.equal(report.changeRecords.length, 1);
  assert.equal(report.changeRecords[0].claimId, "withholding-position");
  assert.equal(report.changeRecords[0].reason, "input-stale");
  assert.equal(report.changeRecords[0].action, "recompute");
  assert.deepEqual(report.changeRecords[0].inputClaimIds, ["wages"]);
});

test("assumed inputs downgrade derived claims and create review records", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "assumption", fieldOrBehavior: "filingStatus", value: "single", status: "assumed" },
      {
        ...baseClaim,
        id: "derived",
        fieldOrBehavior: "taxPosition",
        value: "estimate",
        derivedFrom: ["assumption"],
        status: "verified",
      },
    ],
    events: [
      {
        id: "ev-assumption",
        claimId: "assumption",
        status: "assumed",
        actor: "planner",
        method: "planning-assumption",
        evidenceIds: [],
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "ev-derived",
        claimId: "derived",
        status: "verified",
        actor: "rule-engine",
        method: "rule-application",
        evidenceIds: [],
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "report-assumed", now: new Date("2026-06-02T00:00:00.000Z") });
  const derived = report.claims.find((c) => c.id === "derived");
  assert.equal(derived?.status, "assumed");
  assert.equal(report.changeRecords[0].reason, "input-assumed");
  assert.equal(report.changeRecords[0].action, "review");
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
  const topChange = report.changeRecords.find((record) => record.claimId === "top");
  assert.equal(topChange?.reason, "input-disputed");
  assert.deepEqual(topChange?.inputClaimIds, ["leaf"]);
});

test("derivedFrom cycles are detected and emit unsupported_inference", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      {
        ...baseClaim,
        id: "claim-a",
        fieldOrBehavior: "passes",
        value: true,
        materiality: "high",
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
  const cycleGaps = report.transparencyGaps.filter(
    (fl) => fl.type === "unsupported_inference" && (fl.metadata as Record<string, unknown> | undefined)?.source === "derivation.cycle",
  );
  assert.ok(cycleGaps.length >= 1, "expected at least one cycle transparency gap");
  assert.equal(cycleGaps.find((gap) => gap.claimId === "claim-a")?.materiality, "high");
});

test("derivedFrom cycle gaps omit materiality when the claim has none", () => {
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

  const report = buildTrustReport(input, { id: "report-cycle-no-materiality", now: new Date("2026-04-26T00:00:00.000Z") });
  const cycleGap = report.transparencyGaps.find(
    (gap) => gap.claimId === "claim-a" && (gap.metadata as Record<string, unknown> | undefined)?.source === "derivation.cycle",
  );
  assert.ok(cycleGap);
  assert.equal(Object.hasOwn(cycleGap, "materiality"), false);
});

test("missing derivation input gaps inherit claim materiality", () => {
  const claim: Claim = {
    ...baseClaim,
    id: "derived",
    fieldOrBehavior: "release-ready",
    value: true,
    materiality: "high",
    derivedFrom: ["missing-input"],
  };

  const outcome = applyDerivation({
    claim,
    ownStatus: "verified",
    ownStatusByClaimId: new Map(),
    claimsById: new Map([[claim.id, claim]]),
    now: new Date("2026-04-26T00:00:00.000Z"),
  });

  const missingGap = outcome.transparencyGaps.find(
    (gap) => (gap.metadata as Record<string, unknown> | undefined)?.source === "derivation.missing",
  );
  assert.equal(missingGap?.materiality, "high");
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

test("validator rejects derivationEdges referencing unknown claim", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        claims: [
          {
            ...baseClaim,
            id: "claim-a",
            fieldOrBehavior: "passes",
            value: true,
            derivationEdges: [{ inputClaimId: "does-not-exist", method: "rule-application" }],
          },
        ],
      })),
    /derives from unknown claim/,
  );
});
