import type { Evidence, EvidenceSupportStrength } from "./types.js";

export function evidenceSupportStrength(evidence: Evidence): EvidenceSupportStrength {
  return evidence.supportStrength ?? "entails";
}

export function evidenceEntailsClaim(evidence: Evidence): boolean {
  return evidenceSupportStrength(evidence) === "entails";
}

/**
 * The only failed-evidence predicate that can become Basis counterevidence.
 * A citation is contextual only, and an explicitly non-blocking failed check
 * must remain visible without being promoted into standing-affecting support.
 */
export function isStandingCounterevidence(evidence: Evidence): boolean {
  return evidenceEntailsClaim(evidence) && evidence.passing === false && evidence.blocking !== false;
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
