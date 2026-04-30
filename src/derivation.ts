import type { Claim, FaultLine, TrustStatus } from "./types.js";

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
 * visit and emits an `unsupported_inference` fault line so the cycle is visible
 * in the report.
 */

const STATUS_RANK: Record<TrustStatus, number> = {
  rejected: 0,
  disputed: 1,
  superseded: 2,
  stale: 3,
  unknown: 4,
  proposed: 5,
  verified: 6,
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
  /** Fault lines emitted by the derivation pass (cycle detection, missing inputs). */
  faultLines: FaultLine[];
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
  if (!claim.derivedFrom || claim.derivedFrom.length === 0) {
    return { status: ownStatus, faultLines: [] };
  }

  const faultLines: FaultLine[] = [];
  const createdAt = now.toISOString();
  const visited = new Set<string>([claim.id]);
  let ceiling: TrustStatus = "verified";
  let cycleDetected = false;
  let missingInputs: string[] = [];

  const walk = (currentId: string): void => {
    const inputClaim = claimsById.get(currentId);
    if (!inputClaim) {
      missingInputs.push(currentId);
      ceiling = weakerStatus(ceiling, "unknown");
      return;
    }
    const inputStatus = ownStatusByClaimId.get(currentId) ?? "unknown";
    ceiling = weakerStatus(ceiling, inputStatus);
    if (!inputClaim.derivedFrom) return;
    for (const next of inputClaim.derivedFrom) {
      if (visited.has(next)) {
        cycleDetected = true;
        continue;
      }
      visited.add(next);
      walk(next);
    }
  };

  for (const inputId of claim.derivedFrom) {
    if (visited.has(inputId)) {
      cycleDetected = true;
      continue;
    }
    visited.add(inputId);
    walk(inputId);
  }

  if (cycleDetected) {
    faultLines.push({
      id: `${claim.id}.fault.derived-cycle`,
      claimId: claim.id,
      type: "unsupported_inference",
      severity: claim.impactLevel ?? "medium",
      message: `Claim ${claim.id} participates in a derivedFrom cycle.`,
      createdAt,
      metadata: { source: "derivation.cycle" },
    });
  }

  if (missingInputs.length > 0) {
    faultLines.push({
      id: `${claim.id}.fault.derived-missing`,
      claimId: claim.id,
      type: "unsupported_inference",
      severity: claim.impactLevel ?? "medium",
      message: `Claim ${claim.id} derives from missing claims: ${missingInputs.join(", ")}.`,
      createdAt,
      metadata: { source: "derivation.missing", missingInputs },
    });
  }

  const finalStatus = weakerStatus(ownStatus, ceiling);
  return { status: finalStatus, faultLines };
}
