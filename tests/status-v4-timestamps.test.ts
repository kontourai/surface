/**
 * Status function version "4" (Hachure 0.18.0): RFC 3339 timestamps compared
 * exactly, unevaluable times failing closed in Step 1, exact validity windows.
 *
 * The conformance vectors run through buildTrustReport in
 * tests/spec-conformance.test.ts. This file checks the timestamp reader
 * against the `hachure` package's own, the inputs no vector can express (a
 * `now` that is not a Date), and that version "3" stays as it was.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrustReport,
  compareTimestamps,
  deriveClaimStatus,
  parseTimestamp,
  type StatusFunctionVersion,
  type TrustBundle,
} from "../src/index.js";

// @ts-expect-error — the hachure package ships no TypeScript types
const hachure = (await import("hachure")) as {
  parseTimestamp: (value: unknown) => { epochMilliseconds: number; subMillisecond: string } | undefined;
  compareTimestamps: (a: unknown, b: unknown) => number;
  deriveStatuses: (bundle: unknown, now: Date, options: { statusFunctionVersion: string }) => Record<string, string>;
};

const FORMS: unknown[] = [
  "2026-05-02T00:00:00Z",
  "2026-05-02T00:00:00.000Z",
  "2026-05-02t00:00:00z",
  "2026-05-02T02:00:00+02:00",
  "2026-05-01T19:00:00-05:00",
  "2026-05-02T00:00:00.0009Z",
  "2026-05-02T00:00:00.0001Z",
  "2026-05-02T00:00:00.00000000002Z",
  "2026-05-02T00:00:00.00000000001Z",
  "2026-05-02T00:00:00.9999999999Z",
  "2026-05-02T00:00:00.5Z",
  "2026-05-02T00:00:00.500000Z",
  "2016-12-31T23:59:60Z",
  "2017-01-01T00:59:60+01:00",
  "2016-12-31T23:58:60Z",
  "2024-02-29T00:00:00Z",
  "2023-02-29T00:00:00Z",
  "2027-02-30T00:00:00Z",
  "2026-05-02T24:00:00Z",
  "2026-05-02T00:60:00Z",
  "2026-05-02T00:00:00+24:00",
  "2026-05-02T00:00:00+0200",
  "2026-05-02 00:00:00Z",
  "2026-05-02T00:00:00",
  "2026-05-02",
  "April 1, 2027",
  "0099-01-01T00:00:00Z",
  "1969-12-31T23:59:59.999Z",
  1714608000000,
  null,
  undefined,
  {},
];

test("parseTimestamp reads every form exactly as the hachure package does", () => {
  for (const value of FORMS) {
    assert.deepEqual(parseTimestamp(value), hachure.parseTimestamp(value), `form ${JSON.stringify(value)}`);
  }
});

test("compareTimestamps orders every pair exactly as the hachure package does", () => {
  const instants = FORMS.map((value) => parseTimestamp(value)).filter((value) => value !== undefined);
  assert.ok(instants.length >= 15);
  for (const a of instants) {
    for (const b of instants) assert.equal(Math.sign(compareTimestamps(a, b)), Math.sign(hachure.compareTimestamps(a, b)));
  }
  // Pinned literally: sub-millisecond digits count, trailing zeros do not.
  const t = (value: string) => parseTimestamp(value)!;
  assert.ok(compareTimestamps(t("2026-05-02T00:00:00.0009Z"), t("2026-05-02T00:00:00.0001Z")) > 0);
  assert.ok(compareTimestamps(t("2026-05-02T00:00:00.00000000002Z"), t("2026-05-02T00:00:00.00000000001Z")) > 0);
  assert.ok(compareTimestamps(t("2026-05-02T00:00:00.9999999999Z"), t("2026-05-02T00:00:01Z")) < 0);
  assert.equal(compareTimestamps(t("2026-05-02T00:00:00.5Z"), t("2026-05-02T00:00:00.500000Z")), 0);
  assert.equal(compareTimestamps(t("2016-12-31T23:59:60Z"), t("2017-01-01T00:00:00Z")), 0);
});

// ── a `now` that is not a Date ────────────────────────────────────────────

function verifiedBundle(): TrustBundle {
  return {
    schemaVersion: 5,
    source: "status-v4",
    claims: [{ id: "claim.a", subjectType: "repo", subjectId: "r", claimType: "check", fieldOrBehavior: "a", value: true, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" }],
    evidence: [{ id: "ev.a", claimId: "claim.a", evidenceType: "test_output", method: "validation", sourceRef: "ci", excerptOrSummary: "ok", observedAt: "2026-06-01T00:00:00.000Z", collectedBy: "ci", passing: true }],
    policies: [{ id: "policy.check", claimType: "check", requiredEvidence: ["test_output"], acceptanceCriteria: ["ok"], reviewAuthority: "ci", validityRule: { kind: "duration", durationDays: 0.7 }, stalenessTriggers: [], conflictRules: [], impactLevel: "medium" }],
    events: [{ id: "event.a", claimId: "claim.a", status: "verified", actor: "ci", method: "test", evidenceIds: ["ev.a"], createdAt: "2026-06-01T00:00:00.000Z" }],
  };
}

test("v4 takes `now` as a Date only: a string, valid timestamp or not, is refused", () => {
  const bundle = verifiedBundle();
  const args = { claim: bundle.claims[0]!, evidence: bundle.evidence, events: bundle.events, policies: bundle.policies, statusFunctionVersion: "4" as StatusFunctionVersion };
  for (const now of ["2026-06-01T12:00:00Z", "2026-06-01T12:00:00.0000001Z", "June 1, 2026", "2026-06-01"]) {
    assert.throws(() => deriveClaimStatus({ ...args, now: now as unknown as Date }), /invalid now/, `now ${now}`);
  }
  assert.throws(() => deriveClaimStatus({ ...args, now: new Date("not a date") }), /invalid now/);
  assert.equal(deriveClaimStatus({ ...args, now: new Date("2026-06-01T12:00:00.000Z") }).status, "verified");
});

test("a 0.7-day window is exactly 60,480,000 ms under v4, and v3 matches the reference implementation's v3", () => {
  const bundle = verifiedBundle();
  const at = (ms: number) => new Date(Date.parse("2026-06-01T00:00:00.000Z") + ms);
  const status = (version: StatusFunctionVersion, ms: number) => buildTrustReport(bundle, { now: at(ms), statusFunctionVersion: version }).claims[0]!.status;
  // Pinned literally beside the constant under test: 0.7 × 86,400,000.
  assert.equal(status("4", 60_480_000), "verified");
  assert.equal(status("4", 60_480_001), "stale");
  // Version "3" keeps its floating-point sum; it is compared with the
  // reference implementation's "3" below rather than pinned.
  for (const ms of [60_480_000, 60_480_001]) {
    assert.equal(status("4", ms), hachure.deriveStatuses(bundle, at(ms), { statusFunctionVersion: "4" })["claim.a"]);
    assert.equal(status("3", ms), hachure.deriveStatuses(bundle, at(ms), { statusFunctionVersion: "3" })["claim.a"]);
  }
});
