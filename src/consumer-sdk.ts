import type {
  Claim,
  Evidence,
  IdentityLink,
  SchemaVersion,
  ClaimGroup,
  TrustBundle,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";
import { validateTrustBundle } from "./validate.js";

export type ClaimDraft = Claim;
export type EvidenceDraft = Omit<Evidence, "claimId"> & Partial<Pick<Evidence, "claimId">>;
export type VerificationEventDraft = VerificationEvent;
export type VerificationPolicyDraft = VerificationPolicy;

export interface TrustBundleBuilderArgs {
  source: string;
  schemaVersion?: SchemaVersion;
}

export interface EvidenceLink {
  linkTo(claimId: string): TrustBundleBuilder;
}

export interface VerifiedClaimEmission {
  claim: ClaimDraft;
  evidence: EvidenceDraft;
  policy: VerificationPolicyDraft;
  event: Omit<VerificationEventDraft, "claimId" | "evidenceIds" | "status"> & {
    status?: VerificationEventDraft["status"];
    evidenceIds?: string[];
  };
}

export function buildClaim(claim: ClaimDraft): Claim {
  return claim;
}

export function buildEvidence(evidence: EvidenceDraft): EvidenceDraft {
  return evidence;
}

export function buildEvent(event: VerificationEventDraft): VerificationEvent {
  return event;
}

export function buildPolicy(policy: VerificationPolicyDraft): VerificationPolicy {
  return policy;
}

export class TrustBundleBuilder {
  readonly source: string;
  readonly schemaVersion: SchemaVersion;
  private readonly claims: Claim[] = [];
  private readonly evidence: Evidence[] = [];
  private readonly policies: VerificationPolicy[] = [];
  private readonly events: VerificationEvent[] = [];
  private readonly identityLinks: IdentityLink[] = [];
  private readonly claimGroups: ClaimGroup[] = [];

  constructor(args: TrustBundleBuilderArgs) {
    this.source = args.source;
    this.schemaVersion = args.schemaVersion ?? 2;
  }

  addClaim(claim: ClaimDraft): this {
    this.claims.push(buildClaim(claim));
    return this;
  }

  addEvidence(evidence: EvidenceDraft): EvidenceLink {
    if (evidence.claimId) {
      this.upsertEvidence(evidence as Evidence);
    }
    return {
      linkTo: (claimId: string) => {
        this.upsertEvidence({ ...evidence, claimId });
        return this;
      },
    };
  }

  addPolicy(policy: VerificationPolicyDraft): this {
    this.policies.push(buildPolicy(policy));
    return this;
  }

  addEvent(event: VerificationEventDraft): this {
    this.events.push(buildEvent(event));
    return this;
  }

  addIdentityLink(link: IdentityLink): this {
    this.identityLinks.push(link);
    return this;
  }

  addClaimGroup(claimGroup: ClaimGroup): this {
    this.claimGroups.push(claimGroup);
    return this;
  }

  addVerifiedClaim(input: VerifiedClaimEmission): this {
    this.addClaim(input.claim);
    const evidence = { ...input.evidence, claimId: input.claim.id } as Evidence;
    this.upsertEvidence(evidence);
    this.addPolicy(input.policy);
    this.addEvent({
      ...input.event,
      claimId: input.claim.id,
      status: input.event.status ?? "verified",
      evidenceIds: input.event.evidenceIds ?? [evidence.id],
    } as VerificationEvent);
    return this;
  }

  build(): TrustBundle {
    const input: TrustBundle = {
      schemaVersion: this.schemaVersion,
      source: this.source,
      claims: [...this.claims],
      evidence: [...this.evidence],
      policies: [...this.policies],
      events: [...this.events],
    };
    if (this.identityLinks.length > 0) input.identityLinks = [...this.identityLinks];
    if (this.claimGroups.length > 0) input.claimGroups = [...this.claimGroups];
    return validateTrustBundle(input);
  }

  private upsertEvidence(evidence: Evidence): void {
    const index = this.evidence.findIndex((item) => item.id === evidence.id);
    if (index >= 0) {
      this.evidence[index] = evidence;
      return;
    }
    this.evidence.push(evidence);
  }
}
