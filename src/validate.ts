import type { SchemaVersion, TrustInput } from "./types.js";

const SUPPORTED_SCHEMA_VERSIONS = [2, 3] as const;
const TRUST_STATUSES = ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected"] as const;
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
  "attestation",
  "calculation_trace",
  "document_citation",
  "crawl_observation",
  "policy_rule",
] as const;
const VALIDITY_KINDS = ["duration", "commit", "historical", "manual"] as const;
const AUTHORITY_TYPES = ["role", "permission", "credential", "system", "organization", "policy", "other"] as const;
const DERIVATION_METHODS = ["sum", "max", "min", "model", "rule-application", "copy", "normalization", "manual"] as const;
const SUPPORT_STRENGTHS = ["weak", "moderate", "strong"] as const;
const EVIDENCE_SUPPORT_STRENGTHS = ["cited", "entails"] as const;
const INTEGRITY_ANCHOR_KINDS = ["hash", "signature", "transparency_log", "timestamp", "external_ref", "other"] as const;
const INTEGRITY_ANCHOR_VERIFICATION_STATUSES = ["unverified", "verified", "failed", "not_applicable"] as const;
const INTEGRITY_ANCHOR_KEYS = new Set([
  "id",
  "kind",
  "algorithm",
  "value",
  "sourceRef",
  "observedAt",
  "verificationStatus",
  "verifiedAt",
  "verifiedBy",
  "metadata",
]);

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
  "currentIntegrityAnchor",
  "verificationPolicyId",
  "confidenceBasis",
  "subjectAliases",
  "derivedFrom",
  "derivationEdges",
  "metadata",
]);
const DERIVATION_EDGE_KEYS = new Set(["inputClaimId", "method", "role", "supportStrength", "rationale", "metadata"]);
const EVIDENCE_KEYS = new Set([
  "id",
  "claimId",
  "supportStrength",
  "evidenceType",
  "method",
  "sourceRef",
  "sourceLocator",
  "excerptOrSummary",
  "observedAt",
  "collectedBy",
  "integrityRef",
  "integrityAnchor",
  "passing",
  "blocking",
  "metadata",
]);
const POLICY_KEYS = new Set([
  "id",
  "claimType",
  "parentType",
  "requiredEvidence",
  "requiredMethods",
  "requiresCorroboration",
  "acceptanceCriteria",
  "reviewAuthority",
  "validityRule",
  "stalenessTriggers",
  "conflictRules",
  "impactLevel",
  "incompatibleValues",
  "incompatibleStatuses",
]);
const EVENT_KEYS = new Set(["id", "claimId", "status", "actor", "method", "evidenceIds", "createdAt", "verifiedAt", "notes"]);
const CLAIM_GROUP_KEYS = new Set(["id", "title", "kind", "description", "claimIds", "requirements", "rollupPolicy", "metadata"]);
const REQUIREMENT_KEYS = new Set(["id", "title", "claimIds", "required", "severity", "validationStrategy", "metadata"]);
const ROLLUP_POLICY_KEYS = new Set(["mode", "requiredRequirementIds", "optionalRequirementIds"]);
const VALIDATION_STRATEGY_KEYS = new Set([
  "requiredEvidence",
  "requiredMethods",
  "requiresCorroboration",
  "acceptanceCriteria",
  "reviewAuthority",
  "notes",
  "metadata",
]);
const AUTHORITY_TRACE_KEYS = new Set([
  "id",
  "subject",
  "actorRef",
  "authorityType",
  "authorityRef",
  "sourceRef",
  "observedAt",
  "evidenceIds",
  "claimIds",
  "validFrom",
  "validUntil",
  "revokedAt",
  "integrityRef",
  "integrityAnchor",
  "metadata",
]);
const CLAIM_GROUP_KINDS = ["claimGroup", "framework", "requirement-set"] as const;
const ROLLUP_MODES = ["all-required", "any-required"] as const;

