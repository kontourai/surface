import { readFile } from "node:fs/promises";
import { mergeBundlesDetailed, type MergeCollision } from "../merge.js";
import { buildTrustReport } from "../report.js";
import { validateTrustBundle } from "../validate.js";
import type { DerivedReportClaim, Evidence, TransparencyGap, TrustBundle, TrustReport } from "../types.js";

/**
 * A merge collision enriched for the console view. The wire {@link MergeCollision}
 * only carries bundle indices (`keptFromBundle` / `droppedFromBundle`); attribution
 * is a projection-layer concern (merged bundles never carry `producerId`, per
 * `merge.md` §5 rule 3), so we resolve each index back to the producer identity of
 * the input bundle that contributed it. Colliding producers are therefore NAMED in
 * the view rather than shown as opaque integers — and losing content is surfaced,
 * never silently dropped.
 */
export interface ConsoleMergeCollision {
  collection: MergeCollision["collection"];
  id: string;
  keptProducer: string;
  droppedProducer: string;
  /** True when both records came from a single malformed input bundle (`merge.md` within-bundle case). */
  withinBundle: boolean;
}

/**
 * A console read model produced from one or more producer bundles. Extends the
 * plain producer/summary/claims read model the console projection already consumes
 * with two multi-producer fields the projection surfaces:
 *  - `producerAttribution`: claim id -> the producer identities that asserted it,
 *    built from the INPUT bundles before merge (the merged bundle drops producerId).
 *  - `mergeCollisions`: producer-named collisions surfaced in a dedicated section.
 */
export interface ConsoleReadModel {
  producer: {
    runId: string;
    timestamp: string;
    sourceKind?: string;
    sourceScope?: string[];
    producers?: string[];
  };
  summary: {
    claimCount: number;
    statusCounts: Record<string, number>;
    transparencyGapCount: number;
    facetCounts: Record<string, number>;
    attentionClaimIds: string[];
    producerCount?: number;
    collisionCount?: number;
  };
  claims: Array<DerivedReportClaim & { evidenceIds: string[]; transparencyGapIds: string[]; producers?: string[] }>;
  evidence: Evidence[];
  transparencyGaps: TransparencyGap[];
  producers: string[];
  producerAttribution: Record<string, string[]>;
  mergeCollisions: ConsoleMergeCollision[];
}

export interface BuildConsoleReadModelOptions {
  runId?: string;
  now?: Date;
}

/**
 * Stable identity for a producer bundle used for attribution: the optional
 * `producerId` (`merge.md` §2, kept stable across a producer's runs) when set,
 * otherwise the run-scoped free-text `source`. Never reads a merged bundle's
 * absent producerId.
 */
function producerIdentity(bundle: TrustBundle): string {
  const producerId = typeof bundle.producerId === "string" && bundle.producerId.length > 0 ? bundle.producerId : undefined;
  return producerId ?? bundle.source;
}

const ATTENTION_STATUSES = new Set(["stale", "disputed", "rejected", "unknown", "assumed"]);

/**
 * Build the per-claim producer attribution map from the INPUT bundles (before
 * merge). Every producer whose bundle contains a claim id contributes to that
 * claim's attribution set, so an identical shared claim that dedups in the merge
 * still shows all of its contributing producers. Each list is sorted so the
 * projected view is order-independent.
 */
function buildProducerAttribution(bundles: TrustBundle[]): Record<string, string[]> {
  const attribution: Record<string, string[]> = {};
  for (const bundle of bundles) {
    const identity = producerIdentity(bundle);
    for (const claim of bundle.claims) {
      const list = attribution[claim.id] ?? (attribution[claim.id] = []);
      if (!list.includes(identity)) list.push(identity);
    }
  }
  // Sort each attribution list so the projected view is order-independent — the
  // set of producers behind a claim does not depend on input bundle order (the
  // same order-independence invariant WS4 established for the merged ledger).
  for (const id of Object.keys(attribution)) attribution[id].sort();
  return attribution;
}

function enrichCollisions(collisions: MergeCollision[], bundles: TrustBundle[]): ConsoleMergeCollision[] {
  const identityFor = (index: number): string => {
    const bundle = bundles[index];
    return bundle ? producerIdentity(bundle) : `bundle-${index}`;
  };
  return collisions.map((collision) => ({
    collection: collision.collection,
    id: collision.id,
    keptProducer: identityFor(collision.keptFromBundle),
    droppedProducer: identityFor(collision.droppedFromBundle),
    withinBundle: collision.keptFromBundle === collision.droppedFromBundle,
  }));
}

