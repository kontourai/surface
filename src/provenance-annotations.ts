// Hachure basis-annotations profile (hachure 0.17.0, basis-annotations.md) and
// the schemaVersion 9 invariants derivation relies on.
//
// The profile's two shapes live under the open `metadata` object
// (`evidence.metadata.sourceOfRecord`, `claim.metadata.estimate`), so neither
// JSON Schema validation nor `validateTrustBundle` sees them; the functions
// here are the profile's rejection path. None of them is a status-function
// input, and status derivation never calls them for the profile.
//
// `checkBasisInvariants` is the minimum check the status function requires of
// a caller that derives without full schema validation (status-function.md,
// "Fields that are not inputs"). `deriveTrustSnapshot` runs it on every bundle
// it derives, because `buildTrustReport` accepts unvalidated input.
//
// These are ports of the `hachure` package's functions of the same names. The
// package is a development dependency only, so Surface carries its own copy;
// tests/schema-v9-basis-fields.test.ts asserts the two agree case by case.

import type { Claim, Evidence, TrustBundle } from "./types.js";
import { SCHEMA_VERSION_BASIS_FIELDS } from "./validation/constants.js";

/** One profile or invariant violation, located by JSON Pointer. */
export interface BasisAnnotationError {
  instancePath: string;
  message: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Check that inconclusive evidence is kept out of derivation, and that the
 * schemaVersion 9 evidence fields are declared:
 *
 * - an evidence item with `inconclusive` has `supportStrength: "cited"` and no
 *   `passing`;
 * - a bundle with an evidence item carrying `inconclusive` or
 *   `collectedByKind` declares `schemaVersion` 9 or later.
 *
 * Returns an empty array when the invariants hold. Not a substitute for
 * schema validation, and not a step of the status function.
 */
export function checkBasisInvariants(bundle: unknown): BasisAnnotationError[] {
  if (!isObject(bundle)) return [{ instancePath: "", message: "bundle must be an object" }];
  if (bundle.evidence === undefined) return [];
  if (!Array.isArray(bundle.evidence)) return [{ instancePath: "/evidence", message: "evidence must be an array" }];

  const errors: BasisAnnotationError[] = [];
  const declares9 = typeof bundle.schemaVersion === "number" && bundle.schemaVersion >= SCHEMA_VERSION_BASIS_FIELDS;
  bundle.evidence.forEach((item: unknown, i: number) => {
    const instancePath = `/evidence/${i}`;
    if (!isObject(item)) {
      errors.push({ instancePath, message: "evidence item must be an object" });
      return;
    }
    const name = `evidence ${JSON.stringify(item.id)}`;
    if (item.inconclusive !== undefined) {
      if (item.supportStrength !== "cited") {
        errors.push({
          instancePath,
          message: `inconclusive ${name} must have supportStrength "cited" (found ${JSON.stringify(item.supportStrength)})`,
        });
      }
      if (item.passing !== undefined) {
        errors.push({ instancePath, message: `inconclusive ${name} must not carry passing` });
      }
    }
    if (!declares9) {
      for (const field of ["inconclusive", "collectedByKind"]) {
        if (item[field] !== undefined) {
          errors.push({
            instancePath,
            message: `${name} carries ${field}, which requires schemaVersion ${SCHEMA_VERSION_BASIS_FIELDS} or later (declared ${JSON.stringify(bundle.schemaVersion)})`,
          });
        }
      }
    }
  });
  return errors;
}

/**
 * Throw when {@link checkBasisInvariants} finds a violation. Derivation entry
 * points that accept unvalidated bundles call this first: an inconclusive item
 * that is entailing would otherwise be counted by the fold, which never reads
 * `inconclusive`.
 */
export function assertBasisInvariants(bundle: unknown): void {
  const errors = checkBasisInvariants(bundle);
  if (errors.length === 0) return;
  throw new Error(
    `Trust bundle fails the schemaVersion 9 evidence invariants: ${errors.map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ")}`,
  );
}

function unknownKeys(object: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(object).filter((key) => !allowed.includes(key));
}

function estimateErrors(claim: Record<string, unknown>, estimate: unknown, path: string): BasisAnnotationError[] {
  if (!isObject(estimate)) return [{ instancePath: path, message: "estimate must be an object" }];
  const errors: BasisAnnotationError[] = [];
  const push = (suffix: string, message: string): void => {
    errors.push({ instancePath: `${path}${suffix}`, message });
  };
  for (const key of unknownKeys(estimate, ["basis", "low", "high"])) push(`/${key}`, "unknown estimate key");
  if (!isNonEmptyString(estimate.basis)) push("/basis", "basis must be a non-empty string");

  const hasLow = estimate.low !== undefined;
  const hasHigh = estimate.high !== undefined;
  if (hasLow !== hasHigh) {
    push("", "low and high must appear together or not at all");
    return errors;
  }
  if (!hasLow) return errors;
  const { low, high } = estimate;
  if (typeof low !== "number" || typeof high !== "number" || !Number.isFinite(low) || !Number.isFinite(high)) {
    push("", "low and high must be finite numbers");
    return errors;
  }
  if (low > high) push("", `low (${low}) must be <= high (${high})`);
  if (typeof claim.value !== "number") {
    push("", "bounds require a numeric claim value");
  } else if (low <= high && (claim.value < low || claim.value > high)) {
    push("", `claim value (${claim.value}) must lie within [${low}, ${high}]`);
  }
  return errors;
}

function sourceOfRecordErrors(sourceOfRecord: unknown, path: string): BasisAnnotationError[] {
  if (!isObject(sourceOfRecord)) return [{ instancePath: path, message: "sourceOfRecord must be an object" }];
  const errors = unknownKeys(sourceOfRecord, ["authorityTraceId"]).map((key) => ({
    instancePath: `${path}/${key}`,
    message: "unknown sourceOfRecord key",
  }));
  if (!isNonEmptyString(sourceOfRecord.authorityTraceId)) {
    errors.push({ instancePath: `${path}/authorityTraceId`, message: "authorityTraceId must be a non-empty string" });
  }
  return errors;
}

/**
 * Shape checks for `claim.metadata.estimate` and
 * `evidence.metadata.sourceOfRecord`. A record that does not use the profile
 * produces no errors. `validateTrustBundle` does not call this: `metadata` is
 * open in the core schemas, and a malformed profile value does not make a
 * bundle invalid. A consumer that displays the profile calls it and treats a
 * malformed value as neither "no annotation" nor a well-formed one.
 */
export function validateBasisAnnotations(bundle: unknown): BasisAnnotationError[] {
  const errors: BasisAnnotationError[] = [];
  const record = isObject(bundle) ? bundle : {};
  (Array.isArray(record.claims) ? record.claims : []).forEach((claim: unknown, i: number) => {
    if (isObject(claim) && isObject(claim.metadata) && claim.metadata.estimate !== undefined) {
      errors.push(...estimateErrors(claim, claim.metadata.estimate, `/claims/${i}/metadata/estimate`));
    }
  });
  (Array.isArray(record.evidence) ? record.evidence : []).forEach((evidence: unknown, i: number) => {
    if (isObject(evidence) && isObject(evidence.metadata) && evidence.metadata.sourceOfRecord !== undefined) {
      errors.push(...sourceOfRecordErrors(evidence.metadata.sourceOfRecord, `/evidence/${i}/metadata/sourceOfRecord`));
    }
  });
  return errors;
}

/** A well-formed `claim.metadata.estimate`. */
export interface ClaimEstimate {
  basis: string;
  low?: number;
  high?: number;
}

/**
 * Read a claim's `metadata.estimate`: `absent` when not declared, `malformed`
 * when present but failing the profile's rules (its bounds must not be shown),
 * otherwise the estimate.
 */
export function readClaimEstimate(
  claim: Pick<Claim, "value" | "metadata">,
): { state: "absent" } | { state: "malformed" } | { state: "estimate"; estimate: ClaimEstimate } {
  const metadata = (claim as { metadata?: unknown }).metadata;
  if (!isObject(metadata) || metadata.estimate === undefined) return { state: "absent" };
  if (estimateErrors(claim as unknown as Record<string, unknown>, metadata.estimate, "").length > 0) return { state: "malformed" };
  const raw = metadata.estimate as Record<string, unknown>;
  const estimate: ClaimEstimate = { basis: raw.basis as string };
  if (raw.low !== undefined) estimate.low = raw.low as number;
  if (raw.high !== undefined) estimate.high = raw.high as number;
  return { state: "estimate", estimate };
}

/** Why a source-of-record reference is not backed (basis-annotations.md). */
export type SourceOfRecordNotBackedReason =
  | "not-declared"
  | "inconclusive"
  | "malformed"
  | "claim-not-found"
  | "collisions-malformed"
  | "trace-collision"
  | "trace-not-found"
  | "trace-ambiguous"
  | "authority-type"
  | "subject-mismatch"
  | "not-active";

type AuthorityTraceRecord = NonNullable<TrustBundle["authorityTrace"]>[number];

export type SourceOfRecordResolution =
  | { backed: true; trace: AuthorityTraceRecord; revokedAt?: string }
  | { backed: false; reason: SourceOfRecordNotBackedReason };

export interface ResolveSourceOfRecordOptions {
  /**
   * When `bundle` is a merge result, the `collisions` `mergeBundlesDetailed`
   * returned. Merge keeps one of two differing traces that share an id, so a
   * reference to a collided trace id may be reading another producer's trace
   * and is not backed. Absent means "not a merge result"; a value that is not
   * a collision list backs nothing.
   */
  collisions?: ReadonlyArray<{ collection: string; id: string }>;
}

/** The collections mergeBundlesDetailed reports collisions for (merge.md §8). */
const COLLISION_COLLECTIONS = ["claims", "evidence", "policies", "events", "claimGroups", "authorityTrace"];

function isCollisionList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((c) => isObject(c) && COLLISION_COLLECTIONS.includes(c.collection as string) && typeof c.id === "string")
  );
}

