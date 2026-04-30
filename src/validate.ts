import type { SchemaVersion, TrustInput } from "./types.js";

const SUPPORTED_SCHEMA_VERSIONS = [2, 3] as const;
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
  "subjectAliases",
  "derivedFrom",
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
  "parentType",
  "requiredEvidence",
  "requiredMethods",
  "requiresCorroboration",
  "requiredProof",
  "reviewAuthority",
  "validityRule",
  "stalenessTriggers",
  "conflictRules",
  "impactLevel",
  "incompatibleValues",
  "incompatibleStatuses",
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
  const identityLinks = input.identityLinks === undefined ? undefined : requireArray(input, "identityLinks");

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
    if (claim.subjectAliases !== undefined) {
      const aliases = requireArray(claim, "subjectAliases");
      for (const alias of aliases) {
        requireObject(alias, `claim ${claim.id} subjectAlias`);
        rejectUnknownKeys(alias, new Set(["subjectType", "subjectId"]), `claim ${claim.id} subjectAlias`);
        requireString(alias, "subjectType");
        requireString(alias, "subjectId");
      }
    }
    if (claim.derivedFrom !== undefined) {
      const inputs = requireStringArray(claim, "derivedFrom");
      if (inputs.includes(claim.id as string)) {
        throw new Error(`Claim ${claim.id} cannot list itself in derivedFrom`);
      }
    }
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
    if (policy.parentType !== undefined) requireString(policy, "parentType");
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
    if (policy.incompatibleValues !== undefined) {
      const pairs = requireArray(policy, "incompatibleValues");
      for (const pair of pairs) {
        requireObject(pair, `policy ${policy.id} incompatibleValues entry`);
        rejectUnknownKeys(pair, new Set(["values", "message"]), `policy ${policy.id} incompatibleValues entry`);
        const values = requireArray(pair, "values");
        if (values.length !== 2) throw new Error(`policy ${policy.id} incompatibleValues entry must have exactly two values`);
        if (pair.message !== undefined) requireString(pair, "message");
      }
    }
    if (policy.incompatibleStatuses !== undefined) {
      const pairs = requireArray(policy, "incompatibleStatuses");
      for (const pair of pairs) {
        requireObject(pair, `policy ${policy.id} incompatibleStatuses entry`);
        rejectUnknownKeys(pair, new Set(["statuses", "message"]), `policy ${policy.id} incompatibleStatuses entry`);
        const statuses = requireArray(pair, "statuses");
        if (statuses.length !== 2) throw new Error(`policy ${policy.id} incompatibleStatuses entry must have exactly two statuses`);
        for (const value of statuses) {
          if (typeof value !== "string" || !TRUST_STATUSES.includes(value as (typeof TRUST_STATUSES)[number])) {
            throw new Error(`policy ${policy.id} incompatibleStatuses contains unsupported status: ${String(value)}`);
          }
        }
        if (pair.message !== undefined) requireString(pair, "message");
      }
    }
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

  if (identityLinks !== undefined) {
    for (const link of identityLinks) {
      requireObject(link, "identityLink");
      rejectUnknownKeys(link, new Set(["subjects", "reason", "attestedBy"]), "identityLink");
      const subjects = requireArray(link, "subjects");
      if (subjects.length < 2) throw new Error("identityLink.subjects must contain at least two entries");
      for (const ref of subjects) {
        requireObject(ref, "identityLink.subjects[]");
        rejectUnknownKeys(ref, new Set(["subjectType", "subjectId"]), "identityLink.subjects[]");
        requireString(ref, "subjectType");
        requireString(ref, "subjectId");
      }
      if (link.reason !== undefined) requireString(link, "reason");
      if (link.attestedBy !== undefined) requireString(link, "attestedBy");
    }
  }

  validateReferences({ claims, evidence, policies, events } as TrustInput);

  const result: TrustInput = { schemaVersion, source, claims, evidence, policies, events } as TrustInput;
  if (identityLinks !== undefined) (result as TrustInput).identityLinks = identityLinks as TrustInput["identityLinks"];
  return result;
}

function requireSchemaVersion(input: Record<string, unknown>): SchemaVersion {
  if (!("schemaVersion" in input)) {
    throw new Error(
      "Missing required schemaVersion: expected 2 or 3. See docs/schema-versioning.md for the v1-to-v2 migration.",
    );
  }
  const value = input.schemaVersion;
  if (value !== 2 && value !== 3) {
    throw new Error(
      `Unsupported schemaVersion ${String(value)}: expected 2 or 3. See docs/schema-versioning.md for the v1-to-v2 migration.`,
    );
  }
  return value as SchemaVersion;
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
    if (claim.derivedFrom) {
      for (const inputId of claim.derivedFrom) {
        if (!claimIds.has(inputId)) {
          throw new Error(`Claim ${claim.id} derives from unknown claim ${inputId}`);
        }
      }
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
