import { canonicalJson } from "./canonical-digest.js";
import { accumulationDigest, type EventAdmission, type IdentityAdmission } from "./accumulation-admission.js";
import type { Claim, Evidence, IdentityLink, SubjectRef, VerificationEvent } from "./types.js";

/** Structural view of Survey's EntityProjectionRecord, not a portable bundle extension. */
export interface SurveyIdentityRecord {
  status: string;
  outcomeId?: string;
  supersededBy?: string;
  ambiguity?: string;
  alternative: { operation: string; subjects: readonly SubjectRef[] };
  identityLink?: IdentityLink;
  mappingClaim?: Claim;
  mappingEvidence?: Evidence[];
  mappingEvent?: VerificationEvent;
}
/** Host-authenticated custody and separate action decisions; the digest alone authenticates nothing. */
export interface SurveyIdentityCustody {
  publisher: string;
  recordDigest: string;
  eventAdmitted: boolean;
  identityAdmitted: boolean;
}

/** Adapt an accepted Survey candidate to explicit host admission inputs. */
export function surveyIdentityAdmission(record: SurveyIdentityRecord, custody: SurveyIdentityCustody): { identityDecision: IdentityAdmission; eventDecision: EventAdmission } {
  const { identityLink: link, mappingClaim: claim, mappingEvent: event, mappingEvidence: evidence } = record;
  if (!custody.publisher || custody.recordDigest !== accumulationDigest(record) || typeof custody.eventAdmitted !== "boolean" || typeof custody.identityAdmitted !== "boolean" || record.status !== "accepted" || record.ambiguity !== undefined || !record.outcomeId || !link || !claim || !event || !Array.isArray(evidence)) throw new Error("invalid Survey identity custody or record");
  const value = claim.value as { subjects?: unknown; relation?: unknown } | null;
  if (link.id !== `entity-link:${record.outcomeId}` || claim.id !== `entity-claim:${record.outcomeId}` || event.id !== `entity-event:${record.outcomeId}` || link.mappingClaimId !== claim.id || event.claimId !== claim.id || event.status !== "verified" || event.method !== "survey-entity-review" || link.relation !== "equivalent" || claim.claimType !== "entity-relationship" || claim.fieldOrBehavior !== record.alternative.operation || !["merge", "alias", "same-as"].includes(record.alternative.operation) || canonicalJson(link.subjects) !== canonicalJson(record.alternative.subjects) || !value || value.relation !== "equivalent" || canonicalJson(value.subjects) !== canonicalJson(link.subjects) || evidence.some(item => item.claimId !== claim.id) || canonicalJson([...event.evidenceIds].sort()) !== canonicalJson(evidence.map(item => item.id).sort())) throw new Error("inconsistent Survey identity record");
  return {
    identityDecision: { linkDigest: accumulationDigest(link), publisher: custody.publisher, mappingClaimId: claim.id, admitted: custody.identityAdmitted, reviewProvenance: { system: "survey", outcomeId: record.outcomeId, recordDigest: custody.recordDigest } },
    eventDecision: { eventId: event.id, eventDigest: accumulationDigest(event), publisher: custody.publisher, admitted: custody.eventAdmitted },
  };
}

/** Host-admitted Survey split withdraws the prior link; Survey owns ancestry evaluation. */
export function surveySplitIdentityAdmission(input: {
  accepted: SurveyIdentityRecord;
  superseded: SurveyIdentityRecord;
  split: SurveyIdentityRecord;
  publisher: string;
  recordsDigest: string;
  identityAdmitted: boolean;
}): IdentityAdmission {
  const { accepted, superseded, split, publisher } = input;
  if (!publisher || typeof input.identityAdmitted !== "boolean" || input.recordsDigest !== accumulationDigest([accepted, superseded, split]) || accepted.status !== "accepted" || !accepted.outcomeId || !accepted.identityLink?.mappingClaimId || superseded.status !== "superseded" || superseded.outcomeId !== accepted.outcomeId || !superseded.supersededBy || split.status !== "accepted" || split.ambiguity !== undefined || split.alternative.operation !== "split" || split.outcomeId !== superseded.supersededBy || canonicalJson(accepted.alternative) !== canonicalJson(superseded.alternative) || canonicalJson(accepted.alternative.subjects) !== canonicalJson(split.alternative.subjects) || canonicalJson(accepted.alternative.subjects) !== canonicalJson(accepted.identityLink.subjects)) throw new Error("invalid Survey split custody or records");
  surveyIdentityAdmission(accepted, { publisher, recordDigest: accumulationDigest(accepted), eventAdmitted: false, identityAdmitted: false });
  return { linkDigest: accumulationDigest(accepted.identityLink), publisher, mappingClaimId: accepted.identityLink.mappingClaimId, admitted: input.identityAdmitted, reviewedInactive: true, reviewProvenance: { system: "survey", outcomeId: accepted.outcomeId, supersedingOutcomeId: split.outcomeId, recordDigest: input.recordsDigest } };
}
