export type TrustStatus =
  | "unknown"
  | "proposed"
  | "assumed"
  | "verified"
  | "stale"
  | "disputed"
  | "superseded"
  | "rejected"
  | "revoked";

export type ImpactLevel = "low" | "medium" | "high" | "critical";
export type Materiality = "low" | "medium" | "high";
export type SupportStrength = "weak" | "moderate" | "strong";
export type EvidenceSupportStrength = "cited" | "entails";

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

export type IntegrityAnchorKind =
  | "hash"
  | "signature"
  | "transparency_log"
  | "timestamp"
  | "external_ref"
  | "other";

export type IntegrityAnchorVerificationStatus = "unverified" | "verified" | "failed" | "not_applicable";

export interface IntegrityAnchor {
  id: string;
  kind: IntegrityAnchorKind;
  algorithm: string;
  value: string;
  sourceRef: string;
  observedAt?: string;
  verificationStatus?: IntegrityAnchorVerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  metadata?: Record<string, unknown>;
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
  integrityAnchor?: IntegrityAnchor;
  metadata?: Record<string, unknown>;
}

/**
 * Optional unit-conversion parameters for an IdentityLink with relation "converts".
 */
export interface IdentityLinkConversion {
  /** Multiplicative factor: target_value = source_value * factor + offset */
  factor?: number;
  /** Additive offset applied after factor multiplication. */
  offset?: number;
  /** Human-readable note describing the conversion (e.g. unit names). */
  note?: string;
}

export interface IdentityLink {
  /** Stable identifier for this link (optional but strongly recommended). */
  id?: string;
  subjects: SubjectRef[];
  reason?: string;
  attestedBy?: string;
  /**
   * Semantic relation between the subjects.  Default semantics: "equivalent"
   * (co-reference — the subjects denote the same real-world entity).
   * "subsumes" — the first subject is a superset of / contains the others.
   * "converts" — the subjects are related by a unit or scale conversion;
   *   use the companion  field to provide factor/offset.
   */
  relation?: "equivalent" | "subsumes" | "converts";
  /**
   * Unit-conversion parameters.  Only meaningful when relation = "converts".
   * Describes how to transform a numeric value on one subject to the other.
   */
  conversion?: IdentityLinkConversion;
  /**
   * Optional reference to the Claim whose value evidences this mapping.
   * When set, the answer status is capped by the mapping claim's derived
   * status (weakest-link rule): a disputed mapping cannot yield a verified
   * answer.
   */
  mappingClaimId?: string;
}

export type SchemaVersion = 2 | 3 | 4;
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
  qualifiers?: Record<string, string>;
  value: unknown;
  status?: TrustStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * Optional absolute validity window (Hachure schema 4). ISO-8601 instant
   * after which the claim is no longer fresh. Canonical when both expiresAt
   * and ttlSeconds are present (expiresAt wins).
   */
  expiresAt?: string;
  /**
   * Optional relative validity window in seconds (Hachure schema 4), resolved
   * against the governing verification event's verifiedAt (fallback createdAt).
   * Ignored when expiresAt is present.
   */
  ttlSeconds?: number;
  impactLevel?: ImpactLevel;
  materiality?: Materiality;
  currentIntegrityRef?: string;
  currentIntegrityAnchor?: IntegrityAnchor;
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
  materiality?: Materiality;
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
  supportStrength?: EvidenceSupportStrength;
  evidenceType: EvidenceType;
  method: EvidenceMethod;
  sourceRef: string;
  sourceLocator?: string;
  excerptOrSummary: string;
  observedAt: string;
  collectedBy: string;
  integrityRef?: string;
  integrityAnchor?: IntegrityAnchor;
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

export type VerificationEventType = "verification" | "invalidation";

export interface VerificationEvent {
  id: string;
  claimId: string;
  status: TrustStatus;
  /**
   * Optional event classifier (Hachure schema 4). "invalidation" marks a
   * ledger line that explicitly revokes/stales a previously-good claim (use
   * with status "revoked" or "stale"); it is terminal in derivation.
   * Defaults to "verification" semantics when omitted.
   */
  type?: VerificationEventType;
  actor: string;
  method: string;
  evidenceIds: string[];
  createdAt: string;
  verifiedAt?: string;
  notes?: string;
  /** ADR 0003 §8: marks this event as a dispute-resolution decision. */
  resolvesDispute?: true;
  /**
   * ADR 0003 §8: the authorityRef from the AuthorityTrace record that
   * establishes the actor's mandate to decide.  Required when
   * resolvesDispute is true; ignored otherwise.
   */
  authorityRef?: string;
}

