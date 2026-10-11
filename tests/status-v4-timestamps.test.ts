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

import { readFileSync } from "node:fs";

import {
  buildTrustReport,
  evaluateDerivationRule,
  validateTrustBundle,
  type DerivationRule,
  compareTimestamps,
  deriveClaimStatus,
  parseTimestamp,
  type StatusFunctionVersion,
  type TrustBundle,
} from "../src/index.js";
import { buildMergedConsoleReadModel } from "../src/console/merged-read-model.js";
import { buildSurfaceConsoleProjection } from "../src/console/projection.js";

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

test("a report's freshness never shows an expiry the v4 status function cannot read", () => {
  const bundle = verifiedBundle();
  const withExpiry = (expiresAt: string): TrustBundle => ({ ...bundle, claims: [{ ...bundle.claims[0]!, expiresAt }] });
  const freshness = (input: TrustBundle, version: StatusFunctionVersion) => {
    const claim = buildTrustReport(input, { now: new Date("2026-06-01T12:00:00.000Z"), statusFunctionVersion: version }).claims[0]!;
    return { status: claim.status, expiresAt: claim.freshness?.expiresAt };
  };
  // Date only: not a v4 timestamp, so v4 derives stale and shows no expiry;
  // v3 reads it with Date.parse, as it always has.
  assert.deepEqual(freshness(withExpiry("2027-04-01"), "4"), { status: "stale", expiresAt: undefined });
  assert.deepEqual(freshness(withExpiry("2027-04-01"), "3"), { status: "verified", expiresAt: "2027-04-01T00:00:00.000Z" });
  // An RFC 3339 expiry with an offset is shown as the same instant under both.
  for (const version of ["3", "4"] as const) {
    assert.deepEqual(freshness(withExpiry("2027-04-01T02:00:00+02:00"), version), { status: "verified", expiresAt: "2027-04-01T00:00:00.000Z" });
  }
});

// ── a claim made stale by an expiry v4 cannot read is explained as such ───

for (const expiresAt of ["2027-01-01T24:00:00Z", "2027-02-30T00:00:00Z"]) {
  test(`an unreadable own expiry (${expiresAt}) is named as unevaluable under v4, not as outdated or failed`, () => {
    const raw = JSON.parse(readFileSync("examples/surface-example-bundle.json", "utf8")) as TrustBundle;
    const claimId = "claim.repo-governance.api-proof";
    raw.claims.find((c) => c.id === claimId)!.expiresAt = expiresAt;
    const bundle = validateTrustBundle(raw); // both forms pass validation
    const now = new Date("2026-10-10T00:00:00.000Z");

    // Version "3" reads it with Date.parse and is unchanged.
    const v3 = buildTrustReport(bundle, { now, statusFunctionVersion: "3" });
    assert.equal(v3.claims.find((c) => c.id === claimId)!.status, "verified");
    assert.ok(!v3.transparencyGaps.some((g) => g.claimId === claimId && g.id.endsWith(".gap.unevaluable-validity-rule")));

    const report = buildTrustReport(bundle, { now });
    assert.equal(report.claims.find((c) => c.id === claimId)!.status, "stale");
    const gaps = report.transparencyGaps.filter((g) => g.claimId === claimId);
    const unevaluable = gaps.find((g) => g.id === `${claimId}.gap.unevaluable-validity-rule`);
    assert.ok(unevaluable, JSON.stringify(gaps.map((g) => g.id)));
    assert.match(unevaluable!.message, /expiresAt .* is not an RFC 3339 timestamp/);
    assert.equal(unevaluable!.metadata?.source, "validity.unevaluable");
    assert.match(gaps.find((g) => g.type === "freshness_breach")!.message, /could not be evaluated/);

    const projection = buildSurfaceConsoleProjection(buildMergedConsoleReadModel([bundle], { now }));
    const detail = projection.claimDetails[claimId]!;
    const titles = detail.gaps.map((g) => g.title);
    assert.ok(titles.includes("Validity could not be evaluated"), JSON.stringify(titles));
    assert.ok(!titles.includes("Verification failed"), JSON.stringify(titles));
    assert.match(detail.guidance ?? "", /validity could not be evaluated/);
    assert.doesNotMatch(detail.guidance ?? "", /outdated/);
  });
}

