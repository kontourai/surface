import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accumulationDigest, projectAccumulation, surveyIdentityAdmission, surveySplitIdentityAdmission, type AccumulationAuthority, type AccumulationBundle, type BundleObservation, type SurveyIdentityRecord } from "../src/index.js";

// Produced by Survey's real projectEntityReviews at da1e74c60f96cd8f77dceaacc8ca1a3bbfb84d47.
const survey = JSON.parse(readFileSync("tests/fixtures/knowledge-accumulation/survey-entity-review.json", "utf8"));
const vectors = JSON.parse(readFileSync("tests/fixtures/knowledge-accumulation/vectors.json", "utf8"));
function setup() {
  const c = vectors.cases.find((v: { id: string }) => v.id === "simultaneous-conflict");
  const claims = ["b1", "b2"].map((id, index) => {
    const bundle = structuredClone(c.bundles[id]) as AccumulationBundle;
    bundle.claims[0].subjectType = "person"; bundle.claims[0].subjectId = `alex-${index + 1}`;
    return { id, bundle, observedAt: "2026-10-01T00:00:00Z", authenticatedPublisher: bundle.producerId!, contentDigest: accumulationDigest(bundle) };
  });
  const accepted = survey.beforeSplit[0] as SurveyIdentityRecord;
  const policy = { ...claims[0].bundle.policies[0], id: "policy.entity", claimType: "entity-relationship" };
  const bundle: AccumulationBundle = { schemaVersion: 5, source: "survey-review", producerId: "survey-host", claims: [accepted.mappingClaim!], evidence: accepted.mappingEvidence!, events: [accepted.mappingEvent!], identityLinks: [accepted.identityLink!], policies: [policy] };
  const review: BundleObservation = { id: "survey", bundle, observedAt: "2026-11-02T01:00:00Z", authenticatedPublisher: "survey-host", contentDigest: accumulationDigest(bundle) };
  const decisions = surveyIdentityAdmission(accepted, { publisher: "survey-host", recordDigest: accumulationDigest(accepted), eventAdmitted: true, identityAdmitted: true });
  const ownerByClaimId = { ...c.fixtureAuthority.authenticatedOwnerByClaimId, [accepted.mappingClaim!.id]: "survey-host" };
  const eventDecisions = claims.flatMap(o => o.bundle.events.map(e => ({ eventId: e.id, eventDigest: accumulationDigest(e), publisher: o.authenticatedPublisher, admitted: true })));
  const inputs = { version: "1" as const, ownerByClaimId, eventDecisions: [...eventDecisions, decisions.eventDecision], identityDecisions: [decisions.identityDecision] };
  const authority: AccumulationAuthority = { ...inputs, integrityRef: accumulationDigest(inputs) };
  const query = { slot: { subjectType: "person", subjectId: "alex-1", fieldOrBehavior: "headquarters", claimType: "fact" }, now: "2026-11-05T00:00:00Z", valuePolicy: "single-json-v1" as const };
  return { accepted, claims, review, authority, query };
}

test("Survey accepted review and later split feed the real admitted identity projection", () => {
  const f = setup();
  const observations = [...f.claims, f.review];
  const merged = projectAccumulation(observations, f.authority, f.query);
  assert.equal(merged.statusByClaimId[f.accepted.mappingClaim!.id], "verified");
  assert.equal(merged.outcome, "contested");
  assert.deepEqual(merged.identityLinkIds, [f.accepted.identityLink!.id]);
  const superseded = survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === f.accepted.outcomeId) as SurveyIdentityRecord;
  const split = survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === superseded.supersededBy) as SurveyIdentityRecord;
  const identityDecision = surveySplitIdentityAdmission({ accepted: f.accepted, superseded, split, publisher: "survey-host", recordsDigest: accumulationDigest([f.accepted, superseded, split]), identityAdmitted: true });
  const authority = structuredClone(f.authority);
  authority.identityDecisions = [identityDecision];
  const { integrityRef: _, ...inputs } = authority; authority.integrityRef = accumulationDigest(inputs);
  const denied = structuredClone(authority);
  denied.identityDecisions = [surveySplitIdentityAdmission({ accepted: f.accepted, superseded, split, publisher: "survey-host", recordsDigest: accumulationDigest([f.accepted, superseded, split]), identityAdmitted: false })];
  const { integrityRef: deniedRef, ...deniedFields } = denied; denied.integrityRef = accumulationDigest(deniedFields);
  assert.equal(projectAccumulation(observations, denied, f.query).outcome, "invalid", "an unadmitted split cannot deactivate the link");
  const separated = projectAccumulation(observations, authority, f.query);
  assert.equal(separated.outcome, "current");
  assert.equal(separated.value, "Berlin");
  assert.deepEqual(separated.inertIdentityLinkIds, [f.accepted.identityLink!.id]);
  assert.equal(separated.identityDecisionTrace[0].reviewProvenance?.supersedingOutcomeId, split.outcomeId);
  const historical = projectAccumulation(observations, f.authority, { ...f.query, knownAt: "2026-11-03T00:00:00Z" });
  assert.equal(historical.outcome, "contested", "host retains the authority snapshot for the earlier cut");
});

