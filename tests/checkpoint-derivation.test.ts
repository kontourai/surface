/**
 * Task A — checkpointed (tail-only) derivation.
 *
 * Proves BOTH halves of the bounded-replay contract:
 *   (1) a checkpointed re-derivation is byte-identical to a full derivation for
 *       the same `now` (the status function is pure), AND
 *   (2) it actually consumes only the event tail — a claim with no events newer
 *       than the checkpoint high-water mark folds ZERO of its events, while a
 *       full derivation folds the whole ledger.
 *
 * The instrument hook on buildTrustReport reports per-claim how many events were
 * folded, so "touches only the tail" is asserted directly, not assumed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildTrustReport,
  checkpointFromReport,
  validateTrustBundle,
  type SnapshotEventProbe,
  type TrustBundle,
} from "../src/index.js";

const CONFORMANCE_DIR = "node_modules/hachure/conformance";

async function loadBundle(vectorFile: string): Promise<TrustBundle> {
  const raw = JSON.parse(await readFile(join(CONFORMANCE_DIR, vectorFile), "utf8"));
  return validateTrustBundle(raw.input);
}

function probesByClaim(): { probes: SnapshotEventProbe[]; instrument: (p: SnapshotEventProbe) => void } {
  const probes: SnapshotEventProbe[] = [];
  return { probes, instrument: (p) => probes.push(p) };
}

function foldedFor(probes: SnapshotEventProbe[], claimId: string): SnapshotEventProbe {
  const probe = probes.find((p) => p.claimId === claimId);
  assert.ok(probe, `expected a probe for ${claimId}`);
  return probe;
}

test("checkpointed derivation is identical to full derivation for the same now", async () => {
  // claim.window.expires-at: fresh while now < 2026-06-01, stale after.
  const bundle = await loadBundle("sf-expired-window.json");

  // T0 — before either claim's window closes; both verified+fresh.
  const t0 = new Date("2026-05-15T00:00:00.000Z");
  const reportT0 = buildTrustReport(bundle, { now: t0 });
  assert.equal(reportT0.claims.find((c) => c.id === "claim.window.expires-at")?.status, "verified");
  const checkpoint = checkpointFromReport(reportT0);

  // T1 — both windows have closed; both derive stale.
  const t1 = new Date("2026-06-10T00:00:00.000Z");
  const full = buildTrustReport(bundle, { now: t1 });
  const checkpointed = buildTrustReport(bundle, { now: t1, since: checkpoint });

  // (1) IDENTITY — same now ⇒ identical claims regardless of the checkpoint.
  //     id/generatedAt are time-stamps, not derivation output; compare the rest.
  const stripVolatile = (r: ReturnType<typeof buildTrustReport>) => ({
    claims: r.claims,
    changeRecords: r.changeRecords,
    transparencyGaps: r.transparencyGaps,
    summary: r.summary,
    claimGroupRollups: r.claimGroupRollups,
    statusFunctionVersion: r.statusFunctionVersion,
  });
  assert.deepEqual(stripVolatile(checkpointed), stripVolatile(full));
  assert.equal(checkpointed.claims.find((c) => c.id === "claim.window.expires-at")?.status, "stale");
});

test("checkpointed derivation folds ZERO events for unchanged claims (tail-only)", async () => {
  const bundle = await loadBundle("sf-expired-window.json");
  const t0 = new Date("2026-05-15T00:00:00.000Z");
  const checkpoint = checkpointFromReport(buildTrustReport(bundle, { now: t0 }));
  const t1 = new Date("2026-06-10T00:00:00.000Z");

  // Full derivation at T1 folds each claim's full event ledger.
  const fullRun = probesByClaim();
  buildTrustReport(bundle, { now: t1, instrument: fullRun.instrument });
  const fullExpires = foldedFor(fullRun.probes, "claim.window.expires-at");
  assert.equal(fullExpires.fromCheckpoint, false);
  assert.equal(fullExpires.eventsTotal, 1);
  assert.equal(fullExpires.eventsFolded, 1, "full derivation must fold the claim's event");

  // Checkpointed derivation at T1 (no new events landed) folds ZERO events but
  // still flips the claim to stale purely from re-applying the time window.
  const cpRun = probesByClaim();
  const cpReport = buildTrustReport(bundle, { now: t1, since: checkpoint, instrument: cpRun.instrument });
  const cpExpires = foldedFor(cpRun.probes, "claim.window.expires-at");
  assert.equal(cpExpires.fromCheckpoint, true, "claim must be served from the checkpoint");
  assert.equal(cpExpires.eventsTotal, 1);
  assert.equal(cpExpires.eventsFolded, 0, "checkpointed derivation must fold NONE of the claim's events");
  assert.equal(cpReport.claims.find((c) => c.id === "claim.window.expires-at")?.status, "stale");

  // The total events folded across all claims is demonstrably smaller under the
  // checkpoint than under a full replay.
  const totalFull = fullRun.probes.reduce((n, p) => n + p.eventsFolded, 0);
  const totalCheckpointed = cpRun.probes.reduce((n, p) => n + p.eventsFolded, 0);
  assert.ok(totalFull > 0);
  assert.equal(totalCheckpointed, 0, "no claim had a tail event, so nothing should be folded");
  assert.ok(totalCheckpointed < totalFull, "checkpointed run must touch fewer events than full");
});

test("checkpointed derivation folds ONLY the tail when a new event lands", async () => {
  const bundle = await loadBundle("sf-expired-window.json");
  const t0 = new Date("2026-05-15T00:00:00.000Z");
  const checkpoint = checkpointFromReport(buildTrustReport(bundle, { now: t0 }));

  // Append a NEW event (after the checkpoint high-water mark) revoking one claim.
  const withTailEvent: TrustBundle = {
    ...bundle,
    events: [
      ...bundle.events,
      {
        id: "event.window.expires-at.revoked",
        claimId: "claim.window.expires-at",
        status: "revoked",
        type: "invalidation",
        actor: "operator",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-05-20T00:00:00.000Z",
      },
    ],
  };

  const t1 = new Date("2026-05-25T00:00:00.000Z");
  const full = buildTrustReport(withTailEvent, { now: t1 });

  const cpRun = probesByClaim();
  const checkpointed = buildTrustReport(withTailEvent, { now: t1, since: checkpoint, instrument: cpRun.instrument });

  // Identity holds even with a tail event.
  assert.deepEqual(
    checkpointed.claims.map((c) => [c.id, c.status]),
    full.claims.map((c) => [c.id, c.status]),
  );

  // The revoked claim HAS a tail event, so it must be re-folded; the untouched
  // claim has none, so it is served from the checkpoint (zero events folded).
  const revoked = foldedFor(cpRun.probes, "claim.window.expires-at");
  assert.equal(revoked.fromCheckpoint, false, "claim with a tail event must be re-folded");
  assert.ok(revoked.eventsFolded > 0);
  assert.equal(checkpointed.claims.find((c) => c.id === "claim.window.expires-at")?.status, "stale");

  const untouched = foldedFor(cpRun.probes, "claim.window.ttl");
  assert.equal(untouched.fromCheckpoint, true, "claim with no tail event served from checkpoint");
  assert.equal(untouched.eventsFolded, 0);
});

test("a checkpoint from a different statusFunctionVersion forces a full replay", async () => {
  const bundle = await loadBundle("sf-expired-window.json");
  const t0 = new Date("2026-05-15T00:00:00.000Z");
  const checkpoint = checkpointFromReport(buildTrustReport(bundle, { now: t0 }));
  // Simulate a checkpoint produced under an older/incompatible algorithm.
  const staleCheckpoint = { ...checkpoint, statusFunctionVersion: "1" };

  const t1 = new Date("2026-06-10T00:00:00.000Z");
  const cpRun = probesByClaim();
  buildTrustReport(bundle, { now: t1, since: staleCheckpoint, instrument: cpRun.instrument });

  // No claim may be served from an incompatible checkpoint — all fully re-folded.
  for (const probe of cpRun.probes) {
    assert.equal(probe.fromCheckpoint, false, `${probe.claimId} must not be served from an incompatible checkpoint`);
    assert.equal(probe.eventsFolded, probe.eventsTotal);
  }
});

// ---------------------------------------------------------------------------
// Checkpoint input digests: a checkpointed derivation must equal the full one
// when evidence, policy or an input claim changed without a new event.
// ---------------------------------------------------------------------------

const T0 = "2026-05-01T00:00:00.000Z";
const digestNow = new Date("2026-06-01T00:00:00.000Z");
const apiPolicy = {
  id: "policy.api", claimType: "api", requiredEvidence: ["test_output" as const], acceptanceCriteria: ["tests pass"],
  reviewAuthority: "ci", validityRule: { kind: "manual" as const }, stalenessTriggers: [], conflictRules: [], impactLevel: "high" as const,
};
const claimFor = (id: string, extra: Record<string, unknown> = {}) => ({
  id, subjectType: "service", subjectId: "svc", facet: "api", claimType: "api", fieldOrBehavior: id, value: true,
  createdAt: T0, updatedAt: T0, ...extra,
});
const evidenceFor = (id: string, claimId: string, extra: Record<string, unknown> = {}) => ({
  id, claimId, evidenceType: "test_output" as const, method: "validation" as const, sourceRef: "ci", excerptOrSummary: "tests",
  observedAt: T0, collectedBy: "ci", passing: true, ...extra,
});
const eventFor = (id: string, claimId: string, status: string, createdAt = T0, extra: Record<string, unknown> = {}) => ({
  id, claimId, status, actor: "ci", method: "validation", evidenceIds: [], createdAt, ...extra,
});
// claim.c has no derivation inputs, its own policy, and is never edited below.
const untouchedPolicy = { ...apiPolicy, id: "policy.untouched", claimType: "untouched" };
const digestBase = (): TrustBundle => ({
  schemaVersion: 3, source: "checkpoint-digest",
  claims: [claimFor("claim.a"), claimFor("claim.b", { derivedFrom: ["claim.a"] }), claimFor("claim.c", { claimType: "untouched" })],
  evidence: [evidenceFor("evidence.a", "claim.a"), evidenceFor("evidence.b", "claim.b"), evidenceFor("evidence.c", "claim.c")],
  policies: [apiPolicy, untouchedPolicy],
  events: [eventFor("event.a", "claim.a", "verified"), eventFor("event.b", "claim.b", "verified"), eventFor("event.c", "claim.c", "verified")],
} as unknown as TrustBundle);

function statusesWithAndWithoutCheckpoint(before: TrustBundle, after: TrustBundle) {
  const checkpoint = checkpointFromReport(buildTrustReport(validateTrustBundle(before), { now: digestNow }));
  const run = probesByClaim();
  const full = buildTrustReport(validateTrustBundle(after), { now: digestNow });
  const since = buildTrustReport(validateTrustBundle(after), { now: digestNow, since: checkpoint, instrument: run.instrument });
  const statuses = (report: ReturnType<typeof buildTrustReport>) => Object.fromEntries(report.claims.map((claim) => [claim.id, claim.status]));
  return { full: statuses(full), since: statuses(since), fullReport: full, sinceReport: since, probes: run.probes };
}

test("checkpoint: new blocking failed evidence without a new event derives the full status", () => {
  const before = digestBase();
  const after = { ...before, evidence: [...before.evidence, evidenceFor("evidence.a.fail", "claim.a", { passing: false, blocking: true })] };
  const result = statusesWithAndWithoutCheckpoint(before, after);
  assert.equal(result.full["claim.a"], "disputed");
  assert.deepEqual(result.since, result.full);
  assert.equal(foldedFor(result.probes, "claim.a").fromCheckpoint, false);
  assert.equal(foldedFor(result.probes, "claim.c").eventsFolded, 0, "an untouched claim is still served from the checkpoint");
});

test("checkpoint: a tightened policy derives the full status", () => {
  const before = digestBase();
  const after = { ...before, policies: [{ ...apiPolicy, requiredEvidence: ["test_output", "runtime_observation"] }, untouchedPolicy] } as unknown as TrustBundle;
  const result = statusesWithAndWithoutCheckpoint(before, after);
  assert.equal(result.full["claim.a"], "proposed");
  assert.deepEqual(result.since, result.full);
});

test("checkpoint: a derived claim follows its input when the input recovers", () => {
  const disputed = { ...digestBase(), events: [...digestBase().events, eventFor("event.a.disputed", "claim.a", "disputed", "2026-05-02T00:00:00.000Z")] } as unknown as TrustBundle;
  // The input recovers through an event that is not later than the checkpoint's mark.
  const recovered = { ...disputed, events: [...disputed.events.filter((event) => event.id !== "event.a.disputed"), eventFor("event.a.recheck", "claim.a", "verified", "2026-05-01T12:00:00.000Z")] } as unknown as TrustBundle;
  const result = statusesWithAndWithoutCheckpoint(disputed, recovered);
  assert.equal(result.full["claim.b"], "verified");
  assert.deepEqual(result.since, result.full);
  // claim.b itself is unchanged, so it is served from the checkpoint and the ceiling is recomputed.
  assert.equal(foldedFor(result.probes, "claim.b").fromCheckpoint, true);
});

test("checkpoint: a revocation folded before the checkpoint stays stale", () => {
  const revoked = { ...digestBase(), events: [...digestBase().events, eventFor("event.a.revoked", "claim.a", "revoked", "2026-05-02T00:00:00.000Z", { type: "invalidation" })] } as unknown as TrustBundle;
  const result = statusesWithAndWithoutCheckpoint(revoked, revoked);
  assert.equal(result.full["claim.a"], "stale");
  assert.deepEqual(result.since, result.full);
  assert.equal(foldedFor(result.probes, "claim.a").fromCheckpoint, true);
});

test("checkpoint: a checkpoint without input digests, or from a cloned report, replays in full", () => {
  const bundle = validateTrustBundle(digestBase());
  const report = buildTrustReport(bundle, { now: digestNow });
  const { inputDigestByClaimId: _digests, untimedOwnStatusByClaimId: _own, ...legacy } = checkpointFromReport(report);
  const fromClone = checkpointFromReport(structuredClone(report));
  assert.equal(fromClone.inputDigestByClaimId, undefined);
  for (const checkpoint of [legacy, fromClone]) {
    const run = probesByClaim();
    buildTrustReport(bundle, { now: digestNow, since: checkpoint, instrument: run.instrument });
    for (const probe of run.probes) assert.equal(probe.fromCheckpoint, false, `${probe.claimId} must be re-folded`);
  }
});

test("checkpoint: random edits without new events derive the same report as a full derivation", () => {
  let seed = 0x5eed;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const edits: Array<(bundle: TrustBundle) => TrustBundle> = [
    (b) => ({ ...b, evidence: [...b.evidence, evidenceFor(`evidence.extra.${b.evidence.length}`, pick(["claim.a", "claim.b"]), { passing: pick([true, false]), blocking: pick([true, false]) })] } as unknown as TrustBundle),
    (b) => ({ ...b, evidence: b.evidence.filter((item) => item.id !== pick(["evidence.a", "evidence.b"])) }),
    (b) => ({ ...b, policies: [{ ...apiPolicy, requiredEvidence: pick([["test_output"], ["test_output", "runtime_observation"], []]) }, untouchedPolicy] } as unknown as TrustBundle),
    (b) => ({ ...b, policies: [{ ...apiPolicy, requiresCorroboration: pick([true, false]) }, untouchedPolicy] } as unknown as TrustBundle),
    (b) => ({ ...b, events: [...b.events, eventFor(`event.backdated.${b.events.length}`, pick(["claim.a", "claim.b"]), pick(["disputed", "verified", "rejected"]), T0)] } as unknown as TrustBundle),
  ];
  const volatile = (report: ReturnType<typeof buildTrustReport>) => ({ claims: report.claims, transparencyGaps: report.transparencyGaps, changeRecords: report.changeRecords, summary: report.summary });
  for (let round = 0; round < 60; round += 1) {
    let after = digestBase();
    const count = 1 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) after = pick(edits)(after);
    const result = statusesWithAndWithoutCheckpoint(digestBase(), after);
    assert.deepEqual(volatile(result.sinceReport), volatile(result.fullReport), `round ${round}`);
    assert.equal(foldedFor(result.probes, "claim.c").eventsFolded, 0, `round ${round}: untouched claim must not be re-folded`);
  }
});

// ---------------------------------------------------------------------------
// Checkpoints re-apply time exactly for a `now` earlier or later than `asOf`.
// ---------------------------------------------------------------------------

function sinceMatchesFull(bundle: TrustBundle, checkpointAt: Date, at: Date) {
  const checkpoint = checkpointFromReport(buildTrustReport(bundle, { now: checkpointAt }));
  const run = probesByClaim();
  const since = buildTrustReport(bundle, { now: at, since: checkpoint, instrument: run.instrument });
  const full = buildTrustReport(bundle, { now: at });
  const statuses = (report: ReturnType<typeof buildTrustReport>) => Object.fromEntries(report.claims.map((claim) => [claim.id, claim.status]));
  return { since: statuses(since), full: statuses(full), sinceReport: since, fullReport: full, probes: run.probes };
}

// A verified claim with a blocking failure and an intrinsic expiry: disputed
// before 06-15, stale after it.
const expiringDisputed = (): TrustBundle => ({
  ...digestBase(),
  claims: [claimFor("claim.a", { expiresAt: "2026-06-15T00:00:00.000Z" }), ...digestBase().claims.slice(1)],
  evidence: [...digestBase().evidence, evidenceFor("evidence.a.fail", "claim.a", { passing: false, blocking: true })],
} as unknown as TrustBundle);

test("checkpoint: a stale checkpoint replayed at an earlier now does not hide a blocking failure", () => {
  const result = sinceMatchesFull(expiringDisputed(), new Date("2026-07-01T00:00:00.000Z"), new Date("2026-06-01T00:00:00.000Z"));
  assert.equal(result.full["claim.a"], "disputed");
  assert.deepEqual(result.since, result.full);
  assert.equal(foldedFor(result.probes, "claim.a").fromCheckpoint, true);
});

test("checkpoint: a disputed checkpoint replayed after the expiry derives stale", () => {
  const result = sinceMatchesFull(expiringDisputed(), new Date("2026-06-01T00:00:00.000Z"), new Date("2026-07-01T00:00:00.000Z"));
  assert.equal(result.full["claim.a"], "stale");
  assert.deepEqual(result.since, result.full);
  assert.equal(foldedFor(result.probes, "claim.a").fromCheckpoint, true);
});

test("checkpoint: an authorized dispute resolution is not re-aged by time", () => {
  const trace = {
    id: "authority.reviewer", subject: { subjectType: "service", subjectId: "svc" }, actorRef: "actor:reviewer",
    authorityType: "role", authorityRef: "role:owner", sourceRef: "directory", observedAt: T0,
    validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2026-12-31T23:59:59.000Z",
  };
  const bundle = {
    ...expiringDisputed(),
    events: [...digestBase().events, eventFor("event.a.resolved", "claim.a", "verified", "2026-05-02T00:00:00.000Z", { resolvesDispute: true, actor: "actor:reviewer", authorityRef: "role:owner" })],
    authorityTrace: [trace],
  } as unknown as TrustBundle;
  const result = sinceMatchesFull(bundle, new Date("2026-06-01T00:00:00.000Z"), new Date("2026-07-01T00:00:00.000Z"));
  // A full fold returns the resolution's status without a staleness test.
  assert.equal(result.full["claim.a"], "verified");
  assert.deepEqual(result.since, result.full);
  assert.equal(foldedFor(result.probes, "claim.a").fromCheckpoint, true);
});

test("checkpoint: an invalidation event with status verified stays stale", () => {
  const bundle = {
    ...digestBase(),
    events: [...digestBase().events, eventFor("event.a.invalidated", "claim.a", "verified", "2026-05-02T00:00:00.000Z", { type: "invalidation" })],
  } as unknown as TrustBundle;
  const result = sinceMatchesFull(bundle, new Date("2026-06-01T00:00:00.000Z"), new Date("2026-07-01T00:00:00.000Z"));
  assert.equal(result.full["claim.a"], "stale");
  assert.deepEqual(result.since, result.full);
  assert.equal(foldedFor(result.probes, "claim.a").fromCheckpoint, true);
});

test("checkpoint: replay at random nows before and after the checkpoint equals a full derivation", () => {
  let seed = 0x7a11;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const day = (offset: number) => new Date(Date.parse("2026-06-15T00:00:00.000Z") + offset * 86_400_000);
  const volatile = (report: ReturnType<typeof buildTrustReport>) => ({
    claims: report.claims.map(({ freshness, ...claim }) => ({ ...claim, stale: freshness?.stale })),
    transparencyGaps: report.transparencyGaps.map(({ createdAt: _createdAt, ...gap }) => gap),
    changeRecords: report.changeRecords.map(({ createdAt: _createdAt, ...record }) => record),
  });
  for (let round = 0; round < 80; round += 1) {
    const base = digestBase();
    const bundle = {
      ...base,
      claims: [
        claimFor("claim.a", pick([{}, { expiresAt: day(pick([-10, 0, 10])).toISOString() }, { ttlSeconds: pick([86_400 * 30, 86_400 * 60]) }])),
        ...base.claims.slice(1),
      ],
      evidence: [...base.evidence, ...(random() < 0.5 ? [evidenceFor("evidence.a.fail", "claim.a", { passing: false, blocking: pick([true, false]) })] : [])],
      policies: [{ ...apiPolicy, requiredEvidence: pick([["test_output"], ["runtime_observation"]]), validityRule: pick([{ kind: "manual" }, { kind: "duration", durationDays: pick([30, 50]) }]) }, untouchedPolicy],
    } as unknown as TrustBundle;
    const checkpointAt = day(pick([-30, -5, 0, 5, 30]));
    const at = day(pick([-40, -10, -1, 1, 10, 40]));
    const result = sinceMatchesFull(bundle, checkpointAt, at);
    assert.deepEqual(volatile(result.sinceReport), volatile(result.fullReport), `round ${round}: checkpoint ${checkpointAt.toISOString()} now ${at.toISOString()}`);
    assert.equal(foldedFor(result.probes, "claim.a").fromCheckpoint, true, `round ${round}: unchanged claim must be served from the checkpoint`);
  }
});
