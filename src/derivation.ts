import type { Claim, DerivationChangeRecord, TransparencyGap, TrustStatus } from "./types.js";
import type { DerivationEdge } from "./types.js";
export { compareStatusStrength, weakerStatus } from "./status-taxonomy.js";
import { weakerStatus } from "./status-taxonomy.js";
import { meetVisibility, readDeclaredVisibility, sealedVisibility, type Visibility } from "./visibility.js";

/**
 * A derived claim cannot be more confident than the weakest claim it is built
 * on. Surface treats this as a "ceiling": the claim's own status is computed
 * normally, then bounded by the weakest status across its `derivedFrom` inputs.
 *
 * The status ranking below mirrors how downstream agents should treat a claim:
 * a chain that includes a rejected input collapses to rejected, a chain that
 * carries a stale input cannot itself be considered fresh, and so on.
 *
 * Cycles in derivedFrom are not fatal — the kernel breaks them on the second
 * visit and emits an `unsupported_inference` transparency gap so the cycle is visible
 * in the report.
 */

export interface DerivationOutcome {
  /** The status after applying the derivation ceiling. */
  status: TrustStatus;
  /** Transparency gaps emitted by the derivation pass (cycle detection, missing inputs). */
  transparencyGaps: TransparencyGap[];
  /** Change records explaining recompute/review pressure from derivation inputs. */
  changeRecords: DerivationChangeRecord[];
  /**
   * The claim's effective visibility: no wider than the intersection of its own
   * and every transitive input's visibility, sealed wherever one is missing.
   * Surface represents this; the store that serves the claim enforces it. See
   * {@link deriveClaimVisibility}.
   */
  visibility: DerivedVisibility;
}

/** Why one claim contributed the visibility it did to a derived claim. */
export type VisibilityContributionBasis =
  /** The claim declares a visibility Surface could read. */
  | "declared"
  /** The claim declares none. It contributes sealed: omission never widens. */
  | "undeclared"
  /** The claim declares something unreadable. It contributes sealed. */
  | "unrecognized"
  /** A `derivedFrom` id has no claim in the bundle. It contributes sealed. */
  | "missing-claim";

export interface VisibilityTraceEntry {
  claimId: string;
  /** `self` is the claim being derived; `input` is one of its transitive derivation inputs. */
  role: "self" | "input";
  basis: VisibilityContributionBasis;
  /** What this claim contributed to the intersection. */
  visibility: Visibility;
  /** True when the contribution is narrower than public, so this claim bounds the result. */
  restricts: boolean;
}

export interface DerivedVisibility {
  visibility: Visibility;
  /** Every claim that contributed, `self` first then inputs by id. Names the restricting input(s) via `restricts`. */
  trace: VisibilityTraceEntry[];
}

export type DerivationInputSource = "derivedFrom" | "derivationEdges";

export interface NormalizedDerivationInput {
  inputClaimId: string;
  source: DerivationInputSource;
  edge?: DerivationEdge;
}

interface DerivationInputs {
  claim: Claim;
  ownStatus: TrustStatus;
  /** Map from claimId to the claim's own (pre-derivation) status. */
  ownStatusByClaimId: Map<string, TrustStatus>;
  /** Map from claimId to claim, used to walk derivedFrom chains. */
  claimsById: Map<string, Claim>;
  now: Date;
}

/**
 * Apply the derivation ceiling for a single claim. Walks `derivedFrom`
 * transitively with cycle detection, collecting the weakest input status seen.
 */
