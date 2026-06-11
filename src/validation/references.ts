import type { TrustBundle } from "../types.js";

export function validateReferences(input: TrustBundle): void {
  const claimIds = new Set(input.claims.map((claim) => claim.id));
  const evidenceIds = new Set(input.evidence.map((evidence) => evidence.id));
  const policyIds = new Set(input.policies.map((policy) => policy.id));

  for (const claim of input.claims) {
    if (claim.verificationPolicyId && !policyIds.has(claim.verificationPolicyId)) {
      throw new Error(`Claim ${claim.id} references unknown policy ${claim.verificationPolicyId}`);
    }
    if (claim.derivedFrom) {
      for (const inputId of claim.derivedFrom) {
        if (!claimIds.has(inputId)) {
          throw new Error(`Claim ${claim.id} derives from unknown claim ${inputId}`);
        }
      }
    }
    if (claim.derivationEdges) {
      for (const edge of claim.derivationEdges) {
        if (!claimIds.has(edge.inputClaimId)) {
          throw new Error(`Claim ${claim.id} derives from unknown claim ${edge.inputClaimId}`);
        }
      }
    }
  }

  for (const item of input.evidence) {
    if (!claimIds.has(item.claimId)) {
      throw new Error(`Evidence ${item.id} references unknown claim ${item.claimId}`);
    }
  }

  for (const event of input.events) {
    if (!claimIds.has(event.claimId)) {
      throw new Error(`Event ${event.id} references unknown claim ${event.claimId}`);
    }
    for (const evidenceId of event.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new Error(`Event ${event.id} references unknown evidence ${evidenceId}`);
      }
    }
  }

  for (const claimGroup of input.claimGroups ?? []) {
    for (const claimId of claimGroup.claimIds ?? []) {
      if (!claimIds.has(claimId)) {
        throw new Error(`Claim group ${claimGroup.id} references unknown claim ${claimId}`);
      }
    }
    const requirementIds = new Set((claimGroup.requirements ?? []).map((requirement) => requirement.id));
    for (const requirement of claimGroup.requirements ?? []) {
      for (const claimId of requirement.claimIds) {
        if (!claimIds.has(claimId)) {
          throw new Error(`Claim group ${claimGroup.id} requirement ${requirement.id} references unknown claim ${claimId}`);
        }
      }
    }
    for (const requirementId of claimGroup.rollupPolicy?.requiredRequirementIds ?? []) {
      if (!requirementIds.has(requirementId)) throw new Error(`Claim group ${claimGroup.id} rollupPolicy references unknown requirement ${requirementId}`);
    }
    for (const requirementId of claimGroup.rollupPolicy?.optionalRequirementIds ?? []) {
      if (!requirementIds.has(requirementId)) throw new Error(`Claim group ${claimGroup.id} rollupPolicy references unknown requirement ${requirementId}`);
    }
  }

  for (const trace of input.authorityTrace ?? []) {
    for (const claimId of trace.claimIds ?? []) {
      if (!claimIds.has(claimId)) {
        throw new Error(`Authority trace ${trace.id} references unknown claim ${claimId}`);
      }
    }
    for (const evidenceId of trace.evidenceIds ?? []) {
      if (!evidenceIds.has(evidenceId)) {
        throw new Error(`Authority trace ${trace.id} references unknown evidence ${evidenceId}`);
      }
    }
  }
}
