import type {
  AuthorityTrace,
  Claim,
  ClaimGroup,
  Evidence,
  IdentityLink,
  TrustBundle,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";

/**
 * A collision between records that share an `id` but differ in content.  When
 * two or more distinct contents are found under one id, the merge keeps a single
 * record chosen deterministically (see {@link mergeBundlesDetailed} / hachure
 * `merge.md` §6 tie-break) and surfaces every *losing* distinct content here so
 * producers can reconcile — losing content is never silently discarded.
 *
 * Determinism guarantee (`merge.md` §6): for a fixed *set* of input bundles the
 * kept content and the set of `{collection, id}` collisions are independent of
 * the order the bundles are supplied in.  The `keptFromBundle` /
 * `droppedFromBundle` indices are provenance pointers into the *given* input
 * array, so their numeric values are order-relative by nature (which physical
 * bundle contributed a content depends on where it sat in the input); the
 * order-independent invariant is the `{collection, id}` collision set, not the
 * index integers.
 */
export interface MergeCollision {
  /** Which collection the colliding records belong to. */
  collection: "claims" | "evidence" | "policies" | "events" | "claimGroups" | "authorityTrace";
  /** The shared id whose records disagreed. */
  id: string;
  /** Zero-based index of the bundle that contributed the kept record. */
  keptFromBundle: number;
  /**
   * Zero-based index of the bundle that contributed a dropped (losing) record.
   *
   * Note: for a WITHIN-BUNDLE collision — two same-id, differing-content records
   * that both originate from a single input bundle (a malformed producer bundle;
   * `validateReferences` does not itself enforce per-bundle id uniqueness) —
   * `keptFromBundle` and `droppedFromBundle` are the SAME index. Do not assume
   * the two indices always name distinct bundles.
   */
  droppedFromBundle: number;
}

export interface MergeResult {
  bundle: TrustBundle;
  collisions: MergeCollision[];
}

/**
 * Folds bundles from multiple producers into one ledger (ADR 0002 §"Merge
 * semantics").  The merge is a UNION of every collection fed to the existing
 * status fold — it is never last-write-wins.  Conflicting *values* for the same
 * subject and field are NOT resolved here; they are surfaced downstream by
 * {@link buildTrustReport} as `contradiction` transparency gaps / `disputed`
 * status.  This function only handles structural union + id de-duplication, and
 * preserves all provenance (claim.surface / source are never mutated).
 *
 * Records are de-duped by id.  Identical content under a shared id is kept once
 * (a re-export round-trip is not a collision).  When two or more *distinct*
 * contents share one id, a single record is kept deterministically via a
 * canonical-serialization tie-break (hachure `merge.md` §6) — the kept content
 * is a pure function of the *set* of inputs, not of array order — and every
 * losing content is reported as a collision via {@link mergeBundlesDetailed};
 * {@link mergeBundles} throws on any claim-id collision with differing content
 * (silent claim corruption is the one thing we never allow).
 */
export function mergeBundles(bundles: TrustBundle[]): TrustBundle {
  const { bundle, collisions } = mergeBundlesDetailed(bundles);
  const claimCollisions = collisions.filter((c) => c.collection === "claims");
  if (claimCollisions.length > 0) {
    const detail = claimCollisions
      .map((c) => `claim ${c.id} (bundles ${c.keptFromBundle} and ${c.droppedFromBundle})`)
      .join(", ");
    throw new Error(
      `mergeBundles: conflicting claims share an id but differ in content: ${detail}. ` +
        `Give each producer's claims distinct ids, or use mergeBundlesDetailed to inspect collisions.`,
    );
  }
  return bundle;
}

/** Like {@link mergeBundles} but never throws on collisions — returns them for inspection. */
export function mergeBundlesDetailed(bundles: TrustBundle[]): MergeResult {
  if (bundles.length === 0) {
    throw new Error("mergeBundles: at least one bundle is required");
  }

  const schemaVersion = bundles[0].schemaVersion;
  for (let i = 1; i < bundles.length; i += 1) {
    if (bundles[i].schemaVersion !== schemaVersion) {
      throw new Error(
        `mergeBundles: schemaVersion mismatch — bundle 0 is ${schemaVersion}, ` +
          `bundle ${i} is ${bundles[i].schemaVersion}. All bundles must share a schemaVersion.`,
      );
    }
  }

  const collisions: MergeCollision[] = [];

  const claims = unionById<Claim>(bundles, (b) => b.claims, "claims", collisions);
  const evidence = unionById<Evidence>(bundles, (b) => b.evidence, "evidence", collisions);
  const policies = unionById<VerificationPolicy>(bundles, (b) => b.policies, "policies", collisions);
  const events = unionById<VerificationEvent>(bundles, (b) => b.events, "events", collisions);

  // identityLinks may omit ids; concatenating preserves every assertion and the
  // identity index union-finds duplicates harmlessly.
  const identityLinks = concatOptional<IdentityLink>(bundles, (b) => b.identityLinks);

  // claimGroups / authorityTrace carry ids; dedupe like the keyed collections.
  const claimGroups = unionOptionalById<ClaimGroup>(
    bundles,
    (b) => b.claimGroups,
    "claimGroups",
    collisions,
  );
  const authorityTrace = unionOptionalById<AuthorityTrace>(
    bundles,
    (b) => b.authorityTrace,
    "authorityTrace",
    collisions,
  );

  // Sort the distinct sources so the synthesized `source` is, like the rest of
  // the merged bundle, a pure function of the *set* of inputs (merge.md §6) —
  // not of the order the bundles were supplied in.
  const distinctSources = dedupeStrings(bundles.map((b) => b.source)).sort();
  const source = distinctSources.length === 1 ? distinctSources[0] : `merged:${distinctSources.join("+")}`;

  // hachure merge.md §5 rule 3: a merged bundle represents more than one
  // producer, so `producerId` is intentionally NOT copied onto this literal —
  // the omission is the contract, not an accidental gap. (`source`, by contrast,
  // IS synthesized above as `merged:<a>+<b>`.)
  const bundle: TrustBundle = {
    schemaVersion,
    source,
    claims,
    evidence,
    policies,
    events,
  };
  if (identityLinks.length > 0) bundle.identityLinks = identityLinks;
  if (claimGroups.length > 0) bundle.claimGroups = claimGroups;
  if (authorityTrace.length > 0) bundle.authorityTrace = authorityTrace;

  return { bundle, collisions };
}

type Keyed<T> = { record: T; bundleIndex: number };

function unionById<T extends { id: string }>(
  bundles: TrustBundle[],
  pick: (bundle: TrustBundle) => T[],
  collection: MergeCollision["collection"],
  collisions: MergeCollision[],
): T[] {
  // Group EVERY record sharing an id across ALL bundles (hachure merge.md §6:
  // compare each colliding record against every other, not just the first-seen
  // one).  `order` preserves first-occurrence order of ids for a stable — but,
  // per §6, non-normative — output list order.
  const order: string[] = [];
  const groups = new Map<string, Keyed<T>[]>();
  bundles.forEach((bundle, bundleIndex) => {
    for (const record of pick(bundle)) {
      let group = groups.get(record.id);
      if (!group) {
        group = [];
        groups.set(record.id, group);
        order.push(record.id);
      }
      group.push({ record, bundleIndex });
    }
  });

  const out: T[] = [];
  for (const id of order) {
    out.push(resolveGroup(groups.get(id) as Keyed<T>[], collection, id, collisions).record);
  }
  return out;
}

function unionOptionalById<T extends { id?: string }>(
  bundles: TrustBundle[],
  pick: (bundle: TrustBundle) => T[] | undefined,
  collection: MergeCollision["collection"],
  collisions: MergeCollision[],
): T[] {
  // Records without an id are always kept (never deduped), emitted at their
  // occurrence position; id-bearing records are grouped and resolved exactly as
  // in unionById so the same order-independent tie-break applies.
  type Slot = { kind: "keep"; record: T } | { kind: "group"; id: string };
  const slots: Slot[] = [];
  const groups = new Map<string, Keyed<T>[]>();
  bundles.forEach((bundle, bundleIndex) => {
    for (const record of pick(bundle) ?? []) {
      if (record.id === undefined) {
        slots.push({ kind: "keep", record });
        continue;
      }
      let group = groups.get(record.id);
      if (!group) {
        group = [];
        groups.set(record.id, group);
        slots.push({ kind: "group", id: record.id });
      }
      group.push({ record, bundleIndex });
    }
  });

  const out: T[] = [];
  for (const slot of slots) {
    if (slot.kind === "keep") {
      out.push(slot.record);
      continue;
    }
    out.push(resolveGroup(groups.get(slot.id) as Keyed<T>[], collection, slot.id, collisions).record);
  }
  return out;
}

/**
 * Resolves all records sharing one id into a single kept record plus any
 * collisions, order-independently (hachure merge.md §6).
 *
 * 1. Partition the group into DISTINCT contents (deep structural equality via
 *    canonical serialization); identical content is not a collision and each
 *    distinct content remembers the earliest bundle index that contributed it.
 * 2. If there is exactly one distinct content, keep it (no collision).
 * 3. Otherwise sort the distinct contents by their canonical serialization and
 *    keep the lexicographically-first one — the choice depends on CONTENT ALONE,
 *    never on array position, so `merge([A,B,C])` and every permutation agree.
 *    Report one collision per losing distinct content (`keptFromBundle` points at
 *    the kept content's origin, `droppedFromBundle` at each losing content's).
 */
function resolveGroup<T>(
  group: Keyed<T>[],
  collection: MergeCollision["collection"],
  id: string,
  collisions: MergeCollision[],
): Keyed<T> {
  const distinct: { serialized: string; record: T; bundleIndex: number }[] = [];
  for (const { record, bundleIndex } of group) {
    const serialized = canonicalSortedStringify(record);
    if (!distinct.some((d) => d.serialized === serialized)) {
      distinct.push({ serialized, record, bundleIndex });
    }
    // Identical content: not a new distinct group; the earliest contributing
    // bundleIndex is already recorded, so nothing to do.
  }

  distinct.sort((a, b) => (a.serialized < b.serialized ? -1 : a.serialized > b.serialized ? 1 : 0));
  const kept = distinct[0];

  if (distinct.length > 1) {
    for (let i = 1; i < distinct.length; i += 1) {
      collisions.push({
        collection,
        id,
        keptFromBundle: kept.bundleIndex,
        droppedFromBundle: distinct[i].bundleIndex,
      });
    }
  }

  return { record: kept.record, bundleIndex: kept.bundleIndex };
}

/**
 * Canonical, order-independent serialization used for both distinct-content
 * grouping and the merge.md §6 tie-break.  Object keys are sorted recursively
 * before stringifying (arrays keep their position — order-independence here is a
 * property of *this* function over a fixed record, which is all the tie-break
 * needs).
 *
 * INTERIM FALLBACK (merge.md §6): this is sorted-key `JSON.stringify`, not a
 * full RFC 8785 / JCS canonicalization.  §6 asks for convergence-under-
 * permutation of this specific function, which this provides; adopting RFC 8785
 * bundle-wide is tracked as a WS1 follow-up, out of this delivery's scope.
 */
function canonicalSortedStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

function concatOptional<T>(
  bundles: TrustBundle[],
  pick: (bundle: TrustBundle) => T[] | undefined,
): T[] {
  const out: T[] = [];
  for (const bundle of bundles) {
    for (const record of pick(bundle) ?? []) out.push(record);
  }
  return out;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
