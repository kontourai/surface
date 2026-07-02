import type { SurfaceConsoleRuntimeConfig } from "./types.js";

export interface SurfaceConsoleMetric {
  label: string;
  value: string;
  hint: string;
  delta: string;
  color: string;
  filter: string;
}

export interface SurfaceConsoleProjection {
  project: { name: string };
  run: { id: string; meta: string; label?: string | null };
  narrative: string;
  metrics: SurfaceConsoleMetric[];
  claimCards: SurfaceConsoleClaimCard[];
  attentionClaims: SurfaceConsoleClaimCard[];
  claims: Array<Record<string, unknown>>;
  facetCounts: Record<string, number>;
  readModel: unknown;
}

export interface SurfaceConsoleClaimCard {
  id: string;
  title: string;
  subject: string;
  facet: string;
  surfaceLabel: string;
  status: string;
  evidenceCount: number;
  transparencyGapCount: number;
  policyId?: string;
}

export function buildSurfaceConsoleProjection(
  readModel: unknown,
  config: SurfaceConsoleRuntimeConfig = {},
): SurfaceConsoleProjection {
  const model = objectRecord(readModel);
  const producer = objectRecord(model.producer);
  const summary = objectRecord(model.summary);
  const claims = Array.isArray(model.claims) ? model.claims.filter(isRecord) : [];
  const sourceSummary = formatSourceSummary(producer);
  const timestamp = stringValue(producer.timestamp);
  const runDate = timestamp
    ? new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const runMeta = [sourceSummary, runDate].filter(Boolean).join(" · ");
  const statusCounts = objectRecord(summary.statusCounts);
  const verified = numberValue(statusCounts.verified);
  const attention = claims.filter((claim) => {
    const status = stringValue(claim.status);
    return status === "stale" || status === "disputed" || status === "rejected" || status === "unknown" || status === "assumed";
  });
  const claimCount = numberValue(summary.claimCount, claims.length);
  const total = Math.max(claimCount, 1);
  const transparencyGapCount = numberValue(summary.transparencyGapCount);
  const claimCards = claims.map((claim) => buildClaimCard(claim, model, config.vocab?.surfaceLabels));
  const projectName =
    config.vocab?.projectName ??
    config.theme?.brandName ??
    deriveProjectName(claims) ??
    projectNameFromFolder(config.folderName) ??
    "Console";

  return {
    project: { name: projectName },
    run: { id: stringValue(producer.runId, "unknown"), meta: runMeta, label: stringValue(producer.runId) },
    narrative: buildNarrative({ claimCount, verified, attention, surfaceLabels: config.vocab?.surfaceLabels }),
    metrics: [
      { label: "Claims", value: String(claimCount), hint: "", delta: "", color: "blue", filter: "all" },
      { label: "Verified", value: String(verified), hint: "", delta: `${Math.round((verified / total) * 100)}%`, color: "good", filter: "verified" },
      {
        label: "Attention",
        value: String(attention.length),
        hint: "",
        delta: `${transparencyGapCount} gaps`,
        color: attention.length ? "bad" : "good",
        filter: "attention",
      },
    ],
    claimCards,
    attentionClaims: claimCards.filter((claim) => isAttentionStatus(claim.status)),
    claims,
    // Tolerant of a read-model JSON produced before this rename (an
    // un-migrated producer, or an archived local run artifact).
    facetCounts: numberRecord(isRecord(summary.facetCounts) ? summary.facetCounts : summary.surfaceCounts),
    readModel,
  };
}

export function emptySurfaceConsoleProjection(config: SurfaceConsoleRuntimeConfig = {}): SurfaceConsoleProjection {
  return {
    project: { name: config.vocab?.projectName ?? config.theme?.brandName ?? "No data yet" },
    run: { id: "", meta: "No runs found — run the producer to generate a read model" },
    narrative: "",
    metrics: [
      { label: "Claims", value: "0", hint: "", delta: "", color: "blue", filter: "all" },
      { label: "Verified", value: "0", hint: "", delta: "", color: "good", filter: "verified" },
      { label: "Attention", value: "0", hint: "", delta: "", color: "bad", filter: "attention" },
    ],
    claimCards: [],
    attentionClaims: [],
    claims: [],
    facetCounts: {},
    readModel: null,
  };
}

function buildClaimCard(
  claim: Record<string, unknown>,
  readModel: Record<string, unknown>,
  surfaceLabels?: Record<string, string>,
): SurfaceConsoleClaimCard {
  const id = stringValue(claim.id);
  // Tolerant of a legacy `surface` key (pre-rename producer or archived run
  // artifact) — same one-release shim spirit as validate.ts's bundle-read shim.
  const facet = stringValue(claim.facet) || stringValue(claim.surface);
  const policyId = stringValue(claim.verificationPolicyId);
  const card: SurfaceConsoleClaimCard = {
    id,
    title: stringValue(claim.fieldOrBehavior) || stringValue(claim.claimType) || id || "Untitled claim",
    subject: [stringValue(claim.subjectType), stringValue(claim.subjectId)].filter(Boolean).join(":"),
    facet,
    surfaceLabel: surfaceLabel(facet, surfaceLabels),
    status: stringValue(claim.status, "unknown"),
    evidenceCount: evidenceForClaim(claim, readModel).length,
    transparencyGapCount: transparencyGapsForClaim(claim, readModel).length,
  };
  if (policyId) card.policyId = policyId;
  return card;
}

