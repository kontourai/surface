import test from "node:test";
import assert from "node:assert/strict";
import {
  addAuthoredClaim,
  buildClaimDefinition,
  emptyClaimStore,
  parseImpactLevel,
  updateAuthoredClaim,
} from "../src/index.js";

const now = "2026-05-22T12:00:00.000Z";

test("buildClaimDefinition owns claim id generation and timestamps", () => {
  const claim = buildClaimDefinition({
    surface: "veritas.evidence-check",
    claimType: "software-evidence",
    fieldOrBehavior: "npm test",
    subjectType: "repository",
    subjectId: "Repo Name",
  }, { now });

  assert.equal(claim.id, "repo-name.veritas-evidence-check.npm-test");
  assert.equal(claim.impactLevel, "medium");
  assert.equal(claim.createdAt, now);
  assert.equal(claim.updatedAt, now);
});

test("addAuthoredClaim and updateAuthoredClaim apply authoring timestamps", () => {
  const added = addAuthoredClaim(emptyClaimStore(), {
    id: "claim-1",
    surface: "veritas.evidence-check",
    claimType: "software-evidence",
    fieldOrBehavior: "npm test",
    subjectType: "repository",
    subjectId: "repo",
  }, { now });

  const later = "2026-05-22T13:00:00.000Z";
  const updated = updateAuthoredClaim(added.store, "claim-1", {
    fieldOrBehavior: "npm run test",
    impactLevel: "high",
  }, { now: later });

  assert.equal(updated.claim.createdAt, now);
  assert.equal(updated.claim.updatedAt, later);
  assert.equal(updated.claim.fieldOrBehavior, "npm run test");
  assert.equal(updated.claim.impactLevel, "high");
});

test("parseImpactLevel accepts empty optional values and rejects unknown levels", () => {
  assert.equal(parseImpactLevel(undefined), undefined);
  assert.equal(parseImpactLevel(""), undefined);
  assert.equal(parseImpactLevel("critical"), "critical");
  assert.throws(() => parseImpactLevel("urgent"), /impactLevel must be low, medium, high, or critical/);
});
