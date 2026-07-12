export const TRUST_STATUSES = ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected", "revoked"] as const;
export const EVENT_TYPES = ["verification", "invalidation"] as const;
export const IMPACT_LEVELS = ["low", "medium", "high", "critical"] as const;
export const MATERIALITY_LEVELS = ["low", "medium", "high"] as const;
export const EVIDENCE_METHODS = [
  "observation",
  "extraction",
  "validation",
  "corroboration",
  "attestation",
  "auditability",
  "anchoring",
  "monitoring",
] as const;
export const EVIDENCE_TYPES = [
  "source_excerpt",
  "test_output",
  "human_attestation",
  "attestation",
  "calculation_trace",
  "document_citation",
  "crawl_observation",
  "policy_rule",
] as const;
export const VALIDITY_KINDS = ["duration", "commit", "historical", "manual"] as const;
export const AUTHORITY_TYPES = ["role", "permission", "credential", "system", "organization", "policy", "other"] as const;
export const DERIVATION_METHODS = ["sum", "max", "min", "model", "rule-application", "copy", "normalization", "manual"] as const;
export const SUPPORT_STRENGTHS = ["weak", "moderate", "strong"] as const;
export const EVIDENCE_SUPPORT_STRENGTHS = ["cited", "entails"] as const;
export const INTEGRITY_ANCHOR_KINDS = ["hash", "signature", "transparency_log", "timestamp", "external_ref", "other"] as const;
export const INTEGRITY_ANCHOR_VERIFICATION_STATUSES = ["unverified", "verified", "failed", "not_applicable"] as const;

export const INTEGRITY_ANCHOR_KEYS = new Set([
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

export const CLAIM_KEYS = new Set([
  "id",
  "subjectType",
  "subjectId",
  "facet",
  // TOLERANCE SHIM (owner-ratified, one release, hachure facet rename):
  // `surface` is the pre-0.9.0 name for `facet`. Kept allowed (not required)
  // here so legacy bundles don't fail rejectUnknownKeys; validate.ts's
  // read-tolerance shim maps its value onto `facet` and strips it before the
  // bundle is returned — `surface` is never itself part of the current wire
  // shape and is never re-emitted. Remove this entry in the following release.
  "surface",
  "claimType",
  "fieldOrBehavior",
  "value",
  "status",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "ttlSeconds",
  "impactLevel",
  "materiality",
  "currentIntegrityRef",
  "currentIntegrityAnchor",
  "verificationPolicyId",
  "confidenceBasis",
  "subjectAliases",
  "derivedFrom",
  "derivationEdges",
  "qualifiers",
  "metadata",
  // Derivation-only fields tolerated on round-trip (a TrustReport's derived
  // claims can be re-fed as input). They are recomputed, never trusted.
  "status",
  "producerStatus",
  "freshness",
]);
export const DERIVATION_EDGE_KEYS = new Set(["inputClaimId", "method", "role", "supportStrength", "rationale", "sensitivity", "metadata"]);
export const DERIVATION_EDGE_SENSITIVITY_KEYS = new Set(["low", "high", "basis"]);
export const EVIDENCE_KEYS = new Set([
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
  "execution",
  "metadata",
]);
export const EXECUTION_KEYS = new Set([
  "runner",
  "label",
  "exitCode",
  "isError",
  "durationMs",
  "metadata",
]);
export const POLICY_KEYS = new Set([
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
export const EVENT_KEYS = new Set(["id", "claimId", "status", "type", "actor", "method", "evidenceIds", "createdAt", "verifiedAt", "notes", "resolvesDispute", "authorityRef"]);
export const CLAIM_GROUP_KEYS = new Set(["id", "title", "kind", "description", "claimIds", "requirements", "rollupPolicy", "metadata"]);
export const REQUIREMENT_KEYS = new Set(["id", "title", "claimIds", "required", "severity", "validationStrategy", "metadata"]);
export const ROLLUP_POLICY_KEYS = new Set(["mode", "requiredRequirementIds", "optionalRequirementIds"]);
export const VALIDATION_STRATEGY_KEYS = new Set([
  "requiredEvidence",
  "requiredMethods",
  "requiresCorroboration",
  "acceptanceCriteria",
  "reviewAuthority",
  "notes",
  "metadata",
]);
export const AUTHORITY_TRACE_KEYS = new Set([
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
export const CLAIM_GROUP_KINDS = ["claimGroup", "framework", "requirement-set"] as const;
export const ROLLUP_MODES = ["all-required", "any-required"] as const;
