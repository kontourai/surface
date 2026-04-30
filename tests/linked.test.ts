import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustReport, toLinkedReport, validateTrustInput, SURFACE_LINKED_VOCAB } from "../src/index.js";
import type { TrustInput } from "../src/index.js";

const baseClaim = {
  id: "claim-base",
  subjectType: "veritas.repo",
  subjectId: "repo-A",
  surface: "veritas.developer-proof",
  claimType: "software-proof",
  fieldOrBehavior: "passes",
  value: true,
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

function makeInput(overrides: Partial<TrustInput>): TrustInput {
  return {
    schemaVersion: 3,
    source: "linked-test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

test("toLinkedReport wraps a trust report with the Surface @context", () => {
  const input = validateTrustInput(makeInput({ claims: [{ ...baseClaim }] }));
  const report = buildTrustReport(input, { id: "report-linked", now: new Date("2026-04-26T00:00:00.000Z") });
  const linked = toLinkedReport(report);

  const ctx = linked["@context"] as Record<string, unknown>;
  assert.equal(ctx["@vocab"], SURFACE_LINKED_VOCAB);
  assert.deepEqual(ctx.claimId, { "@type": "@id" });
  assert.equal(linked.id, "report-linked");
  assert.equal(linked.claims.length, 1);
});

test("Surface vocab is versioned and stable", () => {
  assert.match(SURFACE_LINKED_VOCAB, /\/v1#$/);
});

test("Surface @context declares JSON-LD 1.1 and aliases derivedFrom to PROV-O", () => {
  const input = validateTrustInput(makeInput({ claims: [{ ...baseClaim }] }));
  const report = buildTrustReport(input, { id: "report-prov", now: new Date("2026-04-26T00:00:00.000Z") });
  const linked = toLinkedReport(report);
  const ctx = linked["@context"] as Record<string, unknown>;

  assert.equal(ctx["@version"], 1.1);
  assert.deepEqual(ctx.derivedFrom, {
    "@id": "http://www.w3.org/ns/prov#wasDerivedFrom",
    "@type": "@id",
    "@container": "@set",
  });
});

test("linked report preserves all original report fields", () => {
  const input = validateTrustInput(makeInput({ claims: [{ ...baseClaim }] }));
  const report = buildTrustReport(input, { id: "report-preserve", now: new Date("2026-04-26T00:00:00.000Z") });
  const linked = toLinkedReport(report);

  for (const key of Object.keys(report) as Array<keyof typeof report>) {
    assert.deepEqual(linked[key], report[key]);
  }
});
