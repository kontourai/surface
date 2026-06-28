/**
 * Canonical claim grammar — ADR 0003 step 1.
 *
 * A CanonicalClaimTarget is the minimal shape needed to build a deterministic
 * matching key: subject type + id, the field/behaviour predicate, and optional
 * qualifiers.  It is intentionally smaller than a full Claim so that inquiry
 * targets and derivation rule targets can use the same type without carrying
 * claim-identity fields (id, value, timestamps, …).
 */
export interface CanonicalClaimTarget {
  subjectType: string;
  subjectId: string;
  fieldOrBehavior: string;
  qualifiers?: Record<string, string>;
}

/**
 * Build a deterministic, normalised key that can be compared for exact match.
 *
 * Normalisation rules:
 * - subjectType  → trim + lowercase
 * - fieldOrBehavior → trim + lowercase
 * - subjectId    → trim only (case-preserved — identifiers are often case-sensitive)
 * - qualifiers   → sorted by key (keys trimmed+lowercased, values trimmed+lowercased)
 *
 * The resulting key is an opaque string; callers should not parse it.
 */
export function canonicalClaimKey(target: CanonicalClaimTarget): string {
  // Escape the separator characters (`:` and `?`, plus `%` itself) inside each segment
  // so that values legitimately containing them (e.g. subjectId="commit:abc") cannot
  // bleed across segment boundaries and produce an ambiguous, colliding key. Other
  // characters (including `/`) are left intact to keep keys readable.
  const subjectType = escapeSegment(target.subjectType.trim().toLowerCase());
  const subjectId = escapeSegment(target.subjectId.trim());
  const fieldOrBehavior = escapeSegment(target.fieldOrBehavior.trim().toLowerCase());

  const qualifiersPart = buildQualifiersPart(target.qualifiers);

  return qualifiersPart
    ? `${subjectType}:${subjectId}:${fieldOrBehavior}?${qualifiersPart}`
    : `${subjectType}:${subjectId}:${fieldOrBehavior}`;
}

/**
 * Escapes the key's structural delimiters within a single segment. `%` is escaped
 * first so the transform stays reversible/injective; `:` and `?` are the segment
 * separators in the key grammar.
 */
function escapeSegment(value: string): string {
  return value.replace(/%/g, "%25").replace(/:/g, "%3A").replace(/\?/g, "%3F");
}

function buildQualifiersPart(qualifiers: Record<string, string> | undefined): string {
  if (!qualifiers) return "";
  const entries = Object.entries(qualifiers);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => [k.trim().toLowerCase(), v.trim().toLowerCase()] as [string, string])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
