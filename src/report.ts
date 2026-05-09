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
import { buildIdentityIndex } from "./identity.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import { applyDerivation } from "./derivation.js";

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
  const identityIndex = buildIdentityIndex(input);
  const policyByClaimId = new Map<string, VerificationPolicy>();

  // Pass 1: compute each claim's own status (pre-derivation) and per-claim
  // policy fault lines. Derivation needs the full set of own-statuses, so we
  // capture them here and apply the derivation ceiling in pass 2.
  const ownStatusByClaimId = new Map<string, TrustStatus>();
  const claimsById = new Map<string, Claim>();
  const ownStatuses = input.claims.map((claim) => {
    claimsById.set(claim.id, claim);
    const evidence = input.evidence.filter((item) => item.claimId === claim.id);
    const policy = resolvePolicyForClaim(claim, input.policies);
    if (policy) policyByClaimId.set(claim.id, policy);
    const ownStatus = deriveTrustStatus({ claim, evidence, policy, events: input.events, now });
    ownStatusByClaimId.set(claim.id, ownStatus);
    if (policy) {
      proofRequirementsByClaimId[claim.id] = proofRequirementFromPolicy(policy);
      faultLines.push(...deriveFaultLines({ claim, evidence, policy, status: ownStatus, now }));
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
    return { claim, ownStatus };
  });

  // Pass 2: apply derivedFrom ceilings.
  const claims = ownStatuses.map(({ claim, ownStatus }) => {
    const outcome = applyDerivation({ claim, ownStatus, ownStatusByClaimId, claimsById, now });
    faultLines.push(...outcome.faultLines);
    return { ...claim, status: outcome.status };
  });

  // Cross-claim incompatibility detection. For each policy, group its claims by
  // canonical subject, then check declared incompatible value/status pairs.
  faultLines.push(...deriveIncompatibilityFaultLines({
    claims,
    policyByClaimId,
    canonicalKeyForClaim: (claim) => identityIndex.canonicalKeyForClaim(claim),
    now,
  }));

  return {
    schemaVersion: input.schemaVersion,
    id: options.id ?? `surface-${now.getTime()}`,
    generatedAt: now.toISOString(),
    source: input.source,
    claims,
    evidence: input.evidence,
    policies: input.policies,
    events: input.events,
    identityLinks: input.identityLinks ?? [],
    proofRequirementsByClaimId,
    faultLines,
    subjectGroups: identityIndex.groups,
    summary: summarizeClaims(claims, faultLines),
  };
}