export function applyDerivation(input: DerivationInputs): DerivationOutcome {
  const { claim, ownStatus, ownStatusByClaimId, claimsById, now } = input;
  const inputIds = derivationInputIds(claim);
  const visibility = deriveClaimVisibility(claim, claimsById);
  if (inputIds.length === 0) {
    return { status: ownStatus, transparencyGaps: [], changeRecords: [], visibility };
  }

  const transparencyGaps: TransparencyGap[] = [];
  const changeRecords: DerivationChangeRecord[] = [];
  const createdAt = now.toISOString();
  const visited = new Set<string>([claim.id]);
  let ceiling: TrustStatus = "verified";
  let cycleDetected = false;
  let missingInputs: string[] = [];
  const weakDerivationEdges: Array<{ claimId: string; inputClaimId: string }> = [];
  const collectWeakEdges = (candidate: Claim): void => {
    for (const edge of candidate.derivationEdges ?? []) if (edge.supportStrength === "weak") weakDerivationEdges.push({ claimId: candidate.id, inputClaimId: edge.inputClaimId });
  };
  collectWeakEdges(claim);
  const statusesByInputId = new Map<string, TrustStatus>();

  const walk = (currentId: string): void => {
    const inputClaim = claimsById.get(currentId);
    if (!inputClaim) {
      missingInputs.push(currentId);
      ceiling = weakerStatus(ceiling, "unknown");
      return;
    }
    const inputStatus = ownStatusByClaimId.get(currentId) ?? "unknown";
    statusesByInputId.set(currentId, inputStatus);
    ceiling = weakerStatus(ceiling, inputStatus);
    const nextInputs = derivationInputIds(inputClaim);
    collectWeakEdges(inputClaim);
    if (nextInputs.length === 0) return;
    for (const next of nextInputs) {
      if (visited.has(next)) {
        cycleDetected = true;
        continue;
      }
      visited.add(next);
      walk(next);
    }
  };

  for (const inputId of inputIds) {
    if (visited.has(inputId)) {
      cycleDetected = true;
      continue;
    }
    visited.add(inputId);
    walk(inputId);
  }

  if (cycleDetected) {
    transparencyGaps.push({
      id: `${claim.id}.gap.derived-cycle`,
      claimId: claim.id,
      type: "unsupported_inference",
      severity: claim.impactLevel ?? "medium",
      ...materialityFromClaim(claim),
      message: `Claim ${claim.id} participates in a derivedFrom cycle.`,
      createdAt,
      metadata: { source: "derivation.cycle" },
    });
    changeRecords.push({
      id: `${claim.id}.change.derivation-cycle`,
      claimId: claim.id,
      inputClaimIds: inputIds,
      reason: "derivation-cycle",
      action: "blocked",
      createdAt,
      message: `Claim ${claim.id} has a derivation cycle that blocks reliable recompute.`,
      metadata: { source: "derivation.cycle" },
    });
  }

  if (missingInputs.length > 0) {
    transparencyGaps.push({
      id: `${claim.id}.gap.derived-missing`,
      claimId: claim.id,
      type: "unsupported_inference",
      severity: claim.impactLevel ?? "medium",
      ...materialityFromClaim(claim),
      message: `Claim ${claim.id} derives from missing claims: ${missingInputs.join(", ")}.`,
      createdAt,
      metadata: { source: "derivation.missing", missingInputs },
    });
    changeRecords.push({
      id: `${claim.id}.change.input-missing`,
      claimId: claim.id,
      inputClaimIds: missingInputs,
      reason: "input-missing",
      action: "blocked",
      createdAt,
      message: `Claim ${claim.id} cannot be recomputed because derivation inputs are missing: ${missingInputs.join(", ")}.`,
      metadata: { source: "derivation.missing" },
    });
  }

  // Weak derivation is explanatory only. It remains visible on every affected
  // conclusion (including through a transitive input) without changing the
  // status function or fabricating independent support from a mixed chain.
  if (weakDerivationEdges.length > 0) {
    transparencyGaps.push({
      id: `${claim.id}.gap.weak-derivation`,
      claimId: claim.id,
      type: "unsupported_inference",
      severity: claim.impactLevel ?? "medium",
      ...materialityFromClaim(claim),
      message: `Claim ${claim.id} depends on weak derivation support.`,
      createdAt,
      metadata: { source: "derivation.weak", weakEdges: [...new Map(weakDerivationEdges.map((edge) => [`${edge.claimId}\u0000${edge.inputClaimId}`, edge])).values()].sort((left, right) => `${left.claimId}\u0000${left.inputClaimId}`.localeCompare(`${right.claimId}\u0000${right.inputClaimId}`, "en")) },
    });
  }

  for (const record of changeRecordsForInputStatuses({ claim, inputIds, statusesByInputId, createdAt })) {
    changeRecords.push(record);
  }

  const finalStatus = weakerStatus(ownStatus, ceiling);
  return { status: finalStatus, transparencyGaps, changeRecords, visibility };
}

/**
 * Effective visibility of a claim, derived the way the status ceiling is: from
 * the claim and everything it is transitively built on (`derivedFrom` and
 * `derivationEdges`).
 *
 * - The result is the intersection (meet) of every contribution, so it is never
 *   wider than any input.
 * - Every input must declare its own visibility. An input that declares none,
 *   one that declares something unreadable, and a `derivedFrom` id with no claim
 *   all contribute sealed (no viewer). Omission never widens; it can only narrow.
 * - The claim itself may narrow what its inputs allow but need not declare: a
 *   derived claim that declares nothing is bounded by its inputs, which is the
 *   point of deriving it. A claim with no inputs has nothing else to be bounded
 *   by, so it must declare, and one that declares nothing is sealed. A
 *   declaration on the claim that cannot be read is sealed either way.
 * - Cycles are harmless here: the meet is idempotent, and each claim is visited once.
 */
