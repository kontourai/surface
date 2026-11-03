import test from "node:test";
import assert from "node:assert/strict";
import { buildDerivationDrilldown, buildTrustReport, recomputeChangeRecords, traceDependents, validateTrustBundle } from "../src/index.js";

const now = new Date("2026-04-26T00:00:00.000Z");
const timestamp = "2026-04-25T00:00:00.000Z";

function report(erased: boolean) {
  const ids = ["source", "other", "sole", "survivor", "downstream"];
  const bundle = validateTrustBundle({
    schemaVersion: 3, source: "erasure-test",
    claims: ids.map((id) => ({
      id, subjectType: "repo", subjectId: "example", claimType: "software-evidence",
      fieldOrBehavior: id, value: id === "source" && erased ? null : true,
      createdAt: timestamp, updatedAt: timestamp,
      // A retained producer status must not restore support after erasure.
      ...(id === "source" ? { status: "assumed" } : {}),
      ...(id === "source" && erased ? { metadata: { surfaceRetention: { state: "deleted", erasedAt: timestamp, actor: "owner", rationale: "request" } } } : {}),
      ...(id === "sole" ? { derivedFrom: ["source"] } : {}),
      ...(id === "survivor" ? { derivedFrom: ["source", "other"] } : {}),
      ...(id === "downstream" ? { derivedFrom: ["survivor"] } : {}),
    })),
    evidence: ids.filter((id) => !(id === "source" && erased)).map((id) => ({
      id: `evidence-${id}`, claimId: id, evidenceType: "human_attestation", method: "attestation",
      sourceRef: "owner", excerptOrSummary: "attested", observedAt: timestamp, collectedBy: "owner",
    })),
    policies: [{ id: "policy", claimType: "software-evidence", requiredEvidence: ["human_attestation"],
      acceptanceCriteria: [], reviewAuthority: "owner", validityRule: { kind: "manual" },
      stalenessTriggers: [], conflictRules: [], impactLevel: "medium" }],
    events: ids.filter((id) => !(id === "source" && erased)).map((id) => ({
      id: `event-${id}`, claimId: id, status: "verified", actor: "owner", method: "attestation", evidenceIds: [], createdAt: timestamp,
    })),
  });
  return buildTrustReport(bundle, { now });
}

test("erasing the sole input removes derived support", () => {
  const prior = report(false);
  const next = report(true);
  assert.equal(prior.claims.find((claim) => claim.id === "sole")?.status, "verified");
  assert.equal(next.claims.find((claim) => claim.id === "sole")?.status, "unknown");
  assert.ok(next.transparencyGaps.some((gap) => gap.claimId === "sole" && gap.metadata?.source === "derivation.deleted"));
});

test("surviving support and transitive blast radius retain the deletion trace", () => {
  const prior = report(false);
  const next = report(true);
  assert.equal(next.claims.find((claim) => claim.id === "survivor")?.status, "verified");
  assert.deepEqual(buildDerivationDrilldown(next, "survivor").directInputs.find((input) => input.inputClaimId === "source")?.claim.metadata?.surfaceRetention, { state: "deleted", erasedAt: timestamp, actor: "owner", rationale: "request" });
  assert.deepEqual(traceDependents(next, "source").map((item) => item.claimId).sort(), ["downstream", "sole", "survivor"]);
  const records = recomputeChangeRecords(prior, next);
  assert.deepEqual(records.map((item) => item.claimId), ["downstream", "sole", "survivor"]);
  assert.deepEqual(records.find((item) => item.claimId === "downstream")?.changedInputs[0].deletedInputIds, ["source"]);
});
