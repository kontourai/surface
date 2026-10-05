import type { Claim, Evidence, SchemaVersion, VerificationPolicy } from "./types.js";

export interface BundleSchemaVersionContent {
  claims: readonly Pick<Claim, "conclusionConfidence">[];
  evidence: readonly Evidence[];
  policies: readonly VerificationPolicy[];
}

/**
 * Return the minimum current wire-schema declaration required by emitted
 * bundle content. Pure v5 vocabulary stays on 5 for older receivers; the v7
 * runtime-observation vocabulary requires 7; a claim that names the
 * calibration table behind its `conclusionConfidence` (the v8 field) requires
 * 8. Declaring 8 also turns on the v8 `conclusionConfidence` rules, so content
 * without `calibration` is never promoted to 8. Evidence carrying
 * `inconclusive` or `collectedByKind` (the v9 fields) requires 9; 9 adds no
 * rule for content without them, so the check is only for presence.
 */
export function requiredBundleSchemaVersion(content: BundleSchemaVersionContent): 5 | 7 | 8 | 9 {
  const usesV9Evidence = content.evidence.some(
    (evidence) => evidence.inconclusive !== undefined || evidence.collectedByKind !== undefined,
  );
  if (usesV9Evidence) return 9;
  const usesV8Claim = content.claims.some((claim) => claim.conclusionConfidence?.calibration !== undefined);
  if (usesV8Claim) return 8;
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
  if (required === 9 && declared < 9) {
    throw new Error(
      `schemaVersion ${declared} is insufficient for evidence inconclusive / collectedByKind; declare schemaVersion 9 or omit the explicit version`,
    );
  }
  if (required === 8 && declared < 8) {
    throw new Error(
      `schemaVersion ${declared} is insufficient for conclusionConfidence.calibration; declare schemaVersion 8 or omit the explicit version`,
    );
  }
  if (required === 7 && declared < 7) {
    throw new Error(
      `schemaVersion ${declared} is insufficient for runtime-observation vocabulary; declare schemaVersion 7 or omit the explicit version`,
    );
  }
}