export function summarizeClaims(claims: Array<Claim & { status: TrustStatus }>, faultLines: FaultLine[] = []): TrustReportSummary {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<TrustStatus, number>;
  const bySurface: Record<string, number> = {};
  const sourceQuality: Record<string, number> = {};
  const reviewerAuthority: Record<string, number> = {};
  const proofStrength: Record<string, number> = {};
  const extractionConfidences: number[] = [];
  const freshnessAtRisk: string[] = [];
  const conflictedClaims: string[] = [];
  let corroboratedClaims = 0;
  const faultLinesByType = Object.fromEntries(FAULT_LINE_TYPES.map((type) => [type, 0])) as Record<FaultLineType, number>;
  const highImpactUnsupported: string[] = [];
  const staleClaims: string[] = [];
  const disputedClaims: string[] = [];

  for (const claim of claims) {
    byStatus[claim.status] += 1;
    bySurface[claim.surface] = (bySurface[claim.surface] ?? 0) + 1;
    const basis = claim.confidenceBasis;
    if (basis?.sourceQuality) sourceQuality[basis.sourceQuality] = (sourceQuality[basis.sourceQuality] ?? 0) + 1;
    if (basis?.reviewerAuthority) reviewerAuthority[basis.reviewerAuthority] = (reviewerAuthority[basis.reviewerAuthority] ?? 0) + 1;
    if (basis?.proofStrength) proofStrength[basis.proofStrength] = (proofStrength[basis.proofStrength] ?? 0) + 1;
    if (typeof basis?.extractionConfidence === "number") extractionConfidences.push(basis.extractionConfidence);
    if ((basis?.corroborationCount ?? 0) > 0) corroboratedClaims += 1;
    if ((basis?.freshnessRemainingDays ?? 1) <= 0) freshnessAtRisk.push(claim.id);
    if ((basis?.conflictCount ?? 0) > 0) conflictedClaims.push(claim.id);

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
    confidenceBasis: {
      sourceQuality,
      reviewerAuthority,
      proofStrength,
      corroboratedClaims,
      averageExtractionConfidence: extractionConfidences.length > 0
        ? extractionConfidences.reduce((total, value) => total + value, 0) / extractionConfidences.length
        : null,
      freshnessAtRisk,
      conflictedClaims,
    },
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

function deriveIncompatibilityFaultLines(input: {
  claims: Array<Claim & { status: TrustStatus }>;
  policyByClaimId: Map<string, VerificationPolicy>;
  canonicalKeyForClaim: (claim: Claim) => string;
  now: Date;
}): FaultLine[] {
  const faultLines: FaultLine[] = [];
  const createdAt = input.now.toISOString();

  // Group claims by (policy.id, canonicalSubjectKey).
  type Group = { policy: VerificationPolicy; subjectKey: string; claims: Array<Claim & { status: TrustStatus }> };
  const groupsByKey = new Map<string, Group>();
  for (const claim of input.claims) {
    const policy = input.policyByClaimId.get(claim.id);
    if (!policy) continue;
    if (!hasIncompatibilityRules(policy)) continue;
    const subjectKey = input.canonicalKeyForClaim(claim);
    const groupKey = `${policy.id}::${subjectKey}`;
    const group = groupsByKey.get(groupKey) ?? { policy, subjectKey, claims: [] };
    group.claims.push(claim);
    groupsByKey.set(groupKey, group);
  }

  for (const group of groupsByKey.values()) {
    if (group.claims.length < 2) continue;
    for (let i = 0; i < group.claims.length; i += 1) {
      for (let j = i + 1; j < group.claims.length; j += 1) {
        const a = group.claims[i];
        const b = group.claims[j];

        for (const pair of group.policy.incompatibleValues ?? []) {
          if (matchValuePair(a.value, b.value, pair.values)) {
            faultLines.push({
              id: `${a.id}.${b.id}.fault.contradiction-values`,
              claimId: a.id,
              type: "contradiction",
              severity: a.impactLevel ?? b.impactLevel ?? group.policy.impactLevel,
              message:
                pair.message ??
                `Claims ${a.id} and ${b.id} hold incompatible values under policy ${group.policy.id}.`,
              policyId: group.policy.id,
              createdAt,
              metadata: { peerClaimId: b.id, subjectKey: group.subjectKey, source: "policy.incompatibleValues" },
            });
          }
        }

        for (const pair of group.policy.incompatibleStatuses ?? []) {
          if (matchStatusPair(a.status, b.status, pair.statuses)) {
            faultLines.push({
              id: `${a.id}.${b.id}.fault.contradiction-statuses`,
              claimId: a.id,
              type: "contradiction",
              severity: a.impactLevel ?? b.impactLevel ?? group.policy.impactLevel,
              message:
                pair.message ??
                `Claims ${a.id} and ${b.id} hold incompatible statuses under policy ${group.policy.id}.`,
              policyId: group.policy.id,
              createdAt,
              metadata: { peerClaimId: b.id, subjectKey: group.subjectKey, source: "policy.incompatibleStatuses" },
            });
          }
        }
      }
    }
  }

  return faultLines;
}

function hasIncompatibilityRules(policy: VerificationPolicy): boolean {
  return (
    (Array.isArray(policy.incompatibleValues) && policy.incompatibleValues.length > 0) ||
    (Array.isArray(policy.incompatibleStatuses) && policy.incompatibleStatuses.length > 0)
  );
}

function matchValuePair(a: unknown, b: unknown, pair: [unknown, unknown]): boolean {
  return (deepEqual(a, pair[0]) && deepEqual(b, pair[1])) || (deepEqual(a, pair[1]) && deepEqual(b, pair[0]));
}

function matchStatusPair(a: TrustStatus, b: TrustStatus, pair: [TrustStatus, TrustStatus]): boolean {
  return (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}
