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
