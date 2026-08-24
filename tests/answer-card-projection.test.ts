import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAnswerCardProjection,
  buildTrustReport,
  type DerivedReportClaim,
  type Evidence,
  type TransparencyGap,
  type TrustBundle,
  type TrustReport,
} from "../src/index.js";

const summary: TrustReport["summary"] = {
  totalClaims: 0,
  byStatus: {
    unknown: 0,
    proposed: 0,
    assumed: 0,
    verified: 0,
    stale: 0,
    disputed: 0,
    superseded: 0,
    rejected: 0,
    revoked: 0,
  },
  byFacet: {},
  confidenceBasis: {
    sourceQuality: {},
    reviewerAuthority: {},
    evidenceStrength: {},
    corroboratedClaims: 0,
    averageExtractionConfidence: null,
    freshnessAtRisk: [],
    conflictedClaims: [],
  },
  transparencyGapsByType: {
    contradiction: 0,
    provenance_gap: 0,
    policy_violation: 0,
    freshness_breach: 0,
    corroboration_absent: 0,
    unsupported_inference: 0,
  },
  highImpactUnsupported: [],
  staleClaims: [],
  disputedClaims: [],
  recomputeNeededClaims: [],
};

function claim(
  id: string,
  status: DerivedReportClaim["status"],
  overrides: Partial<DerivedReportClaim> = {},
): DerivedReportClaim {
  return {
    id,
    subjectType: "answer",
    subjectId: "answer-1",
    claimType: "answer-quality",
    fieldOrBehavior: "supported",
    value: { exact: true },
    status,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

function evidence(
  id: string,
  claimId: string,
  overrides: Partial<Evidence> = {},
): Evidence {
  return {
    id,
    claimId,
    evidenceType: "test_output",
    method: "validation",
    sourceRef: `run:${id}`,
    excerptOrSummary: `Evidence ${id}`,
    observedAt: "2026-08-24T00:01:00.000Z",
    collectedBy: "fixture",
    ...overrides,
  };
}

function report(
  claims: DerivedReportClaim[],
  evidenceRecords: Evidence[] = [],
  transparencyGaps: TransparencyGap[] = [],
): TrustReport {
  return {
    schemaVersion: 5,
    id: "answer-card-test",
    generatedAt: "2026-08-24T00:02:00.000Z",
    source: "answer-card-test",
    claims,
    evidence: evidenceRecords,
    policies: [],
    events: [],
    identityLinks: [],
    claimGroups: [],
    authorityTrace: [],
    evidenceRequirementsByClaimId: {},
    transparencyGaps,
    changeRecords: [],
    subjectGroups: [],
    claimGroupRollups: [],
    summary,
    statusFunctionVersion: "2",
    waiverValidityByClaimId: {},
    waiverValidityFunctionVersion: "1",
  };
}

test("answer card projects exact report facts, support partitions, and one-level derivation inputs", () => {
  const target = claim("target", "stale", {
    value: { source: "report-only" },
    subjectType: "assistant-answer",
    subjectId: "session-1/turn-2",
    claimType: "answer-basis",
    fieldOrBehavior: "answer-supported",
    materiality: "high",
    freshness: {
      asOf: "2026-08-24T00:02:00.000Z",
      expiresAt: "2026-08-24T00:01:00.000Z",
      stale: true,
    },
    derivationEdges: [
      {
        inputClaimId: "edge-input",
        method: "rule-application",
        supportStrength: "strong",
        rationale: "Required direct basis.",
      },
    ],
    derivedFrom: ["legacy-input", "edge-input", "missing-input"],
  });
  const targetGap: TransparencyGap = {
    id: "target-gap",
    claimId: "target",
    type: "unsupported_inference",
    severity: "high",
    message: "One input is unavailable.",
    createdAt: "2026-08-24T00:02:00.000Z",
  };
  const projected = buildAnswerCardProjection(
    report(
      [target, claim("edge-input", "verified"), claim("legacy-input", "proposed")],
      [
        evidence("legacy-entailing", "target", { passing: true }),
        evidence("cited", "target", {
          supportStrength: "cited",
          sourceLocator: "section-2",
          passing: false,
          blocking: false,
        }),
        evidence("cited-default-failure", "target", {
          supportStrength: "cited",
          passing: false,
        }),
        evidence("cited-forced-blocking", "target", {
          supportStrength: "cited",
          passing: false,
          blocking: true,
        }),
        evidence("blocking-failure", "target", {
          supportStrength: "entails",
          passing: false,
        }),
        evidence("nonblocking-entailing", "target", {
          supportStrength: "entails",
          passing: false,
          blocking: false,
        }),
        evidence("other-claim", "other"),
      ],
      [
        targetGap,
        {
          ...targetGap,
          id: "other-gap",
          claimId: "other",
        },
      ],
    ),
    "target",
  );

  assert.equal(projected.found, true);
  if (!projected.found) throw new Error("expected a found answer card");
  assert.deepEqual(projected.claim, {
    id: "target",
    subject: {
      subjectType: "assistant-answer",
      subjectId: "session-1/turn-2",
    },
    claimType: "answer-basis",
    fieldOrBehavior: "answer-supported",
    value: { source: "report-only" },
    status: "stale",
    freshness: {
      asOf: "2026-08-24T00:02:00.000Z",
      expiresAt: "2026-08-24T00:01:00.000Z",
      stale: true,
    },
    materiality: "high",
  });
  assert.deepEqual(projected.evidence.entailing.map((item) => item.id), [
    "legacy-entailing",
    "blocking-failure",
    "nonblocking-entailing",
  ]);
  assert.deepEqual(projected.evidence.cited.map((item) => item.id), [
    "cited",
    "cited-default-failure",
    "cited-forced-blocking",
  ]);
  assert.deepEqual(projected.evidence.entailing[0], {
    id: "legacy-entailing",
    type: "test_output",
    method: "validation",
    sourceRef: "run:legacy-entailing",
    locator: null,
    summary: "Evidence legacy-entailing",
    observedAt: "2026-08-24T00:01:00.000Z",
    supportStrength: null,
    result: "passed",
    blocksClaim: false,
  });
  assert.equal(projected.evidence.cited[0]?.result, "failed");
  assert.equal(projected.evidence.cited[0]?.blocksClaim, false);
  assert.equal(projected.evidence.cited[1]?.result, "failed");
  assert.equal(projected.evidence.cited[1]?.blocksClaim, false);
  assert.equal(projected.evidence.cited[2]?.result, "failed");
  assert.equal(projected.evidence.cited[2]?.blocksClaim, false);
  assert.equal(projected.evidence.entailing[1]?.result, "failed");
  assert.equal(projected.evidence.entailing[1]?.blocksClaim, true);
  assert.equal(projected.evidence.entailing[2]?.result, "failed");
  assert.equal(projected.evidence.entailing[2]?.blocksClaim, false);
  assert.deepEqual(projected.derivation, {
    available: true,
    directInputs: [
      {
        claimId: "edge-input",
        status: "verified",
        source: "derivationEdges",
        edge: {
          method: "rule-application",
          supportStrength: "strong",
          rationale: "Required direct basis.",
        },
      },
      {
        claimId: "legacy-input",
        status: "proposed",
        source: "derivedFrom",
        edge: null,
      },
      {
        claimId: "missing-input",
        status: null,
        source: "derivedFrom",
        edge: null,
      },
    ],
  });
  assert.deepEqual(projected.transparencyGaps, [targetGap]);
});

test("answer card preserves claim evidence and gaps when direct input projection is unavailable", () => {
  const target = claim("target", "proposed");
  Object.defineProperty(target, "derivedFrom", {
    get() {
      throw new Error("unexpected direct-input projection failure");
    },
  });
  const gap: TransparencyGap = {
    id: "gap",
    claimId: "target",
    type: "provenance_gap",
    severity: "medium",
    message: "Evidence is incomplete.",
    createdAt: "2026-08-24T00:02:00.000Z",
  };

  const projected = buildAnswerCardProjection(
    report([target], [evidence("not-evaluated", "target")], [gap]),
    "target",
  );

  assert.equal(projected.found, true);
  if (!projected.found) throw new Error("expected a found answer card");
  assert.deepEqual(projected.derivation, { available: false, directInputs: [] });
  assert.equal(projected.evidence.entailing[0]?.result, "not-evaluated");
  assert.deepEqual(projected.transparencyGaps, [gap]);
});

test("unknown claim returns the stable empty Answer Card shape", () => {
  assert.deepEqual(buildAnswerCardProjection(report([]), "missing"), {
    found: false,
    claim: null,
    evidence: { entailing: [], cited: [] },
    derivation: { available: false, directInputs: [] },
    transparencyGaps: [],
  });
});

test("system-card PII failure remains blocking with its transparency gaps", () => {
  const bundle = JSON.parse(
    readFileSync("examples/system-card/bundle.json", "utf8"),
  ) as TrustBundle;
  const projected = buildAnswerCardProjection(
    buildTrustReport(bundle, { now: new Date("2025-11-05T12:00:00.000Z") }),
    "claim.acme-support-agent.pii-filtering",
  );

  assert.equal(projected.found, true);
  if (!projected.found) throw new Error("expected a found answer card");
  assert.equal(projected.claim.status, "disputed");
  assert.ok(
    projected.evidence.entailing.some(
      (item) => item.result === "failed" && item.blocksClaim,
    ),
  );
  assert.ok(
    projected.transparencyGaps.some(
      (gap) => gap.type === "policy_violation",
    ),
  );
});

test("system-card stale evaluation freshness is copied without re-evaluation", () => {
  const bundle = JSON.parse(
    readFileSync("examples/system-card/bundle.json", "utf8"),
  ) as TrustBundle;
  const projected = buildAnswerCardProjection(
    buildTrustReport(bundle, { now: new Date("2025-12-10T12:00:00.000Z") }),
    "claim.acme-support-agent.intent-accuracy",
  );

  assert.equal(projected.found, true);
  if (!projected.found) throw new Error("expected a found answer card");
  assert.equal(projected.claim.status, "stale");
  assert.deepEqual(projected.claim.freshness, {
    asOf: "2025-12-10T12:00:00.000Z",
    // Policy-duration staleness has no intrinsic claim expiry; the adapter
    // copies the report freshness projection rather than calculating one.
    expiresAt: null,
    stale: true,
  });
});
