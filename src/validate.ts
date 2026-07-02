import type { TrustBundle } from "./types.js";
import {
  CLAIM_KEYS,
  DERIVATION_EDGE_KEYS,
  DERIVATION_METHODS,
  EVIDENCE_KEYS,
  EXECUTION_KEYS,
  EVIDENCE_METHODS,
  EVIDENCE_TYPES,
  EVENT_KEYS,
  EVENT_TYPES,
  IMPACT_LEVELS,
  MATERIALITY_LEVELS,
  POLICY_KEYS,
  SUPPORT_STRENGTHS,
  TRUST_STATUSES,
  VALIDITY_KINDS,
} from "./validation/constants.js";
import {
  isObject,
  rejectUnknownKeys,
  requireArray,
  requireDateTime,
  requireEnum,
  requireEnumArray,
  requireEvidenceMethod,
  requireEvidenceSupportStrength,
  requireObject,
  requireSchemaVersion,
  requireString,
  requireStringArray,
} from "./validation/primitives.js";
import { validateReferences } from "./validation/references.js";
import { validateAuthorityTrace, validateClaimGroup, validateIntegrityAnchor } from "./validation/records.js";

export function validateTrustBundle(input: unknown): TrustBundle {
  if (!isObject(input)) throw new Error("Trust bundle must be an object");
  const schemaVersion = requireSchemaVersion(input);
  const source = requireString(input, "source");
  // Optional stable producer identity (hachure merge.md §2). requireString
  // already rejects empty strings, matching the "minLength 1 when present" rule
  // used for every other optional string field in this validator.
  const producerId = input.producerId === undefined ? undefined : requireString(input, "producerId");
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
    if (claim.qualifiers !== undefined) {
      requireObject(claim.qualifiers, "claim.qualifiers");
      for (const [k, v] of Object.entries(claim.qualifiers as Record<string, unknown>)) {
        if (typeof v !== "string") throw new Error(`Claim ${claim.id} qualifier ${k} must be a string`);
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

  if (identityLinks !== undefined) {
    for (const link of identityLinks) {
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

  validateReferences({ claims, evidence, policies, events, claimGroups, authorityTrace } as TrustBundle);

  const result: TrustBundle = { schemaVersion, source, claims, evidence, policies, events } as TrustBundle;
  if (producerId !== undefined) (result as TrustBundle).producerId = producerId;
  if (identityLinks !== undefined) (result as TrustBundle).identityLinks = identityLinks as TrustBundle["identityLinks"];
  if (claimGroups !== undefined) (result as TrustBundle).claimGroups = claimGroups as TrustBundle["claimGroups"];
  if (authorityTrace !== undefined) (result as TrustBundle).authorityTrace = authorityTrace as TrustBundle["authorityTrace"];
  return result;
}
