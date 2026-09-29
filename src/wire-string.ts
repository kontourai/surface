// Readers for wire enum fields that arrive unvalidated (#300).
//
// `validateTrustBundle` checks these fields, but the report summary and the
// basis view also run on input that never went through it. Both read the
// fields here so they agree on what counts as a value: only a string with
// non-whitespace content. Anything else (null, a number, an object, "",
// "   ") is treated as absent. A present value is returned as-is, not
// trimmed, so an unrecognized string is still shown exactly as written.
//
// Internal module: not re-exported from the package entry points.

import type { ConfidenceBasis } from "./types.js";

/** The value when it is a string with non-whitespace content, else undefined. */
export function wireString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** `confidenceBasis.reviewerAuthority`, or undefined when absent or malformed. */
export function reviewerAuthorityOf(basis: ConfidenceBasis | null | undefined): string | undefined {
  return wireString(basis?.reviewerAuthority);
}

/** `confidenceBasis.evidenceStrength`, or undefined when absent or malformed. */
export function evidenceStrengthOf(basis: ConfidenceBasis | null | undefined): string | undefined {
  return wireString(basis?.evidenceStrength);
}
