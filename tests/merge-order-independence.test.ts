/**
 * Order-independence regression suite for the multi-producer merge
 * (hachure `merge.md` §6).  These tests are Surface-local grounding for the
 * determinism MUST and are independent of the hachure conformance package
 * landing — they exercise the same guarantee `conformance/merge/*.json`
 * (vector 4) will, via the public `mergeBundlesDetailed` / `buildTrustReport`
 * entry points.
 *
 * Why a permutation SWEEP and not a single hand-picked ordering: the pre-WS4
 * `unionById` compared each colliding record only against the *first-seen*
 * record for an id.  For 3+ bundles sharing one id with 2+ distinct contents,
 * that made BOTH the kept content and the reported collision set a function of
 * input array order.  A sweep over every permutation is what actually proves the
 * fix; a single ordering would pass on the old, buggy code too.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrustReport,
  mergeBundles,
  mergeBundlesDetailed,
  validateTrustBundle,
} from "../src/index.js";
import type { Claim, MergeResult, TrustBundle } from "../src/index.js";

// --- helpers ---------------------------------------------------------------

/** All orderings of `items` (N=3 → 6, N=4 → 24 for the sizes used here). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const perm of permutations(rest)) out.push([item, ...perm]);
  });
  return out;
}

/**
 * Canonical, list-order-independent view of a MergeResult.  Per merge.md §6 the
 * determinism MUST is on the retained content and the {collection,id} collision
 * SET "modulo list ordering", so we sort every collection by id and reduce
 * collisions to their order-independent {collection,id} identity before
 * comparing.  Two permutations that produce this same string are byte-identical
 * merges in the sense the spec requires.
 */
function canonicalMerge(result: MergeResult): string {
  const b = result.bundle;
  const byId = <T extends { id?: string }>(xs: T[] | undefined): T[] =>
    (xs ?? []).slice().sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const normalized = {
    schemaVersion: b.schemaVersion,
    source: b.source,
    producerIdPresent: "producerId" in b,
    claims: byId(b.claims),
    evidence: byId(b.evidence),
    policies: byId(b.policies),
    events: byId(b.events),
    claimGroups: byId(b.claimGroups),
    authorityTrace: byId(b.authorityTrace),
    collisionSet: result.collisions
      .map((c) => `${c.collection}:${c.id}`)
      .sort()
      .filter((v, i, a) => a.indexOf(v) === i),
    collisionCount: result.collisions.length,
  };
  return sortedStringify(normalized);
}

function sortedStringify(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v !== null && typeof v === "object") {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortKeys(value));
}

