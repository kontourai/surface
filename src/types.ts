export type TrustStatus =
  | "unknown"
  | "proposed"
  | "verified"
  | "stale"
  | "disputed"
  | "superseded"
  | "rejected";

export type ImpactLevel = "low" | "medium" | "high" | "critical";

export type EvidenceType =
  | "source_excerpt"
  | "test_output"
  | "human_attestation"
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
  proofStrength?: "none" | "weak" | "moderate" | "strong";
  impactLevel?: ImpactLevel;
}

export interface SubjectRef {
  subjectType: string;
  subjectId: string;
}

export interface IdentityLink {
  subjects: SubjectRef[];
  reason?: string;
  attestedBy?: string;
}

export type SchemaVersion = 2 | 3;

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
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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
  requiredProof: string[];
  reviewAuthority: string;
  validityRule: ValidityRule;
  stalenessTriggers: string[];
  conflictRules: string[];
  impactLevel: ImpactLevel;
  incompatibleValues?: IncompatibleValuePair[];
  incompatibleStatuses?: IncompatibleStatusPair[];
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
}

export interface TrustReportSummary {
  totalClaims: number;
  byStatus: Record<TrustStatus, number>;
  bySurface: Record<string, number>;
  faultLinesByType: Record<FaultLineType, number>;
  highImpactUnsupported: string[];
  staleClaims: string[];
  disputedClaims: string[];
}

export interface ProofRequirement {
  requiredEvidenceTypes?: EvidenceType[];
  requiredMethods?: EvidenceMethod[];
  requiresCorroboration?: boolean;
  requiredAuthority?: string;
  notes?: string;
}

export type FaultLineType =
  | "contradiction"
  | "provenance_gap"
  | "policy_violation"
  | "freshness_breach"
  | "corroboration_absent"
  | "unsupported_inference";

export interface FaultLine {
  id: string;
  claimId: string;
  type: FaultLineType;
  severity: ImpactLevel;
  message: string;
  evidenceIds?: string[];
  policyId?: string;
  createdAt: string;
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
  claims: Array<Claim & { status: TrustStatus }>;
  proofRequirementsByClaimId: Record<string, ProofRequirement>;
  faultLines: FaultLine[];
  subjectGroups: SubjectGroup[];
  summary: TrustReportSummary;
}
