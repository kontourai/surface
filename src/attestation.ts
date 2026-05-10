import type { Evidence } from "./types.js";

export interface HumanAttestationEvidenceArgs {
  subject: {
    claimId: string;
    sourceRef: string;
    sourceLocator?: string;
  };
  actor: {
    id: string;
    displayName?: string;
  };
  attestedAt: string;
  validUntil?: string;
  contentHash: string;
  summary?: string;
}

export function buildHumanAttestationEvidence(args: HumanAttestationEvidenceArgs): Evidence {
  const evidence: Evidence = {
    id: `evidence.attestation.${args.subject.claimId}`,
    claimId: args.subject.claimId,
    evidenceType: "attestation",
    method: "attestation",
    sourceRef: args.subject.sourceRef,
    excerptOrSummary: args.summary ?? `Human attestation by ${args.actor.displayName ?? args.actor.id}.`,
    observedAt: args.attestedAt,
    collectedBy: args.actor.id,
    integrityRef: args.contentHash,
    metadata: {
      actor: args.actor,
      attestedAt: args.attestedAt,
      validUntil: args.validUntil ?? null,
      contentHash: args.contentHash,
    },
  };
  if (args.subject.sourceLocator !== undefined) evidence.sourceLocator = args.subject.sourceLocator;
  return evidence;
}