function evidenceForClaim(claim: Record<string, unknown>, readModel: Record<string, unknown>): Record<string, unknown>[] {
  const evidence = Array.isArray(readModel.evidence) ? readModel.evidence.filter(isRecord) : [];
  const evidenceIds = new Set(Array.isArray(claim.evidenceIds) ? claim.evidenceIds.filter((item): item is string => typeof item === "string") : []);
  const claimId = stringValue(claim.id);
  return evidence.filter((item) => evidenceIds.has(stringValue(item.id)) || stringValue(item.claimId) === claimId);
}

function transparencyGapsForClaim(claim: Record<string, unknown>, readModel: Record<string, unknown>): Record<string, unknown>[] {
  const gaps = Array.isArray(readModel.transparencyGaps) ? readModel.transparencyGaps.filter(isRecord) : [];
  const gapIds = new Set(Array.isArray(claim.transparencyGapIds) ? claim.transparencyGapIds.filter((item): item is string => typeof item === "string") : []);
  const claimId = stringValue(claim.id);
  return gaps.filter((item) => gapIds.has(stringValue(item.id)) || stringValue(item.claimId) === claimId);
}

function isAttentionStatus(status: string): boolean {
  return status === "stale" || status === "disputed" || status === "rejected" || status === "unknown" || status === "assumed";
}

function buildNarrative(input: {
  claimCount: number;
  verified: number;
  attention: Array<Record<string, unknown>>;
  surfaceLabels?: Record<string, string>;
}): string {
  if (input.attention.length === 0) {
    return `All ${input.verified} of ${input.claimCount} claims are verified.`;
  }
  const first = input.attention[0];
  const fieldOrBehavior = stringValue(first.fieldOrBehavior) || stringValue(first.claimType);
  const facet = stringValue(first.facet) || stringValue(first.surface);
  return `${input.attention.length} claim${input.attention.length !== 1 ? "s" : ""} need attention. Start with “${fieldOrBehavior}” on facet ${surfaceLabel(facet, input.surfaceLabels)}.`;
}

function formatSourceSummary(producer: Record<string, unknown>): string | null {
  const kind = stringValue(producer.sourceKind);
  const scope = Array.isArray(producer.sourceScope)
    ? producer.sourceScope.filter((item): item is string => typeof item === "string")
    : stringValue(producer.sourceScope) ? [stringValue(producer.sourceScope)] : [];

  let kindLabel: string | null = null;
  if (kind === "working-tree") kindLabel = "Working tree";
  else if (kind === "branch-diff") kindLabel = "Branch diff";
  else if (kind === "explicit-files") kindLabel = "Explicit files";
  else if (kind) kindLabel = kind.replace(/-/g, " ");

  const allLocal = ["staged", "unstaged", "untracked"];
  let scopeLabel: string | null = null;
  if (scope.length > 0 && allLocal.every((item) => scope.includes(item)) && scope.length === allLocal.length) {
    scopeLabel = "all local changes";
  } else if (scope.length === 1) {
    scopeLabel = `${scope[0]} only`;
  } else if (scope.length > 0) {
    scopeLabel = scope.join(" + ");
  }

  if (!kindLabel && !scopeLabel) return null;
  if (!scopeLabel || scopeLabel === kindLabel) return kindLabel;
  return `${kindLabel} · ${scopeLabel}`;
}

function deriveProjectName(claims: Array<Record<string, unknown>>): string | null {
  if (claims.length === 0) return null;
  const roots: Record<string, number> = {};
  for (const claim of claims) {
    const raw = stringValue(claim.subjectId).split(":")[0]?.trim();
    if (raw) roots[raw] = (roots[raw] ?? 0) + 1;
  }
  const top = Object.entries(roots).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? titleFromToken(top) : null;
}

function projectNameFromFolder(folderName: string | undefined): string | null {
  return folderName ? titleFromToken(folderName) : null;
}

function surfaceLabel(surface: string, labels: Record<string, string> | undefined): string {
  if (labels?.[surface]) return labels[surface];
  const name = surface.includes(".") ? surface.split(".").slice(1).join(" ") : surface;
  return titleFromToken(name);
}

function titleFromToken(value: string): string {
  return value.replace(/[-_.]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function objectRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberRecord(value: unknown): Record<string, number> {
  const record = objectRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
  );
}
