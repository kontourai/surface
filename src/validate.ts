import type { TrustInput } from "./types.js";

const CURRENT_SCHEMA_VERSION = 2;
const TRUST_STATUSES = ["unknown", "proposed", "verified", "stale", "disputed", "superseded", "rejected"] as const;
const IMPACT_LEVELS = ["low", "medium", "high", "critical"] as const;
const EVIDENCE_METHODS = [
  "observation",
  "extraction",
  "validation",
  "corroboration",
  "attestation",
  "auditability",
  "anchoring",
  "monitoring",
] as const;
const EVIDENCE_TYPES = [
  "source_excerpt",
  "test_output",
  "human_attestation",
  "calculation_trace",
  "document_citation",
  "crawl_observation",
  "policy_rule",
] as const;
const VALIDITY_KINDS = ["duration", "commit", "historical", "manual"] as const;

const CLAIM_KEYS = new Set([
  "id",
  "subjectType",
  "subjectId",
  "surface",
  "claimType",
  "fieldOrBehavior",
  "value",
  "status",
  "createdAt",
  "updatedAt",
  "impactLevel",
  "currentIntegrityRef",
  "verificationPolicyId",
  "confidenceBasis",
  "metadata",
]);
const EVIDENCE_KEYS = new Set([
  "id",
  "claimId",
  "evidenceType",
  "method",
  "sourceRef",
  "sourceLocator",
  "excerptOrSummary",
  "observedAt",
  "collectedBy",
  "integrityRef",
  "metadata",
]);
const POLICY_KEYS = new Set([
  "id",
  "claimType",
  "requiredEvidence",
  "requiredMethods",
  "requiresCorroboration",
  "requiredProof",
  "reviewAuthority",
  "validityRule",
  "stalenessTriggers",
  "conflictRules",
  "impactLevel",
]);
const EVENT_KEYS = new Set(["id", "claimId", "status", "actor", "method", "evidenceIds", "createdAt", "verifiedAt", "notes"]);

export function validateTrustInput(input: unknown): TrustInput {
  if (!isObject(input)) throw new Error("Trust input must be an object");
  const schemaVersion = requireSchemaVersion(input);
  const source = requireString(input, "source");
  const claims = requireArray(input, "claims");
  const evidence = requireArray(input, "evidence");
  const policies = requireArray(input, "policies");
  const events = requireArray(input, "events");

  for (const claim of claims) {
    requireObject(claim, "claim");
    rejectUnknownKeys(claim, CLAIM_KEYS, `claim ${String(claim.id ?? "")}`);
    for (const field of ["id", "subjectType", "subjectId", "surface", "claimType", "fieldOrBehavior", "createdAt", "updatedAt"]) {
      requireString(claim, field);
    }
    if (!("value" in claim)) throw new Error(`Claim ${claim.id} is missing value`);
    requireDateTime(claim, "createdAt");
    requireDateTime(claim, "updatedAt");
    if (claim.status !== undefined) requireEnum(claim, "status", TRUST_STATUSES);
    if (claim.impactLevel !== undefined) requireEnum(claim, "impactLevel", IMPACT_LEVELS);
    if (claim.currentIntegrityRef !== undefined) requireString(claim, "currentIntegrityRef");
    if (claim.verificationPolicyId !== undefined) requireString(claim, "verificationPolicyId");
    if (claim.confidenceBasis !== undefined) requireObject(claim.confidenceBasis, "claim.confidenceBasis");
    if (claim.metadata !== undefined) requireObject(claim.metadata, "claim.metadata");
  }

  for (const item of evidence) {
    requireObject(item, "evidence");
    rejectUnknownKeys(item, EVIDENCE_KEYS, `evidence ${String(item.id ?? "")}`);
    for (const field of ["id", "claimId", "evidenceType"]) {
      requireString(item, field);
    }
    requireEvidenceMethod(item);
    for (const field of ["sourceRef", "excerptOrSummary", "observedAt", "collectedBy"]) {
      requireString(item, field);
    }
    requireEnum(item, "evidenceType", EVIDENCE_TYPES);
    requireEnum(item, "method", EVIDENCE_METHODS);
    requireDateTime(item, "observedAt");
    if (item.sourceLocator !== undefined) requireString(item, "sourceLocator");
    if (item.integrityRef !== undefined) requireString(item, "integrityRef");
    if (item.metadata !== undefined) requireObject(item.metadata, "evidence.metadata");
  }

  for (const policy of policies) {
    requireObject(policy, "policy");
    rejectUnknownKeys(policy, POLICY_KEYS, `policy ${String(policy.id ?? "")}`);
    for (const field of ["id", "claimType", "reviewAuthority", "impactLevel"]) {
      requireString(policy, field);
    }
    requireEnum(policy, "impactLevel", IMPACT_LEVELS);
    requireEnumArray(policy, "requiredEvidence", EVIDENCE_TYPES);
    if (policy.requiredMethods !== undefined) requireEnumArray(policy, "requiredMethods", EVIDENCE_METHODS);
    if (policy.requiresCorroboration !== undefined && typeof policy.requiresCorroboration !== "boolean") {
      throw new Error(`policy ${policy.id} requiresCorroboration must be a boolean`);
    }
    requireStringArray(policy, "requiredProof");
    requireObject(policy.validityRule, "policy.validityRule");
    rejectUnknownKeys(policy.validityRule, new Set(["kind", "durationDays"]), `policy ${policy.id} validityRule`);
    requireEnum(policy.validityRule, "kind", VALIDITY_KINDS);
    if (policy.validityRule.durationDays !== undefined && typeof policy.validityRule.durationDays !== "number") {
      throw new Error(`policy ${policy.id} validityRule.durationDays must be a number`);
    }
    requireStringArray(policy, "stalenessTriggers");
    requireStringArray(policy, "conflictRules");
  }

  for (const event of events) {
    requireObject(event, "event");
    rejectUnknownKeys(event, EVENT_KEYS, `event ${String(event.id ?? "")}`);
    for (const field of ["id", "claimId", "status", "actor", "method", "createdAt"]) {
      requireString(event, field);
    }
    requireEnum(event, "status", TRUST_STATUSES);
    requireStringArray(event, "evidenceIds");
    requireDateTime(event, "createdAt");
    if (event.verifiedAt !== undefined) requireDateTime(event, "verifiedAt");
    if (event.notes !== undefined) requireString(event, "notes");
  }

  validateReferences({ claims, evidence, policies, events } as TrustInput);

  return { schemaVersion, source, claims, evidence, policies, events } as TrustInput;
}

