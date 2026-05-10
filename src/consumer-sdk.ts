import type {
  Claim,
  Evidence,
  IdentityLink,
  SchemaVersion,
  TrustInput,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";
import { validateTrustInput } from "./validate.js";

export type ClaimDraft = Claim;
export type EvidenceDraft = Omit<Evidence, "claimId"> & Partial<Pick<Evidence, "claimId">>;
export type VerificationEventDraft = VerificationEvent;
export type VerificationPolicyDraft = VerificationPolicy;

export interface TrustInputBuilderArgs {
  source: string;
  schemaVersion?: SchemaVersion;
}

export interface EvidenceLink {
  linkTo(claimId: string): TrustInputBuilder;
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

export class TrustInputBuilder {
  readonly source: string;
  readonly schemaVersion: SchemaVersion;
  private readonly claims: Claim[] = [];
  private readonly evidence: Evidence[] = [];
  private readonly policies: VerificationPolicy[] = [];
  private readonly events: VerificationEvent[] = [];
  private readonly identityLinks: IdentityLink[] = [];

  constructor(args: TrustInputBuilderArgs) {
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

  build(): TrustInput {
    const input: TrustInput = {
      schemaVersion: this.schemaVersion,
      source: this.source,
      claims: [...this.claims],
      evidence: [...this.evidence],
      policies: [...this.policies],
      events: [...this.events],
    };
    if (this.identityLinks.length > 0) input.identityLinks = [...this.identityLinks];
    return validateTrustInput(input);
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
