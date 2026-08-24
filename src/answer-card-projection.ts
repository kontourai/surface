import { derivationInputsForClaim, type DerivationInputSource } from "./derivation.js";
import {
  evidenceEntailsClaim,
  partitionEvidenceBySupport,
} from "./evidence-support.js";
import type {
  DerivationEdge,
  Evidence,
  EvidenceMethod,
  EvidenceSupportStrength,
  EvidenceType,
  Materiality,
  SubjectRef,
  SupportStrength,
  TransparencyGap,
  TrustReport,
  TrustStatus,
} from "./types.js";

export type AnswerCardEvidenceResult = "passed" | "failed" | "not-evaluated";

export interface AnswerCardClaimSummary {
  id: string;
  subject: SubjectRef;
  claimType: string;
  fieldOrBehavior: string;
  value: unknown;
  status: TrustStatus;
  freshness: { asOf: string; expiresAt: string | null; stale: boolean } | null;
  materiality: Materiality | null;
}

export interface AnswerCardEvidenceItem {
  id: string;
  type: EvidenceType;
  method: EvidenceMethod;
  sourceRef: string;
  locator: string | null;
  summary: string;
  observedAt: string;
  supportStrength: EvidenceSupportStrength | null;
  result: AnswerCardEvidenceResult;
  blocksClaim: boolean;
}

export interface AnswerCardDerivationEdge {
  method: DerivationEdge["method"] | null;
  supportStrength: SupportStrength | null;
  rationale: string | null;
}

export interface AnswerCardDirectInput {
  claimId: string;
  status: TrustStatus | null;
  source: DerivationInputSource;
  edge: AnswerCardDerivationEdge | null;
}

export interface AnswerCardDerivation {
  available: boolean;
  directInputs: AnswerCardDirectInput[];
}

export interface FoundAnswerCardProjection {
  found: true;
  claim: AnswerCardClaimSummary;
  evidence: {
    entailing: AnswerCardEvidenceItem[];
    cited: AnswerCardEvidenceItem[];
  };
  derivation: AnswerCardDerivation;
  transparencyGaps: TransparencyGap[];
}

export interface MissingAnswerCardProjection {
  found: false;
  claim: null;
  evidence: {
    entailing: [];
    cited: [];
  };
  derivation: {
    available: false;
    directInputs: [];
  };
  transparencyGaps: [];
}

export type AnswerCardProjection =
  | FoundAnswerCardProjection
  | MissingAnswerCardProjection;

/**
 * Project one already-derived report claim for a compact answer card.
 *
 * This is a report-only adapter: it neither validates untyped input nor
 * derives status or freshness. It preserves the report's evidence partition,
 * direct derivation declaration, and transparency gaps for the exact claim.
 */
export function buildAnswerCardProjection(
  report: TrustReport,
  claimId: string,
): AnswerCardProjection {
  const claim = report.claims.find((candidate) => candidate.id === claimId);
  if (!claim) return missingAnswerCardProjection();

  const evidence = report.evidence.filter((item) => item.claimId === claim.id);
  const partitioned = partitionEvidenceBySupport(evidence);

  return {
    found: true,
    claim: {
      id: claim.id,
      subject: {
        subjectType: claim.subjectType,
        subjectId: claim.subjectId,
      },
      claimType: claim.claimType,
      fieldOrBehavior: claim.fieldOrBehavior,
      value: claim.value,
      status: claim.status,
      freshness: claim.freshness
        ? {
            asOf: claim.freshness.asOf,
            expiresAt: claim.freshness.expiresAt ?? null,
            stale: claim.freshness.stale,
          }
        : null,
      materiality: claim.materiality ?? null,
    },
    evidence: {
      entailing: partitioned.entailingEvidence.map(projectEvidence),
      cited: partitioned.citedEvidence.map(projectEvidence),
    },
    derivation: projectDerivation(report, claim),
    transparencyGaps: report.transparencyGaps.filter(
      (gap) => gap.claimId === claim.id,
    ),
  };
}

function projectEvidence(evidence: Evidence): AnswerCardEvidenceItem {
  return {
    id: evidence.id,
    type: evidence.evidenceType,
    method: evidence.method,
    sourceRef: evidence.sourceRef,
    locator: evidence.sourceLocator ?? null,
    summary: evidence.excerptOrSummary,
    observedAt: evidence.observedAt,
    supportStrength: evidence.supportStrength ?? null,
    result:
      evidence.passing === true
        ? "passed"
        : evidence.passing === false
          ? "failed"
          : "not-evaluated",
    blocksClaim:
      evidenceEntailsClaim(evidence) &&
      evidence.passing === false &&
      evidence.blocking !== false,
  };
}

function projectDerivation(
  report: TrustReport,
  claim: TrustReport["claims"][number],
): AnswerCardDerivation {
  try {
    const claimsById = new Map(
      report.claims.map((candidate) => [candidate.id, candidate]),
    );
    return {
      available: true,
      directInputs: derivationInputsForClaim(claim).map((input) => {
        const inputClaim = claimsById.get(input.inputClaimId);
        return {
          claimId: input.inputClaimId,
          status: inputClaim?.status ?? null,
          source: input.source,
          edge: input.edge
            ? {
                method: input.edge.method ?? null,
                supportStrength: input.edge.supportStrength ?? null,
                rationale: input.edge.rationale ?? null,
              }
            : null,
        };
      }),
    };
  } catch {
    // A corrupt direct-input declaration must not erase otherwise valid report
    // projection. Its unavailability is explicit; report gaps stay intact.
    return { available: false, directInputs: [] };
  }
}

function missingAnswerCardProjection(): MissingAnswerCardProjection {
  return {
    found: false,
    claim: null,
    evidence: { entailing: [], cited: [] },
    derivation: { available: false, directInputs: [] },
    transparencyGaps: [],
  };
}
