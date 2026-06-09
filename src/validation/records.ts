import {
  AUTHORITY_TRACE_KEYS,
  AUTHORITY_TYPES,
  CLAIM_GROUP_KEYS,
  CLAIM_GROUP_KINDS,
  EVIDENCE_METHODS,
  EVIDENCE_TYPES,
  IMPACT_LEVELS,
  INTEGRITY_ANCHOR_KEYS,
  INTEGRITY_ANCHOR_KINDS,
  INTEGRITY_ANCHOR_VERIFICATION_STATUSES,
  REQUIREMENT_KEYS,
  ROLLUP_MODES,
  ROLLUP_POLICY_KEYS,
  VALIDATION_STRATEGY_KEYS,
} from "./constants.js";
import {
  rejectUnknownKeys,
  requireArray,
  requireDateTime,
  requireEnum,
  requireEnumArray,
  requireObject,
  requireString,
  requireStringArray,
} from "./primitives.js";

export function validateAuthorityTrace(trace: unknown): void {
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

export function validateIntegrityAnchor(value: unknown, label: string): void {
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

export function validateClaimGroup(claimGroup: unknown): void {
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
