/**
 * #24 — a quantitative derivation edge carries a sensitivity range so a
 * threshold/estimate is never a bare number. Optional and pass-through:
 * validation accepts it; absence is unchanged behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateTrustBundle } from "../src/index.js";

function bundleWithEdge(edge: Record<string, unknown>) {
  return {
    schemaVersion: 6,
    source: "derivation-edge-sensitivity-test",
    claims: [
      {
        id: "input.pretax-income",
        subjectType: "financial-facts.entity",
        subjectId: "entity-A",
        claimType: "fact",
        fieldOrBehavior: "pretax-income",
        value: 5000000,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "derived.materiality",
        subjectType: "financial-facts.entity",
        subjectId: "entity-A",
        claimType: "fact",
        fieldOrBehavior: "materiality-threshold",
        value: 250000,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        derivationEdges: [edge],
      },
    ],
    evidence: [],
    policies: [],
    events: [],
  };
}

const validSensitivity = { low: 210000, high: 290000, basis: "5% of pretax income, ±$40K" };

test("AC1: a derivationEdge carrying a {low,high,basis} sensitivity range round-trips through validation", () => {
  const result = validateTrustBundle(
    bundleWithEdge({ inputClaimId: "input.pretax-income", method: "rule-application", sensitivity: validSensitivity }),
  );
  const edge = result.claims[1].derivationEdges?.[0];
  assert.deepEqual(edge?.sensitivity, validSensitivity, "sensitivity is preserved verbatim through validation");
});

test("AC2: a derivationEdge omitting sensitivity validates exactly as before (unchanged behavior)", () => {
  const result = validateTrustBundle(
    bundleWithEdge({ inputClaimId: "input.pretax-income", method: "rule-application", role: "quality-input" }),
  );
  const edge = result.claims[1].derivationEdges?.[0];
  assert.equal(edge?.sensitivity, undefined);
  assert.equal(edge?.role, "quality-input");
});

test("a partial sensitivity (missing basis) is rejected", () => {
  assert.throws(
    () => validateTrustBundle(bundleWithEdge({ inputClaimId: "input.pretax-income", sensitivity: { low: 1, high: 2 } })),
    /basis/,
  );
});

test("a non-numeric sensitivity bound is rejected", () => {
  assert.throws(
    () =>
      validateTrustBundle(
        bundleWithEdge({ inputClaimId: "input.pretax-income", sensitivity: { low: "1", high: 2, basis: "b" } }),
      ),
    /sensitivity\.low must be a number/,
  );
});

test("an unknown key inside sensitivity is rejected", () => {
  assert.throws(
    () =>
      validateTrustBundle(
        bundleWithEdge({
          inputClaimId: "input.pretax-income",
          sensitivity: { low: 1, high: 2, basis: "b", midpoint: 1.5 },
        }),
      ),
    /Unknown key.*midpoint|midpoint/,
  );
});
