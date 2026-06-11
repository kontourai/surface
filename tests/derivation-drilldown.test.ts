import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDerivationDrilldown, buildTrustReport, validateTrustBundle } from "../src/index.js";
import { runCli } from "../src/cli.js";
import type { Claim, Evidence, TrustBundle, TrustReport, VerificationEvent } from "../src/index.js";

const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
  subjectType: "repo-governance.repo",
  subjectId: "repo-A",
  surface: "repo-governance.developer-evidence",
  claimType: "software-evidence",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

function makeInput(overrides: Partial<TrustBundle>): TrustBundle {
  return {
    schemaVersion: 3,
    source: "derivation-drilldown-test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

function evidence(id: string, claimId: string): Evidence {
  return {
    id,
    claimId,
    supportStrength: "entails",
    evidenceType: "test_output",
    method: "validation",
    sourceRef: `run:${id}`,
    excerptOrSummary: `${claimId} passed`,
    observedAt: "2026-06-01T00:00:00.000Z",
    collectedBy: "ci",
  };
}

function verifiedEvent(id: string, claimId: string, evidenceIds: string[] = []): VerificationEvent {
  return {
    id,
    claimId,
    status: "verified",
    actor: "ci",
    method: "validation",
    evidenceIds,
    createdAt: "2026-06-01T00:00:00.000Z",
    verifiedAt: "2026-06-01T00:00:00.000Z",
  };
}

function minimalReport(claims: TrustReport["claims"]): TrustReport {
  return {
    schemaVersion: 3,
    id: "report-drilldown-regression",
    generatedAt: "2026-06-01T00:00:00.000Z",
    source: "derivation-drilldown-test",
    claims,
    evidence: [],
    policies: [],
    events: [],
    evidenceRequirementsByClaimId: {},
    transparencyGaps: [],
    changeRecords: [],
    subjectGroups: [],
    claimGroupRollups: [],
    summary: {
      totalClaims: claims.length,
      byStatus: {
        unknown: 0,
        proposed: 0,
        assumed: 0,
        verified: claims.filter((claim) => claim.status === "verified").length,
        stale: 0,
        disputed: 0,
        superseded: 0,
        rejected: 0,
      },
      bySurface: {},
      staleClaims: [],
      disputedClaims: [],
      highImpactUnsupported: [],
      recomputeNeededClaims: [],
      transparencyGapsByType: {
        contradiction: 0,
        provenance_gap: 0,
        policy_violation: 0,
        freshness_breach: 0,
        corroboration_absent: 0,
        unsupported_inference: 0,
      },
      confidenceBasis: {
        sourceQuality: {},
        reviewerAuthority: {},
        evidenceStrength: {},
        corroboratedClaims: 0,
        averageExtractionConfidence: null,
        freshnessAtRisk: [],
        conflictedClaims: [],
      },
    },
  };
}

test("drilldown exposes one-hop structured derivation methods and leaf evidence", () => {
  const input = validateTrustBundle(makeInput({
    claims: [
      { ...baseClaim, id: "build-score", fieldOrBehavior: "build.score", value: 82 },
      { ...baseClaim, id: "release-exception", fieldOrBehavior: "release.exception-count", value: 2 },
      {
        ...baseClaim,
        id: "release-readiness-score",
        fieldOrBehavior: "release.readiness-score",
        value: 80,
        derivationEdges: [
          {
            inputClaimId: "build-score",
            method: "sum",
            role: "quality-input",
            supportStrength: "strong",
            rationale: "Included in readiness score.",
          },
          {
            inputClaimId: "release-exception",
            method: "rule-application",
            role: "exception-input",
            supportStrength: "moderate",
          },
        ],
      },
    ],
    evidence: [evidence("evd-build-score", "build-score"), evidence("evd-release-exception", "release-exception")],
    events: [
      verifiedEvent("event-build-score", "build-score", ["evd-build-score"]),
      verifiedEvent("event-release-exception", "release-exception", ["evd-release-exception"]),
      verifiedEvent("event-release-readiness-score", "release-readiness-score"),
    ],
  }));

  const report = buildTrustReport(input, { id: "report-drilldown-one-hop" });
  const drilldown = buildDerivationDrilldown(report, "release-readiness-score");

  assert.equal(drilldown.claim.id, "release-readiness-score");
  assert.deepEqual(drilldown.directInputs.map((item) => item.inputClaimId), ["build-score", "release-exception"]);
  assert.deepEqual(drilldown.directInputs.map((item) => item.edge?.method), ["sum", "rule-application"]);
  assert.equal(drilldown.directInputs[0]?.edge?.role, "quality-input");
  assert.equal(drilldown.directInputs[0]?.evidence[0]?.id, "evd-build-score");
  assert.deepEqual(drilldown.leafClaims.map((item) => item.claim.id), ["build-score", "release-exception"]);
  assert.deepEqual(drilldown.leafClaims.flatMap((item) => item.evidence.map((evidenceItem) => evidenceItem.id)), ["evd-build-score", "evd-release-exception"]);
});

test("drilldown walks two-hop derivations mixing derivedFrom and derivationEdges", () => {
  const input = validateTrustBundle(makeInput({
    claims: [
      { ...baseClaim, id: "leaf", fieldOrBehavior: "unit.pass", value: true },
      {
        ...baseClaim,
        id: "middle",
        fieldOrBehavior: "test.suite",
        value: true,
        derivedFrom: ["leaf"],
      },
      {
        ...baseClaim,
        id: "top",
        fieldOrBehavior: "release.ready",
        value: true,
        derivationEdges: [{ inputClaimId: "middle", method: "max", role: "quality-gate" }],
      },
    ],
    evidence: [evidence("evd-leaf", "leaf")],
    events: [
      verifiedEvent("event-leaf", "leaf", ["evd-leaf"]),
      verifiedEvent("event-middle", "middle"),
      verifiedEvent("event-top", "top"),
    ],
  }));

  const report = buildTrustReport(input, { id: "report-drilldown-two-hop" });
  const drilldown = buildDerivationDrilldown(report, "top");

  assert.equal(report.claims.find((claim) => claim.id === "top")?.status, "verified");
  assert.equal(drilldown.directInputs[0]?.inputClaimId, "middle");
  assert.equal(drilldown.directInputs[0]?.edge?.method, "max");
  assert.equal(drilldown.directInputs[0]?.childInputs[0]?.inputClaimId, "leaf");
  assert.equal(drilldown.directInputs[0]?.childInputs[0]?.source, "derivedFrom");
  assert.deepEqual(drilldown.leafClaims.map((item) => item.claim.id), ["leaf"]);
  assert.deepEqual(drilldown.leafClaims[0]?.path, ["top", "middle", "leaf"]);
  assert.deepEqual(drilldown.leafClaims[0]?.evidence.map((item) => item.id), ["evd-leaf"]);
});

test("drilldown does not promote a parent to leaf when all child inputs are missing", () => {
  const top: TrustReport["claims"][number] = {
    ...baseClaim,
    id: "top",
    fieldOrBehavior: "release.ready",
    value: true,
    status: "verified",
    derivedFrom: ["middle"],
  };
  const middle: TrustReport["claims"][number] = {
    ...baseClaim,
    id: "middle",
    fieldOrBehavior: "test.suite",
    value: true,
    status: "verified",
    derivedFrom: ["missing"],
  };
  const report = minimalReport([top, middle]);

  const drilldown = buildDerivationDrilldown(report, "top");

  assert.equal(drilldown.directInputs[0]?.inputClaimId, "middle");
  assert.deepEqual(drilldown.directInputs[0]?.childInputs, []);
  assert.deepEqual(drilldown.leafClaims.map((item) => item.claim.id), []);
  assert.deepEqual(drilldown.diagnostics.map((item) => item.type), ["missing-input"]);
  assert.deepEqual(drilldown.diagnostics[0]?.path, ["top", "middle", "missing"]);
});

test("drilldown does not promote a parent to leaf when all child inputs are cyclic", () => {
  const input = validateTrustBundle(makeInput({
    claims: [
      {
        ...baseClaim,
        id: "top",
        fieldOrBehavior: "release.ready",
        value: true,
        derivedFrom: ["middle"],
      },
      {
        ...baseClaim,
        id: "middle",
        fieldOrBehavior: "test.suite",
        value: true,
        derivedFrom: ["top"],
      },
    ],
    events: [verifiedEvent("event-top", "top"), verifiedEvent("event-middle", "middle")],
  }));

  const report = buildTrustReport(input, { id: "report-drilldown-cycle" });
  const drilldown = buildDerivationDrilldown(report, "top");

  assert.equal(drilldown.directInputs[0]?.inputClaimId, "middle");
  assert.deepEqual(drilldown.directInputs[0]?.childInputs, []);
  assert.deepEqual(drilldown.leafClaims.map((item) => item.claim.id), []);
  assert.deepEqual(drilldown.diagnostics.map((item) => item.type), ["cycle"]);
  assert.deepEqual(drilldown.diagnostics[0]?.path, ["top", "middle", "top"]);
});

test("non-derived claim remains ordinary and has an empty derivation drilldown", () => {
  const input = validateTrustBundle(makeInput({
    claims: [{ ...baseClaim, id: "leaf", fieldOrBehavior: "unit.pass", value: true }],
    evidence: [evidence("evd-leaf", "leaf")],
    events: [verifiedEvent("event-leaf", "leaf", ["evd-leaf"])],
  }));

  const report = buildTrustReport(input, { id: "report-drilldown-empty" });
  const drilldown = buildDerivationDrilldown(report, "leaf");

  assert.equal(drilldown.claim.id, "leaf");
  assert.deepEqual(drilldown.directInputs, []);
  assert.deepEqual(drilldown.leafClaims, []);
  assert.deepEqual(drilldown.diagnostics, []);
});

test("surface get keeps claim projection fields and includes derivation drilldown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-drilldown-"));
  const inputPath = join(dir, "input.json");
  const input = makeInput({
    claims: [
      { ...baseClaim, id: "leaf", fieldOrBehavior: "unit.pass", value: true },
      {
        ...baseClaim,
        id: "top",
        fieldOrBehavior: "release.ready",
        value: true,
        verificationPolicyId: "policy-software-evidence",
        derivedFrom: ["leaf"],
      },
    ],
    evidence: [evidence("evd-leaf", "leaf")],
    policies: [
      {
        id: "policy-software-evidence",
        claimType: "software-evidence",
        requiredEvidence: [],
        acceptanceCriteria: [],
        reviewAuthority: "owner",
        validityRule: { kind: "manual" },
        stalenessTriggers: [],
        conflictRules: [],
        impactLevel: "medium",
      },
    ],
    events: [verifiedEvent("event-leaf", "leaf", ["evd-leaf"]), verifiedEvent("event-top", "top")],
  });
  await writeFile(inputPath, JSON.stringify(input), "utf8");

  const writes: string[] = [];
  const previous = console.log;
  console.log = (value?: unknown) => { writes.push(String(value)); };
  try {
    await runCli(["get", "--claim-id", "top", "--input", inputPath]);
  } finally {
    console.log = previous;
    await rm(dir, { recursive: true, force: true });
  }

  const output = JSON.parse(writes.join("\n")) as {
    claim?: { id: string };
    evidence?: unknown[];
    events?: unknown[];
    policy?: unknown;
    evidenceRequirement?: unknown;
    transparencyGaps?: unknown[];
    derivation?: {
      directInputs: Array<{ inputClaimId: string }>;
      leafClaims: Array<{ claim: { id: string }; evidence: Array<{ id: string }> }>;
    };
  };
  assert.equal(output.claim?.id, "top");
  assert.ok(Array.isArray(output.evidence));
  assert.ok(Array.isArray(output.events));
  assert.ok(Object.hasOwn(output, "policy"));
  assert.ok(Object.hasOwn(output, "evidenceRequirement"));
  assert.ok(Array.isArray(output.transparencyGaps));
  assert.equal(output.derivation?.directInputs[0]?.inputClaimId, "leaf");
  assert.equal(output.derivation?.leafClaims[0]?.claim.id, "leaf");
  assert.equal(output.derivation?.leafClaims[0]?.evidence[0]?.id, "evd-leaf");
});
