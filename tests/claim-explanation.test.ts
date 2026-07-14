import test from "node:test";
import assert from "node:assert/strict";

import { explainClaim } from "../src/index.js";
import type {
  DerivationChangeRecord,
  Evidence,
  TransparencyGap,
  TrustReport,
  VerificationPolicy,
} from "../src/index.js";

const timestamp = "2026-07-13T00:00:00.000Z";

function claim(id: string, overrides: Partial<TrustReport["claims"][number]> = {}): TrustReport["claims"][number] {
  return {
    id,
    subjectType: "repo",
    subjectId: "surface",
    claimType: "software-evidence",
    fieldOrBehavior: id,
    value: true,
    status: "verified",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function evidence(
  id: string,
  claimId: string,
  overrides: Partial<Evidence> & { label?: string; summary?: string; status?: string } = {},
): Evidence {
  return {
    id,
    claimId,
    evidenceType: "test_output",
    method: "validation",
    sourceRef: `run:${id}`,
    excerptOrSummary: `${id} summary`,
    observedAt: timestamp,
    collectedBy: "ci",
    ...overrides,
  } as Evidence;
}

function policy(id: string): VerificationPolicy {
  return {
    id,
    claimType: "software-evidence",
    requiredEvidence: ["test_output"],
    requiredMethods: ["validation"],
    acceptanceCriteria: ["command exits successfully"],
    reviewAuthority: "release-owner",
    validityRule: { kind: "manual" },
    stalenessTriggers: [],
    conflictRules: [],
    impactLevel: "high",
  };
}

function gap(id: string, claimId: string): TransparencyGap {
  return {
    id,
    claimId,
    type: "policy_violation",
    severity: "high",
    message: `${claimId} needs review`,
    createdAt: timestamp,
  };
}

function change(id: string, claimId: string): DerivationChangeRecord {
  return {
    id,
    claimId,
    inputClaimIds: ["leaf"],
    reason: "input-disputed",
    action: "review",
    createdAt: timestamp,
    message: `${claimId} changed`,
  };
}

function report(overrides: Partial<TrustReport> = {}): TrustReport {
  const claims = overrides.claims ?? [];
  return {
    schemaVersion: 5,
    id: "claim-explanation-report",
    generatedAt: timestamp,
    source: "claim-explanation-test",
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
        verified: claims.filter((item) => item.status === "verified").length,
        stale: 0,
        disputed: 0,
        superseded: 0,
        rejected: 0,
        revoked: 0,
      },
      byFacet: {},
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
    statusFunctionVersion: "2",
    waiverValidityByClaimId: {},
    waiverValidityFunctionVersion: "1",
    ...overrides,
  };
}

test("explains a found claim with evidence, policy, derivation, gaps, and changes", () => {
  const matchingGap = gap("gap-parent", "parent");
  const matchingChange = change("change-parent", "parent");
  const input = report({
    claims: [
      claim("leaf"),
      claim("parent", {
        value: 42,
        verificationPolicyId: "release-policy",
        derivedFrom: ["leaf"],
      }),
      claim("unresolved-policy", { verificationPolicyId: "missing-policy" }),
    ],
    evidence: [
      evidence("passing", "parent", {
        label: "npm test",
        execution: { runner: "bash", label: "npm test", exitCode: 0 },
      }),
      evidence("failing", "parent", {
        execution: { runner: "mcp", label: "verify@tool", exitCode: 7 },
      }),
      evidence("explicit-success", "parent", {
        execution: { runner: "mcp", label: "verify@tool", exitCode: 7, isError: false },
      }),
      evidence("disputed", "parent", { status: "disputed", excerptOrSummary: "reviewer disputed output" }),
      evidence("legacy-summary", "parent", {
        excerptOrSummary: undefined,
        sourceRef: "legacy:source",
        summary: "legacy evidence summary",
      }),
      evidence("other", "leaf"),
    ],
    policies: [policy("release-policy")],
    transparencyGaps: [matchingGap, gap("gap-leaf", "leaf")],
    changeRecords: [matchingChange, change("change-leaf", "leaf")],
  });

  const explanation = explainClaim(input, "parent");

  assert.equal(explanation.found, true);
  assert.equal(explanation.status, "verified");
  assert.equal(explanation.value, "42");
  assert.equal(explanation.claimType, "software-evidence");
  assert.deepEqual(explanation.evidence, [
    {
      evidenceType: "test_output",
      label: "npm test",
      execution: { runner: "bash", label: "npm test", isError: false, exitCode: 0 },
      passing: true,
      summary: "passing summary",
    },
    {
      evidenceType: "test_output",
      label: "failing summary",
      execution: { runner: "mcp", label: "verify@tool", isError: true, exitCode: 7 },
      passing: false,
      summary: "failing summary",
    },
    {
      evidenceType: "test_output",
      label: "explicit-success summary",
      execution: { runner: "mcp", label: "verify@tool", isError: false, exitCode: 7 },
      passing: true,
      summary: "explicit-success summary",
    },
    {
      evidenceType: "test_output",
      label: "reviewer disputed output",
      execution: null,
      passing: false,
      summary: "reviewer disputed output",
    },
    {
      evidenceType: "test_output",
      label: "legacy:source",
      execution: null,
      passing: true,
      summary: "legacy evidence summary",
    },
  ]);
  assert.deepEqual(explanation.policy, {
    id: "release-policy",
    requiredEvidence: ["test_output"],
    requiredMethods: ["validation"],
    acceptanceCriteria: ["command exits successfully"],
    reviewAuthority: "release-owner",
  });
  assert.deepEqual(explanation.why.directInputs.map((item) => item.inputClaimId), ["leaf"]);
  assert.deepEqual(explanation.why.leafClaims.map((item) => item.claim.id), ["leaf"]);
  assert.deepEqual(explanation.why.diagnostics, []);
  assert.deepEqual(explanation.why.transparencyGaps, [matchingGap]);
  assert.deepEqual(explanation.why.changeRecords, [matchingChange]);
  assert.equal(explainClaim(input, "unresolved-policy").policy, null);
});

test("returns the stable empty shape for an unknown claim", () => {
  assert.deepEqual(explainClaim(report({ claims: [claim("known")] }), "missing"), {
    found: false,
    status: "unknown",
    value: "",
    claimType: "",
    evidence: [],
    policy: null,
    why: {
      directInputs: [],
      leafClaims: [],
      diagnostics: [],
      transparencyGaps: [],
      changeRecords: [],
    },
  });
});

test("keeps the explanation when derivation drilldown throws", () => {
  const claims = [claim("parent", { value: null, verificationPolicyId: "policy-parent" })];
  const input = report({
    claims,
    evidence: [evidence("ev-parent", "parent")],
    policies: [{ ...policy("policy-parent") }],
    transparencyGaps: [gap("gap-parent", "parent")],
    changeRecords: [change("change-parent", "parent")],
  });
  let reads = 0;
  Object.defineProperty(input, "claims", {
    configurable: true,
    get() {
      reads += 1;
      if (reads > 1) throw new Error("simulated drilldown failure");
      return claims;
    },
  });

  const explanation = explainClaim(input, "parent");

  assert.equal(explanation.found, true);
  assert.equal(explanation.value, "");
  assert.deepEqual(explanation.why.directInputs, []);
  assert.deepEqual(explanation.why.leafClaims, []);
  assert.deepEqual(explanation.why.diagnostics, []);
  // The documented fail-soft promise: only the derivation arrays empty out —
  // evidence, policy, gaps, and change records all survive drilldown failure.
  assert.deepEqual(explanation.evidence.map((item) => item.label), ["ev-parent summary"]);
  assert.equal(explanation.policy?.id, "policy-parent");
  assert.deepEqual(explanation.why.transparencyGaps.map((item) => item.id), ["gap-parent"]);
  assert.deepEqual(explanation.why.changeRecords.map((item) => item.id), ["change-parent"]);
});
