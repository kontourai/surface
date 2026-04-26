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

export interface VerificationPolicy {
  id: string;
  claimType: string;
  requiredEvidence: EvidenceType[];
  requiredMethods?: EvidenceMethod[];
  requiresCorroboration?: boolean;
  requiredProof: string[];
  reviewAuthority: string;
  validityRule: ValidityRule;
  stalenessTriggers: string[];
  conflictRules: string[];
  impactLevel: ImpactLevel;
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
  schemaVersion: 2;
  source: string;
  claims: Claim[];
  evidence: Evidence[];
  policies: VerificationPolicy[];
  events: VerificationEvent[];
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

export interface TrustReport extends TrustInput {
  schemaVersion: 2;
  id: string;
  generatedAt: string;
  claims: Array<Claim & { status: TrustStatus }>;
  proofRequirementsByClaimId: Record<string, ProofRequirement>;
  faultLines: FaultLine[];
  summary: TrustReportSummary;
}
