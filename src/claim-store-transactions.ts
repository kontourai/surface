import {
  addAuthoredClaim,
  removeAuthoredClaim,
  updateAuthoredClaim,
  type ClaimAuthoringOptions,
  type ClaimAuthoringResult,
  type ClaimDefinitionDraft,
  type ClaimDefinitionUpdateDraft,
} from "./claim-authoring.js";
import { loadClaimStore, saveClaimStore, validateClaimStore } from "./store.js";
import type { ClaimStore } from "./types.js";

export const DEFAULT_CLAIM_STORE_PATH = "veritas.claims.json";

export function listClaimStore(path: string): ClaimStore {
  return loadClaimStore(path);
}

export function addClaimStoreClaim(
  path: string,
  draft: ClaimDefinitionDraft,
  options: ClaimAuthoringOptions = {},
): ClaimAuthoringResult {
  const result = addAuthoredClaim(loadClaimStore(path), draft, options);
  saveClaimStore(result.store, path);
  return result;
}

export function updateClaimStoreClaim(
  path: string,
  claimId: string,
  draft: ClaimDefinitionUpdateDraft,
  options: ClaimAuthoringOptions = {},
): ClaimAuthoringResult {
  const result = updateAuthoredClaim(loadClaimStore(path), claimId, draft, options);
  saveClaimStore(result.store, path);
  return result;
}

export function removeClaimStoreClaim(path: string, claimId: string): ClaimStore {
  const store = removeAuthoredClaim(loadClaimStore(path), claimId);
  saveClaimStore(store, path);
  return store;
}

export function validateClaimStoreAtPath(path: string): ClaimStore {
  return validateClaimStore(loadClaimStore(path));
}
