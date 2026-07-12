/**
 * Issue #16 — recompute change records for derived claims.
 *
 * `recomputeChangeRecords(prior, next)` diffs two derivations and emits a
 * before/after record for each derived claim whose inputs changed. Tests cover
 * the three cases the issue calls out: a changed derived value, an unchanged
 * recompute (inputs moved, derived result did not), and a stale-to-current
 * input transition.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { TrustReport, TrustStatus } from "../src/types.js";
import { recomputeChangeRecords } from "../src/recompute.js";

interface ClaimSpec {
  id: string;
  status?: TrustStatus;
  value?: unknown;
  derivedFrom?: string[];
  derivationEdges?: Array<{ inputClaimId: string }>;
}

function report(claims: ClaimSpec[]): TrustReport {
  return { claims: claims.map((c) => ({ value: null, ...c })) } as unknown as TrustReport;
}

test("changed value: a derived claim whose input value moved reports the before/after", () => {
  const prior = report([
    { id: "A", status: "verified", value: 2 },
    { id: "total", status: "verified", value: 5, derivedFrom: ["A"] },
  ]);
  const next = report([
    { id: "A", status: "verified", value: 4 },
    { id: "total", status: "verified", value: 7, derivedFrom: ["A"] },
  ]);
  const records = recomputeChangeRecords(prior, next);
  assert.equal(records.length, 1);
  assert.equal(records[0].claimId, "total");
  assert.equal(records[0].valueChanged, true);
  assert.equal(records[0].fromValue, 5);
  assert.equal(records[0].toValue, 7);
  assert.deepEqual(records[0].changedInputs.map((c) => [c.inputClaimId, c.valueChanged]), [["A", true]]);
});

test("unchanged recompute: inputs moved but the derived result did not is still reported, flagged unchanged", () => {
  // A's value changes but the derived claim's value/status stay put (e.g. a
  // producer-authored derived value that didn't move). The recompute happened;
  // it just had no effect.
  const prior = report([
    { id: "A", status: "verified", value: 1 },
    { id: "D", status: "verified", value: "steady", derivedFrom: ["A"] },
  ]);
  const next = report([
    { id: "A", status: "verified", value: 2 },
    { id: "D", status: "verified", value: "steady", derivedFrom: ["A"] },
  ]);
  const records = recomputeChangeRecords(prior, next);
  assert.equal(records.length, 1);
  assert.equal(records[0].claimId, "D");
  assert.equal(records[0].statusChanged, false);
  assert.equal(records[0].valueChanged, false);
  assert.equal(records[0].changedInputs.length, 1);
});

test("stale-to-current: an input recovering from stale to verified is reported with the transition", () => {
  const prior = report([
    { id: "A", status: "stale", value: 1 },
    { id: "D", status: "stale", value: 1, derivedFrom: ["A"] },
  ]);
  const next = report([
    { id: "A", status: "verified", value: 1 },
    { id: "D", status: "verified", value: 1, derivedFrom: ["A"] },
  ]);
  const records = recomputeChangeRecords(prior, next);
  assert.equal(records.length, 1);
  const rec = records[0];
  assert.equal(rec.claimId, "D");
  assert.deepEqual([rec.fromStatus, rec.toStatus], ["stale", "verified"]);
  assert.equal(rec.statusChanged, true);
  assert.deepEqual(rec.changedInputs[0], {
    inputClaimId: "A",
    fromStatus: "stale",
    toStatus: "verified",
    statusChanged: true,
    valueChanged: false,
  });
});

test("no record when nothing changed, and non-derived (input) claims are not reported", () => {
  const prior = report([
    { id: "A", status: "verified", value: 1 },
    { id: "D", status: "verified", value: 1, derivedFrom: ["A"] },
  ]);
  assert.deepEqual(recomputeChangeRecords(prior, prior), []);

  // A is a leaf input that changed; A itself gets no recompute record (only
  // derived claims do), and D is reported because its input A moved.
  const next = report([
    { id: "A", status: "disputed", value: 1 },
    { id: "D", status: "disputed", value: 1, derivedFrom: ["A"] },
  ]);
  const records = recomputeChangeRecords(prior, next);
  assert.deepEqual(records.map((r) => r.claimId), ["D"]);
});

test("transitive cascade: each derived claim in a chain reports its own direct-input change", () => {
  const prior = report([
    { id: "A", status: "verified", value: 1 },
    { id: "B", status: "verified", value: 1, derivedFrom: ["A"] },
    { id: "C", status: "verified", value: 1, derivedFrom: ["B"] },
  ]);
  const next = report([
    { id: "A", status: "disputed", value: 1 },
    { id: "B", status: "disputed", value: 1, derivedFrom: ["A"] },
    { id: "C", status: "disputed", value: 1, derivedFrom: ["B"] },
  ]);
  const records = recomputeChangeRecords(prior, next);
  // B reports its input A moved; C reports its input B moved — the cascade is
  // captured via each claim's direct input.
  assert.deepEqual(records.map((r) => [r.claimId, r.changedInputs[0].inputClaimId]), [
    ["B", "A"],
    ["C", "B"],
  ]);
});

test("value comparison is structural (object key order does not spuriously report a change)", () => {
  const prior = report([
    { id: "A", status: "verified", value: 1 },
    { id: "D", status: "verified", value: { x: 1, y: 2 }, derivedFrom: ["A"] },
  ]);
  const next = report([
    { id: "A", status: "verified", value: 2 },
    { id: "D", status: "verified", value: { y: 2, x: 1 }, derivedFrom: ["A"] },
  ]);
  const records = recomputeChangeRecords(prior, next);
  assert.equal(records[0].valueChanged, false); // same object, different key order
});
