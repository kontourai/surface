import type { SchemaVersion } from "../types.js";
import { EVIDENCE_METHODS, EVIDENCE_SUPPORT_STRENGTHS } from "./constants.js";

// TOLERANCE SHIM (owner-ratified, one release, hachure facet rename): this
// reader intentionally still ACCEPTS legacy schemaVersion 2-4 on read (the
// shipped `trust-bundle.schema.json` / `trust-report.schema.json` enums are a
// [5, 6, 7] wire contract for NEW bundles — see schemas/*.schema.json — but this
// hand-written validator is the same read choke point that maps legacy
// `surface` onto `facet`, and a bundle self-declaring schemaVersion 4 is
// exactly the kind of archived/legacy bundle that shim exists for).
// schemaVersions 6 and 7 are current versions: they add the optional `proof`
// block and runtime-observation evidence respectively. Bundle emitters declare
// 5 or 7 from their content via requiredBundleSchemaVersion; this function
// governs reading only, never writing.
export function requireSchemaVersion(input: Record<string, unknown>): SchemaVersion {
  if (!("schemaVersion" in input)) {
    throw new Error(
      "Missing required schemaVersion: expected 2, 3, 4, 5, 6, or 7. See docs/reference/schema-versioning.md for the v1-to-v2 migration.",
    );
  }
  const value = input.schemaVersion;
  if (value !== 2 && value !== 3 && value !== 4 && value !== 5 && value !== 6 && value !== 7) {
    throw new Error(
      `Unsupported schemaVersion ${String(value)}: expected 2, 3, 4, 5, 6, or 7. See docs/reference/schema-versioning.md for the v1-to-v2 migration.`,
    );
  }
  return value as SchemaVersion;
}

export function requireEvidenceMethod(evidence: Record<string, unknown>): void {
  if (typeof evidence.method === "string" && evidence.method.length > 0) return;
  const evidenceId = typeof evidence.id === "string" && evidence.id.length > 0 ? evidence.id : "<unknown>";
  throw new Error(
    `Evidence ${evidenceId} is missing required method. Add one of: ${EVIDENCE_METHODS.join(", ")}. See docs/reference/schema-versioning.md for the v1-to-v2 migration.`,
  );
}

export function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
}

export function requireString(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required string field: ${field}`);
  return value;
}

export function requireArray(object: Record<string, unknown>, field: string): unknown[] {
  const value = object[field];
  if (!Array.isArray(value)) throw new Error(`Missing required array field: ${field}`);
  return value;
}

export function requireStringArray(object: Record<string, unknown>, field: string): string[] {
  const values = requireArray(object, field);
  if (!values.every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  return values as string[];
}

export function requireEnumArray<T extends readonly string[]>(object: Record<string, unknown>, field: string, allowed: T): Array<T[number]> {
  const values = requireStringArray(object, field);
  for (const value of values) {
    if (!allowed.includes(value)) throw new Error(`${field} contains unsupported value: ${value}`);
  }
  return values as Array<T[number]>;
}

export function requireEnum<T extends readonly string[]>(object: Record<string, unknown>, field: string, allowed: T): T[number] {
  const value = requireString(object, field);
  if (!allowed.includes(value)) throw new Error(`${field} contains unsupported value: ${value}`);
  return value;
}

export function requireEvidenceSupportStrength(evidence: Record<string, unknown>): void {
  const value = requireString(evidence, "supportStrength");
  if (!EVIDENCE_SUPPORT_STRENGTHS.includes(value as (typeof EVIDENCE_SUPPORT_STRENGTHS)[number])) {
    throw new Error(`Evidence ${String(evidence.id ?? "")} supportStrength contains unsupported value: ${value}`);
  }
}

export function requireDateTime(object: Record<string, unknown>, field: string): void {
  const value = requireString(object, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-8601 UTC date-time`);
  }
}

export function rejectUnknownKeys(object: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
