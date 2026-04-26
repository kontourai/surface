import type {
  Claim,
  Evidence,
  FaultLine,
  FaultLineType,
  ProofRequirement,
  TrustInput,
  TrustReport,
  TrustReportSummary,
  TrustStatus,
  VerificationPolicy,
} from "./types.js";
import { deriveTrustStatus } from "./status.js";

const STATUSES: TrustStatus[] = ["unknown", "proposed", "verified", "stale", "disputed", "superseded", "rejected"];
const FAULT_LINE_TYPES: FaultLineType[] = [
  "contradiction",
  "provenance_gap",
  "policy_violation",
  "freshness_breach",
  "corroboration_absent",
  "unsupported_inference",
];

export function buildTrustReport(input: TrustInput, options: { now?: Date; id?: string } = {}): TrustReport {
  const now = options.now ?? new Date();
  const proofRequirementsByClaimId: Record<string, ProofRequirement> = {};
  const faultLines: FaultLine[] = [];
  const claims = input.claims.map((claim) => {
    const evidence = input.evidence.filter((item) => item.claimId === claim.id);
    const policy = input.policies.find((item) => item.id === claim.verificationPolicyId || item.claimType === claim.claimType);
    const status = deriveTrustStatus({ claim, evidence, policy, events: input.events, now });
    if (policy) {
      proofRequirementsByClaimId[claim.id] = proofRequirementFromPolicy(policy);
      faultLines.push(...deriveFaultLines({ claim, evidence, policy, status, now }));
    } else if (evidence.length === 0) {
      faultLines.push({
        id: `${claim.id}.fault.provenance-gap`,
        claimId: claim.id,
        type: "provenance_gap",
        severity: claim.impactLevel ?? "medium",
        message: `Claim ${claim.id} has no evidence and no verification policy.`,
        createdAt: now.toISOString(),
      });
    }
    return { ...claim, status };
  });

  return {
    schemaVersion: 2,
    id: options.id ?? `surface-${now.getTime()}`,
    generatedAt: now.toISOString(),
    source: input.source,
    claims,
    evidence: input.evidence,
    policies: input.policies,
    events: input.events,
    proofRequirementsByClaimId,
    faultLines,
    summary: summarizeClaims(claims, faultLines),
  };
}

export function summarizeClaims(claims: Array<Claim & { status: TrustStatus }>, faultLines: FaultLine[] = []): TrustReportSummary {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<TrustStatus, number>;
  const bySurface: Record<string, number> = {};
  const faultLinesByType = Object.fromEntries(FAULT_LINE_TYPES.map((type) => [type, 0])) as Record<FaultLineType, number>;
  const highImpactUnsupported: string[] = [];
  const staleClaims: string[] = [];
  const disputedClaims: string[] = [];

  for (const claim of claims) {
    byStatus[claim.status] += 1;
    bySurface[claim.surface] = (bySurface[claim.surface] ?? 0) + 1;

    if ((claim.impactLevel === "high" || claim.impactLevel === "critical") && (claim.status === "unknown" || claim.status === "proposed")) {
      highImpactUnsupported.push(claim.id);
    }
    if (claim.status === "stale") staleClaims.push(claim.id);
    if (claim.status === "disputed") disputedClaims.push(claim.id);
  }

  for (const faultLine of faultLines) {
    faultLinesByType[faultLine.type] += 1;
  }

  return {
    totalClaims: claims.length,
    byStatus,
    bySurface,
    faultLinesByType,
    highImpactUnsupported,
    staleClaims,
    disputedClaims,
  };
}

export function formatTrustReportSummary(report: TrustReport): string {
  const statusSummary = STATUSES
    .filter((status) => report.summary.byStatus[status] > 0)
    .map((status) => `${status}: ${report.summary.byStatus[status]}`)
    .join(", ");
  const surfaceSummary = Object.entries(report.summary.bySurface)
    .map(([surface, count]) => `${surface}: ${count}`)
    .join(", ");

  return [
    `Kontour Surface report ${report.id}`,
    `Source: ${report.source}`,
    `Claims: ${report.summary.totalClaims} (${statusSummary || "none"})`,
    `Surfaces: ${surfaceSummary || "none"}`,
    `High-impact unsupported: ${report.summary.highImpactUnsupported.join(", ") || "none"}`,
    `Stale: ${report.summary.staleClaims.join(", ") || "none"}`,
    `Disputed: ${report.summary.disputedClaims.join(", ") || "none"}`,
    `Fault lines: ${report.faultLines.length}`,
  ].join("\n");
}

