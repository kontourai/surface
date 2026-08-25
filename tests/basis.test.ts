import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAnswerAssessmentProjection, composeBasisProjection, parseBasisComposition, SURFACE_BASIS_VERSION, type BasisCompositionInput, type BasisOwnerRef, type ThreadAnswerRef } from "../src/basis/index.js";
import type { Evidence, TrustReport, VerificationPolicy } from "../src/types.js";

const answer: ThreadAnswerRef = { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "assistant-message", threadId: "thread-a", messageId: "message-a" };
const threadOwner: BasisOwnerRef = { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "result", component: "thread" };
const stationOwner: BasisOwnerRef = { authority: "@kontourai/station", schemaVersion: "1", kind: "task-output", component: "station" };

function policy(): VerificationPolicy {
  return { id: "policy-a", claimType: "answer", requiredEvidence: ["test_output"], acceptanceCriteria: [], reviewAuthority: "surface", validityRule: { kind: "manual" }, stalenessTriggers: [], conflictRules: [], impactLevel: "medium" };
}

function report(evidence: Evidence[] = [], policies: VerificationPolicy[] = [policy()]): TrustReport {
  return {
    schemaVersion: 7, id: "bundle-a", generatedAt: "2026-08-25T00:00:00.000Z", source: "fixture",
    claims: [{ id: "claim-a", subjectType: "answer", subjectId: "message-a", claimType: "answer", fieldOrBehavior: "supported", value: true, status: "proposed", verificationPolicyId: "policy-a", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }],
    evidence, policies, events: [], identityLinks: [], claimGroups: [], authorityTrace: [], evidenceRequirementsByClaimId: {}, transparencyGaps: [], changeRecords: [], subjectGroups: [], claimGroupRollups: [],
    summary: { totalClaims: 1, byStatus: { unknown: 0, proposed: 1, assumed: 0, verified: 0, stale: 0, disputed: 0, superseded: 0, rejected: 0, revoked: 0 }, byFacet: {}, confidenceBasis: { sourceQuality: {}, reviewerAuthority: {}, evidenceStrength: {}, corroboratedClaims: 0, averageExtractionConfidence: null, freshnessAtRisk: [], conflictedClaims: [] }, transparencyGapsByType: { contradiction: 0, provenance_gap: 0, policy_violation: 0, freshness_breach: 0, corroboration_absent: 0, unsupported_inference: 0 }, highImpactUnsupported: [], staleClaims: [], disputedClaims: [], recomputeNeededClaims: [] },
    statusFunctionVersion: "2", waiverValidityByClaimId: {}, waiverValidityFunctionVersion: "1",
  };
}

function evidence(id: string, supportStrength: Evidence["supportStrength"], passing?: boolean): Evidence {
  return { id, claimId: "claim-a", evidenceType: "test_output", method: "validation", sourceRef: `source:${id}`, excerptOrSummary: id, observedAt: "2026-08-25T00:00:00.000Z", collectedBy: "fixture", supportStrength, ...(passing === undefined ? {} : { passing }) };
}

function input(assessment: BasisCompositionInput["assessment"], contributions: BasisCompositionInput["contributions"] = []): BasisCompositionInput {
  return { version: SURFACE_BASIS_VERSION, answer, assessment, contributions };
}

test("assessment partitions cited, entailing, and counterevidence without status inference", () => {
  const assessment = buildAnswerAssessmentProjection(report([evidence("entails", "entails"), evidence("cited", "cited"), evidence("failed", "entails", false)]), "claim-a");
  assert.deepEqual(assessment.evidence.entails.map((item) => item.id), ["entails", "failed"]);
  assert.deepEqual(assessment.evidence.cited.map((item) => item.id), ["cited"]);
  assert.deepEqual(assessment.evidence.counterevidence.map((item) => item.id), ["failed"]);
  assert.equal(assessment.policy?.outcome, "satisfied");
  assert.equal(composeBasisProjection(input({ owner: threadOwner, state: "available", value: assessment })).standing, "policy-met");
});

