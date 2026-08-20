import type { TrustStatus } from "./types.js";

export const TRUST_STATUS_ORDER: TrustStatus[] = [
  "unknown",
  "proposed",
  "assumed",
  "verified",
  "stale",
  "disputed",
  "superseded",
  "rejected",
  "revoked",
];

const STATUS_STRENGTH: Record<TrustStatus, number> = {
  revoked: 0,
  rejected: 1,
  disputed: 2,
  superseded: 3,
  stale: 4,
  unknown: 5,
  assumed: 6,
  proposed: 7,
  verified: 8,
};

export function compareStatusStrength(a: TrustStatus, b: TrustStatus): number {
  return STATUS_STRENGTH[a] - STATUS_STRENGTH[b];
}

export function weakerStatus(a: TrustStatus, b: TrustStatus): TrustStatus {
  return STATUS_STRENGTH[a] <= STATUS_STRENGTH[b] ? a : b;
}

export function isUnsupportedStatus(status: TrustStatus): boolean {
  return status === "unknown" || status === "proposed" || status === "assumed";
}

/**
 * An `assumed` claim is unsupported for requirement purposes exactly as it is for
 * `isUnsupportedStatus`. The two predicates disagreed until now, and the rollup used
 * this one — so an assumed claim appeared in NO list on a RequirementRollup: not
 * `verifiedClaims`, not `unsupportedClaims`, not `staleClaims`, not `disputedClaims`.
 * A disclosed gap that is invisible in every list is a disclosed gap in name only.
 */
export function isRequirementUnsupportedStatus(status: TrustStatus): boolean {
  return status === "unknown" || status === "proposed" || status === "assumed";
}

export function needsAttentionStatus(status: TrustStatus): boolean {
  return status === "stale" ||
    status === "disputed" ||
    status === "rejected" ||
    status === "unknown" ||
    status === "assumed";
}

export function aggregateTrustStatuses(statuses: TrustStatus[]): TrustStatus {
  if (statuses.length === 0) return "unknown";
  // `revoked` is STATUS_STRENGTH 0 — the weakest status in the taxonomy, weaker even than
  // `rejected`. It was absent from this chain, so a revoked status fell through every branch
  // and landed on the optimistic `return "verified"` default: aggregate(["revoked"]) was
  // "verified", and a revoked claim was invisible beside a verified one. Not reachable via
  // deriveClaimStatus (which folds a revoked event to "stale"), but this is a public API over
  // the full TrustStatus union, and the default must never be the strongest value.
  if (statuses.some((status) => status === "revoked")) return "revoked";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "disputed")) return "disputed";
  if (statuses.some((status) => status === "stale" || status === "superseded")) return "stale";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  if (statuses.some((status) => status === "proposed")) return "proposed";
  if (statuses.some((status) => status === "assumed")) return "assumed";
  return "verified";
}
