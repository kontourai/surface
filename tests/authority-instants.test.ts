/**
 * Authority-trace bounds are compared as instants, never as strings (#320),
 * under every status function version, on both paths that read them:
 *
 * - the status function's Step 1 (an authority-gated dispute resolution), and
 * - a derivation rule's `requiresActiveAuthority` (`checkAuthorityActive`).
 *
 * Before 6.0.1, Step 1 under "2" and `checkAuthorityActive` under every
 * version compared the ISO strings, so a bound written with a non-`Z` offset,
 * or with a different number of fractional digits, was misread.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrustReport,
  checkAuthorityActive,
  evaluateDerivationRule,
  type AuthorityTrace,
  type DerivationRule,
  type StatusFunctionVersion,
  type TrustBundle,
} from "../src/index.js";

// @ts-expect-error — the hachure package ships no TypeScript types
const hachure = (await import("hachure")) as {
  deriveStatuses: (bundle: unknown, now: Date, options: { statusFunctionVersion: string }) => Record<string, string>;
};

const VERSIONS: StatusFunctionVersion[] = ["2", "3", "4"];

function trace(bounds: Partial<AuthorityTrace>): AuthorityTrace {
  return {
    id: "trace.reviewer", subject: { subjectType: "service", subjectId: "svc" }, actorRef: "reviewer", authorityType: "role",
    authorityRef: "security", sourceRef: "directory", observedAt: "2026-01-01T00:00:00Z", ...bounds,
  } as AuthorityTrace;
}

// ── #320: checkAuthorityActive / requiresActiveAuthority ──────────────────

const NOW = new Date("2026-10-09T23:30:00.000Z");

test("#320 repro: a validUntil written with +02:00 that ended half an hour ago is expired, under every version", () => {
  for (const statusFunctionVersion of VERSIONS) {
    // 2026-10-10T01:00+02:00 is 2026-10-09T23:00Z.
    assert.equal(checkAuthorityActive("reviewer", [trace({ validUntil: "2026-10-10T01:00:00+02:00" })], NOW, { statusFunctionVersion }), "expired", `v${statusFunctionVersion}`);
    // Control: the same instant written in Z.
    assert.equal(checkAuthorityActive("reviewer", [trace({ validUntil: "2026-10-09T23:00:00Z" })], NOW, { statusFunctionVersion }), "expired", `v${statusFunctionVersion} Z`);
  }
});

const ACTIVE_CASES: Array<[string, Partial<AuthorityTrace>, "active" | "expired" | "revoked"]> = [
  // validUntil 2026-10-09T21:00-05:00 is 2026-10-10T02:00Z: still active. As a string it sorts before now.
  ["validUntil later, negative offset", { validUntil: "2026-10-09T21:00:00-05:00" }, "active"],
  ["validUntil earlier, positive offset", { validUntil: "2026-10-10T01:00:00+02:00" }, "expired"],
  ["validUntil exactly now, other offset", { validUntil: "2026-10-10T01:30:00+02:00" }, "active"],
  ["validUntil exactly now, no milliseconds", { validUntil: "2026-10-09T23:30:00Z" }, "active"],
  // validFrom 2026-10-09T23:00-02:00 is 2026-10-10T01:00Z: not yet valid. As a string it sorts before now.
  ["validFrom later, negative offset", { validFrom: "2026-10-09T23:00:00-02:00" }, "expired"],
  ["validFrom exactly now, other offset", { validFrom: "2026-10-10T01:30:00+02:00" }, "active"],
  // revokedAt 2026-10-10T00:00+02:00 is 2026-10-09T22:00Z: revoked. As a string it sorts after now.
  ["revokedAt earlier, positive offset", { revokedAt: "2026-10-10T00:00:00+02:00" }, "revoked"],
  ["revokedAt exactly now, no milliseconds", { revokedAt: "2026-10-09T23:30:00Z" }, "revoked"],
  ["revokedAt later, negative offset", { revokedAt: "2026-10-09T22:00:00-02:00" }, "active"],
];

for (const [name, bounds, expected] of ACTIVE_CASES) {
  test(`checkAuthorityActive compares instants: ${name}`, () => {
    for (const statusFunctionVersion of VERSIONS) {
      assert.equal(checkAuthorityActive("reviewer", [trace(bounds)], NOW, { statusFunctionVersion }), expected, `v${statusFunctionVersion}`);
    }
  });
}

test("checkAuthorityActive: sub-millisecond bounds are exact under v4 and millisecond-precise under v3 and v2", () => {
  // A revocation 0.1 ms after now has not happened yet under "4"; "3" and
  // "2" read times to the millisecond (Date.parse), where it equals now.
  const later = trace({ revokedAt: "2026-10-09T23:30:00.0001Z" });
  assert.equal(checkAuthorityActive("reviewer", [later], NOW, { statusFunctionVersion: "4" }), "active");
  assert.equal(checkAuthorityActive("reviewer", [later], NOW, { statusFunctionVersion: "3" }), "revoked");
  assert.equal(checkAuthorityActive("reviewer", [later], NOW, { statusFunctionVersion: "2" }), "revoked");
});

test("checkAuthorityActive: an unreadable bound fails closed under v4 and excludes nothing under v3 and v2", () => {
  for (const [bounds, v4] of [[{ validUntil: "soon" }, "expired"], [{ validFrom: "2026-10-09" + " 00:00Z" }, "expired"], [{ revokedAt: "never" }, "revoked"]] as const) {
    assert.equal(checkAuthorityActive("reviewer", [trace(bounds)], NOW, { statusFunctionVersion: "4" }), v4, JSON.stringify(bounds));
    for (const statusFunctionVersion of ["2", "3"] as const) {
      assert.equal(checkAuthorityActive("reviewer", [trace(bounds)], NOW, { statusFunctionVersion }), "active", `v${statusFunctionVersion} ${JSON.stringify(bounds)}`);
    }
  }
  // One active trace is enough; an unreadable one does not veto it.
  assert.equal(checkAuthorityActive("reviewer", [trace({ validUntil: "soon" }), trace({})], NOW, { statusFunctionVersion: "4" }), "active");
});

test("requiresActiveAuthority reads offset-bearing bounds as instants through evaluateDerivationRule", () => {
  const bundle = (validUntil: string): TrustBundle => ({
    schemaVersion: 5,
    source: "authority-instants",
    claims: [{ id: "claim.a", subjectType: "service", subjectId: "svc", claimType: "grant", fieldOrBehavior: "deploy", value: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }],
    evidence: [],
    policies: [],
    events: [{ id: "event.a", claimId: "claim.a", status: "verified", actor: "reviewer", method: "review", evidenceIds: [], createdAt: "2026-10-01T00:00:00Z" }],
    authorityTrace: [trace({ validUntil })],
  });
  const rule: DerivationRule = {
    id: "rule.authority", version: "1", name: "Authority", target: { subjectType: "t", subjectId: "t", fieldOrBehavior: "t" },
    requirements: [{
      target: { subjectType: "service", subjectId: "svc", fieldOrBehavior: "deploy" },
      acceptedStatuses: ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected", "revoked"],
      requiresActiveAuthority: true,
    }],
    combinator: "all",
  };
  for (const statusFunctionVersion of VERSIONS) {
    // #320 repro: expired half an hour before now, written with +02:00.
    assert.equal(evaluateDerivationRule(rule, bundle("2026-10-10T01:00:00+02:00"), { now: NOW, statusFunctionVersion }).satisfied, false, `v${statusFunctionVersion} offset`);
    assert.equal(evaluateDerivationRule(rule, bundle("2026-10-09T23:00:00Z"), { now: NOW, statusFunctionVersion }).satisfied, false, `v${statusFunctionVersion} Z`);
    // Still active, written so that the string sorts before now.
    assert.equal(evaluateDerivationRule(rule, bundle("2026-10-09T21:00:00-05:00"), { now: NOW, statusFunctionVersion }).satisfied, true, `v${statusFunctionVersion} active`);
  }
});

// ── Step 1: an authority-gated resolution, every version ──────────────────

const AT = "2026-05-02T00:00:00.000Z";
const STEP1_NOW = new Date("2026-05-03T00:00:00.000Z");

/** A `verified` resolution at AT followed by a plain `rejected`: verified when the resolver's trace is active at AT. */
function resolutionBundle(bounds: Partial<AuthorityTrace>): TrustBundle {
  return {
    schemaVersion: 5,
    source: "authority-instants-step1",
    claims: [{ id: "claim.grant", subjectType: "service", subjectId: "svc", claimType: "grant", fieldOrBehavior: "deploy key", value: true, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" }],
    evidence: [{ id: "evidence.attested", claimId: "claim.grant", evidenceType: "human_attestation", method: "attestation", sourceRef: "review", excerptOrSummary: "attested", observedAt: "2026-05-01T00:00:00.000Z", collectedBy: "reviewer" }],
    policies: [{ id: "policy.grant", claimType: "grant", requiredEvidence: ["human_attestation"], acceptanceCriteria: ["attested"], reviewAuthority: "security", validityRule: { kind: "manual" }, stalenessTriggers: [], conflictRules: [], impactLevel: "high" }],
    events: [
      { id: "event.rejected", claimId: "claim.grant", status: "rejected", actor: "auditor", method: "review", evidenceIds: [], createdAt: "2026-05-02T12:00:00.000Z" },
      { id: "event.resolved", claimId: "claim.grant", status: "verified", actor: "reviewer", method: "review", evidenceIds: ["evidence.attested"], createdAt: AT, resolvesDispute: true },
    ],
    authorityTrace: [trace(bounds)],
  };
}

const STEP1_CASES: Array<[string, Partial<AuthorityTrace>, string]> = [
  ["validUntil an hour before the resolution, +02:00", { validUntil: "2026-05-02T01:00:00.000+02:00" }, "rejected"],
  ["validUntil 90 minutes after the resolution, -02:00", { validUntil: "2026-05-01T23:30:00.000-02:00" }, "verified"],
  ["validUntil exactly at the resolution, no milliseconds", { validUntil: "2026-05-02T00:00:00Z" }, "verified"],
  ["validFrom 30 minutes after the resolution, -02:00", { validFrom: "2026-05-01T22:30:00.000-02:00" }, "rejected"],
  ["validFrom exactly at the resolution, other offset", { validFrom: "2026-05-02T02:00:00+02:00" }, "verified"],
  ["revokedAt exactly at the resolution, no milliseconds", { revokedAt: "2026-05-02T00:00:00Z" }, "rejected"],
  ["revokedAt an hour after the resolution, -01:00", { revokedAt: "2026-05-02T00:00:00-01:00" }, "verified"],
];

for (const [name, bounds, expected] of STEP1_CASES) {
  test(`Step 1 compares the trace window as instants under every version: ${name}`, () => {
    const bundle = resolutionBundle(bounds);
    for (const statusFunctionVersion of VERSIONS) {
      const status = buildTrustReport(structuredClone(bundle), { now: STEP1_NOW, statusFunctionVersion }).claims[0]!.status;
      assert.equal(status, expected, `v${statusFunctionVersion}`);
      assert.equal(hachure.deriveStatuses(bundle, STEP1_NOW, { statusFunctionVersion })["claim.grant"], expected, `reference v${statusFunctionVersion}`);
    }
  });
}