/**
 * Project a single (already merged, or single-producer) {@link TrustBundle} plus
 * its attribution/collision metadata into the console read model. Splits out from
 * {@link buildMergedConsoleReadModel} so the mapping from a derived
 * {@link TrustReport} to the console read-model shape is unit-testable in isolation.
 */
export function projectBundleToConsoleReadModel(
  bundle: TrustBundle,
  producerAttribution: Record<string, string[]>,
  mergeCollisions: ConsoleMergeCollision[],
  options: BuildConsoleReadModelOptions = {},
): ConsoleReadModel {
  const report: TrustReport = buildTrustReport(bundle, { id: options.runId, now: options.now });

  const evidenceByClaim = new Map<string, string[]>();
  for (const item of report.evidence) {
    const list = evidenceByClaim.get(item.claimId) ?? [];
    list.push(item.id);
    evidenceByClaim.set(item.claimId, list);
  }
  const gapsByClaim = new Map<string, string[]>();
  for (const gap of report.transparencyGaps) {
    const list = gapsByClaim.get(gap.claimId) ?? [];
    list.push(gap.id);
    gapsByClaim.set(gap.claimId, list);
  }

  const attentionClaimIds: string[] = [];
  const claims = report.claims.map((claim) => {
    if (ATTENTION_STATUSES.has(claim.status)) attentionClaimIds.push(claim.id);
    const producers = producerAttribution[claim.id];
    return {
      ...claim,
      evidenceIds: evidenceByClaim.get(claim.id) ?? [],
      transparencyGapIds: gapsByClaim.get(claim.id) ?? [],
      ...(producers ? { producers } : {}),
    };
  });

  const producers = distinctProducersInOrder(producerAttribution);

  return {
    producer: {
      runId: report.id,
      timestamp: report.generatedAt,
      producers,
    },
    summary: {
      claimCount: report.summary.totalClaims,
      statusCounts: report.summary.byStatus,
      transparencyGapCount: report.transparencyGaps.length,
      facetCounts: report.summary.byFacet,
      attentionClaimIds,
      producerCount: producers.length,
      collisionCount: mergeCollisions.length,
    },
    claims,
    evidence: report.evidence,
    transparencyGaps: report.transparencyGaps,
    producers,
    producerAttribution,
    mergeCollisions,
  };
}

function distinctProducersInOrder(attribution: Record<string, string[]>): string[] {
  const seen: string[] = [];
  for (const producers of Object.values(attribution)) {
    for (const producer of producers) {
      if (!seen.includes(producer)) seen.push(producer);
    }
  }
  return seen.sort();
}

/**
 * Merge N producer bundles (order-independently, WS4 `mergeBundlesDetailed`) and
 * project the merged ledger into a console read model carrying per-claim producer
 * attribution and producer-named merge collisions. Mirrors the report layer's
 * validate-each-then-merge-then-project pattern (`src/commands/shared.ts`).
 */
export function buildMergedConsoleReadModel(
  bundles: TrustBundle[],
  options: BuildConsoleReadModelOptions = {},
): ConsoleReadModel {
  if (bundles.length === 0) throw new Error("buildMergedConsoleReadModel: at least one bundle is required");
  const attribution = buildProducerAttribution(bundles);
  const { bundle: merged, collisions } = mergeBundlesDetailed(bundles);
  // Re-validate the merged ledger so the union is held to the same invariants as
  // any single producer bundle (mirrors loadReport in src/commands/shared.ts).
  const validated = validateTrustBundle(merged);
  return projectBundleToConsoleReadModel(validated, attribution, enrichCollisions(collisions, bundles), options);
}

/**
 * Load, validate, merge, and project a set of bundle input paths into a console
 * read model. Each input is validated individually before the merge so a bad
 * producer bundle fails loudly with its own path named.
 */
export async function loadMergedConsoleReadModel(
  inputPaths: string[],
  options: BuildConsoleReadModelOptions = {},
): Promise<ConsoleReadModel> {
  if (inputPaths.length === 0) throw new Error("loadMergedConsoleReadModel: at least one --input is required");
  const bundles = await Promise.all(
    inputPaths.map(async (path): Promise<TrustBundle> => {
      const raw = await readFile(path, "utf8");
      try {
        return validateTrustBundle(JSON.parse(raw));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid bundle input ${path}: ${message}`);
      }
    }),
  );
  return buildMergedConsoleReadModel(bundles, options);
}