const subjectKey = (subject: Record<string, unknown>): string => JSON.stringify([subject.subjectType, subject.subjectId]);

const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** The claim's subject, its aliases, and everything `equivalent` links join to them. */
function claimSubjectKeys(claim: Record<string, unknown>, bundle: Record<string, unknown>): Set<string> {
  const keys = new Set([claim, ...list(claim.subjectAliases)].map(subjectKey));
  const links = list(bundle.identityLinks)
    .filter((link) => (link.relation ?? "equivalent") === "equivalent")
    .map((link) => list(link.subjects).map(subjectKey));
  let grew = true;
  while (grew) {
    grew = false;
    for (const link of links) {
      if (!link.some((key) => keys.has(key))) continue;
      for (const key of link) {
        if (!keys.has(key)) {
          keys.add(key);
          grew = true;
        }
      }
    }
  }
  return keys;
}

/** Bound comparison that fails closed: an unparseable bound never passes. */
function boundHolds(bound: unknown, test: (ms: number) => boolean): boolean {
  if (bound === undefined) return true;
  const ms = Date.parse(bound as string);
  return !Number.isNaN(ms) && test(ms);
}

/**
 * Resolve an evidence item's `metadata.sourceOfRecord` against the bundle
 * (basis-annotations.md, "Resolution rules"). Show a source-of-record label
 * only when `backed` is true, and show `revokedAt` with it when set. Malformed
 * input yields a reason, never a throw.
 */
