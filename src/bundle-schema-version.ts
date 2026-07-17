import type { Evidence, SchemaVersion, VerificationPolicy } from "./types.js";

export interface BundleSchemaVersionContent {
  evidence: readonly Evidence[];
  policies: readonly VerificationPolicy[];
}

/**
 * Return the minimum current wire-schema declaration required by emitted
 * bundle content. Pure v5 vocabulary stays on 5 for older receivers; the v7
 * runtime-observation vocabulary requires 7.
 */
export function requiredBundleSchemaVersion(content: BundleSchemaVersionContent): 5 | 7 {
  const usesV7Evidence = content.evidence.some(
    (evidence) =>
      evidence.evidenceType === "runtime_observation" ||
      evidence.execution?.environment !== undefined,
  );
  const usesV7Policy = content.policies.some((policy) =>
    policy.requiredEvidence.includes("runtime_observation"),
  );
  return usesV7Evidence || usesV7Policy ? 7 : 5;
}

export function assertBundleSchemaVersionSufficient(
  declared: SchemaVersion,
  content: BundleSchemaVersionContent,
): void {
  const required = requiredBundleSchemaVersion(content);
  if (required === 7 && declared < 7) {
    throw new Error(
      `schemaVersion ${declared} is insufficient for runtime-observation vocabulary; declare schemaVersion 7 or omit the explicit version`,
    );
  }
}