test("Survey review outputs cannot self-authorize or forge a split", () => {
  const f = setup();
  const denied = surveyIdentityAdmission(f.accepted, { publisher: "survey-host", recordDigest: accumulationDigest(f.accepted), eventAdmitted: false, identityAdmitted: false });
  assert.equal(denied.identityDecision.admitted, false);
  assert.equal(denied.eventDecision.admitted, false);
  assert.throws(() => surveyIdentityAdmission(f.accepted, { publisher: "survey-host", recordDigest: "wrong", eventAdmitted: true, identityAdmitted: true }), /custody/);
  const changed = structuredClone(f.accepted);
  (changed.mappingClaim!.value as { subjects: { subjectType: string; subjectId: string }[] }).subjects[1].subjectId = "other";
  assert.throws(() => surveyIdentityAdmission(changed, { publisher: "survey-host", recordDigest: accumulationDigest(changed), eventAdmitted: true, identityAdmitted: true }), /inconsistent/);
  const superseded = survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === f.accepted.outcomeId) as SurveyIdentityRecord;
  const split = structuredClone(survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === superseded.supersededBy)) as SurveyIdentityRecord;
  split.alternative.subjects = [{ subjectType: "person", subjectId: "other" }, ...split.alternative.subjects.slice(1)];
  assert.throws(() => surveySplitIdentityAdmission({ accepted: f.accepted, superseded, split, publisher: "survey-host", recordsDigest: accumulationDigest([f.accepted, superseded, split]), identityAdmitted: true }), /invalid Survey split/);
});


test("a malformed inactive decision fails closed", () => {
  const f = setup();
  const policy = structuredClone(f.authority);
  (policy.identityDecisions![0] as unknown as { reviewedInactive: unknown }).reviewedInactive = "true";
  const { integrityRef: _, ...fields } = policy; policy.integrityRef = accumulationDigest(fields);
  assert.throws(() => projectAccumulation([...f.claims, f.review], policy, f.query), /invalid identity admission state/);
});

test("Survey's actual conflicting-review split and a forged ambiguous acceptance are never admitted", () => {
  const f = setup();
  const superseded = survey.ambiguousAfterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === f.accepted.outcomeId) as SurveyIdentityRecord;
  const split = survey.ambiguousAfterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === superseded.supersededBy) as SurveyIdentityRecord;
  assert.equal(split.ambiguity, "conflicting-reviews");
  assert.throws(() => surveySplitIdentityAdmission({ accepted: f.accepted, superseded, split, publisher: "survey-host", recordsDigest: accumulationDigest([f.accepted, superseded, split]), identityAdmitted: true }), /invalid Survey split/);
  const forged = { ...f.accepted, ambiguity: "conflicting-reviews" };
  assert.throws(() => surveyIdentityAdmission(forged, { publisher: "survey-host", recordDigest: accumulationDigest(forged), eventAdmitted: true, identityAdmitted: true }), /invalid Survey identity/);
});

test("Survey decisions bind the carried mapping claim and every evidence item", () => {
  const f = setup();
  for (const change of ["claim", "evidence", "extra-evidence"] as const) {
    const review = structuredClone(f.review);
    if (change === "claim") (review.bundle.claims[0].value as { subjects: { subjectId: string }[] }).subjects[1].subjectId = "someone-else";
    else if (change === "evidence") review.bundle.evidence[0].excerptOrSummary = "forged";
    else review.bundle.evidence.push({ ...review.bundle.evidence[0], id: "extra-evidence" });
    review.contentDigest = accumulationDigest(review.bundle);
    const result = projectAccumulation([...f.claims, review], f.authority, f.query);
    assert.equal(result.outcome, "invalid", change);
    assert.deepEqual(result.identityLinkIds, [], change);
  }
});

test("Survey split must point back to the superseded outcome", () => {
  const f = setup();
  const superseded = survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === f.accepted.outcomeId) as SurveyIdentityRecord;
  const split = structuredClone(survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === superseded.supersededBy)) as SurveyIdentityRecord;
  split.supersedes = "unrelated";
  assert.throws(() => surveySplitIdentityAdmission({ accepted: f.accepted, superseded, split, publisher: "survey-host", recordsDigest: accumulationDigest([f.accepted, superseded, split]), identityAdmitted: true }), /invalid Survey split/);
});

test("an accepted record cannot already be superseded, and a split must be named by its predecessor", () => {
  const f = setup();
  const contradictory = { ...f.accepted, supersededBy: "forged" };
  assert.throws(() => surveyIdentityAdmission(contradictory, { publisher: "survey-host", recordDigest: accumulationDigest(contradictory), eventAdmitted: true, identityAdmitted: true }), /invalid Survey identity/);
  const superseded = survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === f.accepted.outcomeId) as SurveyIdentityRecord;
  const split = structuredClone(survey.afterSplit.find((r: SurveyIdentityRecord) => r.outcomeId === superseded.supersededBy)) as SurveyIdentityRecord;
  split.outcomeId = "rival-split";
  assert.throws(() => surveySplitIdentityAdmission({ accepted: f.accepted, superseded, split, publisher: "survey-host", recordsDigest: accumulationDigest([f.accepted, superseded, split]), identityAdmitted: true }), /invalid Survey split/);
});
