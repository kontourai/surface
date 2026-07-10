import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrustReport, deriveTrustSnapshot, validateTrustBundle } from "../src/index.js";

test("deriveTrustSnapshot returns the Trust Snapshot pieces used by reports", async () => {
  const raw = await readFile("examples/surface-example-bundle.json", "utf8");
  const input = validateTrustBundle(JSON.parse(raw));
  const now = new Date("2026-04-25T00:00:00.000Z");
  const snapshot = deriveTrustSnapshot(input, { now });
  const report = buildTrustReport(input, { id: "snapshot-test", now });

  assert.deepEqual(snapshot.claims, report.claims);
  assert.deepEqual(snapshot.evidenceRequirementsByClaimId, report.evidenceRequirementsByClaimId);
  assert.deepEqual(snapshot.transparencyGaps, report.transparencyGaps);
  assert.deepEqual(snapshot.subjectGroups, report.subjectGroups);
  assert.deepEqual(snapshot.claimGroupRollups, report.claimGroupRollups);
});

test(
  "evidenceRequirementsByClaimId is immune to a claim id of literal \"__proto__\" (own-property-safe map, #127)",
  () => {
    // Regression for #127: before the null-prototype-map fix a claim id of
    // `__proto__` drove the `Object.prototype.__proto__` setter instead of
    // landing as an own key, so `Object.keys(...)` reported `[]`, serialization
    // dropped it, and a prototype-sensitive lookup could return a foreign value.
    const protoClaimId = "__proto__";
    const now = new Date("2026-06-02T00:00:00.000Z");
    const input = validateTrustBundle({
      schemaVersion: 3,
      source: "trust-snapshot-proto-claim-id-test",
      claims: [
        {
          id: protoClaimId,
          subjectType: "repo-governance.repo",
          subjectId: "repo-A",
          facet: "repo-governance.developer-evidence",
          claimType: "public-surface-requirement",
          fieldOrBehavior: "needs-evidence",
          value: "OPEN",
          verificationPolicyId: "policy.public-surface",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      evidence: [],
      policies: [
        {
          id: "policy.public-surface",
          claimType: "public-surface-requirement",
          requiredEvidence: ["policy_rule"],
          requiredMethods: ["validation"],
          acceptanceCriteria: ["rule evaluation"],
          reviewAuthority: "system",
          validityRule: { kind: "manual" },
          stalenessTriggers: [],
          conflictRules: [],
          impactLevel: "high",
        },
      ],
      events: [],
    });

    const snapshot = deriveTrustSnapshot(input, { now });
    const report = buildTrustReport(input, { id: "proto-req-test", now });

    // The requirement lands as an own key on a null-prototype map, visible to
    // Object.keys/hasOwn and to a direct index read, on both the snapshot and
    // the report projection.
    assert.deepEqual(Object.keys(snapshot.evidenceRequirementsByClaimId), [protoClaimId]);
    assert.ok(Object.hasOwn(snapshot.evidenceRequirementsByClaimId, protoClaimId));
    assert.ok(Object.hasOwn(report.evidenceRequirementsByClaimId, protoClaimId));
    assert.ok(snapshot.evidenceRequirementsByClaimId[protoClaimId]);
    // A missing hostile id resolves to undefined, never a prototype method.
    assert.equal(report.evidenceRequirementsByClaimId["toString"], undefined);
  },
);
