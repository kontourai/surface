/**
 * Status function "3", step 1 and event ordering, compared as instants.
 *
 * The Hachure 0.16.0 conformance vectors do not cover these inputs (every
 * vector spells its timestamps the same way), so each case is also checked
 * against the `hachure` package's bundled implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildTrustReport, type AuthorityTrace, type StatusFunctionVersion, type TrustBundle } from "../src/index.js";

// @ts-expect-error — the hachure package ships no TypeScript types
const hachure = (await import("hachure")) as {
  deriveStatuses: (bundle: unknown, now: Date, options: { statusFunctionVersion: string }) => Record<string, string>;
};

const now = new Date("2026-05-03T00:00:00.000Z");

/**
 * A resolution event to `verified` at 2026-05-02T00:00:00.000Z, followed by a
 * later plain `rejected` event. When the resolver's trace is active at the
 * resolution, the resolution governs (`verified`); otherwise the latest event
 * does (`rejected`).
 */
function resolutionBundle(trace: Partial<AuthorityTrace>): TrustBundle {
  return {
    schemaVersion: 5,
    source: "status-v3-authority",
    claims: [{
      id: "claim.grant", subjectType: "service", subjectId: "svc", facet: "access", claimType: "grant",
      fieldOrBehavior: "deploy key", value: true, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z",
    }],
    evidence: [{
      id: "evidence.attested", claimId: "claim.grant", evidenceType: "human_attestation", method: "attestation",
      sourceRef: "review", excerptOrSummary: "attested", observedAt: "2026-05-01T00:00:00.000Z", collectedBy: "reviewer",
    }],
    policies: [{
      id: "policy.grant", claimType: "grant", requiredEvidence: ["human_attestation"], acceptanceCriteria: ["attested"],
      reviewAuthority: "security", validityRule: { kind: "manual" }, stalenessTriggers: [], conflictRules: [], impactLevel: "high",
    }],
    events: [
      { id: "event.rejected", claimId: "claim.grant", status: "rejected", actor: "auditor", method: "review", evidenceIds: [], createdAt: "2026-05-02T12:00:00.000Z" },
      {
        id: "event.resolved", claimId: "claim.grant", status: "verified", actor: "reviewer", method: "review",
        evidenceIds: ["evidence.attested"], createdAt: "2026-05-02T00:00:00.000Z", resolvesDispute: true,
      },
    ],
    authorityTrace: [{
      id: "trace.reviewer", subject: { subjectType: "service", subjectId: "svc" }, actorRef: "reviewer",
      authorityRef: "security", grantedAt: "2026-04-01T00:00:00.000Z", ...trace,
    } as AuthorityTrace],
  };
}

function statusUnder(bundle: TrustBundle, version: StatusFunctionVersion, at: Date = now): string {
  return buildTrustReport(bundle, { now: at, statusFunctionVersion: version }).claims[0]!.status;
}

function referenceStatus(bundle: TrustBundle, at: Date = now): string {
  return hachure.deriveStatuses(bundle, at, { statusFunctionVersion: "3" })["claim.grant"]!;
}

test("baseline: an active trace lets the resolution govern; a trace revoked earlier does not", () => {
  assert.equal(statusUnder(resolutionBundle({}), "3"), "verified");
  assert.equal(statusUnder(resolutionBundle({ revokedAt: "2026-05-01T23:00:00.000Z" }), "3"), "rejected");
});

test("revokedAt at the event's instant, spelled without milliseconds, revokes the trace", () => {
  // As strings "…00:00:00Z" > "…00:00:00.000Z", which read as "revoked later".
  const bundle = resolutionBundle({ revokedAt: "2026-05-02T00:00:00Z" });
  assert.equal(statusUnder(bundle, "3"), "rejected");
  assert.equal(referenceStatus(bundle), "rejected");
  assert.equal(statusUnder(bundle, "2"), "verified", "version 2 keeps the string comparison it shipped with");
});

test("validUntil an hour before the event, spelled in another offset, has expired", () => {
  // 2026-05-02T01:00+02:00 is 2026-05-01T23:00Z. As a string it sorts after the event time.
  const bundle = resolutionBundle({ validUntil: "2026-05-02T01:00:00.000+02:00" });
  assert.equal(statusUnder(bundle, "3"), "rejected");
  assert.equal(referenceStatus(bundle), "rejected");
  assert.equal(statusUnder(bundle, "2"), "verified");
});

test("the reverse spelling no longer excludes a trace that is still active", () => {
  // 2026-05-01T23:30-02:00 is 2026-05-02T01:30Z, an hour and a half after the
  // event. As a string it sorts before the event time and read as "expired".
  const bundle = resolutionBundle({ validUntil: "2026-05-01T23:30:00.000-02:00" });
  assert.equal(statusUnder(bundle, "3"), "verified");
  assert.equal(referenceStatus(bundle), "verified");
  assert.equal(statusUnder(bundle, "2"), "rejected");

  // validFrom half an hour after the event, spelled so that it sorts before it.
  const notYet = resolutionBundle({ validFrom: "2026-05-01T22:30:00.000-02:00" });
  assert.equal(statusUnder(notYet, "3"), "rejected");
  assert.equal(referenceStatus(notYet), "rejected");
  assert.equal(statusUnder(notYet, "2"), "verified");
});

test("an event with an unparseable createdAt sorts as the oldest, so a dated event governs", () => {
  const bundle = resolutionBundle({});
  // No authority: plain latest-event fold over a dated `verified` and an undated `rejected`.
  bundle.authorityTrace = [];
  const undated = { id: "event.undated", claimId: "claim.grant", status: "rejected" as const, actor: "auditor", method: "review" as const, evidenceIds: [], createdAt: "not-a-date" };
  const dated = { id: "event.dated", claimId: "claim.grant", status: "verified" as const, actor: "reviewer", method: "review" as const, evidenceIds: ["evidence.attested"], createdAt: "2026-05-02T00:00:00.000Z" };

  for (const events of [[undated, dated], [dated, undated]]) {
    bundle.events = events;
    assert.equal(statusUnder(bundle, "3"), "verified", `bundle order ${events.map((event) => event.id).join(", ")}`);
    assert.equal(referenceStatus(bundle), "verified");
  }
  // Version 2 leaves the order to a NaN comparison: the first event in bundle order governs.
  bundle.events = [undated, dated];
  assert.equal(statusUnder(bundle, "2"), "rejected");
});
