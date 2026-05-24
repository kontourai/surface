import {
  addClaimToStore,
  removeClaimFromStore,
  updateClaimInStore,
} from "./store.js";
import type { ClaimDefinition, ClaimStore, ImpactLevel } from "./types.js";

export interface ClaimDefinitionDraft {
  id?: string;
  surface: string;
  claimType: string;
  fieldOrBehavior: string;
  subjectType: string;
  subjectId: string;
  impactLevel?: ImpactLevel;
  verificationPolicyId?: string;
  metadata?: Record<string, unknown>;
}

export type ClaimDefinitionUpdateDraft = Partial<Omit<ClaimDefinitionDraft, "id">>;

export interface ClaimAuthoringOptions {
  now?: Date | string;
}

export interface ClaimAuthoringResult {
  store: ClaimStore;
  claim: ClaimDefinition;
}

export function addAuthoredClaim(
  store: ClaimStore,
  draft: ClaimDefinitionDraft,
  options: ClaimAuthoringOptions = {},
): ClaimAuthoringResult {
  const claim = buildClaimDefinition(draft, options);
  return {
    store: addClaimToStore(store, claim),
    claim,
  };
}

export function updateAuthoredClaim(
  store: ClaimStore,
  claimId: string,
  draft: ClaimDefinitionUpdateDraft,
  options: ClaimAuthoringOptions = {},
): ClaimAuthoringResult {
  const updates = buildClaimDefinitionUpdates(draft, options);
  const updatedStore = updateClaimInStore(store, claimId, updates);
  const claim = updatedStore.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Claim "${claimId}" not found in store`);
  return { store: updatedStore, claim };
}

export function removeAuthoredClaim(store: ClaimStore, claimId: string): ClaimStore {
  return removeClaimFromStore(store, claimId);
}

export function buildClaimDefinition(
  draft: ClaimDefinitionDraft,
  options: ClaimAuthoringOptions = {},
): ClaimDefinition {
  const now = authoringTimestamp(options.now);
  return {
    id: nonEmptyString(draft.id) ?? generateClaimId(draft.subjectId, draft.surface, draft.fieldOrBehavior),
    surface: requireDraftString(draft.surface, "surface"),
    claimType: requireDraftString(draft.claimType, "claimType"),
    fieldOrBehavior: requireDraftString(draft.fieldOrBehavior, "fieldOrBehavior"),
    subjectType: requireDraftString(draft.subjectType, "subjectType"),
    subjectId: requireDraftString(draft.subjectId, "subjectId"),
    impactLevel: draft.impactLevel ?? "medium",
    verificationPolicyId: nonEmptyString(draft.verificationPolicyId),
    metadata: draft.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildClaimDefinitionUpdates(
  draft: ClaimDefinitionUpdateDraft,
  options: ClaimAuthoringOptions = {},
): Partial<Omit<ClaimDefinition, "id" | "createdAt">> {
  const updates: Partial<Omit<ClaimDefinition, "id" | "createdAt">> = {
    updatedAt: authoringTimestamp(options.now),
  };
  if (draft.surface !== undefined) updates.surface = requireDraftString(draft.surface, "surface");
  if (draft.claimType !== undefined) updates.claimType = requireDraftString(draft.claimType, "claimType");
  if (draft.fieldOrBehavior !== undefined) updates.fieldOrBehavior = requireDraftString(draft.fieldOrBehavior, "fieldOrBehavior");
  if (draft.subjectType !== undefined) updates.subjectType = requireDraftString(draft.subjectType, "subjectType");
  if (draft.subjectId !== undefined) updates.subjectId = requireDraftString(draft.subjectId, "subjectId");
  if (draft.impactLevel !== undefined) updates.impactLevel = draft.impactLevel;
  if (draft.verificationPolicyId !== undefined) updates.verificationPolicyId = nonEmptyString(draft.verificationPolicyId);
  if (draft.metadata !== undefined) updates.metadata = draft.metadata;
  return updates;
}

export function parseImpactLevel(value: unknown, label = "impactLevel"): ImpactLevel | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "low" || value === "medium" || value === "high" || value === "critical") return value;
  throw new Error(`${label} must be low, medium, high, or critical`);
}

export function generateClaimId(subjectId: string, surface: string, fieldOrBehavior: string): string {
  return `${slugify(subjectId)}.${slugify(surface)}.${slugify(fieldOrBehavior)}`;
}

function authoringTimestamp(now: Date | string | undefined): string {
  if (typeof now === "string") return now;
  return (now ?? new Date()).toISOString();
}

function requireDraftString(value: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function nonEmptyString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "claim";
}
