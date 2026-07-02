import test from "node:test";
import assert from "node:assert/strict";
import { mergeBundles, mergeBundlesDetailed, validateTrustBundle } from "../src/index.js";
import type { TrustBundle } from "../src/index.js";

// Hachure facet rename (0.9.0): Claim.surface -> Claim.facet (renamed, made
// optional). Owner-ratified, one-release TOLERANCE SHIM lives in
// validateTrustBundle (src/validate.ts) — the single choke point every
// consumer reads bundles through. These tests cover the shim's exact
// contract: legacy bundles keep working, the mapped value lands in `facet`,
// a deprecation warning fires (once), current-format bundles round-trip
// unchanged with no warning, and mixed legacy+current inputs merge cleanly.

function legacyBundle(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 4,
    source: "legacy-producer",
    claims: [
      {
        id: "claim-legacy",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "legacy.surface-value",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      },
    ],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

function currentBundle(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 5,
    source: "current-producer",
    claims: [
      {
        id: "claim-current",
        subjectType: "repo",
        subjectId: "repo-2",
        facet: "current.facet-value",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      },
    ],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

async function withWarnSpy<T>(fn: () => T): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const previous = console.warn;
  console.warn = (message?: unknown) => { warnings.push(String(message)); };
  try {
    const result = fn();
    return { result, warnings };
  } finally {
    console.warn = previous;
  }
}

test("validateTrustBundle: legacy claim.surface is read into claim.facet, surface is stripped, and a deprecation warning fires", async () => {
  const { result: bundle, warnings } = await withWarnSpy(() => validateTrustBundle(legacyBundle()));

  assert.equal(bundle.claims[0]?.facet, "legacy.surface-value");
  assert.ok(!("surface" in (bundle.claims[0] as unknown as Record<string, unknown>)), "surface must never be re-emitted");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /deprecated/);
  assert.match(warnings[0], /"surface"/);
  assert.match(warnings[0], /"facet"/);
});

