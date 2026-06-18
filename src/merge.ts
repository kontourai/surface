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
 * A record kept from a first occurrence that conflicts with a later record
 * sharing the same id but differing in content.  The merge keeps the first
 * occurrence (stable, deterministic) and never silently overwrites; every
 * dropped conflicting record is surfaced here so producers can reconcile.
 */
export interface MergeCollision {
  /** Which collection the colliding records belong to. */
  collection: "claims" | "evidence" | "policies" | "events" | "claimGroups" | "authorityTrace";
  /** The shared id whose records disagreed. */
  id: string;
  /** Zero-based index of the bundle that contributed the kept record. */
  keptFromBundle: number;
  /** Zero-based index of the bundle that contributed the dropped record. */
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
 * Records are de-duped by id, first occurrence wins.  When two *different*
 * records share the same id, the first is kept and the collision is reported
 * via {@link mergeBundlesDetailed}; {@link mergeBundles} throws on any
 * claim-id collision with differing content (silent claim corruption is the one
 * thing we never allow).
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

  const distinctSources = dedupeStrings(bundles.map((b) => b.source));
  const source = distinctSources.length === 1 ? distinctSources[0] : `merged:${distinctSources.join("+")}`;

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

function unionById<T extends { id: string }>(
  bundles: TrustBundle[],
  pick: (bundle: TrustBundle) => T[],
  collection: MergeCollision["collection"],
  collisions: MergeCollision[],
): T[] {
  const out: T[] = [];
  const seen = new Map<string, { record: T; bundleIndex: number }>();
  bundles.forEach((bundle, bundleIndex) => {
    for (const record of pick(bundle)) {
      const prior = seen.get(record.id);
      if (!prior) {
        seen.set(record.id, { record, bundleIndex });
        out.push(record);
        continue;
      }
      if (!sameContent(prior.record, record)) {
        collisions.push({
          collection,
          id: record.id,
          keptFromBundle: prior.bundleIndex,
          droppedFromBundle: bundleIndex,
        });
      }
      // Identical content (or differing content with first-wins): keep the first.
    }
  });
  return out;
}

function unionOptionalById<T extends { id?: string }>(
  bundles: TrustBundle[],
  pick: (bundle: TrustBundle) => T[] | undefined,
  collection: MergeCollision["collection"],
  collisions: MergeCollision[],
): T[] {
  const out: T[] = [];
  const seen = new Map<string, { record: T; bundleIndex: number }>();
  bundles.forEach((bundle, bundleIndex) => {
    for (const record of pick(bundle) ?? []) {
      if (record.id === undefined) {
        out.push(record);
        continue;
      }
      const prior = seen.get(record.id);
      if (!prior) {
        seen.set(record.id, { record, bundleIndex });
        out.push(record);
        continue;
      }
      if (!sameContent(prior.record, record)) {
        collisions.push({
          collection,
          id: record.id,
          keptFromBundle: prior.bundleIndex,
          droppedFromBundle: bundleIndex,
        });
      }
    }
  });
  return out;
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

/** Structural equality via stable JSON; sufficient for plain-data ledger records. */
function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
