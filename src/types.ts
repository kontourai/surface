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
  highImpactUnsupported: string[];
  staleClaims: string[];
  disputedClaims: string[];
}

export interface TrustReport extends TrustInput {
  id: string;
  generatedAt: string;
  claims: Array<Claim & { status: TrustStatus }>;
  summary: TrustReportSummary;
}