export function validateTrustInput(input: unknown): TrustInput {
  if (!isObject(input)) throw new Error("Trust input must be an object");
  const schemaVersion = requireSchemaVersion(input);
  const source = requireString(input, "source");
  const claims = requireArray(input, "claims");
  const evidence = requireArray(input, "evidence");
  const policies = requireArray(input, "policies");
  const events = requireArray(input, "events");
  const identityLinks = input.identityLinks === undefined ? undefined : requireArray(input, "identityLinks");
  const claimGroups = input.claimGroups === undefined ? undefined : requireArray(input, "claimGroups");
  const authorityTrace = input.authorityTrace === undefined ? undefined : requireArray(input, "authorityTrace");

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
    if (claim.currentIntegrityAnchor !== undefined) validateIntegrityAnchor(claim.currentIntegrityAnchor, `claim ${claim.id} currentIntegrityAnchor`);
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
    if (claim.derivationEdges !== undefined) {
      const edges = requireArray(claim, "derivationEdges");
      for (const edge of edges) {
        requireObject(edge, `claim ${claim.id} derivationEdge`);
        rejectUnknownKeys(edge, DERIVATION_EDGE_KEYS, `claim ${claim.id} derivationEdge`);
        const inputClaimId = requireString(edge, "inputClaimId");
        if (inputClaimId === claim.id) {
          throw new Error(`Claim ${claim.id} cannot list itself in derivationEdges`);
        }
        if (edge.method !== undefined) requireEnum(edge, "method", DERIVATION_METHODS);
        if (edge.role !== undefined) requireString(edge, "role");
        if (edge.supportStrength !== undefined) requireEnum(edge, "supportStrength", SUPPORT_STRENGTHS);
        if (edge.rationale !== undefined) requireString(edge, "rationale");
        if (edge.metadata !== undefined) requireObject(edge.metadata, "derivationEdge.metadata");
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
    if (item.supportStrength !== undefined) requireEvidenceSupportStrength(item);
    requireDateTime(item, "observedAt");
    if (item.sourceLocator !== undefined) requireString(item, "sourceLocator");
    if (item.integrityRef !== undefined) requireString(item, "integrityRef");
    if (item.integrityAnchor !== undefined) validateIntegrityAnchor(item.integrityAnchor, `evidence ${item.id} integrityAnchor`);
    if (item.passing !== undefined && typeof item.passing !== "boolean") {
      throw new Error(`Evidence ${item.id} passing must be a boolean`);
    }
    if (item.blocking !== undefined && typeof item.blocking !== "boolean") {
      throw new Error(`Evidence ${item.id} blocking must be a boolean`);
    }
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
    requireStringArray(policy, "acceptanceCriteria");
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

  if (claimGroups !== undefined) {
    for (const claimGroup of claimGroups) {
      validateClaimGroup(claimGroup);
    }
  }

  if (authorityTrace !== undefined) {
    for (const trace of authorityTrace) {
      validateAuthorityTrace(trace);
    }
  }

  validateReferences({ claims, evidence, policies, events, claimGroups, authorityTrace } as TrustInput);

  const result: TrustInput = { schemaVersion, source, claims, evidence, policies, events } as TrustInput;
  if (identityLinks !== undefined) (result as TrustInput).identityLinks = identityLinks as TrustInput["identityLinks"];
  if (claimGroups !== undefined) (result as TrustInput).claimGroups = claimGroups as TrustInput["claimGroups"];
  if (authorityTrace !== undefined) (result as TrustInput).authorityTrace = authorityTrace as TrustInput["authorityTrace"];
  return result;
}

function validateAuthorityTrace(trace: unknown): void {
  requireObject(trace, "authorityTrace");
  rejectUnknownKeys(trace, AUTHORITY_TRACE_KEYS, `authorityTrace ${String(trace.id ?? "")}`);
  for (const field of ["id", "actorRef", "authorityType", "authorityRef", "sourceRef", "observedAt"]) requireString(trace, field);
  requireObject(trace.subject, `authorityTrace ${trace.id} subject`);
  rejectUnknownKeys(trace.subject, new Set(["subjectType", "subjectId"]), `authorityTrace ${trace.id} subject`);
  requireString(trace.subject, "subjectType");
  requireString(trace.subject, "subjectId");
  requireEnum(trace, "authorityType", AUTHORITY_TYPES);
  requireDateTime(trace, "observedAt");
  if (trace.evidenceIds !== undefined) requireStringArray(trace, "evidenceIds");
  if (trace.claimIds !== undefined) requireStringArray(trace, "claimIds");
  if (trace.validFrom !== undefined) requireDateTime(trace, "validFrom");
  if (trace.validUntil !== undefined) requireDateTime(trace, "validUntil");
  if (trace.revokedAt !== undefined) requireDateTime(trace, "revokedAt");
  if (trace.integrityRef !== undefined) requireString(trace, "integrityRef");
  if (trace.integrityAnchor !== undefined) validateIntegrityAnchor(trace.integrityAnchor, `authorityTrace ${trace.id} integrityAnchor`);
  if (trace.metadata !== undefined) requireObject(trace.metadata, "authorityTrace.metadata");
}

function validateIntegrityAnchor(value: unknown, label: string): void {
  requireObject(value, label);
  rejectUnknownKeys(value, INTEGRITY_ANCHOR_KEYS, label);
  for (const field of ["id", "algorithm", "value", "sourceRef"]) requireString(value, field);
  requireEnum(value, "kind", INTEGRITY_ANCHOR_KINDS);
  if (value.observedAt !== undefined) requireDateTime(value, "observedAt");
  if (value.verificationStatus !== undefined) requireEnum(value, "verificationStatus", INTEGRITY_ANCHOR_VERIFICATION_STATUSES);
  if (value.verifiedAt !== undefined) requireDateTime(value, "verifiedAt");
  if (value.verifiedBy !== undefined) requireString(value, "verifiedBy");
  if (value.metadata !== undefined) requireObject(value.metadata, `${label}.metadata`);
}

function validateClaimGroup(claimGroup: unknown): void {
  requireObject(claimGroup, "claimGroup");
  rejectUnknownKeys(claimGroup, CLAIM_GROUP_KEYS, `claimGroup ${String(claimGroup.id ?? "")}`);
  for (const field of ["id", "title", "kind"]) requireString(claimGroup, field);
  requireEnum(claimGroup, "kind", CLAIM_GROUP_KINDS);
  if (claimGroup.description !== undefined) requireString(claimGroup, "description");
  if (claimGroup.claimIds !== undefined) requireStringArray(claimGroup, "claimIds");
  if (claimGroup.metadata !== undefined) requireObject(claimGroup.metadata, "claimGroup.metadata");
  if (claimGroup.requirements !== undefined) {
    const requirements = requireArray(claimGroup, "requirements");
    for (const requirement of requirements) {
      requireObject(requirement, `claimGroup ${claimGroup.id} requirement`);
      rejectUnknownKeys(requirement, REQUIREMENT_KEYS, `claimGroup ${claimGroup.id} requirement ${String(requirement.id ?? "")}`);
      for (const field of ["id", "title"]) requireString(requirement, field);
      requireStringArray(requirement, "claimIds");
      if (requirement.required !== undefined && typeof requirement.required !== "boolean") {
        throw new Error(`claimGroup ${claimGroup.id} requirement ${requirement.id} required must be a boolean`);
      }
      if (requirement.severity !== undefined) requireEnum(requirement, "severity", IMPACT_LEVELS);
      if (requirement.validationStrategy !== undefined) validateValidationStrategy(requirement.validationStrategy, `claimGroup ${claimGroup.id} requirement ${requirement.id}`);
      if (requirement.metadata !== undefined) requireObject(requirement.metadata, "requirement.metadata");
    }
  }
  if (claimGroup.rollupPolicy !== undefined) {
    requireObject(claimGroup.rollupPolicy, `claimGroup ${claimGroup.id} rollupPolicy`);
    rejectUnknownKeys(claimGroup.rollupPolicy, ROLLUP_POLICY_KEYS, `claimGroup ${claimGroup.id} rollupPolicy`);
    requireEnum(claimGroup.rollupPolicy, "mode", ROLLUP_MODES);
    if (claimGroup.rollupPolicy.requiredRequirementIds !== undefined) requireStringArray(claimGroup.rollupPolicy, "requiredRequirementIds");
    if (claimGroup.rollupPolicy.optionalRequirementIds !== undefined) requireStringArray(claimGroup.rollupPolicy, "optionalRequirementIds");
  }
}

function validateValidationStrategy(value: unknown, label: string): void {
  requireObject(value, `${label} validationStrategy`);
  rejectUnknownKeys(value, VALIDATION_STRATEGY_KEYS, `${label} validationStrategy`);
  if (value.requiredEvidence !== undefined) requireEnumArray(value, "requiredEvidence", EVIDENCE_TYPES);
  if (value.requiredMethods !== undefined) requireEnumArray(value, "requiredMethods", EVIDENCE_METHODS);
  if (value.requiresCorroboration !== undefined && typeof value.requiresCorroboration !== "boolean") {
    throw new Error(`${label} validationStrategy requiresCorroboration must be a boolean`);
  }
  if (value.acceptanceCriteria !== undefined) requireStringArray(value, "acceptanceCriteria");
  if (value.reviewAuthority !== undefined) requireString(value, "reviewAuthority");
  if (value.notes !== undefined) requireString(value, "notes");
  if (value.metadata !== undefined) requireObject(value.metadata, `${label} validationStrategy.metadata`);
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
    if (claim.derivationEdges) {
      for (const edge of claim.derivationEdges) {
        if (!claimIds.has(edge.inputClaimId)) {
          throw new Error(`Claim ${claim.id} derives from unknown claim ${edge.inputClaimId}`);
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

  for (const claimGroup of input.claimGroups ?? []) {
    for (const claimId of claimGroup.claimIds ?? []) {
      if (!claimIds.has(claimId)) {
        throw new Error(`Claim group ${claimGroup.id} references unknown claim ${claimId}`);
      }
    }
    const requirementIds = new Set((claimGroup.requirements ?? []).map((requirement) => requirement.id));
    for (const requirement of claimGroup.requirements ?? []) {
      for (const claimId of requirement.claimIds) {
        if (!claimIds.has(claimId)) {
          throw new Error(`Claim group ${claimGroup.id} requirement ${requirement.id} references unknown claim ${claimId}`);
        }
      }
    }
    for (const requirementId of claimGroup.rollupPolicy?.requiredRequirementIds ?? []) {
      if (!requirementIds.has(requirementId)) throw new Error(`Claim group ${claimGroup.id} rollupPolicy references unknown requirement ${requirementId}`);
    }
    for (const requirementId of claimGroup.rollupPolicy?.optionalRequirementIds ?? []) {
      if (!requirementIds.has(requirementId)) throw new Error(`Claim group ${claimGroup.id} rollupPolicy references unknown requirement ${requirementId}`);
    }
  }

  for (const trace of input.authorityTrace ?? []) {
    for (const claimId of trace.claimIds ?? []) {
      if (!claimIds.has(claimId)) {
        throw new Error(`Authority trace ${trace.id} references unknown claim ${claimId}`);
      }
    }
    for (const evidenceId of trace.evidenceIds ?? []) {
      if (!evidenceIds.has(evidenceId)) {
        throw new Error(`Authority trace ${trace.id} references unknown evidence ${evidenceId}`);
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

function requireEvidenceSupportStrength(evidence: Record<string, unknown>): void {
  const value = requireString(evidence, "supportStrength");
  if (!EVIDENCE_SUPPORT_STRENGTHS.includes(value as (typeof EVIDENCE_SUPPORT_STRENGTHS)[number])) {
    throw new Error(`Evidence ${String(evidence.id ?? "")} supportStrength contains unsupported value: ${value}`);
  }
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