// ── fresherThan reads times as v4 does ────────────────────────────────────

function freshnessBundle(events: Array<{ id: string; createdAt: string }>): TrustBundle {
  return {
    schemaVersion: 5,
    source: "fresher-than-v4",
    claims: [{ id: "claim.f", subjectType: "repo", subjectId: "r", claimType: "check", fieldOrBehavior: "fresh", value: true, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" }],
    evidence: [{ id: "ev.f", claimId: "claim.f", evidenceType: "test_output", method: "validation", sourceRef: "ci", excerptOrSummary: "ok", observedAt: "2026-09-01T00:00:00Z", collectedBy: "ci", passing: true }],
    policies: [{ id: "policy.check", claimType: "check", requiredEvidence: ["test_output"], acceptanceCriteria: ["ok"], reviewAuthority: "ci", validityRule: { kind: "manual" }, stalenessTriggers: [], conflictRules: [], impactLevel: "medium" }],
    events: events.map((e) => ({ ...e, claimId: "claim.f", status: "verified" as const, actor: "ci", method: "test", evidenceIds: ["ev.f"] })),
  };
}

const FRESH_RULE: DerivationRule = {
  id: "rule.fresh", version: "1", name: "Fresh", target: { subjectType: "t", subjectId: "t", fieldOrBehavior: "t" },
  requirements: [{ target: { subjectType: "repo", subjectId: "r", fieldOrBehavior: "fresh" }, acceptedStatuses: ["verified"], fresherThan: { days: 2 } }],
  combinator: "all",
};

test("fresherThan under v4 ignores a verification time it cannot read; v3 keeps Date.parse", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");
  // Hour 24 reads as 2026-10-10 under Date.parse; under v4 it is not a timestamp,
  // so the latest verification v4 can read is 2026-10-01, nine days old.
  const repro = freshnessBundle([{ id: "e1", createdAt: "2026-10-01T00:00:00Z" }, { id: "e2", createdAt: "2026-10-09T24:00:00Z" }]);
  assert.equal(evaluateDerivationRule(FRESH_RULE, repro, { now }).satisfied, false);
  assert.equal(evaluateDerivationRule(FRESH_RULE, repro, { now, statusFunctionVersion: "3" }).satisfied, true);
  // Control: a readable recent verification is fresh under both.
  const control = freshnessBundle([{ id: "e1", createdAt: "2026-10-01T00:00:00Z" }, { id: "e2", createdAt: "2026-10-09T12:00:00Z" }]);
  assert.equal(evaluateDerivationRule(FRESH_RULE, control, { now }).satisfied, true);
  assert.equal(evaluateDerivationRule(FRESH_RULE, control, { now, statusFunctionVersion: "3" }).satisfied, true);
  // The window edge is inclusive and exact: two days to the millisecond is fresh, one more is not.
  const edge = freshnessBundle([{ id: "e1", createdAt: "2026-10-08T12:00:00Z" }]);
  assert.equal(evaluateDerivationRule(FRESH_RULE, edge, { now }).satisfied, true);
  assert.equal(evaluateDerivationRule(FRESH_RULE, edge, { now: new Date(now.getTime() + 1) }).satisfied, false);
});

test("every derivation entry point refuses a string now with the same RangeError under v3 and v4", () => {
  const bundle = verifiedBundle();
  for (const statusFunctionVersion of ["3", "4"] as const) {
    const now = "2026-06-01T12:00:00Z" as unknown as Date;
    assert.throws(() => buildTrustReport(bundle, { now, statusFunctionVersion }), (e: unknown) => e instanceof RangeError && /^invalid now: /.test((e as Error).message));
    assert.throws(
      () => deriveClaimStatus({ claim: bundle.claims[0]!, evidence: bundle.evidence, events: bundle.events, policies: bundle.policies, now, statusFunctionVersion }),
      (e: unknown) => e instanceof RangeError && /^invalid now: /.test((e as Error).message),
    );
  }
});
