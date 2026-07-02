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
  const normalized = validateClaimDefinition(claim);
  if (store.claims.some((item) => item.id === normalized.id)) {
    throw new Error(`Claim "${normalized.id}" already exists in store`);
  }
  return { ...store, claims: [...store.claims, { ...normalized }] };
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
  const normalized = validateClaimDefinition(updated);
  return {
    ...store,
    claims: [...store.claims.slice(0, index), normalized, ...store.claims.slice(index + 1)],
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
  // Non-mutating: validateClaimDefinition returns a normalized copy (legacy
  // `surface` mapped onto `facet`) instead of writing onto the caller's raw
  // claim objects, so the normalized claims are threaded through explicitly
  // below rather than relying on in-place mutation of `raw.claims`.
  const claims = raw.claims.map((claim) => validateClaimDefinition(claim));
  const policies = raw.policies as VerificationPolicy[];
  const policyIds = new Set(policies.map((policy) => policy.id));
  for (const claim of claims) {
    if (claim.verificationPolicyId && !policyIds.has(claim.verificationPolicyId)) {
      throw new Error(`Claim "${claim.id}" references unknown policy "${claim.verificationPolicyId}"`);
    }
  }
  return { ...(raw as Record<string, unknown>), claims } as unknown as ClaimStore;
}

// TOLERANCE SHIM (owner-ratified, one release): a store entry written before
// the hachure facet rename used `surface` where this release reads `facet`.
// Non-mutating, mirrors validateTrustBundle's normalizeClaimFacetForRead
// (src/validate.ts): never writes onto the caller-supplied object — a frozen
// claim (e.g. `Object.freeze`d by a caller holding its own reference) must
// validate successfully, not throw. Only allocates a shallow copy when there
// is actually something to normalize/strip (a legacy `surface` key); the
// common case (no `surface` key) validates and returns the original
// reference untouched. Read path only: `surface`'s value is copied onto
// `facet` when `facet` is absent, a deprecation warning fires once per
// process (not once per claim), and `surface` is never re-emitted — a
// round-tripped save migrates the entry instead of preserving the stale key
// forever.
function validateClaimDefinition(rawInput: unknown): ClaimDefinition {
  if (!isObject(rawInput)) throw new Error("Claim definition must be a JSON object");
  const raw: Record<string, unknown> = "surface" in rawInput ? { ...rawInput } : rawInput;
  for (const field of ["id", "claimType", "fieldOrBehavior", "subjectType", "subjectId", "createdAt", "updatedAt"]) {
    if (typeof raw[field] !== "string" || (raw[field] as string).length === 0) {
      throw new Error(`Claim definition must have a ${field} string`);
    }
  }
  if (raw.facet === undefined && typeof raw.surface === "string" && raw.surface.length > 0) {
    warnLegacyClaimDefinitionSurfaceFieldOnce();
    raw.facet = raw.surface;
  }
  delete raw.surface;
  // facet is optional (mirrors the hachure Claim.facet rename/optionality).
  if (raw.facet !== undefined && (typeof raw.facet !== "string" || (raw.facet as string).length === 0)) {
    throw new Error("Claim definition facet must be a non-empty string when present");
  }
  if (raw.impactLevel !== undefined && !IMPACT_LEVELS.has(raw.impactLevel as ImpactLevel)) {
    throw new Error(`Claim "${raw.id as string}" has unsupported impactLevel: ${String(raw.impactLevel)}`);
  }
  if (raw.verificationPolicyId !== undefined && typeof raw.verificationPolicyId !== "string") {
    throw new Error(`Claim "${raw.id as string}" verificationPolicyId must be a string`);
  }
  if (raw.metadata !== undefined && !isObject(raw.metadata)) {
    throw new Error(`Claim "${raw.id as string}" metadata must be an object`);
  }
  return raw as unknown as ClaimDefinition;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