test("policy outcome has mutation teeth and no policy remains null", () => {
  const satisfied = buildAnswerAssessmentProjection(report([evidence("entails", "entails")]), "claim-a");
  const notSatisfied = buildAnswerAssessmentProjection(report([evidence("cited", "cited")]), "claim-a");
  const noPolicy = buildAnswerAssessmentProjection(report([evidence("entails", "entails")], []), "claim-a");
  assert.equal(satisfied.policy?.outcome, "satisfied");
  assert.equal(notSatisfied.policy?.outcome, "not-satisfied");
  assert.equal(noPolicy.policy, null);
  assert.equal(composeBasisProjection(input({ owner: threadOwner, state: "available", value: notSatisfied })).standing, "assessed-with-gaps");
});

test("owner tools, outputs, gates, events, and cited context never change standing", () => {
  const context = { id: "output", owner: stationOwner, answer, role: "execution" as const, display: { title: "Passed gate", summary: "Owner context only" } };
  const projection = composeBasisProjection(input({ owner: threadOwner, state: "not-captured" }, [{ owner: stationOwner, state: "available", value: [context] }]));
  assert.equal(projection.standing, "execution-only");
  assert.equal(projection.relationships.length, 0);
  const assessment = buildAnswerAssessmentProjection(report([evidence("citation", "cited")]), "claim-a");
  assert.equal(composeBasisProjection(input({ owner: threadOwner, state: "available", value: assessment }, [{ owner: stationOwner, state: "available", value: [context] }])).standing, "assessed-with-gaps");
});

test("partial outages preserve matching owner context and restricted reads leak no values", () => {
  const context = { id: "output", owner: stationOwner, answer, role: "execution" as const, display: { title: "Output" } };
  const projection = composeBasisProjection(input({ owner: threadOwner, state: "not-captured" }, [{ owner: stationOwner, state: "available", value: [context] }, { owner: { authority: "@kontourai/survey", schemaVersion: "1", kind: "review", component: "survey" }, state: "restricted" }]));
  assert.equal(projection.regions.execution.length, 1);
  assert.equal(projection.standing, "execution-only");
  assert.deepEqual(projection.gaps.map((gap) => gap.code), ["owner-restricted"]);
});

test("canonical parser rejects unknown versions and hostile display text", async () => {
  const station = JSON.parse(await readFile("examples/fixtures/station-basis-context.json", "utf8"));
  const parsed = parseBasisComposition(station);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("fixture must parse");
  assert.equal(parsed.value.answer.threadId, "thread-42");
  const unknown = structuredClone(station); unknown.answer.schemaVersion = "9";
  assert.equal(parseBasisComposition(unknown).ok, false);
  const html = structuredClone(station); html.contributions[0].value[0].display.title = "<script>";
  assert.equal(parseBasisComposition(html).ok, false);
  const bidi = structuredClone(station); bidi.contributions[0].value[0].display.title = "unsafe\u202E";
  assert.equal(parseBasisComposition(bidi).ok, false);
  const url = structuredClone(station); url.contributions[0].value[0].display.summary = "https://unsafe.example";
  assert.equal(parseBasisComposition(url).ok, false);
  const tone = structuredClone(station); tone.contributions[0].value[0].display.title = "Verified output";
  assert.equal(parseBasisComposition(tone).ok, false);
  const oversized = structuredClone(station); oversized.contributions[0].value[0].display.summary = "x".repeat(70_000);
  assert.equal(parseBasisComposition(oversized).ok, false);
});

test("same IDs on different Threads do not cross the projection; order and dedupe are stable without mutation", () => {
  const other = { ...answer, threadId: "other" };
  const original = [{ id: "z", owner: stationOwner, answer, role: "execution" as const, display: { title: "z" } }, { id: "a", owner: stationOwner, answer, role: "execution" as const, display: { title: "a" } }, { id: "a", owner: stationOwner, answer, role: "execution" as const, display: { title: "duplicate" } }, { id: "a", owner: stationOwner, answer: other, role: "execution" as const, display: { title: "wrong thread" } }];
  const before = structuredClone(original);
  const projection = composeBasisProjection(input({ owner: threadOwner, state: "not-captured" }, [{ owner: stationOwner, state: "available", value: original }]));
  assert.deepEqual(projection.regions.execution.map((item) => item.id), ["a", "z"]);
  assert.deepEqual(original, before);
});
