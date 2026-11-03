import type { Claim, DerivationChangeRecord, TransparencyGap, TrustStatus } from "./types.js";
import type { DerivationEdge } from "./types.js";
export { compareStatusStrength, weakerStatus } from "./status-taxonomy.js";
import { weakerStatus } from "./status-taxonomy.js";

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
  /** Shared report-wide survival index; standalone callers may omit it. */
  survivingInputIds?: ReadonlySet<string>;
  /** Shared reverse reachability from tombstones. */
  deletionAffectedInputIds?: ReadonlySet<string>;
}

/**
 * Apply the derivation ceiling for a single claim. Walks `derivedFrom`
 * transitively with cycle detection, collecting the weakest input status seen.
 */
export function applyDerivation(input: DerivationInputs): DerivationOutcome {
  const { claim, ownStatus, ownStatusByClaimId, claimsById, now } = input;
  const inputIds = derivationInputIds(claim);
  if (isDeletedClaim(claim)) {
    return { status: "unknown", transparencyGaps: [], changeRecords: [] };
  }
  if (inputIds.length === 0) {
    return { status: ownStatus, transparencyGaps: [], changeRecords: [] };
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
  const deletedInputs = new Set<string>();
  const pending = [...inputIds];
  const seenForDeletion = new Set<string>([claim.id]);
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (seenForDeletion.has(id)) continue;
    seenForDeletion.add(id);
    const candidate = claimsById.get(id);
    if (!candidate) continue;
    if (isDeletedClaim(candidate)) { deletedInputs.add(id); continue; }
    pending.push(...derivationInputIds(candidate));
  }

  const surviving = deletedInputs.size > 0
    ? input.survivingInputIds ?? survivingDerivationInputs(claimsById)
    : undefined;
  const deletionAffected = deletedInputs.size > 0
    ? input.deletionAffectedInputIds ?? derivationInputsAffectedByDeletion(claimsById)
    : undefined;
  const unsupportedInputs = new Set<string>();

  // Explicit DFS frames preserve the existing visit order without growing the
  // JavaScript call stack for deep provenance chains.
  const frames: Array<{ ids: string[]; index: number }> = [{ ids: inputIds, index: 0 }];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    if (frame.index === frame.ids.length) { frames.pop(); continue; }
    const currentId = frame.ids[frame.index++];
    if (visited.has(currentId)) { cycleDetected = true; continue; }
    visited.add(currentId);
    const inputClaim = claimsById.get(currentId);
    if (!inputClaim) {
      missingInputs.push(currentId);
      ceiling = weakerStatus(ceiling, "unknown");
      continue;
    }
    if (isDeletedClaim(inputClaim)) continue;
    let inputStatus = ownStatusByClaimId.get(currentId) ?? "unknown";
    if (surviving && deletionAffected?.has(currentId) && !surviving.has(currentId)) {
      unsupportedInputs.add(currentId);
      inputStatus = weakerStatus(inputStatus, "unknown");
    }
    statusesByInputId.set(currentId, inputStatus);
    ceiling = weakerStatus(ceiling, inputStatus);
    collectWeakEdges(inputClaim);
    const children = derivationInputIds(inputClaim);
    if (children.length > 0) frames.push({ ids: children, index: 0 });
  }

  if (deletedInputs.size > 0) {
    const erased = [...deletedInputs].sort();
    const unsupported = unsupportedInputs.size > 0 || !inputIds.some((id) => {
      const candidate = claimsById.get(id);
      return !candidate || (!isDeletedClaim(candidate) &&
        (!deletionAffected!.has(id) || surviving!.has(id)));
    });
    if (unsupported) {
      ceiling = weakerStatus(ceiling, "unknown");
      transparencyGaps.push({
        id: `${claim.id}.gap.deleted-input`, claimId: claim.id,
        type: "unsupported_inference", severity: claim.impactLevel ?? "medium",
        ...materialityFromClaim(claim),
        message: unsupportedInputs.size > 0
          ? `Claim ${claim.id} depends on inputs with no surviving support.`
          : `Claim ${claim.id} has no surviving derivation input.`, createdAt,
        metadata: { source: "derivation.deleted", deletedInputs: erased, unsupportedInputs: [...unsupportedInputs].sort() },
      });
    } else {
      transparencyGaps.push({
        id: `${claim.id}.gap.deleted-input`, claimId: claim.id,
        type: "provenance_gap", severity: claim.impactLevel ?? "medium",
        ...materialityFromClaim(claim),
        message: `Claim ${claim.id} has a deleted derivation input; review its content and support.`, createdAt,
        metadata: { source: "derivation.deleted", deletedInputs: erased },
      });
    }
    changeRecords.push({
      id: `${claim.id}.change.input-deleted`, claimId: claim.id,
      inputClaimIds: erased, reason: "input-deleted", action: "review", createdAt,
      message: `Claim ${claim.id} depends on deleted input; review derived content for removal.`,
      inputStatuses: Object.fromEntries(statusesByInputId),
      metadata: { source: "derivation.deleted", unsupportedInputs: [...unsupportedInputs].sort() },
    });
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
  return { status: finalStatus, transparencyGaps, changeRecords };
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

/** Surface retention metadata is a producer-authored tombstone, not a content hash. */
export function isDeletedClaim(claim: Claim): boolean {
  if (!claim.metadata || !Object.hasOwn(claim.metadata, "surfaceRetention")) return false;
  const retention = claim.metadata.surfaceRetention;
  return typeof retention === "object" && retention !== null &&
    Object.hasOwn(retention, "state") && (retention as Record<string, unknown>).state === "deleted";
}

/** Index branches that reach a non-deleted leaf or missing input in O(V + E). */
export function survivingDerivationInputs(claimsById: ReadonlyMap<string, Claim>): ReadonlySet<string> {
  const parents = new Map<string, string[]>();
  const queue: string[] = [];
  for (const [id, candidate] of claimsById) {
    if (isDeletedClaim(candidate)) continue;
    const children = derivationInputIds(candidate);
    if (children.length === 0) queue.push(id);
    for (const child of children) {
      const owners = parents.get(child) ?? [];
      owners.push(id);
      parents.set(child, owners);
      if (!claimsById.has(child)) queue.push(child);
    }
  }
  const surviving = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (surviving.has(id)) continue;
    surviving.add(id);
    for (const parent of parents.get(id) ?? []) queue.push(parent);
  }
  return surviving;
}

/** Refuse a bundle that would publish evidence belonging to a deleted claim. */
export function assertDeletedClaimsHaveNoEvidence(claims: readonly Claim[], evidence: readonly { claimId: string }[]): void {
  const deleted = new Set(claims.filter(isDeletedClaim).map((claim) => claim.id));
  if (evidence.some((item) => deleted.has(item.claimId))) {
    throw new Error("deleted claims must not retain attached evidence");
  }
}

/** Claims with a path to a tombstone, stopping at deleted claims. */
export function derivationInputsAffectedByDeletion(claimsById: ReadonlyMap<string, Claim>): ReadonlySet<string> {
  const parents = new Map<string, string[]>();
  const queue: string[] = [];
  for (const [id, claim] of claimsById) {
    if (isDeletedClaim(claim)) { queue.push(id); continue; }
    for (const child of derivationInputIds(claim)) {
      const owners = parents.get(child) ?? [];
      owners.push(id);
      parents.set(child, owners);
    }
  }
  const affected = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (affected.has(id)) continue;
    affected.add(id);
    for (const parent of parents.get(id) ?? []) queue.push(parent);
  }
  return affected;
}
