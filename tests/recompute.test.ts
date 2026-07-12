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
import type { Claim, TrustBundle, TrustReport, TrustStatus } from "../src/types.js";
import { buildTrustReport, recomputeChangeRecords, validateTrustBundle } from "../src/index.js";

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

test("value comparison is crash-safe and does not collide NaN / Infinity / null", () => {
  // A BigInt value would make a naive JSON.stringify throw; the diff must not abort.
  const priorBig = report([{ id: "A", status: "verified", value: 1 }, { id: "D", status: "verified", value: 10n, derivedFrom: ["A"] }]);
  const nextBig = report([{ id: "A", status: "disputed", value: 1 }, { id: "D", status: "verified", value: 11n, derivedFrom: ["A"] }]);
  const bigRecords = recomputeChangeRecords(priorBig, nextBig); // must not throw
  assert.equal(bigRecords[0].valueChanged, true); // 10n → 11n is a change

  // NaN, Infinity, and null all serialize to "null" naively; a real change between them must be detected.
  const priorNum = report([{ id: "A", status: "verified", value: 1 }, { id: "D", status: "verified", value: NaN, derivedFrom: ["A"] }]);
  const nextNum = report([{ id: "A", status: "disputed", value: 1 }, { id: "D", status: "verified", value: Infinity, derivedFrom: ["A"] }]);
  assert.equal(recomputeChangeRecords(priorNum, nextNum)[0].valueChanged, true);

  const priorNull = report([{ id: "A", status: "verified", value: 1 }, { id: "D", status: "verified", value: null, derivedFrom: ["A"] }]);
  const nextNull = report([{ id: "A", status: "disputed", value: 1 }, { id: "D", status: "verified", value: NaN, derivedFrom: ["A"] }]);
  assert.equal(recomputeChangeRecords(priorNull, nextNull)[0].valueChanged, true); // null vs NaN is a change
});

test("derivationEdges inputs (not just derivedFrom) are diffed", () => {
  const prior = report([
    { id: "A", status: "verified", value: 1 },
    { id: "D", status: "verified", value: 1, derivationEdges: [{ inputClaimId: "A" }] },
  ]);
  const next = report([
    { id: "A", status: "disputed", value: 1 },
    { id: "D", status: "disputed", value: 1, derivationEdges: [{ inputClaimId: "A" }] },
  ]);
  const records = recomputeChangeRecords(prior, next);
  assert.deepEqual(records.map((r) => [r.claimId, r.changedInputs[0].inputClaimId]), [["D", "A"]]);
});

test("a newly-appeared derived claim (absent from prior) is not reported", () => {
  const prior = report([{ id: "A", status: "verified", value: 1 }]);
  const next = report([
    { id: "A", status: "disputed", value: 1 },
    { id: "D", status: "disputed", value: 1, derivedFrom: ["A"] }, // new
  ]);
  assert.deepEqual(recomputeChangeRecords(prior, next), []);
});

test("integration: cascade holds against two real buildTrustReport derivations", () => {
  // Proves the cascade guarantee against the actual derivation kernel, not a
  // hand-authored fixture: an input claim's event flips verified → rejected
  // between two full derivations, and the derived claim's recompute record
  // reflects the kernel-recomputed ceiling.
  const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
    subjectType: "repo", subjectId: "repo-A", facet: "governance.evidence",
    claimType: "software-evidence", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z",
  };
  const bundle = (inputEventStatus: TrustStatus): TrustBundle => validateTrustBundle({
    schemaVersion: 3,
    source: "recompute-integration",
    claims: [
      { ...baseClaim, id: "input", fieldOrBehavior: "check-passes", value: true },
      { ...baseClaim, id: "derived", fieldOrBehavior: "release-ready", value: true, derivedFrom: ["input"] },
    ],
    evidence: [],
    policies: [],
    events: [
      { id: "ev-1", claimId: "input", status: inputEventStatus, actor: "owner", method: "attestation", evidenceIds: [], createdAt: "2026-04-25T01:00:00.000Z" },
      // The derived claim earns its own verified own-status; the ceiling from its
      // input is what then bounds it down when the input flips.
      { id: "ev-2", claimId: "derived", status: "verified", actor: "owner", method: "attestation", evidenceIds: [], createdAt: "2026-04-25T01:00:00.000Z" },
    ],
  } as unknown as TrustBundle);

  const now = new Date("2026-04-26T00:00:00.000Z");
  const prior = buildTrustReport(bundle("verified"), { now });
  const next = buildTrustReport(bundle("rejected"), { now });

  // Sanity: the kernel actually moved both the input and the derived conclusion.
  assert.equal(prior.claims.find((c) => c.id === "derived")?.status, "verified");
  assert.equal(next.claims.find((c) => c.id === "derived")?.status, "rejected");

  const records = recomputeChangeRecords(prior, next);
  const derivedRecord = records.find((r) => r.claimId === "derived");
  assert.ok(derivedRecord, "derived claim has a recompute record");
  assert.deepEqual([derivedRecord.fromStatus, derivedRecord.toStatus], ["verified", "rejected"]);
  assert.equal(derivedRecord.changedInputs[0].inputClaimId, "input");
  assert.deepEqual([derivedRecord.changedInputs[0].fromStatus, derivedRecord.changedInputs[0].toStatus], ["verified", "rejected"]);
});
