import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ClaimDefinition, ClaimStore, ImpactLevel, VerificationPolicy } from "./types.js";

const IMPACT_LEVELS = new Set<ImpactLevel>(["low", "medium", "high", "critical"]);

// TOLERANCE SHIM (owner-ratified, one release; hachure facet rename, 0.9.0):
// mirrors validateTrustBundle's read-tolerance shim (src/validate.ts) for the
// local claim-authoring store (veritas.claims.json and friends). A legacy
// ClaimDefinition.surface value is mapped onto `facet` on read, `surface` is
// never re-emitted, and a deprecation warning fires once per process (not
// once per claim/store) so a store full of legacy entries does not flood
// stderr. This is a separate warn-once flag from validate.ts's — the two
// shims guard different read paths and are allowed to each warn once.
let warnedLegacyClaimDefinitionSurfaceFieldOnce = false;
function warnLegacyClaimDefinitionSurfaceFieldOnce(): void {
  if (warnedLegacyClaimDefinitionSurfaceFieldOnce) return;
  warnedLegacyClaimDefinitionSurfaceFieldOnce = true;
  console.warn(
    "[@kontourai/surface] deprecated: reading legacy claim definition field \"surface\" as \"facet\". " +
      "This read-tolerance shim is temporary (one release) — re-emit affected claim stores with \"facet\" instead of \"surface\".",
  );
}

export function loadClaimStore(path: string): ClaimStore {
  if (!existsSync(path)) return emptyClaimStore();
  const raw = readFileSync(path, "utf8");
  return validateClaimStore(JSON.parse(raw));
}

export function saveClaimStore(store: ClaimStore, path: string): void {
  writeFileSync(path, `${JSON.stringify(validateClaimStore(store), null, 2)}\n`, "utf8");
}

export function addClaimToStore(store: ClaimStore, claim: ClaimDefinition): ClaimStore {
  validateClaimDefinition(claim);
  if (store.claims.some((item) => item.id === claim.id)) {
    throw new Error(`Claim "${claim.id}" already exists in store`);
  }
  return { ...store, claims: [...store.claims, { ...claim }] };
}

export function updateClaimInStore(
  store: ClaimStore,
  id: string,
  updates: Partial<Omit<ClaimDefinition, "id" | "createdAt">>,
): ClaimStore {
  const index = store.claims.findIndex((item) => item.id === id);
  if (index === -1) throw new Error(`Claim "${id}" not found in store`);
  const existing = store.claims[index];
  const updated: ClaimDefinition = {
    ...existing,
    ...updates,
    id,
    createdAt: existing.createdAt,
    updatedAt: updates.updatedAt ?? new Date().toISOString(),
  };
  validateClaimDefinition(updated);
  return {
    ...store,
    claims: [...store.claims.slice(0, index), updated, ...store.claims.slice(index + 1)],
  };
}

export function removeClaimFromStore(store: ClaimStore, id: string): ClaimStore {
  if (!store.claims.some((item) => item.id === id)) {
    throw new Error(`Claim "${id}" not found in store`);
  }
  return { ...store, claims: store.claims.filter((item) => item.id !== id) };
}

export function addPolicyToStore(store: ClaimStore, policy: VerificationPolicy): ClaimStore {
  if (store.policies.some((item) => item.id === policy.id)) {
    throw new Error(`Policy "${policy.id}" already exists in store`);
  }
  return { ...store, policies: [...store.policies, { ...policy }] };
}

export function emptyClaimStore(producer = "veritas"): ClaimStore {
  return { schemaVersion: 1, producer, claims: [], policies: [] };
}

export function validateClaimStore(raw: unknown): ClaimStore {
  if (!isObject(raw)) {
    throw new Error("Claim store must be a JSON object");
  }
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported claim store schemaVersion: ${String(raw.schemaVersion)}`);
  }
  if (typeof raw.producer !== "string" || raw.producer.length === 0) {
    throw new Error("Claim store must have a producer string");
  }
  if (!Array.isArray(raw.claims)) throw new Error("Claim store must have a claims array");
  if (!Array.isArray(raw.policies)) throw new Error("Claim store must have a policies array");
  const store = raw as unknown as ClaimStore;
  for (const claim of store.claims) validateClaimDefinition(claim);
  const policyIds = new Set(store.policies.map((policy) => policy.id));
  for (const claim of store.claims) {
    if (claim.verificationPolicyId && !policyIds.has(claim.verificationPolicyId)) {
      throw new Error(`Claim "${claim.id}" references unknown policy "${claim.verificationPolicyId}"`);
    }
  }
  return store;
}

function validateClaimDefinition(raw: unknown): asserts raw is ClaimDefinition {
  if (!isObject(raw)) throw new Error("Claim definition must be a JSON object");
  for (const field of ["id", "claimType", "fieldOrBehavior", "subjectType", "subjectId", "createdAt", "updatedAt"]) {
    if (typeof raw[field] !== "string" || raw[field].length === 0) {
      throw new Error(`Claim definition must have a ${field} string`);
    }
  }
  // TOLERANCE SHIM (owner-ratified, one release): a store entry written before
  // the hachure facet rename used `surface` where this release reads `facet`.
  // Read path only: map `surface`'s value onto `facet` when `facet` is absent,
  // warn once per process, and never re-emit `surface` (stripped below) so a
  // round-tripped save migrates the entry instead of preserving the stale key
  // forever.
  if (raw.facet === undefined && typeof raw.surface === "string" && raw.surface.length > 0) {
    warnLegacyClaimDefinitionSurfaceFieldOnce();
    raw.facet = raw.surface;
  }
  delete raw.surface;
  // facet is optional (mirrors the hachure Claim.facet rename/optionality).
  if (raw.facet !== undefined && (typeof raw.facet !== "string" || raw.facet.length === 0)) {
    throw new Error("Claim definition facet must be a non-empty string when present");
  }
  if (raw.impactLevel !== undefined && !IMPACT_LEVELS.has(raw.impactLevel as ImpactLevel)) {
    throw new Error(`Claim "${raw.id}" has unsupported impactLevel: ${String(raw.impactLevel)}`);
  }
  if (raw.verificationPolicyId !== undefined && typeof raw.verificationPolicyId !== "string") {
    throw new Error(`Claim "${raw.id}" verificationPolicyId must be a string`);
  }
  if (raw.metadata !== undefined && !isObject(raw.metadata)) {
    throw new Error(`Claim "${raw.id}" metadata must be an object`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
