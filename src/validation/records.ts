import {
  AUTHORITY_TRACE_KEYS,
  AUTHORITY_TYPES,
  CLAIM_GROUP_KEYS,
  CLAIM_GROUP_KINDS,
  CLAIM_KEYS,
  DERIVATION_EDGE_KEYS,
  DERIVATION_EDGE_SENSITIVITY_KEYS,
  DERIVATION_METHODS,
  EVENT_KEYS,
  EVENT_TYPES,
  EVIDENCE_KEYS,
  EVIDENCE_METHODS,
  EVIDENCE_TYPES,
  EXECUTION_KEYS,
  IMPACT_LEVELS,
  INTEGRITY_ANCHOR_KEYS,
  INTEGRITY_ANCHOR_KINDS,
  INTEGRITY_ANCHOR_VERIFICATION_STATUSES,
  MATERIALITY_LEVELS,
  POLICY_KEYS,
  REQUIREMENT_KEYS,
  ROLLUP_MODES,
  ROLLUP_POLICY_KEYS,
  SUPPORT_STRENGTHS,
  TRUST_STATUSES,
  VALIDATION_STRATEGY_KEYS,
  VALIDITY_KINDS,
} from "./constants.js";
import {
  rejectUnknownKeys,
  requireArray,
  requireDateTime,
  requireEnum,
  requireEnumArray,
  requireEvidenceMethod,
  requireEvidenceSupportStrength,
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

export function validateClaim(claim: unknown): void {
  requireObject(claim, "claim");
  rejectUnknownKeys(claim, CLAIM_KEYS, `claim ${String(claim.id ?? "")}`);
  for (const field of ["id", "subjectType", "subjectId", "claimType", "fieldOrBehavior", "createdAt", "updatedAt"]) {
    requireString(claim, field);
  }
  // facet (Hachure schemaVersion 5, renamed from `surface`) is optional. When
  // present it must be a non-empty string, same rule as every other optional
  // string field below. A legacy `surface` value was already mapped onto
  // `facet` (on a non-mutating copy) and stripped by
  // `normalizeClaimFacetForRead` above, before this claim ever entered the
  // loop — there is nothing left to shim here.
  if (claim.facet !== undefined) requireString(claim, "facet");
  if (!("value" in claim)) throw new Error(`Claim ${claim.id} is missing value`);
  requireDateTime(claim, "createdAt");
  requireDateTime(claim, "updatedAt");
  if (claim.expiresAt !== undefined) requireDateTime(claim, "expiresAt");
  if (claim.ttlSeconds !== undefined) {
    if (typeof claim.ttlSeconds !== "number" || !Number.isFinite(claim.ttlSeconds) || claim.ttlSeconds < 0) {
      throw new Error(`Claim ${claim.id} ttlSeconds must be a non-negative number`);
    }
  }
  if (claim.status !== undefined) requireEnum(claim, "status", TRUST_STATUSES);
  if (claim.impactLevel !== undefined) requireEnum(claim, "impactLevel", IMPACT_LEVELS);
  if (claim.materiality !== undefined) requireEnum(claim, "materiality", MATERIALITY_LEVELS);
  if (claim.currentIntegrityRef !== undefined) requireString(claim, "currentIntegrityRef");
  if (claim.currentIntegrityAnchor !== undefined) validateIntegrityAnchor(claim.currentIntegrityAnchor, `claim ${claim.id} currentIntegrityAnchor`);
  if (claim.verificationPolicyId !== undefined) requireString(claim, "verificationPolicyId");
  if (claim.confidenceBasis !== undefined) requireObject(claim.confidenceBasis, "claim.confidenceBasis");
  // Calibrated conclusion confidence is carried, not derived; the vendored JSON
  // schema validates its shape, so the runtime check only asserts it is an object.
  if (claim.conclusionConfidence !== undefined) requireObject(claim.conclusionConfidence, "claim.conclusionConfidence");
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
      if (edge.sensitivity !== undefined) {
        const sensitivity = edge.sensitivity;
        requireObject(sensitivity, `claim ${claim.id} derivationEdge sensitivity`);
        rejectUnknownKeys(sensitivity, DERIVATION_EDGE_SENSITIVITY_KEYS, `claim ${claim.id} derivationEdge sensitivity`);
        for (const bound of ["low", "high"] as const) {
          if (typeof sensitivity[bound] !== "number" || !Number.isFinite(sensitivity[bound] as number)) {
            throw new Error(`Claim ${claim.id} derivationEdge sensitivity.${bound} must be a number`);
          }
        }
        requireString(sensitivity, "basis");
      }
      if (edge.metadata !== undefined) requireObject(edge.metadata, "derivationEdge.metadata");
    }
  }
  if (claim.qualifiers !== undefined) {
    requireObject(claim.qualifiers, "claim.qualifiers");
    for (const [k, v] of Object.entries(claim.qualifiers as Record<string, unknown>)) {
      if (typeof v !== "string") throw new Error(`Claim ${claim.id} qualifier ${k} must be a string`);
    }
  }
  if (claim.metadata !== undefined) requireObject(claim.metadata, "claim.metadata");
}

