import type { Evidence, EvidenceSupportStrength } from "./types.js";

export function evidenceSupportStrength(evidence: Evidence): EvidenceSupportStrength {
  return evidence.supportStrength ?? "entails";
}

export function evidenceEntailsClaim(evidence: Evidence): boolean {
  return evidenceSupportStrength(evidence) === "entails";
}

export function partitionEvidenceBySupport(evidence: Evidence[]): {
  entailingEvidence: Evidence[];
  citedEvidence: Evidence[];
} {
  const entailingEvidence: Evidence[] = [];
  const citedEvidence: Evidence[] = [];

  for (const item of evidence) {
    if (evidenceEntailsClaim(item)) {
      entailingEvidence.push(item);
    } else {
      citedEvidence.push(item);
    }
  }

  return { entailingEvidence, citedEvidence };
}
