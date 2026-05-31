export type TrustStatus =
  | "unknown"
  | "proposed"
  | "assumed"
  | "verified"
  | "stale"
  | "disputed"
  | "superseded"
  | "rejected";

export type ImpactLevel = "low" | "medium" | "high" | "critical";
export type SupportStrength = "weak" | "moderate" | "strong";

export type EvidenceType =
  | "source_excerpt"
  | "test_output"
  | "human_attestation"
  | "attestation"
  | "calculation_trace"
  | "document_citation"
  | "crawl_observation"
  | "policy_rule";

export type EvidenceMethod =
  | "observation"
  | "extraction"
  | "validation"
  | "corroboration"
  | "attestation"
  | "auditability"
  | "anchoring"
  | "monitoring";

export interface ConfidenceBasis {
  sourceQuality?: "unknown" | "weak" | "moderate" | "strong";
  extractionConfidence?: number;
  corroborationCount?: number;
  reviewerAuthority?: "none" | "operator" | "domain_expert" | "system";
  freshnessRemainingDays?: number;
  conflictCount?: number;
  evidenceStrength?: "none" | "weak" | "moderate" | "strong";
  impactLevel?: ImpactLevel;
}

export interface SubjectRef {
  subjectType: string;
  subjectId: string;
}

export type AuthorityType = "role" | "permission" | "credential" | "system" | "organization" | "policy" | "other";

export interface AuthorityTrace {
  id: string;
  subject: SubjectRef;
  actorRef: string;
  authorityType: AuthorityType;
  authorityRef: string;
  sourceRef: string;
  observedAt: string;
  evidenceIds?: string[];
  claimIds?: string[];
  validFrom?: string;
  validUntil?: string;
  revokedAt?: string;
  integrityRef?: string;
  metadata?: Record<string, unknown>;
}

export interface IdentityLink {
  subjects: SubjectRef[];
  reason?: string;
  attestedBy?: string;
}

export type SchemaVersion = 2 | 3;
export type DerivationMethod =
  | "sum"
  | "max"
  | "min"
  | "model"
  | "rule-application"
  | "copy"
  | "normalization"
  | "manual";