export function validateEvidence(item: unknown): void {
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
  if (item.execution !== undefined) {
    requireObject(item.execution, `evidence ${String(item.id ?? "")} execution`);
    const execution = item.execution as Record<string, unknown>;
    rejectUnknownKeys(execution, EXECUTION_KEYS, `evidence ${String(item.id ?? "")} execution`);
    if (execution.runner !== "bash" && execution.runner !== "mcp") {
      throw new Error(`Evidence ${item.id} execution.runner must be "bash" or "mcp"`);
    }
    if (typeof execution.label !== "string" || execution.label.length === 0) {
      throw new Error(`Evidence ${item.id} execution.label must be a non-empty string`);
    }
    if (execution.exitCode !== undefined && !Number.isInteger(execution.exitCode)) {
      throw new Error(`Evidence ${item.id} execution.exitCode must be an integer`);
    }
    if (execution.isError !== undefined && typeof execution.isError !== "boolean") {
      throw new Error(`Evidence ${item.id} execution.isError must be a boolean`);
    }
    if (execution.durationMs !== undefined && typeof execution.durationMs !== "number") {
      throw new Error(`Evidence ${item.id} execution.durationMs must be a number`);
    }
    if (execution.metadata !== undefined) requireObject(execution.metadata, "evidence.execution.metadata");
  }
  if (item.metadata !== undefined) requireObject(item.metadata, "evidence.metadata");
}

export function validatePolicy(policy: unknown): void {
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

export function validateEvent(event: unknown): void {
  requireObject(event, "event");
  rejectUnknownKeys(event, EVENT_KEYS, `event ${String(event.id ?? "")}`);
  for (const field of ["id", "claimId", "status", "actor", "method", "createdAt"]) {
    requireString(event, field);
  }
  requireEnum(event, "status", TRUST_STATUSES);
  if (event.type !== undefined) requireEnum(event, "type", EVENT_TYPES);
  requireStringArray(event, "evidenceIds");
  requireDateTime(event, "createdAt");
  if (event.verifiedAt !== undefined) requireDateTime(event, "verifiedAt");
  if (event.notes !== undefined) requireString(event, "notes");
  if (event.resolvesDispute !== undefined && event.resolvesDispute !== true) {
    throw new Error(`event ${String(event.id)} resolvesDispute must be true when present`);
  }
  if (event.authorityRef !== undefined) requireString(event, "authorityRef");
}

export function validateIdentityLink(link: unknown): void {
  requireObject(link, "identityLink");
  rejectUnknownKeys(link, new Set(["id", "subjects", "reason", "attestedBy", "relation", "conversion", "mappingClaimId"]), "identityLink");
  const subjects = requireArray(link, "subjects");
  if (subjects.length < 2) throw new Error("identityLink.subjects must contain at least two entries");
  for (const ref of subjects) {
    requireObject(ref, "identityLink.subjects[]");
    rejectUnknownKeys(ref, new Set(["subjectType", "subjectId"]), "identityLink.subjects[]");
    requireString(ref, "subjectType");
    requireString(ref, "subjectId");
  }
  if (link.id !== undefined) requireString(link, "id");
  if (link.reason !== undefined) requireString(link, "reason");
  if (link.attestedBy !== undefined) requireString(link, "attestedBy");
  if (link.relation !== undefined) {
    const validRelations = ["equivalent", "subsumes", "converts"];
    if (!validRelations.includes(link.relation as string)) {
      throw new Error("identityLink.relation must be 'equivalent', 'subsumes', or 'converts'");
    }
  }
  if (link.conversion !== undefined) {
    requireObject(link.conversion, "identityLink.conversion");
    rejectUnknownKeys(link.conversion as Record<string, unknown>, new Set(["factor", "offset", "note"]), "identityLink.conversion");
    if ((link.conversion as Record<string, unknown>).factor !== undefined && typeof (link.conversion as Record<string, unknown>).factor !== "number") {
      throw new Error("identityLink.conversion.factor must be a number");
    }
    if ((link.conversion as Record<string, unknown>).offset !== undefined && typeof (link.conversion as Record<string, unknown>).offset !== "number") {
      throw new Error("identityLink.conversion.offset must be a number");
    }
    if ((link.conversion as Record<string, unknown>).note !== undefined && typeof (link.conversion as Record<string, unknown>).note !== "string") {
      throw new Error("identityLink.conversion.note must be a string");
    }
  }
  if (link.mappingClaimId !== undefined) requireString(link, "mappingClaimId");
}