export function resolveSourceOfRecord(
  bundle: Pick<TrustBundle, "claims"> & Partial<Pick<TrustBundle, "authorityTrace" | "identityLinks">>,
  evidence: Evidence,
  options?: ResolveSourceOfRecordOptions,
): SourceOfRecordResolution {
  const fail = (reason: SourceOfRecordNotBackedReason): SourceOfRecordResolution => ({ backed: false, reason });
  const metadata = (evidence as { metadata?: unknown } | null | undefined)?.metadata;
  const sourceOfRecord = isObject(metadata) ? metadata.sourceOfRecord : undefined;
  if (sourceOfRecord === undefined) return fail("not-declared");
  // An attempt that could not run never reached the source.
  if (evidence.inconclusive !== undefined) return fail("inconclusive");
  if (sourceOfRecordErrors(sourceOfRecord, "").length > 0) return fail("malformed");
  const traceId = (sourceOfRecord as { authorityTraceId: string }).authorityTraceId;

  const record = (isObject(bundle) ? bundle : {}) as Record<string, unknown>;
  const claim = list(record.claims).find((c) => c.id === evidence.claimId);
  if (!claim) return fail("claim-not-found");
  const collisions = options?.collisions;
  if (collisions !== undefined && !isCollisionList(collisions)) return fail("collisions-malformed");
  if ((collisions ?? []).some((c) => c.collection === "authorityTrace" && c.id === traceId)) return fail("trace-collision");
  // An id carried by more than one trace does not identify one: fail closed.
  const traces = list(record.authorityTrace).filter((t) => t.id === traceId);
  if (traces.length === 0) return fail("trace-not-found");
  if (traces.length > 1) return fail("trace-ambiguous");
  const trace = traces[0]!;
  if (trace.authorityType !== "system" && trace.authorityType !== "organization") return fail("authority-type");
  if (!isObject(trace.subject) || !claimSubjectKeys(claim, record).has(subjectKey(trace.subject))) {
    return fail("subject-mismatch");
  }

  const at = Date.parse(evidence.observedAt);
  const active =
    !Number.isNaN(at) &&
    boundHolds(trace.revokedAt, (ms) => ms > at) &&
    boundHolds(trace.validFrom, (ms) => ms <= at) &&
    boundHolds(trace.validUntil, (ms) => ms >= at);
  if (!active) return fail("not-active");
  const typed = trace as unknown as AuthorityTraceRecord;
  return trace.revokedAt === undefined ? { backed: true, trace: typed } : { backed: true, trace: typed, revokedAt: trace.revokedAt as string };
}