export interface DerivationEdge {
  inputClaimId: string;
  method?: DerivationMethod;
  role?: string;
  supportStrength?: SupportStrength;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

export type DerivationChangeReason =
  | "input-stale"
  | "input-superseded"
  | "input-disputed"
  | "input-rejected"
  | "input-assumed"
  | "input-missing"
  | "derivation-cycle";

export type DerivationChangeAction = "recompute" | "review" | "blocked";

export interface DerivationChangeRecord {
  id: string;
  claimId: string;
  inputClaimIds: string[];
  reason: DerivationChangeReason;
  action: DerivationChangeAction;
  createdAt: string;
  message: string;
  inputStatuses?: Record<string, TrustStatus>;
  metadata?: Record<string, unknown>;
}

export interface Claim {
  id: string;
  subjectType: string;
  subjectId: string;
  surface: string;
  claimType: string;
  fieldOrBehavior: string;
  value: unknown;
  status?: TrustStatus;
  createdAt: string;
  updatedAt: string;
  impactLevel?: ImpactLevel;
  currentIntegrityRef?: string;
  verificationPolicyId?: string;
  confidenceBasis?: ConfidenceBasis;
  subjectAliases?: SubjectRef[];
  derivedFrom?: string[];
  derivationEdges?: DerivationEdge[];
  metadata?: Record<string, unknown>;
}

export interface ClaimDefinition {
  id: string;
  surface: string;
  claimType: string;
  fieldOrBehavior: string;
  subjectType: string;
  subjectId: string;
  impactLevel?: ImpactLevel;
  verificationPolicyId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimStore {
  schemaVersion: 1;
  producer: string;
  claims: ClaimDefinition[];
  policies: VerificationPolicy[];
}

export interface ClaimTypeMetadataField {
  key: string;
  label: string;
  type: "string" | "boolean" | "number";
  required?: boolean;
  hint?: string;
}

export interface ClaimTypeDefinition {
  id: string;
  displayName: string;
  description: string;
  defaultImpact: ImpactLevel;
  defaultSurface?: string;
  policyTemplateId?: string;
  metadataFields?: ClaimTypeMetadataField[];
}

export interface SurfaceExtension {
  name: string;
  displayName: string;
  vocab: import("./console/types.js").SurfaceConsoleVocab;
  theme: import("./console/types.js").SurfaceConsoleTheme;
  claimTypes?: ClaimTypeDefinition[];
  policyTemplates?: Array<{
    id: string;
    template: Omit<VerificationPolicy, "id">;
  }>;
}

export interface Evidence {
  id: string;
  claimId: string;
  evidenceType: EvidenceType;
  method: EvidenceMethod;
  sourceRef: string;
  sourceLocator?: string;
  excerptOrSummary: string;
  observedAt: string;
  collectedBy: string;
  integrityRef?: string;
  passing?: boolean;
  blocking?: boolean;
  metadata?: Record<string, unknown>;
  execution?: {
    runner: "bash" | "mcp";
    label: string;
    exitCode?: number;
    isError?: boolean;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  };
}

export interface ValidityRule {
  kind: "duration" | "commit" | "historical" | "manual";
  durationDays?: number;
}

export interface IncompatibleValuePair {
  values: [unknown, unknown];
  message?: string;
}

export interface IncompatibleStatusPair {
  statuses: [TrustStatus, TrustStatus];
  message?: string;
}

export interface VerificationPolicy {
  id: string;
  claimType: string;
  parentType?: string;
  requiredEvidence: EvidenceType[];
  requiredMethods?: EvidenceMethod[];
  requiresCorroboration?: boolean;
  acceptanceCriteria: string[];
  reviewAuthority: string;
  validityRule: ValidityRule;
  stalenessTriggers: string[];
  conflictRules: string[];
  impactLevel: ImpactLevel;
  collectWhen?: TrustStatus[];
  incompatibleValues?: IncompatibleValuePair[];
  incompatibleStatuses?: IncompatibleStatusPair[];
}

export interface ValidationStrategy {
  requiredEvidence?: EvidenceType[];
  requiredMethods?: EvidenceMethod[];
  requiresCorroboration?: boolean;
  acceptanceCriteria?: string[];
  reviewAuthority?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type ClaimGroupKind = "claimGroup" | "framework" | "requirement-set";
export type ClaimGroupRollupMode = "all-required" | "any-required";

export interface ClaimRequirement {
  id: string;
  title: string;
  claimIds: string[];
  required?: boolean;
  severity?: ImpactLevel;
  validationStrategy?: ValidationStrategy;
  metadata?: Record<string, unknown>;
}

export interface ClaimGroup {
  id: string;
  title: string;
  kind: ClaimGroupKind;
  description?: string;
  claimIds?: string[];
  requirements?: ClaimRequirement[];
  rollupPolicy?: {
    mode: ClaimGroupRollupMode;
    requiredRequirementIds?: string[];
    optionalRequirementIds?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface RequirementRollup {
  id: string;
  title: string;
  status: TrustStatus;
  claimIds: string[];
  required: boolean;
  severity: ImpactLevel;
  verifiedClaims: string[];
  staleClaims: string[];
  disputedClaims: string[];
  unsupportedClaims: string[];
  missingClaimIds: string[];
  validationStrategy?: ValidationStrategy;
  metadata?: Record<string, unknown>;
}

export interface ClaimGroupRollup {
  id: string;
  title: string;
  kind: ClaimGroupKind;
  status: TrustStatus;
  claimIds: string[];
  requirements: RequirementRollup[];
  summary: {
    totalRequirements: number;
    requiredRequirements: number;
    verifiedRequirements: number;
    staleRequirements: number;
    disputedRequirements: number;
    unsupportedRequirements: number;
    missingClaims: number;
    verificationCoverage: number;
  };
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationEvent {
  id: string;
  claimId: string;
  status: TrustStatus;
  actor: string;
  method: string;
  evidenceIds: string[];
  createdAt: string;
  verifiedAt?: string;
  notes?: string;
}

export interface TrustInput {
  schemaVersion: SchemaVersion;
  source: string;
  claims: Claim[];
  evidence: Evidence[];
  policies: VerificationPolicy[];
  events: VerificationEvent[];
  identityLinks?: IdentityLink[];
  claimGroups?: ClaimGroup[];
  authorityTrace?: AuthorityTrace[];
}

/**
 * Generic summary of a human review of a producer run.
 * Producers populate this in their read model; the shape is intentionally
 * producer-agnostic. Producer-specific fields belong in `metadata`.
 */
export interface EvalSummary {
  /** Whether a human has reviewed this run. */
  reviewed: boolean;
  /** ISO timestamp of when the review was completed. */
  reviewedAt?: string;
  /** How confident the reviewer was in their assessment. */
  confidence?: "low" | "medium" | "high";
  /**
   * What the reviewer concluded:
   * - `accepted` — no significant issues, run is good as-is
   * - `accepted-with-changes` — run was accepted but required corrections
   * - `rejected` — run needs substantial rework before it can be accepted
   */
  outcome?: "accepted" | "accepted-with-changes" | "rejected";
  /** Number of findings the run raised that turned out to be false positives. */
  falsePositiveCount?: number;
  /** Number of real issues the run failed to surface. */
  missedIssueCount?: number;
  /** Minutes elapsed between the first failing run and reaching a passing state. */
  timeToResolutionMinutes?: number;
  /** Free-text reviewer notes. */
  notes?: string[];
  /** Producer-specific effectiveness data that doesn't fit the standard fields. */
  metadata?: Record<string, unknown>;
}

export interface TrustReportSummary {
  totalClaims: number;
  byStatus: Record<TrustStatus, number>;
  bySurface: Record<string, number>;
  confidenceBasis: {
    sourceQuality: Record<string, number>;
    reviewerAuthority: Record<string, number>;
    evidenceStrength: Record<string, number>;
    corroboratedClaims: number;
    averageExtractionConfidence: number | null;
    freshnessAtRisk: string[];
    conflictedClaims: string[];
  };
  transparencyGapsByType: Record<TransparencyGapType, number>;
  highImpactUnsupported: string[];
  staleClaims: string[];
  disputedClaims: string[];
  recomputeNeededClaims: string[];
}

export interface EvidenceRequirement {
  requiredEvidenceTypes?: EvidenceType[];
  requiredMethods?: EvidenceMethod[];
  requiresCorroboration?: boolean;
  requiredAuthority?: string;
  notes?: string;
}

export type TransparencyGapType =
  | "contradiction"
  | "provenance_gap"
  | "policy_violation"
  | "freshness_breach"
  | "corroboration_absent"
  | "unsupported_inference";

export interface TransparencyGap {
  id: string;
  claimId: string;
  type: TransparencyGapType;
  severity: ImpactLevel;
  message: string;
  evidenceIds?: string[];
  policyId?: string;
  createdAt: string;
  blocking?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SubjectGroup {
  canonicalKey: string;
  members: SubjectRef[];
  claimIds: string[];
}

export interface TrustReport extends TrustInput {
  schemaVersion: SchemaVersion;
  id: string;
  generatedAt: string;
  claims: Array<Claim & { status: TrustStatus; producerStatus?: TrustStatus }>;
  evidenceRequirementsByClaimId: Record<string, EvidenceRequirement>;
  transparencyGaps: TransparencyGap[];
  changeRecords: DerivationChangeRecord[];
  subjectGroups: SubjectGroup[];
  claimGroupRollups: ClaimGroupRollup[];
  summary: TrustReportSummary;
}

export interface TrustAnalyticsProjection {
  reportId: string;
  generatedAt: string;
  source: string;
  totals: {
    claims: number;
    evidence: number;
    policies: number;
    events: number;
    authorityTrace: number;
    transparencyGaps: number;
    claimGroups: number;
  };
  authorityTrace: AuthorityTraceProjection;
  claimGroupRollups: ClaimGroupRollup[];
  coverageBySurface: SurfaceTrustCoverage[];
  staleClaims: ClaimQueueItem[];
  disputedClaims: ClaimQueueItem[];
  highImpactUnsupportedClaims: ClaimQueueItem[];
  transparencyGaps: {
    byType: Record<TransparencyGapType, number>;
    bySeverity: Record<ImpactLevel, number>;
    items: TransparencyGapQueueItem[];
  };
  evidenceGaps: EvidenceGap[];
  evidenceRequirementGaps: EvidenceGap[];
  confidenceBasis: TrustReportSummary["confidenceBasis"];
  actionQueues: TrustActionQueues;
  attestationValidity: AttestationValidityProjection;
}

export interface SurfaceTrustCoverage {
  surface: string;
  totalClaims: number;
  verifiedClaims: number;
  staleClaims: number;
  disputedClaims: number;
  unsupportedClaims: number;
  verificationCoverage: number;
}

export interface ClaimQueueItem {
  claimId: string;
  surface: string;
  status: TrustStatus;
  impactLevel: ImpactLevel;
  claimType: string;
  subject: SubjectRef;
  policyId?: string;
}

export interface TransparencyGapQueueItem {
  transparencyGapId: string;
  claimId: string;
  type: TransparencyGapType;
  severity: ImpactLevel;
  message: string;
  policyId?: string;
  evidenceIds: string[];
}

export interface EvidenceGap {
  claimId: string;
  surface: string;
  impactLevel: ImpactLevel;
  gapType: TransparencyGapType | AttestationGapType;
  message: string;
  policyId?: string;
  evidenceIds: string[];
}

export interface TrustActionQueues {
  reviewNow: ClaimQueueItem[];
  reverifyStale: ClaimQueueItem[];
  resolveConflicts: TransparencyGapQueueItem[];
  strengthenEvidence: EvidenceGap[];
}

export interface AuthorityTraceProjection {
  totalRecords: number;
  activeRecords: number;
  expiredRecords: number;
  revokedRecords: number;
  records: AuthorityTraceItem[];
}

export interface AuthorityTraceItem {
  id: string;
  subject: SubjectRef;
  actorRef: string;
  authorityType: AuthorityType;
  authorityRef: string;
  sourceRef: string;
  observedAt: string;
  evidenceIds: string[];
  claimIds: string[];
  status: "active" | "expired" | "revoked";
  validFrom?: string;
  validUntil?: string;
  revokedAt?: string;
  integrityRef?: string;
}

export type AttestationGapType =
  | "attestation_actor_missing"
  | "attestation_identity_unverified"
  | "attestation_authority_unverified"
  | "attestation_integrity_missing"
  | "attestation_expired"
  | "attestation_revoked";

export interface AttestationValidityProjection {
  totalAttestations: number;
  validAttestations: number;
  weakAttestations: number;
  invalidAttestations: number;
  items: AttestationValidityItem[];
}

export interface AttestationValidityItem {
  evidenceId: string;
  claimId: string;
  actorRef?: string;
  authorityTraceIds?: string[];
  requiredAuthority?: string;
  status: "valid" | "weak" | "invalid";
  gaps: AttestationGapType[];
  validUntil?: string;
  revokedAt?: string;
  integrityRef?: string;
}
