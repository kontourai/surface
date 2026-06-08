import type { Claim, DerivationChangeRecord, TransparencyGap, TrustStatus } from "./types.js";

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

const STATUS_RANK: Record<TrustStatus, number> = {
  rejected: 0,
  disputed: 1,
  superseded: 2,
  stale: 3,
  unknown: 4,
  assumed: 5,
  proposed: 6,
  verified: 7,
};

export function compareStatusStrength(a: TrustStatus, b: TrustStatus): number {
  return STATUS_RANK[a] - STATUS_RANK[b];
}

export function weakerStatus(a: TrustStatus, b: TrustStatus): TrustStatus {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

export interface DerivationOutcome {
  /** The status after applying the derivation ceiling. */
  status: TrustStatus;
  /** Transparency gaps emitted by the derivation pass (cycle detection, missing inputs). */
  transparencyGaps: TransparencyGap[];
  /** Change records explaining recompute/review pressure from derivation inputs. */
  changeRecords: DerivationChangeRecord[];
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

  for (const record of changeRecordsForInputStatuses({ claim, inputIds, statusesByInputId, createdAt })) {
    changeRecords.push(record);
  }

  const finalStatus = weakerStatus(ownStatus, ceiling);
  return { status: finalStatus, transparencyGaps, changeRecords };
}

export function derivationInputIds(claim: Claim): string[] {
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
