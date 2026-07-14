import { buildDerivationDrilldown, type DerivedClaimDrilldown } from "./derivation-drilldown.js";
import type {
  Claim,
  DerivationChangeRecord,
  Evidence,
  TransparencyGap,
  TrustReport,
  VerificationPolicy,
} from "./types.js";

type EvidenceExecution = NonNullable<Evidence["execution"]>;

export interface ClaimEvidenceItem {
  evidenceType: Evidence["evidenceType"];
  label: string;
  execution: {
    runner: EvidenceExecution["runner"];
    label: string;
    isError: boolean;
    exitCode: number | null;
  } | null;
  passing: boolean;
  summary: string;
}

export interface ClaimExplanation {
  found: boolean;
  status: string;
  value: string;
  claimType: Claim["claimType"];
  evidence: ClaimEvidenceItem[];
  policy: {
    id: VerificationPolicy["id"];
    requiredEvidence: VerificationPolicy["requiredEvidence"];
    requiredMethods?: VerificationPolicy["requiredMethods"];
    acceptanceCriteria: VerificationPolicy["acceptanceCriteria"];
    reviewAuthority: VerificationPolicy["reviewAuthority"];
  } | null;
  why: {
    directInputs: DerivedClaimDrilldown["directInputs"];
    leafClaims: DerivedClaimDrilldown["leafClaims"];
    diagnostics: DerivedClaimDrilldown["diagnostics"];
    transparencyGaps: TransparencyGap[];
    changeRecords: DerivationChangeRecord[];
  };
}

/**
 * Project one derived report claim into a consumer-ready explanation.
 *
 * The projection is pure and fail-soft: an unknown claim returns the stable
 * empty shape, and a derivation-drilldown failure leaves only the derivation
 * arrays empty while preserving the claim's evidence, policy, and report
 * diagnostics.
 */
export function explainClaim(report: TrustReport, claimId: string): ClaimExplanation {
  const claim = report.claims.find((candidate) => candidate.id === claimId);
  if (!claim) return unknownClaimExplanation();

  const policy = claim.verificationPolicyId
    ? report.policies.find((candidate) => candidate.id === claim.verificationPolicyId)
    : undefined;
  const explanation: ClaimExplanation = {
    found: true,
    status: String(claim.status ?? "unknown"),
    value: String(claim.value ?? ""),
    claimType: String(claim.claimType ?? ""),
    evidence: report.evidence
      .filter((item) => item.claimId === claimId)
      .map(projectEvidence),
    policy: policy ? projectPolicy(policy) : null,
    why: {
      directInputs: [],
      leafClaims: [],
      diagnostics: [],
      transparencyGaps: report.transparencyGaps.filter((item) => item.claimId === claimId),
      changeRecords: report.changeRecords.filter((item) => item.claimId === claimId),
    },
  };

  try {
    const drilldown = buildDerivationDrilldown(report, claimId);
    explanation.why.directInputs = drilldown.directInputs ?? [];
    explanation.why.leafClaims = drilldown.leafClaims ?? [];
    explanation.why.diagnostics = drilldown.diagnostics ?? [];
  } catch {
    // Explanation is intentionally useful even when derivation traversal fails.
  }

  return explanation;
}

function projectEvidence(evidence: Evidence): ClaimEvidenceItem {
  // Legacy tolerance: canonical Evidence has no top-level label/summary/status,
  // but bundles produced before flow-agents#171 lifted this projection may carry
  // them; the fallback chains below preserve the prototype's behavior for that data.
  const compatible = evidence as Evidence & {
    label?: unknown;
    summary?: unknown;
    status?: unknown;
  };
  const execution = evidence.execution;
  const exitCode = typeof execution?.exitCode === "number" ? execution.exitCode : null;
  const isError = execution
    ? Boolean(execution.isError ?? (exitCode !== null && exitCode !== 0))
    : false;

  return {
    evidenceType: evidence.evidenceType,
    label: String(compatible.label ?? evidence.excerptOrSummary ?? evidence.sourceRef ?? evidence.id),
    execution: execution
      ? {
          runner: execution.runner,
          label: String(execution.label ?? ""),
          isError,
          exitCode,
        }
      : null,
    passing: execution ? !isError : String(compatible.status ?? "") !== "disputed",
    summary: String(evidence.excerptOrSummary ?? compatible.summary ?? compatible.label ?? ""),
  };
}

function projectPolicy(policy: VerificationPolicy): NonNullable<ClaimExplanation["policy"]> {
  return {
    id: String(policy.id ?? ""),
    requiredEvidence: (policy.requiredEvidence ?? []).map(String) as VerificationPolicy["requiredEvidence"],
    ...(policy.requiredMethods !== undefined
      ? { requiredMethods: policy.requiredMethods.map(String) as VerificationPolicy["requiredMethods"] }
      : {}),
    acceptanceCriteria: (policy.acceptanceCriteria ?? []).map(String),
    reviewAuthority: String(policy.reviewAuthority ?? ""),
  };
}

function unknownClaimExplanation(): ClaimExplanation {
  return {
    found: false,
    status: "unknown",
    value: "",
    claimType: "",
    evidence: [],
    policy: null,
    why: {
      directInputs: [],
      leafClaims: [],
      diagnostics: [],
      transparencyGaps: [],
      changeRecords: [],
    },
  };
}