export function deriveClaimVisibility(claim: Claim, claimsById: ReadonlyMap<string, Claim>): DerivedVisibility {
  const trace: VisibilityTraceEntry[] = [];
  const contribute = (claimId: string, role: VisibilityTraceEntry["role"], source: Claim | undefined): void => {
    let basis: VisibilityContributionBasis;
    let visibility: Visibility;
    if (source === undefined) {
      basis = "missing-claim";
      visibility = sealedVisibility();
    } else {
      const declaration = readDeclaredVisibility(source);
      basis = declaration.state;
      // A derived claim that declares nothing is bounded by its inputs (the
      // identity of the meet). Every other gap is sealed.
      const boundedByInputs = role === "self" && derivationInputIds(source).length > 0;
      if (declaration.state === "declared") visibility = declaration.visibility;
      else if (declaration.state === "undeclared" && boundedByInputs) visibility = { kind: "public" };
      else visibility = sealedVisibility();
    }
    trace.push({ claimId, role, basis, visibility, restricts: visibility.kind !== "public" });
  };

  contribute(claim.id, "self", claim);
  const visited = new Set<string>([claim.id]);
  const pending = derivationInputIds(claim);
  while (pending.length > 0) {
    const id = pending.pop() as string;
    if (visited.has(id)) continue;
    visited.add(id);
    const input = claimsById.get(id);
    contribute(id, "input", input);
    if (input !== undefined) pending.push(...derivationInputIds(input));
  }

  const [self, ...inputs] = trace;
  inputs.sort((left, right) => (left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0));
  const ordered = [self as VisibilityTraceEntry, ...inputs];
  return { visibility: meetVisibility(...ordered.map((entry) => entry.visibility)), trace: ordered };
}

export function derivationInputIds(claim: Claim): string[] {
  return legacyDerivationInputIds(claim);
}

export function derivationInputsForClaim(claim: Claim): NormalizedDerivationInput[] {
  const inputs = new Map<string, NormalizedDerivationInput>();
  for (const edge of claim.derivationEdges ?? []) {
    inputs.set(edge.inputClaimId, {
      inputClaimId: edge.inputClaimId,
      source: "derivationEdges",
      edge,
    });
  }
  for (const inputClaimId of claim.derivedFrom ?? []) {
    if (!inputs.has(inputClaimId)) {
      inputs.set(inputClaimId, { inputClaimId, source: "derivedFrom" });
    }
  }
  return [...inputs.values()];
}

function legacyDerivationInputIds(claim: Claim): string[] {
  const ids = new Set<string>();
  for (const id of claim.derivedFrom ?? []) ids.add(id);
  for (const edge of claim.derivationEdges ?? []) ids.add(edge.inputClaimId);
  return [...ids];
}

function materialityFromClaim(claim: Claim): Pick<TransparencyGap, "materiality"> | Record<string, never> {
  return claim.materiality === undefined ? {} : { materiality: claim.materiality };
}

function changeRecordsForInputStatuses(input: {
  claim: Claim;
  inputIds: string[];
  statusesByInputId: Map<string, TrustStatus>;
  createdAt: string;
}): DerivationChangeRecord[] {
  const inputStatuses: Record<string, TrustStatus> = {};
  for (const [claimId, status] of input.statusesByInputId) inputStatuses[claimId] = status;

  const records: DerivationChangeRecord[] = [];
  const addRecord = (
    reason: DerivationChangeRecord["reason"],
    statuses: TrustStatus[],
    action: DerivationChangeRecord["action"],
    message: string,
  ) => {
    const affectedInputs = [...input.statusesByInputId]
      .filter(([, status]) => statuses.includes(status))
      .map(([claimId]) => claimId);
    if (affectedInputs.length === 0) return;
    records.push({
      id: `${input.claim.id}.change.${reason}`,
      claimId: input.claim.id,
      inputClaimIds: affectedInputs,
      reason,
      action,
      createdAt: input.createdAt,
      message,
      inputStatuses,
      metadata: { source: "derivation.input-status" },
    });
  };

  addRecord("input-stale", ["stale"], "recompute", `Claim ${input.claim.id} should be recomputed because a derivation input is stale.`);
  addRecord("input-superseded", ["superseded"], "recompute", `Claim ${input.claim.id} should be recomputed because a derivation input was superseded.`);
  addRecord("input-disputed", ["disputed"], "review", `Claim ${input.claim.id} needs review because a derivation input is disputed.`);
  addRecord("input-rejected", ["rejected"], "blocked", `Claim ${input.claim.id} is blocked because a derivation input was rejected.`);
  addRecord("input-assumed", ["assumed"], "review", `Claim ${input.claim.id} depends on an assumed derivation input.`);

  return records;
}