function proofRequirementFromPolicy(policy: VerificationPolicy): ProofRequirement {
  return {
    requiredEvidenceTypes: policy.requiredEvidence,
    requiredMethods: policy.requiredMethods,
    requiresCorroboration: policy.requiresCorroboration,
    requiredAuthority: policy.reviewAuthority,
    notes: policy.requiredProof.join("; "),
  };
}

function deriveFaultLines(input: {
  claim: Claim;
  evidence: Evidence[];
  policy: VerificationPolicy;
  status: TrustStatus;
  now: Date;
}): FaultLine[] {
  const faultLines: FaultLine[] = [];
  const createdAt = input.now.toISOString();
  const evidenceTypes = new Set(input.evidence.map((item) => item.evidenceType));
  const evidenceMethods = new Set(input.evidence.map((item) => item.method));
  const missingEvidence = input.policy.requiredEvidence.filter((type) => !evidenceTypes.has(type));
  const missingMethods = (input.policy.requiredMethods ?? []).filter((method) => !evidenceMethods.has(method));

  if (missingEvidence.length > 0) {
    faultLines.push({
      id: `${input.claim.id}.fault.provenance-gap`,
      claimId: input.claim.id,
      type: "provenance_gap",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: `Missing required evidence: ${missingEvidence.join(", ")}.`,
      policyId: input.policy.id,
      createdAt,
    });
  }

  if (missingMethods.length > 0) {
    faultLines.push({
      id: `${input.claim.id}.fault.policy-violation`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: `Missing required verification method: ${missingMethods.join(", ")}.`,
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      createdAt,
    });
  }

  if (input.policy.requiresCorroboration && input.evidence.length < 2) {
    faultLines.push({
      id: `${input.claim.id}.fault.corroboration-absent`,
      claimId: input.claim.id,
      type: "corroboration_absent",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: "Policy requires corroboration from at least two evidence records.",
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      createdAt,
    });
  }

  if (input.status === "stale") {
    faultLines.push({
      id: `${input.claim.id}.fault.freshness-breach`,
      claimId: input.claim.id,
      type: "freshness_breach",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      message: "Claim verification is stale under its verification policy.",
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      createdAt,
    });
  }

  for (const hint of input.evidence.flatMap((item) => faultLineHintsFromEvidence(item, input.policy.id, createdAt))) {
    faultLines.push(hint);
  }

  return faultLines;
}

function faultLineHintsFromEvidence(evidence: Evidence, policyId: string, createdAt: string): FaultLine[] {
  const hints = evidence.metadata?.faultLineHints;
  if (!Array.isArray(hints)) return [];

  return hints
    .filter((hint): hint is Record<string, unknown> => typeof hint === "object" && hint !== null)
    .map((hint, index) => ({
      id: typeof hint.id === "string" ? hint.id : `${evidence.claimId}.fault.hint-${index + 1}`,
      claimId: evidence.claimId,
      type: isFaultLineType(hint.type) ? hint.type : "unsupported_inference",
      severity: isImpactLevel(hint.severity) ? hint.severity : "medium",
      message: typeof hint.message === "string" ? hint.message : "Evidence contains a fault-line hint.",
      evidenceIds: [evidence.id],
      policyId,
      createdAt,
      metadata: {
        source: "evidence.metadata.faultLineHints",
      },
    }));
}

function isFaultLineType(value: unknown): value is FaultLineType {
  return typeof value === "string" && FAULT_LINE_TYPES.includes(value as FaultLineType);
}

function isImpactLevel(value: unknown): value is FaultLine["severity"] {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}
