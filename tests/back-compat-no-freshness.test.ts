/**
 * Task B — back-compat pin for bundles with NONE of the freshness fields.
 *
 * A bundle that carries no `expiresAt`, no `ttlSeconds`, and no invalidation /
 * revoked events must derive EXACTLY as it did before the time-aware work — i.e.
 * its derivation must be wholly insensitive to `now`. This pins prior behaviour
 * directly (not just indirectly via the spec-conformance vectors): the derived
 * claims, change records, transparency gaps, summary and rollups are identical
 * across two wildly different evaluation instants.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildTrustReport, validateTrustBundle, type TrustBundle } from "../src/index.js";

const CONFORMANCE_DIR = "node_modules/hachure/conformance";

async function loadNoFreshnessBundle(): Promise<TrustBundle> {
  const raw = JSON.parse(await readFile(join(CONFORMANCE_DIR, "sf-no-freshness-fields.json"), "utf8"));
  return validateTrustBundle(raw.input);
}

// Everything in the report except instant-stamped fields. `asOf` inside per-claim
// freshness is a bare echo of `now`, so we strip it; what we are pinning is that
// the *derivation* (statuses, gaps, records) does not move with the clock.
function derivationShape(report: ReturnType<typeof buildTrustReport>) {
  return {
    claims: report.claims.map(({ freshness, ...claim }) => ({
      ...claim,
      // keep the `stale` flag (a real derivation output); drop the `asOf` echo.
      freshness: freshness ? { expiresAt: freshness.expiresAt, stale: freshness.stale } : undefined,
    })),
    changeRecords: report.changeRecords,
    transparencyGaps: report.transparencyGaps,
    summary: report.summary,
    claimGroupRollups: report.claimGroupRollups,
    evidenceRequirementsByClaimId: report.evidenceRequirementsByClaimId,
    statusFunctionVersion: report.statusFunctionVersion,
  };
}

test("a bundle with no freshness fields has no intrinsic expiry on any claim", async () => {
  const bundle = await loadNoFreshnessBundle();
  const report = buildTrustReport(bundle, { now: new Date("2026-06-10T00:00:00.000Z") });
  for (const claim of report.claims) {
    assert.equal(claim.freshness?.expiresAt, undefined, `${claim.id} must carry no intrinsic expiry`);
    assert.equal(claim.freshness?.stale, false, `${claim.id} must not be time-stale`);
  }
});

test("derivation is identical across far-apart `now` values (no clock sensitivity)", async () => {
  const bundle = await loadNoFreshnessBundle();

  // Two instants years apart. With no freshness fields, neither time-based
  // staleness nor the time window can move the result.
  const near = buildTrustReport(bundle, { now: new Date("2026-06-10T00:00:00.000Z") });
  const farFuture = buildTrustReport(bundle, { now: new Date("2099-01-01T00:00:00.000Z") });

  assert.deepEqual(derivationShape(farFuture), derivationShape(near));

  // And the pinned legacy status holds at both instants.
  assert.equal(near.claims.find((c) => c.id === "claim.api.rate-limit")?.status, "verified");
  assert.equal(farFuture.claims.find((c) => c.id === "claim.api.rate-limit")?.status, "verified");
});