test("validateTrustBundle: the legacy-surface deprecation warning fires once per process, not once per claim", async () => {
  const twoLegacyClaims = legacyBundle({
    claims: [
      { id: "claim-a", subjectType: "repo", subjectId: "repo-1", surface: "a.surface", claimType: "software-evidence", fieldOrBehavior: "evidence", value: true, createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" },
      { id: "claim-b", subjectType: "repo", subjectId: "repo-1", surface: "b.surface", claimType: "software-evidence", fieldOrBehavior: "evidence", value: true, createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" },
    ],
  });

  const { result: bundle, warnings } = await withWarnSpy(() => validateTrustBundle(twoLegacyClaims));

  assert.equal(bundle.claims[0]?.facet, "a.surface");
  assert.equal(bundle.claims[1]?.facet, "b.surface");
  assert.ok(warnings.length <= 1, `expected the warning to fire at most once per process, got ${warnings.length}`);
});

test("validateTrustBundle: a current-format bundle (facet, schemaVersion 5) round-trips unchanged with no warning", async () => {
  const { result: bundle, warnings } = await withWarnSpy(() => validateTrustBundle(currentBundle()));

  assert.equal(bundle.schemaVersion, 5);
  assert.equal(bundle.claims[0]?.facet, "current.facet-value");
  assert.equal(warnings.length, 0);
});

test("validateTrustBundle: a claim with neither facet nor surface validates (facet is optional)", () => {
  const bundle = validateTrustBundle(
    currentBundle({
      claims: [
        {
          id: "claim-no-facet",
          subjectType: "repo",
          subjectId: "repo-3",
          claimType: "software-evidence",
          fieldOrBehavior: "evidence",
          value: true,
          createdAt: "2026-04-25T00:00:00.000Z",
          updatedAt: "2026-04-25T00:00:00.000Z",
        },
      ],
    }),
  );
  assert.equal(bundle.claims[0]?.facet, undefined);
});

test("validateTrustBundle: schemaVersion 2-4 (legacy) bundles are not hard-rejected on read", () => {
  for (const schemaVersion of [2, 3, 4] as const) {
    const bundle = validateTrustBundle(legacyBundle({ schemaVersion }));
    assert.equal(bundle.schemaVersion, schemaVersion);
  }
});

test("mergeBundles: mixed legacy (surface) and current (facet) inputs merge correctly, shim-normalized first, output schemaVersion 5", async () => {
  const { result: mergedInputs } = await withWarnSpy(() => [
    validateTrustBundle(legacyBundle()),
    validateTrustBundle(currentBundle()),
  ]);
  const [legacy, current] = mergedInputs;

  const merged = mergeBundles([legacy, current]);

  assert.equal(merged.schemaVersion, 5);
  assert.equal(merged.claims.length, 2);
  const byId = new Map(merged.claims.map((claim) => [claim.id, claim]));
  assert.equal(byId.get("claim-legacy")?.facet, "legacy.surface-value");
  assert.equal(byId.get("claim-current")?.facet, "current.facet-value");
  for (const claim of merged.claims) {
    assert.ok(!("surface" in (claim as unknown as Record<string, unknown>)), "merged output must never carry surface");
  }

  const reValidated = validateTrustBundle(merged);
  assert.equal(reValidated.schemaVersion, 5);
});

test("mergeBundlesDetailed: un-normalized same-id twin (legacy `surface` vs current `facet`, otherwise identical) dedupes with zero collisions", () => {
  // Unlike the earlier mixed-merge test, these two RAW bundles are fed
  // straight to merge WITHOUT going through validateTrustBundle first — the
  // exact "own re-emitted twin" scenario the merge-boundary normalization
  // guards against. mergeBundlesDetailed/mergeBundles must not treat these as
  // a content collision: same id, same everything, only the field name
  // differs (surface vs facet), which is exactly what the facet rename shim
  // is supposed to make invisible to merge's canonical-serialization compare.
  const legacyRaw = legacyBundle({
    claims: [
      {
        id: "claim-shared",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "shared.facet-value",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      },
    ],
  }) as TrustBundle;
  const currentRaw = currentBundle({
    claims: [
      {
        id: "claim-shared",
        subjectType: "repo",
        subjectId: "repo-1",
        facet: "shared.facet-value",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      },
    ],
  }) as TrustBundle;

  const { bundle, collisions } = mergeBundlesDetailed([legacyRaw, currentRaw]);
  assert.equal(collisions.length, 0, `expected 0 collisions, got: ${JSON.stringify(collisions)}`);
  assert.equal(bundle.claims.length, 1);
  assert.equal(bundle.claims[0]?.facet, "shared.facet-value");
  assert.ok(!("surface" in (bundle.claims[0] as unknown as Record<string, unknown>)), "merged output must never carry surface");

  assert.doesNotThrow(() => mergeBundles([legacyRaw, currentRaw]));

  // Merge's defensive normalization must never mutate the caller's raw input.
  const rawClaim = legacyRaw.claims[0] as unknown as Record<string, unknown>;
  assert.equal(rawClaim.surface, "shared.facet-value");
  assert.equal(rawClaim.facet, undefined);
});

test("mergeBundles: same-id, genuinely different content (mixed surface/facet key representation) still collides/throws", () => {
  const legacyRaw = legacyBundle({
    claims: [
      {
        id: "claim-shared",
        subjectType: "repo",
        subjectId: "repo-1",
        surface: "shared.facet-value",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: true,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      },
    ],
  }) as TrustBundle;
  const currentRaw = currentBundle({
    claims: [
      {
        id: "claim-shared",
        subjectType: "repo",
        subjectId: "repo-1",
        facet: "shared.facet-value",
        claimType: "software-evidence",
        fieldOrBehavior: "evidence",
        value: false, // genuinely different content, not just a key-name difference
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      },
    ],
  }) as TrustBundle;

  const { collisions } = mergeBundlesDetailed([legacyRaw, currentRaw]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].collection, "claims");
  assert.equal(collisions[0].id, "claim-shared");

  assert.throws(() => mergeBundles([legacyRaw, currentRaw]), /conflicting claims share an id/);
});

test("validateTrustBundle does not mutate the caller-supplied input object", async () => {
  const input = legacyBundle() as {
    claims: Array<Record<string, unknown>>;
  };
  const originalClaim = input.claims[0];
  const originalClaimSnapshot = { ...originalClaim };

  const { result: bundle } = await withWarnSpy(() => validateTrustBundle(input));

  // The returned bundle is correctly normalized...
  assert.equal(bundle.claims[0]?.facet, "legacy.surface-value");
  assert.ok(!("surface" in (bundle.claims[0] as unknown as Record<string, unknown>)));

  // ...but the caller's original claim object is completely untouched: still
  // carries `surface`, still has no `facet`, and is not the same reference as
  // what validateTrustBundle returned.
  assert.deepEqual(originalClaim, originalClaimSnapshot);
  assert.equal(originalClaim.surface, "legacy.surface-value");
  assert.equal(originalClaim.facet, undefined);
  assert.notEqual(bundle.claims[0], originalClaim);
});
