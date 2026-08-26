import type { SurfacePolicyOutcome } from "./types.js";

/** Shared wire limits for scalar values carried by the Basis read model. */
export const BASIS_MAX_STRING_BYTES = 4_096;
const encoder = new TextEncoder();
const DISALLOWED_INERT_TEXT = /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function boundedWellFormedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= BASIS_MAX_STRING_BYTES && hasWellFormedUnicode(value) && encoder.encode(value).byteLength <= BASIS_MAX_STRING_BYTES;
}

/** Opaque owner refs preserve their exact bytes; Surface never dereferences or normalizes them. */
export function isBasisOpaqueRefScalar(value: unknown): value is string {
  return boundedWellFormedString(value);
}

/** Display values are data, not markup or links; renderers must escape them. */
export function isBasisInertDisplayScalar(value: unknown): value is string {
  return boundedWellFormedString(value) && !DISALLOWED_INERT_TEXT.test(value);
}

/** Contract tokens are deliberately narrower than display prose and opaque refs. */
export function isBasisRestrictedContractScalar(value: unknown): value is string {
  return isBasisInertDisplayScalar(value) && /^[@A-Za-z0-9][A-Za-z0-9._/@-]*$/u.test(value);
}

export function isBasisAuthority(value: unknown): value is string {
  return isBasisRestrictedContractScalar(value) && /^@kontourai\/[a-z0-9-]+$/u.test(value);
}

export function parseSurfacePolicyOutcome(value: unknown): SurfacePolicyOutcome | undefined {
  const reasons = ["claim-not-verified", "claim-stale", "required-evidence-unmet", "explicit-entailing-evidence-missing", "blocking-evidence", "blocking-gap"];
  if (!isPlainRecord(value) || !hasExactKeys(value, ["version", "id", "evaluatedAt", "outcome", "satisfied", "reasons"]) || value.version !== "surface.answer-assessment-policy/v1" || !isBasisOpaqueRefScalar(value.id) || !isBasisOpaqueRefScalar(value.evaluatedAt) || (value.outcome !== "satisfied" && value.outcome !== "not-satisfied") || typeof value.satisfied !== "boolean" || value.satisfied !== (value.outcome === "satisfied") || !Array.isArray(value.reasons) || value.reasons.some((reason) => !reasons.includes(String(reason))) || (value.satisfied ? value.reasons.length !== 0 : value.reasons.length === 0)) return undefined;
  return { version: "surface.answer-assessment-policy/v1", id: value.id, evaluatedAt: value.evaluatedAt, outcome: value.outcome, satisfied: value.satisfied, reasons: value.reasons as SurfacePolicyOutcome["reasons"] };
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  return isPlainRecord(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
