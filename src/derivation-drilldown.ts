import type {
  AuthorityTrace,
  Claim,
  DerivationChangeRecord,
  DerivationEdge,
  Evidence,
  EvidenceRequirement,
  TransparencyGap,
  TrustReport,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";

export type DerivedClaimInputSource = "derivedFrom" | "derivationEdges";
export type DerivedClaimDrilldownDiagnosticType = "missing-input" | "cycle";

export interface DerivedClaimEvidenceContext {
  claim: TrustReport["claims"][number];
  evidence: Evidence[];
  authorityTrace: AuthorityTrace[];
  events: VerificationEvent[];
  policy?: VerificationPolicy;
  evidenceRequirement?: EvidenceRequirement;
  transparencyGaps: TransparencyGap[];
  changeRecords: DerivationChangeRecord[];
}

export interface DerivedClaimInput extends DerivedClaimEvidenceContext {
  inputClaimId: string;
  source: DerivedClaimInputSource;
  edge?: DerivationEdge;
  childInputs: DerivedClaimInput[];
}

export interface DerivedClaimLeaf extends DerivedClaimEvidenceContext {
  path: string[];
}

export interface DerivedClaimDrilldownDiagnostic {
  type: DerivedClaimDrilldownDiagnosticType;
  claimId: string;
  inputClaimId?: string;
  path: string[];
  message: string;
}

export interface DerivedClaimDrilldown {
  claim: TrustReport["claims"][number];
  directInputs: DerivedClaimInput[];
  leafClaims: DerivedClaimLeaf[];
  diagnostics: DerivedClaimDrilldownDiagnostic[];
}

export function buildDerivationDrilldown(report: TrustReport, claimId: string): DerivedClaimDrilldown {
  const claimsById = new Map(report.claims.map((claim) => [claim.id, claim]));
  const claim = claimsById.get(claimId);
  if (!claim) throw new Error(`Unknown claim: ${claimId}`);

  const diagnostics: DerivedClaimDrilldownDiagnostic[] = [];
  const leafClaims = new Map<string, DerivedClaimLeaf>();
  const pathByLeafId = new Map<string, string[]>();

  const walkInput = (
    parentClaim: Claim,
    input: NormalizedDerivationInput,
    path: string[],
  ): DerivedClaimInput | undefined => {
    const nextPath = [...path, input.inputClaimId];
    if (path.includes(input.inputClaimId)) {
      diagnostics.push({
        type: "cycle",
        claimId: parentClaim.id,
        inputClaimId: input.inputClaimId,
        path: nextPath,
        message: `Claim ${parentClaim.id} derivation path cycles through ${input.inputClaimId}.`,
      });
      return undefined;
    }

    const inputClaim = claimsById.get(input.inputClaimId);
    if (!inputClaim) {
      diagnostics.push({
        type: "missing-input",
        claimId: parentClaim.id,
        inputClaimId: input.inputClaimId,
        path: nextPath,
        message: `Claim ${parentClaim.id} derives from missing claim ${input.inputClaimId}.`,
      });
      return undefined;
    }

    const declaredChildInputs = normalizeInputs(inputClaim);
    const childInputs = declaredChildInputs
      .map((childInput) => walkInput(inputClaim, childInput, nextPath))
      .filter((childInput): childInput is DerivedClaimInput => Boolean(childInput));

    const context = evidenceContext(report, inputClaim);
    if (declaredChildInputs.length === 0) {
      const existingPath = pathByLeafId.get(inputClaim.id);
      if (!existingPath || nextPath.length < existingPath.length) {
        leafClaims.set(inputClaim.id, { ...context, path: nextPath });
        pathByLeafId.set(inputClaim.id, nextPath);
      }
    }

    return {
      inputClaimId: input.inputClaimId,
      source: input.source,
      edge: input.edge,
      ...context,
      childInputs,
    };
  };

  const directInputs = normalizeInputs(claim)
    .map((input) => walkInput(claim, input, [claim.id]))
    .filter((input): input is DerivedClaimInput => Boolean(input));

  return {
    claim,
    directInputs,
    leafClaims: [...leafClaims.values()],
    diagnostics,
  };
}

interface NormalizedDerivationInput {
  inputClaimId: string;
  source: DerivedClaimInputSource;
  edge?: DerivationEdge;
}

function normalizeInputs(claim: Claim): NormalizedDerivationInput[] {
  const inputs = new Map<string, NormalizedDerivationInput>();
  for (const edge of claim.derivationEdges ?? []) {
    inputs.set(edge.inputClaimId, {
      inputClaimId: edge.inputClaimId,
      source: "derivationEdges",
      edge,
    });
  }
  for (const inputClaimId of claim.derivedFrom ?? []) {
    if (!inputs.has(inputClaimId)) {
      inputs.set(inputClaimId, { inputClaimId, source: "derivedFrom" });
    }
  }
  return [...inputs.values()];
}

function evidenceContext(report: TrustReport, claim: TrustReport["claims"][number]): DerivedClaimEvidenceContext {
  return {
    claim,
    evidence: report.evidence.filter((item) => item.claimId === claim.id),
    authorityTrace: (report.authorityTrace ?? []).filter((item) => item.claimIds?.includes(claim.id)),
    events: report.events.filter((item) => item.claimId === claim.id),
    policy: claim.verificationPolicyId
      ? report.policies.find((item) => item.id === claim.verificationPolicyId)
      : undefined,
    evidenceRequirement: report.evidenceRequirementsByClaimId[claim.id],
    transparencyGaps: report.transparencyGaps.filter((item) => item.claimId === claim.id),
    changeRecords: report.changeRecords.filter((item) => item.claimId === claim.id),
  };
}
