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

export function isRequirementUnsupportedStatus(status: TrustStatus): boolean {
  return status === "unknown" || status === "proposed";
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
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "disputed")) return "disputed";
  if (statuses.some((status) => status === "stale" || status === "superseded")) return "stale";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  if (statuses.some((status) => status === "proposed")) return "proposed";
  if (statuses.some((status) => status === "assumed")) return "assumed";
  return "verified";
}