export interface TrustBundle {
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
  materiality?: Materiality;
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

/**
 * Per-claim freshness facts attached to a derived claim in a TrustReport. Lets
 * a consumer render "verified, fresh as of T" and detect when re-derivation is
 * due, without re-deriving in the browser.
 */
export interface ClaimFreshness {
  /** The `now` instant the claim's status was judged against (ISO 8601). */
  asOf: string;
  /**
   * The absolute expiry the claim was judged against (ISO 8601), when the claim
   * carries an intrinsic validity window (expiresAt / ttlSeconds). Absent when
   * freshness is governed solely by the verification policy or not time-based.
   */
  expiresAt?: string;
  /** True when the claim's derived status is time-stale at `asOf`. */
  stale: boolean;
}

export type DerivedReportClaim = Claim & {
  status: TrustStatus;
  producerStatus?: TrustStatus;
  freshness?: ClaimFreshness;
};

export interface TrustReport extends TrustBundle {
  schemaVersion: SchemaVersion;
  id: string;
  generatedAt: string;
  claims: DerivedReportClaim[];
  evidenceRequirementsByClaimId: Record<string, EvidenceRequirement>;
  transparencyGaps: TransparencyGap[];
  changeRecords: DerivationChangeRecord[];
  subjectGroups: SubjectGroup[];
  claimGroupRollups: ClaimGroupRollup[];
  summary: TrustReportSummary;
  /**
   * Static version of the status derivation algorithm used to produce this
   * report. Pin downstream (inquiry records, bundle references) so a parent can
   * tell whether a child report is still derivable under the same semantics.
   */
  statusFunctionVersion: string;
}

/**
 * Freshness transition event (the shape downstream planes consume to react to
 * fresh→stale without polling). Emitted by `diffFreshness` when a claim's
 * time-based freshness flips between two derivations.
 */
export interface FreshnessTransitionEvent {
  claimId: string;
  from: "fresh" | "stale";
  to: "fresh" | "stale";
  /** The `now` of the later derivation that observed the transition. */
  asOf: string;
  /** The expiry the claim was judged against, when intrinsic. */
  expiresAt?: string;
  statusFunctionVersion: string;
}

/**
 * Checkpoint for cost-bounded re-derivation: a frozen snapshot of derived claim
 * statuses + the high-water mark of events folded so far. Re-deriving with
 * `{ now, since: checkpoint }` replays only events newer than the checkpoint's
 * `throughEventCreatedAt`, then re-applies time-based freshness against `now`.
 * This object doubles as Flow's per-evaluation inquiry record.
 */
export interface DerivationCheckpoint {
  /** ISO 8601 instant the checkpoint was derived at. */
  asOf: string;
  /** Per-claim derived status captured at `asOf`. */
  statusByClaimId: Record<string, TrustStatus>;
  /** Per-claim intrinsic expiry captured at `asOf` (ISO 8601), when present. */
  expiresAtByClaimId?: Record<string, string>;
  /**
   * High-water mark: the max event.createdAt folded into this checkpoint.
   * Events with createdAt <= this are assumed already reflected.
   */
  throughEventCreatedAt: string | null;
  statusFunctionVersion: string;
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
  materiality?: Materiality;
  claimType: string;
  subject: SubjectRef;
  policyId?: string;
}

export interface TransparencyGapQueueItem {
  transparencyGapId: string;
  claimId: string;
  type: TransparencyGapType;
  severity: ImpactLevel;
  materiality?: Materiality;
  message: string;
  policyId?: string;
  evidenceIds: string[];
}

export interface EvidenceGap {
  claimId: string;
  surface: string;
  impactLevel: ImpactLevel;
  materiality?: Materiality;
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
  integrityAnchor?: IntegrityAnchor;
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
  integrityAnchor?: IntegrityAnchor;
}

// ---------------------------------------------------------------------------
// ADR 0003 steps 3 & 4 — Inquiry, InquiryRecord, DerivationRule
// ---------------------------------------------------------------------------

// Re-export the canonical target type from canonical.ts — placed here so all
// types live in one imported module for consumers.
export type { CanonicalClaimTarget } from "./canonical.js";

/**
 * A consumer-side question posed against the ledger (ADR 0003 §2).
 */
export interface Inquiry {
  /** Stable identifier for this inquiry instance. */
  id: string;
  /** The question as the consumer asked it. */
  question: string;
  /**
   * If the consumer could express the question in canonical claim grammar,
   * this is the resolved target.  Natural-language-only inquiries leave this
   * undefined; they resolve to "unsupported" in this release.
   */
  target?: import("./canonical.js").CanonicalClaimTarget;
  /** Who asked the question (actor ref or user identifier). */
  askedBy: string;
  /** ISO 8601 timestamp of when the inquiry was submitted. */
  askedAt: string;
  /** Optional free-form context or metadata the consumer attached. */
  metadata?: Record<string, unknown>;
}

/**
 * Append-only record capturing the resolution of an Inquiry (ADR 0003 §6).
 * Never updated after creation; the caller is responsible for persistence.
 */
export interface InquiryRecord {
  /** Identifier for this resolution record (may match inquiry.id or be distinct). */
  id: string;
  /** The original inquiry. */
  inquiry: Inquiry;
  /** How the inquiry was resolved. */
  outcome: "matched" | "derived" | "unsupported";
  /**
   * The claims and rule that produced the answer.
   * claimIds lists every claim whose status fed into the answer.
   */
  resolutionPath: {
    claimIds: string[];
    ruleId?: string;
    ruleVersion?: string;
    /**
     * The ids of any IdentityLink records consulted to resolve the inquiry
     * through a co-referent subject (mapping-based resolution).
     */
    identityLinkIds?: string[];
    /**
     * When rule composition (ruleRef requirements) is used, contains the ids
     * of all transitively-referenced rules that contributed to the answer,
     * in evaluation order (excluding the top-level ruleId itself).
     */
    transitiveRuleIds?: string[];
  };
  /** The answer, if the outcome is "matched" or "derived". */
  answer?: {
    value: unknown;
    status: TrustStatus;
  };
  /**
   * Snapshot of the status of each input claim at the time of resolution.
   * Frozen so that future policy changes cannot silently rewrite history.
   */
  inputSnapshot: Array<{ claimId: string; status: TrustStatus }>;
  /** Which version of the status function was used (statusFunctionVersion). */
  statusFunctionVersion: string;
  /** ISO 8601 timestamp of when resolution was computed. */
  resolvedAt: string;
}

/**
 * A single requirement within a derivation rule (ADR 0003 §5).
 *
 * Two mutually exclusive forms:
 *  - Claim-based: requires `target` + `acceptedStatuses`.  May add `predicate`
 *    and/or `fresherThan` to tighten the check.
 *  - Rule-reference: requires only `ruleRef`.  Met iff the referenced rule
 *    evaluates to satisfied when resolved against the same rules array.
 */
export type DerivationRequirement =
  | DerivationClaimRequirement
  | DerivationRuleRefRequirement;

/**
 * Claim-based requirement: checks a specific claim against accepted statuses
 * and optional value predicate / freshness window / authority / corroboration.
 */
export interface DerivationClaimRequirement {
  /** The canonical claim that must exist and satisfy the requirement. */
  target: import("./canonical.js").CanonicalClaimTarget;
  /** The statuses the matched claim's derived status must be in. */
  acceptedStatuses: TrustStatus[];
  /** Optional structural predicate over the claim value. */
  predicate?: {
    op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists";
    /** The operand value.  For "in", this should be an array.  For "exists", omitted. */
    value?: unknown;
  };
  /**
   * Optional freshness window.  When present the claim's authoritative
   * verification timestamp (latest verifying event's verifiedAt ?? createdAt,
   * falling back to claim.updatedAt) must be within the given number of days
   * of the `now` value injected into evaluation.
   */
  fresherThan?: { days: number };
  /**
   * When true, the claim's most-recent status-bearing verification event must
   * have an actor with an AuthorityTrace in the bundle that is active at the
   * `now` instant: validFrom/validUntil window respected, not revoked, and
   * subject-compatible.  Unmet reason names the actor and the failure cause
   * (no trace / expired / revoked).
   */
  requiresActiveAuthority?: true;
  /**
   * Minimum number of DISTINCT collectedBy actors whose evidence for this
   * claim carries supportStrength "entails".  Addresses Art. 14(5)-style
   * distinct-party review: two pieces of evidence from the same actor do NOT
   * satisfy minActors:2.
   *
   * Implementation note: actors are the implementable proxy for distinct-party
   * review because the format does not yet standardise organisational roles.
   * Role-awareness (e.g. "primary attestor vs. independent reviewer") is
   * future work and would require a role field on Evidence.
   */
  corroboration?: { minActors: number };
}

/**
 * Rule-reference requirement: met iff the referenced rule evaluates to
 * satisfied.  Cycle detection fails the requirement with an explicit reason.
 * Mutually exclusive with target / predicate / fresherThan.
 */
export interface DerivationRuleRefRequirement {
  /**
   * The `id` of another DerivationRule in the rules array passed to
   * evaluateDerivationRule / resolveInquiry.  Met iff that rule is satisfied.
   */
  ruleRef: string;
}

/**
 * A named, versioned rule that derives a boolean answer from existing claims
 * (ADR 0003 §5).  Promoted from Flow's gate-expectation language.
 */
export interface DerivationRule {
  /** Stable identifier for this rule. */
  id: string;
  /** Semver or opaque version string. */
  version: string;
  /** Human-readable name. */
  name: string;
  /** The canonical claim the rule answers.  Its value will be the boolean satisfied flag. */
  target: import("./canonical.js").CanonicalClaimTarget;
  /** The input claims that must be satisfied. */
  requirements: DerivationRequirement[];
  /** How multiple requirements are combined. */
  combinator: "all" | "any";
}
