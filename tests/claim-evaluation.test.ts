/**
 * Issue #1 — focused tests for the internal Claim Evaluation contract.
 *
 * `evaluateClaimEvidence` centralises the evidence/policy satisfaction facts
 * that status derivation and transparency-gap derivation both consume. These
 * tests pin the three requirement cases the issue calls out — complete,
 * partial (missing type / missing method / absent corroboration), and missing
 * — and assert the parity that the contract exists to guarantee: the report's
 * status decision and the gaps it emits never disagree about whether a claim's
 * policy requirement is satisfied.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Evidence, EvidenceMethod, EvidenceType, VerificationPolicy } from "../src/types.js";
import { evaluateClaimEvidence } from "../src/claim-evaluation.js";
import { buildTrustReport, validateTrustBundle } from "../src/index.js";

function evidence(overrides: Partial<Evidence> & Pick<Evidence, "evidenceType" | "method">): Evidence {
  return {
    id: overrides.id ?? `ev-${overrides.evidenceType}-${overrides.method}`,
    claimId: "claim-1",
    sourceRef: "src://ref",
    excerptOrSummary: "summary",
    observedAt: "2026-01-01T00:00:00.000Z",
    collectedBy: "tester",
    ...overrides,
  };
}

function policy(overrides: Partial<VerificationPolicy> = {}): VerificationPolicy {
  return {
    id: "policy-1",
    claimType: "generic",
    requiredEvidence: [],
    acceptanceCriteria: [],
    reviewAuthority: "owner",
    validityRule: { kind: "manual" },
    stalenessTriggers: [],
    conflictRules: [],
    impactLevel: "medium",
    ...overrides,
  };
}

test("complete: all required types/methods present, no corroboration gap → requirement met", () => {
  const requiredEvidence: EvidenceType[] = ["test_output", "source_excerpt"];
  const requiredMethods: EvidenceMethod[] = ["validation"];
  const evalResult = evaluateClaimEvidence({
    entailingEvidence: [
      evidence({ evidenceType: "test_output", method: "validation" }),
      evidence({ evidenceType: "source_excerpt", method: "extraction" }),
    ],
    policy: policy({ requiredEvidence, requiredMethods }),
  });

  assert.deepEqual(evalResult.missingEvidenceTypes, []);
  assert.deepEqual(evalResult.missingMethods, []);
  assert.equal(evalResult.corroborationMissing, false);
  assert.equal(evalResult.requirementUnmet, false);
});

test("partial: a required evidence type is missing → requirementUnmet with that type reported", () => {
  const evalResult = evaluateClaimEvidence({
    entailingEvidence: [evidence({ evidenceType: "test_output", method: "validation" })],
    policy: policy({ requiredEvidence: ["test_output", "human_attestation"] }),
  });

  assert.deepEqual(evalResult.missingEvidenceTypes, ["human_attestation"]);
  assert.deepEqual(evalResult.missingMethods, []);
  assert.equal(evalResult.requirementUnmet, true);
});

test("partial: a required method is missing → requirementUnmet with that method reported", () => {
  const evalResult = evaluateClaimEvidence({
    entailingEvidence: [evidence({ evidenceType: "test_output", method: "validation" })],
    policy: policy({ requiredEvidence: ["test_output"], requiredMethods: ["corroboration"] }),
  });

  assert.deepEqual(evalResult.missingEvidenceTypes, []);
  assert.deepEqual(evalResult.missingMethods, ["corroboration"]);
  assert.equal(evalResult.requirementUnmet, true);
});

test("partial: corroboration required but only one entailing record → corroborationMissing", () => {
  const evalResult = evaluateClaimEvidence({
    entailingEvidence: [evidence({ evidenceType: "test_output", method: "validation" })],
    policy: policy({ requiredEvidence: ["test_output"], requiresCorroboration: true }),
  });

  assert.equal(evalResult.corroborationRequired, true);
  assert.equal(evalResult.corroborationMissing, true);
  assert.equal(evalResult.requirementUnmet, true);
});

test("corroboration satisfied by two entailing records → requirement met", () => {
  const evalResult = evaluateClaimEvidence({
    entailingEvidence: [
      evidence({ id: "a", evidenceType: "test_output", method: "validation" }),
      evidence({ id: "b", evidenceType: "test_output", method: "corroboration" }),
    ],
    policy: policy({ requiredEvidence: ["test_output"], requiresCorroboration: true }),
  });

  assert.equal(evalResult.corroborationMissing, false);
  assert.equal(evalResult.requirementUnmet, false);
});

test("missing: no entailing evidence against a policy with requirements → all missing", () => {
  const evalResult = evaluateClaimEvidence({
    entailingEvidence: [],
    policy: policy({ requiredEvidence: ["test_output"], requiredMethods: ["validation"] }),
  });

  assert.deepEqual(evalResult.missingEvidenceTypes, ["test_output"]);
  assert.deepEqual(evalResult.missingMethods, ["validation"]);
  assert.equal(evalResult.requirementUnmet, true);
});

test("status/gap parity: no `verified` claim carries an unmet-requirement gap", async () => {
  // The invariant the shared evaluation guarantees end-to-end: the verified
  // path returns `proposed` whenever `requirementUnmet` is true, and the gap
  // derivation emits `provenance_gap` (missing required type) /
  // `corroboration_absent` from the SAME fact. So a claim finally derived
  // `verified` can never carry either gap — if it did, status and gaps would
  // have disagreed about the requirement. (These two gap types come only from
  // unmet requirements; `policy_violation` is excluded because it is also
  // emitted for non-blocking failing evidence, which leaves status `verified`.)
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const bundle = validateTrustBundle(JSON.parse(raw));
  const report = buildTrustReport(bundle, { now: new Date("2026-04-25T00:00:00.000Z") });

  const unmetRequirementGaps = new Set(["provenance_gap", "corroboration_absent"]);
  for (const claim of report.claims) {
    if (claim.status !== "verified") continue;
    const offending = report.transparencyGaps.filter(
      (gap) => gap.claimId === claim.id && unmetRequirementGaps.has(gap.type),
    );
    assert.deepEqual(
      offending.map((gap) => gap.type),
      [],
      `verified claim ${claim.id} must not carry an unmet-requirement gap`,
    );
  }
  assert.ok(report.claims.length > 0, "example bundle should contain claims");
});