function requireSchemaVersion(input: Record<string, unknown>): 2 {
  if (!("schemaVersion" in input)) {
    throw new Error("Missing required schemaVersion: expected schemaVersion: 2. See docs/schema-versioning.md for the v1-to-v2 migration.");
  }
  if (input.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion ${String(input.schemaVersion)}: expected schemaVersion: 2. See docs/schema-versioning.md for the v1-to-v2 migration.`);
  }
  return CURRENT_SCHEMA_VERSION;
}

function requireEvidenceMethod(evidence: Record<string, unknown>): void {
  if (typeof evidence.method === "string" && evidence.method.length > 0) return;
  const evidenceId = typeof evidence.id === "string" && evidence.id.length > 0 ? evidence.id : "<unknown>";
  throw new Error(
    `Evidence ${evidenceId} is missing required method. Add one of: ${EVIDENCE_METHODS.join(", ")}. See docs/schema-versioning.md for the v1-to-v2 migration.`,
  );
}

function validateReferences(input: TrustInput): void {
  const claimIds = new Set(input.claims.map((claim) => claim.id));
  const evidenceIds = new Set(input.evidence.map((evidence) => evidence.id));
  const policyIds = new Set(input.policies.map((policy) => policy.id));

  for (const claim of input.claims) {
    if (claim.verificationPolicyId && !policyIds.has(claim.verificationPolicyId)) {
      throw new Error(`Claim ${claim.id} references unknown policy ${claim.verificationPolicyId}`);
    }
  }

  for (const item of input.evidence) {
    if (!claimIds.has(item.claimId)) {
      throw new Error(`Evidence ${item.id} references unknown claim ${item.claimId}`);
    }
  }

  for (const event of input.events) {
    if (!claimIds.has(event.claimId)) {
      throw new Error(`Event ${event.id} references unknown claim ${event.claimId}`);
    }
    for (const evidenceId of event.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new Error(`Event ${event.id} references unknown evidence ${evidenceId}`);
      }
    }
  }
}

function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
}

function requireString(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required string field: ${field}`);
  return value;
}

function requireArray(object: Record<string, unknown>, field: string): unknown[] {
  const value = object[field];
  if (!Array.isArray(value)) throw new Error(`Missing required array field: ${field}`);
  return value;
}

function requireStringArray(object: Record<string, unknown>, field: string): string[] {
  const values = requireArray(object, field);
  if (!values.every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  return values as string[];
}

function requireEnumArray<T extends readonly string[]>(object: Record<string, unknown>, field: string, allowed: T): Array<T[number]> {
  const values = requireStringArray(object, field);
  for (const value of values) {
    if (!allowed.includes(value)) throw new Error(`${field} contains unsupported value: ${value}`);
  }
  return values as Array<T[number]>;
}

function requireEnum<T extends readonly string[]>(object: Record<string, unknown>, field: string, allowed: T): T[number] {
  const value = requireString(object, field);
  if (!allowed.includes(value)) throw new Error(`${field} contains unsupported value: ${value}`);
  return value;
}

function requireDateTime(object: Record<string, unknown>, field: string): void {
  const value = requireString(object, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-8601 UTC date-time`);
  }
}

function rejectUnknownKeys(object: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
