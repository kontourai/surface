import type { TrustReport, TrustStatus } from "./types.js";
import { derivationInputIds } from "./derivation.js";
import { weakerStatus } from "./status-taxonomy.js";

/**
 * Counterfactual traversal for derived trust impact analysis (issue #17).
 *
 * Surface answers two directions over the derivation graph:
 *  - **Reverse drilldown** — from a conclusion to the inputs it depends on.
 *    The full annotated tree is `buildDerivationDrilldown`; `traceDependencies`
 *    here is the flat transitive-input reachability set with BFS depth.
 *  - **Forward impact** — from an input to every conclusion that would be
 *    affected if it flips, stales, or becomes disputed. `traceDependents`
 *    answers "which derived claims depend on this input", and
 *    `analyzeCounterfactual` answers "if this input took a hypothetical status,
 *    which conclusions change, and to what".
 *
 * The impact model mirrors the kernel's derivation ceiling: a derived claim's
 * status is bounded by (never stronger than) the weakest status among the
 * inputs it derives from (see `applyDerivation`). So worsening an input can only
 * weaken the conclusions downstream of it. `analyzeCounterfactual` recomputes
 * that ceiling for every forward-reachable conclusion under the hypothetical and
 * reports those whose status moves. Because the ceiling is a downward bound that
 * the report does not expose headroom above, a *strengthening* hypothetical
 * yields no modelled change — consistent with derivation only bounding downward.
 */

export interface DerivationDependent {
  claimId: string;
  /** Shortest derivation distance from the origin input (1 = derives from it directly). */
  depth: number;
}

export interface DerivationDependency {
  claimId: string;
  /** Shortest derivation distance toward the inputs (1 = a direct input of the origin). */
  depth: number;
}

export interface CounterfactualImpact {
  claimId: string;
  /** The conclusion's status in the report as derived today. */
  fromStatus: TrustStatus;
  /** The conclusion's status under the hypothetical input change. */
  toStatus: TrustStatus;
  /** Shortest derivation distance from the hypothesised input. */
  depth: number;
}

export interface CounterfactualResult {
  targetClaimId: string;
  hypotheticalStatus: TrustStatus;
  /** Conclusions whose derived status moves under the hypothetical, weakest-first by depth then id. */
  affected: CounterfactualImpact[];
}

/**
 * Forward reachability: every derived claim that depends on `inputClaimId`,
 * directly or transitively, with its shortest derivation distance. Cycle-safe.
 */
export function traceDependents(report: TrustReport, inputClaimId: string): DerivationDependent[] {
  const dependents = buildDependentsMap(report);
  return bfsReachable(inputClaimId, (id) => dependents.get(id) ?? []).map(({ claimId, depth }) => ({ claimId, depth }));
}

/**
 * Reverse reachability: every claim `claimId` derives from, directly or
 * transitively, with its shortest derivation distance. Cycle-safe. For the full
 * annotated input tree (edges, evidence context, diagnostics) use
 * `buildDerivationDrilldown`.
 */
export function traceDependencies(report: TrustReport, claimId: string): DerivationDependency[] {
  const inputs = buildDirectInputsMap(report);
  return bfsReachable(claimId, (id) => inputs.get(id) ?? []).map(({ claimId: id, depth }) => ({ claimId: id, depth }));
}

/**
 * Counterfactual forward impact: hypothesise that `targetClaimId` takes
 * `hypotheticalStatus`, then report every forward-reachable conclusion whose
 * derived status changes, with its before/after status and depth.
 */
export function analyzeCounterfactual(
  report: TrustReport,
  targetClaimId: string,
  hypotheticalStatus: TrustStatus,
): CounterfactualResult {
  const baseline = buildStatusMap(report);
  const directInputs = buildDirectInputsMap(report);

  const depthByDependent = new Map<string, number>();
  for (const dependent of traceDependents(report, targetClaimId)) {
    depthByDependent.set(dependent.claimId, dependent.depth);
  }

  // Only claims downstream of the target can have their ceiling move.
  const reachable = [...depthByDependent.keys()];

  const projected = new Map<string, TrustStatus>(baseline);
  projected.set(targetClaimId, hypotheticalStatus);

  // Relax to a fixpoint: each conclusion's projected status is its baseline
  // bounded by the weakest projected status among its direct inputs. Monotone
  // downward over a finite status lattice, so this converges and is cycle-safe.
  let changed = true;
  while (changed) {
    changed = false;
    for (const claimId of reachable) {
      const base = baseline.get(claimId);
      if (base === undefined) continue;
      let ceiling: TrustStatus | undefined;
      for (const inputId of directInputs.get(claimId) ?? []) {
        const inputStatus = projected.get(inputId);
        if (inputStatus === undefined) continue; // missing input contributes no bound here
        ceiling = ceiling === undefined ? inputStatus : weakerStatus(ceiling, inputStatus);
      }
      const next = ceiling === undefined ? base : weakerStatus(base, ceiling);
      if (projected.get(claimId) !== next) {
        projected.set(claimId, next);
        changed = true;
      }
    }
  }

  const affected: CounterfactualImpact[] = [];
  for (const claimId of reachable) {
    const from = baseline.get(claimId);
    const to = projected.get(claimId);
    if (from === undefined || to === undefined || from === to) continue;
    affected.push({ claimId, fromStatus: from, toStatus: to, depth: depthByDependent.get(claimId) ?? 0 });
  }
  affected.sort((a, b) => (a.depth - b.depth) || a.claimId.localeCompare(b.claimId));

  return { targetClaimId, hypotheticalStatus, affected };
}

// ── graph helpers ─────────────────────────────────────────────────────────────

/** claim id → its derived report status. */
function buildStatusMap(report: TrustReport): Map<string, TrustStatus> {
  const map = new Map<string, TrustStatus>();
  for (const claim of report.claims) map.set(claim.id, claim.status);
  return map;
}

/** claim id → the ids of the claims it derives from directly (edges + derivedFrom). */
function buildDirectInputsMap(report: TrustReport): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const claim of report.claims) map.set(claim.id, derivationInputIds(claim));
  return map;
}

/** input claim id → the ids of claims that derive from it directly. */
function buildDependentsMap(report: TrustReport): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const claim of report.claims) {
    for (const inputId of derivationInputIds(claim)) {
      const list = map.get(inputId);
      if (list) list.push(claim.id);
      else map.set(inputId, [claim.id]);
    }
  }
  return map;
}

/** Breadth-first reachability from `origin` over `neighbors`, excluding the origin, with shortest depth. */
function bfsReachable(origin: string, neighbors: (id: string) => string[]): Array<{ claimId: string; depth: number }> {
  const result: Array<{ claimId: string; depth: number }> = [];
  const seen = new Set<string>([origin]);
  let frontier = [origin];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of neighbors(id)) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        result.push({ claimId: neighbor, depth });
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return result;
}
