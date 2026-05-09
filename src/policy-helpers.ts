import type {
  EvidenceMethod,
  EvidenceType,
  ImpactLevel,
  VerificationPolicy,
} from "./types.js";

export interface CommitValidityPolicyArgs {
  id: string;
  claimType: string;
  parentType?: string;
  requiredEvidence: EvidenceType[];
  requiredMethods?: EvidenceMethod[];
  requiresCorroboration?: boolean;
  requiredProof: string[];
  reviewAuthority: string;
  stalenessTriggers: string[];
  conflictRules: string[];
  impactLevel: ImpactLevel;
}

export function buildCommitValidityPolicy(args: CommitValidityPolicyArgs): VerificationPolicy {
  const policy: VerificationPolicy = {
    id: args.id,
    claimType: args.claimType,
    requiredEvidence: args.requiredEvidence,
    requiredMethods: args.requiredMethods,
    requiresCorroboration: args.requiresCorroboration,
    requiredProof: args.requiredProof,
    reviewAuthority: args.reviewAuthority,
    validityRule: { kind: "commit" },
    stalenessTriggers: args.stalenessTriggers,
    conflictRules: args.conflictRules,
    impactLevel: args.impactLevel,
  };
  if (args.parentType !== undefined) policy.parentType = args.parentType;
  return policy;
}