const ts = "2026-06-01T00:00:00Z";
function claim(overrides: Partial<Claim> & Pick<Claim, "id">): Claim {
  return {
    subjectType: "repo",
    subjectId: "r1",
    facet: "readiness",
    claimType: "coverage",
    fieldOrBehavior: "coverage",
    value: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}
function bundle(overrides: Partial<TrustBundle>): TrustBundle {
  return {
    schemaVersion: 4,
    source: "producer",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

// --- 1. permutation sweep: N=3, one id shared by all three, 3 distinct values -

test("N=3 permutation sweep: kept content + collision set are byte-identical across all 6 orderings", () => {
  // "multi.collide" appears in all three with DISTINCT values; each bundle also
  // has a unique, non-colliding claim.  Under the pre-WS4 first-seen algorithm
  // the kept value would be whichever bundle came first (order-dependent).
  const p = bundle({
    source: "p",
    claims: [claim({ id: "multi.collide", value: "aaa" }), claim({ id: "only.p", value: 1 })],
  });
  const q = bundle({
    source: "q",
    claims: [claim({ id: "multi.collide", value: "mmm" }), claim({ id: "only.q", value: 2 })],
  });
  const r = bundle({
    source: "r",
    claims: [claim({ id: "multi.collide", value: "zzz" }), claim({ id: "only.r", value: 3 })],
  });

  const perms = permutations([p, q, r]);
  assert.equal(perms.length, 6, "N=3 must sweep all 6 orderings");

  const canonical = perms.map((order) => canonicalMerge(mergeBundlesDetailed(order)));
  for (let i = 1; i < canonical.length; i += 1) {
    assert.equal(
      canonical[i],
      canonical[0],
      `permutation ${i} produced a different merge than permutation 0 — order dependence`,
    );
  }

  // Content-only tie-break: "aaa" sorts lexicographically first, so it is the
  // kept value in EVERY ordering — the exact property the old algorithm broke.
  for (const order of perms) {
    const { bundle: merged, collisions } = mergeBundlesDetailed(order);
    const kept = merged.claims.find((c) => c.id === "multi.collide");
    assert.equal(kept?.value, "aaa", "lexicographically-first content must always win");
    // 3 distinct contents → 2 losing contents → 2 collision entries, all naming
    // the same {collection,id}.
    const collideCollisions = collisions.filter((c) => c.id === "multi.collide");
    assert.equal(collideCollisions.length, 2);
    assert.ok(collideCollisions.every((c) => c.collection === "claims"));
    // every merged id survives (union by id, never collapsed by content)
    assert.deepEqual(
      merged.claims.map((c) => c.id).sort(),
      ["multi.collide", "only.p", "only.q", "only.r"],
    );
  }
});

// --- 2. permutation sweep: N=4, four distinct values for one shared id --------

test("N=4 permutation sweep: kept content + collision set are byte-identical across all 24 orderings", () => {
  const mk = (src: string, val: string, uid: string) =>
    bundle({
      source: src,
      claims: [claim({ id: "multi.collide", value: val }), claim({ id: uid, value: 0 })],
    });
  const bundles = [
    mk("p", "aaa", "only.p"),
    mk("q", "mmm", "only.q"),
    mk("r", "zzz", "only.r"),
    mk("s", "ppp", "only.s"),
  ];

  const perms = permutations(bundles);
  assert.equal(perms.length, 24, "N=4 must sweep all 24 orderings");

  const canonical = perms.map((order) => canonicalMerge(mergeBundlesDetailed(order)));
  for (let i = 1; i < canonical.length; i += 1) {
    assert.equal(canonical[i], canonical[0], `permutation ${i} diverged from permutation 0`);
  }

  for (const order of perms) {
    const { bundle: merged, collisions } = mergeBundlesDetailed(order);
    assert.equal(merged.claims.find((c) => c.id === "multi.collide")?.value, "aaa");
    assert.equal(collisions.filter((c) => c.id === "multi.collide").length, 3); // 4 distinct → 3 losers
  }
});

// --- 3. design §11 worked example (vector 4) + independent hand-derivation ----

test("design merge.md §11 vector 4: A's record wins the accidental id collision, order-independently", () => {
  // Verbatim from merge.md §11 worked example.
  const a: TrustBundle = {
    schemaVersion: 4,
    source: "survey",
    producerId: "survey",
    claims: [
      {
        id: "shared.claim.x",
        subjectType: "repo",
        subjectId: "r1",
        facet: "readiness",
        claimType: "coverage",
        fieldOrBehavior: "coverage",
        value: 91,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    evidence: [],
    policies: [],
    events: [],
  };
  const b: TrustBundle = {
    schemaVersion: 4,
    source: "veritas",
    producerId: "veritas",
    claims: [
      {
        id: "shared.claim.x", // same id, genuinely unrelated claim — accidental collision
        subjectType: "repo",
        subjectId: "r2",
        facet: "governance",
        claimType: "policy-check",
        fieldOrBehavior: "signed-off",
        value: true,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    evidence: [],
    policies: [],
    events: [],
  };
  const c: TrustBundle = {
    schemaVersion: 4,
    source: "flow",
    producerId: "flow",
    claims: [
      {
        id: "unrelated.claim.y",
        subjectType: "gate",
        subjectId: "g1",
        facet: "gates",
        claimType: "gate-status",
        fieldOrBehavior: "passed",
        value: true,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    evidence: [],
    policies: [],
    events: [],
  };

  // Hand-derivation (merge.md §11): under sorted-key serialization A starts
  // {"claimType":"coverage",...} and B starts {"claimType":"policy-check",...};
  // "c" < "p", so A's record (subjectId "r1") is kept in EVERY permutation.
  for (const order of permutations([a, b, c])) {
    const { bundle: merged, collisions } = mergeBundlesDetailed(order);

    assert.deepEqual(
      merged.claims.map((cl) => cl.id).sort(),
      ["shared.claim.x", "unrelated.claim.y"],
      "mergedClaimIds (both ids present; never collapsed)",
    );
    const shared = merged.claims.find((cl) => cl.id === "shared.claim.x");
    assert.equal(shared?.subjectId, "r1", "A (coverage) must win the tie-break, not B (policy-check)");
    assert.equal(shared?.value, 91);

    const collisionSet = collisions
      .map((cl) => ({ collection: cl.collection, id: cl.id }))
      .sort((x, y) => `${x.collection}:${x.id}`.localeCompare(`${y.collection}:${y.id}`));
    assert.deepEqual(collisionSet, [{ collection: "claims", id: "shared.claim.x" }]);

    // statusByClaimId: no policy/evidence/events → both "unknown" (merge.md §11).
    const report = buildTrustReport(validateTrustBundle(merged), { now: new Date("2026-06-02T00:00:00Z") });
    assert.equal(report.claims.find((cl) => cl.id === "shared.claim.x")?.status, "unknown");
    assert.equal(report.claims.find((cl) => cl.id === "unrelated.claim.y")?.status, "unknown");
  }
});

// --- 4. producerId round-trip + omission-on-merge -----------------------------

test("validateTrustBundle round-trips producerId; empty producerId is rejected", () => {
  const withId = validateTrustBundle(bundle({ source: "veritas:run-1", producerId: "veritas" }) as unknown);
  assert.equal(withId.producerId, "veritas");

  const withoutId = validateTrustBundle(bundle({ source: "x" }) as unknown);
  assert.equal("producerId" in withoutId, false, "absent producerId stays absent (additive)");

  assert.throws(
    () => validateTrustBundle({ ...bundle({ source: "x" }), producerId: "" }),
    /producerId/,
    "empty producerId must be rejected by the same non-empty-string rule",
  );
});

test("merged bundle NEVER carries producerId, even when every input sets one (merge.md §5 rule 3)", () => {
  const a = bundle({ source: "survey:run-1", producerId: "survey", claims: [claim({ id: "a.1" })] });
  const b = bundle({ source: "veritas:run-2", producerId: "veritas", claims: [claim({ id: "b.1" })] });
  const c = bundle({ source: "flow:run-3", producerId: "flow", claims: [claim({ id: "c.1" })] });

  for (const order of permutations([a, b, c])) {
    const { bundle: merged } = mergeBundlesDetailed(order);
    assert.equal("producerId" in merged, false, "merged output must omit producerId");
    assert.equal(merged.producerId, undefined);
    // source, by contrast, IS synthesized across producers.
    assert.match(merged.source, /^merged:/);
  }
});

// --- 5. within-bundle duplicate id: same-bundle self-collision ---------------

test("within-bundle duplicate id: two same-id, differing-content records inside ONE bundle self-collide (keptFromBundle === droppedFromBundle)", () => {
  // validateReferences does not itself enforce per-bundle id uniqueness, so a
  // single malformed producer bundle CAN carry two same-id, differing-content
  // claims. resolveGroup treats this exactly like a cross-bundle collision: it
  // partitions by distinct content, keeps the lexicographically-first one, and
  // reports a collision — except both provenance pointers name the SAME input
  // bundle, since there was only one. See the MergeCollision.droppedFromBundle
  // doc note in src/merge.ts.
  const dup = bundle({
    source: "p",
    claims: [claim({ id: "dup", value: "bbb" }), claim({ id: "dup", value: "aaa" })],
  });

  const { bundle: merged, collisions } = mergeBundlesDetailed([dup]);
  assert.equal(merged.claims.length, 1, "only one record kept for the duplicated id");
  assert.equal(merged.claims[0].value, "aaa", "lexicographically-first content wins, even within one bundle");
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].collection, "claims");
  assert.equal(collisions[0].id, "dup");
  assert.equal(
    collisions[0].keptFromBundle,
    collisions[0].droppedFromBundle,
    "self-collision: kept and dropped both point at the single contributing bundle",
  );
  assert.equal(collisions[0].keptFromBundle, 0);

  // mergeBundles still refuses to silently pick a winner for a claim-id
  // collision, whether the collision is cross-bundle or within one bundle.
  assert.throws(() => mergeBundles([dup]), /conflicting claims share an id/);
});

// --- 6. content-identity properties (merge.md §6): key order vs array order --

test("content identity: object-key reordering (recursively) does not create a collision — identical content dedupes to one kept record", () => {
  // Two claims with byte-identical semantic content, but every key — including
  // the nested `metadata` object's keys — is inserted in the OPPOSITE order.
  // canonicalSortedStringify sorts object keys recursively before comparing, so
  // these must be treated as the SAME content: 0 collisions, 1 kept record.
  const forward: Claim = {
    id: "key-order",
    subjectType: "repo",
    subjectId: "r1",
    facet: "readiness",
    claimType: "coverage",
    fieldOrBehavior: "coverage",
    value: 1,
    createdAt: ts,
    updatedAt: ts,
    metadata: { a: 1, b: 2 },
  };
  const reversed: Claim = {
    metadata: { b: 2, a: 1 },
    updatedAt: ts,
    createdAt: ts,
    value: 1,
    fieldOrBehavior: "coverage",
    claimType: "coverage",
    facet: "readiness",
    subjectId: "r1",
    subjectType: "repo",
    id: "key-order",
  };

  const a = bundle({ source: "p", claims: [forward] });
  const b = bundle({ source: "q", claims: [reversed] });

  const { bundle: merged, collisions } = mergeBundlesDetailed([a, b]);
  assert.equal(merged.claims.length, 1);
  assert.equal(collisions.filter((c) => c.id === "key-order").length, 0, "key-order-only difference is NOT a collision");
});

test("content identity: array element reordering IS a distinct content — one collision, not deduped", () => {
  // merge.md §6 deliberately does NOT sort array elements when canonicalizing
  // for the collision tie-break — "order-independence" there is a property of
  // the function over a FIXED record, not a normalization of array contents.
  // So two claims equal in every field except a reordered array field must be
  // treated as DISTINCT content: exactly one collision is reported.
  const a = bundle({
    source: "p",
    claims: [claim({ id: "array-order", derivedFrom: ["x", "y"] })],
  });
  const b = bundle({
    source: "q",
    claims: [claim({ id: "array-order", derivedFrom: ["y", "x"] })],
  });

  const { bundle: merged, collisions } = mergeBundlesDetailed([a, b]);
  assert.equal(merged.claims.length, 1, "still one kept record — union by id, distinct content tie-broken");
  const arrayOrderCollisions = collisions.filter((c) => c.id === "array-order");
  assert.equal(arrayOrderCollisions.length, 1, "array-position difference must be reported as a collision");
  assert.equal(arrayOrderCollisions[0].collection, "claims");
});
