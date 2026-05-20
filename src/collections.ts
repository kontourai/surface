import type {
  Claim,
  CollectionRollup,
  ControlRollup,
  ImpactLevel,
  TrustCollection,
  TrustStatus,
} from "./types.js";

export function deriveCollectionRollups(input: {
  collections?: TrustCollection[];
  claims: Array<Claim & { status: TrustStatus }>;
}): CollectionRollup[] {
  const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
  return (input.collections ?? []).map((collection) => deriveCollectionRollup(collection, claimsById));
}

function deriveCollectionRollup(
  collection: TrustCollection,
  claimsById: Map<string, Claim & { status: TrustStatus }>,
): CollectionRollup {
  const controls = normalizedControls(collection).map((control) => {
    const claimIds = unique(control.claimIds);
    const claims = claimIds.map((id) => claimsById.get(id)).filter((claim): claim is Claim & { status: TrustStatus } => Boolean(claim));
    const missingClaimIds = claimIds.filter((id) => !claimsById.has(id));
    const rollup: ControlRollup = {
      id: control.id,
      title: control.title,
      claimIds,
      required: control.required !== false,
      severity: control.severity ?? maxImpact(claims.map((claim) => claim.impactLevel ?? "medium")),
      status: deriveControlStatus(claims, missingClaimIds),
      verifiedClaims: claims.filter((claim) => claim.status === "verified").map((claim) => claim.id),
      staleClaims: claims.filter((claim) => claim.status === "stale" || claim.status === "superseded").map((claim) => claim.id),
      disputedClaims: claims.filter((claim) => claim.status === "disputed" || claim.status === "rejected").map((claim) => claim.id),
      unsupportedClaims: claims
        .filter((claim) => claim.status === "unknown" || claim.status === "proposed")
        .map((claim) => claim.id),
      missingClaimIds,
    };
    if (control.validationStrategy) rollup.validationStrategy = control.validationStrategy;
    if (control.metadata) rollup.metadata = control.metadata;
    return rollup;
  });

  const rollupClaims = unique([
    ...(collection.claimIds ?? []),
    ...controls.flatMap((control) => control.claimIds),
  ]);
  const status = deriveCollectionStatus(collection, controls);
  const summary = summarizeControls(controls);
  const rollup: CollectionRollup = {
    id: collection.id,
    title: collection.title,
    kind: collection.kind,
    status,
    claimIds: rollupClaims,
    controls,
    summary,
  };
  if (collection.description) rollup.description = collection.description;
  if (collection.metadata) rollup.metadata = collection.metadata;
  return rollup;
}

function normalizedControls(collection: TrustCollection): NonNullable<TrustCollection["controls"]> {
  if (collection.controls && collection.controls.length > 0) return collection.controls;
  if (!collection.claimIds || collection.claimIds.length === 0) return [];
  return [{
    id: `${collection.id}.claims`,
    title: collection.title,
    claimIds: collection.claimIds,
    required: true,
  }];
}

function deriveControlStatus(
  claims: Array<Claim & { status: TrustStatus }>,
  missingClaimIds: string[],
): TrustStatus {
  if (missingClaimIds.length > 0 || claims.length === 0) return "unknown";
  const statuses = claims.map((claim) => claim.status);
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "disputed")) return "disputed";
  if (statuses.some((status) => status === "stale" || status === "superseded")) return "stale";
  if (statuses.some((status) => status === "unknown" || status === "proposed")) return "proposed";
  return "verified";
}

function deriveCollectionStatus(collection: TrustCollection, controls: ControlRollup[]): TrustStatus {
  const required = requiredControls(collection, controls);
  if (required.length === 0) return controls.length > 0 ? aggregateStatuses(controls.map((control) => control.status)) : "unknown";
  if (collection.rollupPolicy?.mode === "any-required") {
    if (required.some((control) => control.status === "verified")) return "verified";
    return aggregateStatuses(required.map((control) => control.status));
  }
  return aggregateStatuses(required.map((control) => control.status));
}

function requiredControls(collection: TrustCollection, controls: ControlRollup[]): ControlRollup[] {
  const requiredIds = new Set(collection.rollupPolicy?.requiredControlIds ?? []);
  const optionalIds = new Set(collection.rollupPolicy?.optionalControlIds ?? []);
  if (requiredIds.size > 0) return controls.filter((control) => requiredIds.has(control.id));
  return controls.filter((control) => control.required && !optionalIds.has(control.id));
}

function aggregateStatuses(statuses: TrustStatus[]): TrustStatus {
  if (statuses.length === 0) return "unknown";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "disputed")) return "disputed";
  if (statuses.some((status) => status === "stale" || status === "superseded")) return "stale";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  if (statuses.some((status) => status === "proposed")) return "proposed";
  return "verified";
}

function summarizeControls(controls: ControlRollup[]): CollectionRollup["summary"] {
  const required = controls.filter((control) => control.required);
  const verifiedControls = controls.filter((control) => control.status === "verified").length;
  return {
    totalControls: controls.length,
    requiredControls: required.length,
    verifiedControls,
    staleControls: controls.filter((control) => control.status === "stale" || control.status === "superseded").length,
    disputedControls: controls.filter((control) => control.status === "disputed" || control.status === "rejected").length,
    unsupportedControls: controls.filter((control) => control.status === "unknown" || control.status === "proposed").length,
    missingClaims: controls.reduce((total, control) => total + control.missingClaimIds.length, 0),
    verificationCoverage: controls.length === 0 ? 0 : verifiedControls / controls.length,
  };
}

function maxImpact(levels: ImpactLevel[]): ImpactLevel {
  const rank: Record<ImpactLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  return levels.reduce((max, level) => rank[level] > rank[max] ? level : max, "medium");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
