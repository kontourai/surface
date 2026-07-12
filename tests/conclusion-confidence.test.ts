/**
 * #25 — a claim carries a calibrated conclusionConfidence value (distinct from
 * confidenceBasis) plus a producer-populated comfort-zone signal. Optional and
 * pass-through: validation accepts it, buildTrustReport carries it through
 * unchanged, and absence is unchanged behavior. Surface never derives or
 * consults it (Hachure 0.14).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustReport, mergeBundles, validateTrustBundle } from "../src/index.js";
import type { ConclusionConfidence } from "../src/index.js";

function bundleWithClaim(extra: Record<string, unknown>) {
  return {
    schemaVersion: 6,
    source: "conclusion-confidence-test",
    claims: [
      {
        id: "claim.conclusion.1",
        subjectType: "entity",
        subjectId: "entity-A",
        claimType: "fact",
        fieldOrBehavior: "revenue-recognition-correct",
        value: true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        ...extra,
      },
    ],
    evidence: [],
    policies: [],
    events: [],
  };
}

const conclusionConfidence: ConclusionConfidence = {
  value: 0.82,
  method: "ensemble-disagreement",
  interval: { low: 0.71, high: 0.9 },
  comfortZone: { within: false, reason: "out-of-distribution" },
};

test("a claim carrying conclusionConfidence round-trips through validation", () => {
  const bundle = validateTrustBundle(bundleWithClaim({ conclusionConfidence }));
  assert.deepEqual(bundle.claims[0].conclusionConfidence, conclusionConfidence);
});

test("buildTrustReport carries conclusionConfidence through unchanged (carry, not produce)", () => {
  const report = buildTrustReport(validateTrustBundle(bundleWithClaim({ conclusionConfidence })));
  assert.deepEqual(report.claims[0].conclusionConfidence, conclusionConfidence);
});

test("conclusionConfidence is optional: a claim without it is unchanged", () => {
  const report = buildTrustReport(validateTrustBundle(bundleWithClaim({})));
  assert.equal(report.claims[0].conclusionConfidence, undefined);
});

test("conclusionConfidence must be an object at the runtime validator (matches confidenceBasis)", () => {
  // Surface's runtime validator does a loose object check (deep shape — value
  // range, required `within` — is enforced by the vendored JSON schema for
  // consumers and covered in the hachure ajv suite, consistent with how
  // confidenceBasis is treated).
  assert.throws(() => validateTrustBundle(bundleWithClaim({ conclusionConfidence: "not-an-object" })));
});

test("conclusionConfidence survives a multi-producer merge", () => {
  // Field-agnostic merge must preserve the calibrated value on the surviving claim.
  const withCC = validateTrustBundle(bundleWithClaim({ conclusionConfidence }));
  const other = validateTrustBundle({
    schemaVersion: 6, source: "other-producer", claims: [], evidence: [], policies: [], events: [],
  });
  const merged = mergeBundles([withCC, other]);
  const claim = merged.claims.find((c) => c.id === "claim.conclusion.1");
  assert.deepEqual(claim?.conclusionConfidence, conclusionConfidence);
});

test("conclusionConfidence is separate from confidenceBasis (both can coexist)", () => {
  const bundle = validateTrustBundle(bundleWithClaim({
    confidenceBasis: { reviewerAuthority: "domain_expert" },
    conclusionConfidence: { value: 0.3 }, // expert-reviewed yet low calibrated confidence — the orthogonality
  }));
  assert.equal(bundle.claims[0].confidenceBasis?.reviewerAuthority, "domain_expert");
  assert.equal(bundle.claims[0].conclusionConfidence?.value, 0.3);
});
