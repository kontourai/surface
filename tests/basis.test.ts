import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { buildAnswerAssessmentProjection, composeBasisProjection, createSurfacePolicyOutcome, parseBasisComposition, parseBasisProjection, SURFACE_ANSWER_ASSESSMENT_VERSION, SURFACE_BASIS_VERSION, type AnswerAssessmentProjection, type BasisCompositionInput, type BasisContribution, type BasisContributionRef, type ThreadAnswerRef } from "../src/basis/index.js";
import * as rootSurface from "../src/index.js";
import type { Evidence, TrustReport } from "../src/types.js";

const answerRef: ThreadAnswerRef = { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "assistant-message", standing: "observed", threadId: "thread-a", messageId: "message-a" };
const answer: BasisCompositionInput["answer"] = { owner: { authority: "@kontourai/thread" }, state: "available", observedAt: "2026-08-25T00:00:00.000Z", value: { ref: answerRef, fact: "answer-observed", observedAt: "2026-08-25T00:00:00.000Z" } };
const assessmentRef = { authority: "@kontourai/surface" as const, schemaVersion: SURFACE_ANSWER_ASSESSMENT_VERSION, kind: "answer-assessment" as const, bundleId: "bundle-a", claimId: "claim-a" };
const noAssessment: BasisCompositionInput["assessment"] = { owner: { authority: "@kontourai/surface" }, state: "not-captured", observedAt: "2026-08-25T00:00:00.000Z" };
const contribution: BasisContribution<Extract<BasisContributionRef, { authority: "@kontourai/station" }>> = { ref: { authority: "@kontourai/station", schemaVersion: "1", kind: "task-output", taskId: "task-a", outputId: "output-a" }, answer: answerRef, role: "outcome", context: { kind: "station-output", title: "Verified output", mediaType: "text/plain", byteLength: 4, digest: "sha256-abcd" } };
function input(assessment: BasisCompositionInput["assessment"], contributions: BasisCompositionInput["contributions"] = []): BasisCompositionInput { return { version: SURFACE_BASIS_VERSION, answer, assessment, contributions }; }
function report(): TrustReport { return { schemaVersion: 7, id: "bundle-a", generatedAt: "2026-08-25T00:00:00.000Z", source: "fixture", claims: [{ id: "claim-a", subjectType: "answer", subjectId: "message-a", claimType: "answer", fieldOrBehavior: "supported", value: true, status: "proposed", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }], evidence: [], policies: [], events: [], identityLinks: [], claimGroups: [], authorityTrace: [], evidenceRequirementsByClaimId: {}, transparencyGaps: [], changeRecords: [], subjectGroups: [], claimGroupRollups: [], summary: { totalClaims: 1, byStatus: { unknown: 0, proposed: 1, assumed: 0, verified: 0, stale: 0, disputed: 0, superseded: 0, rejected: 0, revoked: 0 }, byFacet: {}, confidenceBasis: { sourceQuality: {}, reviewerAuthority: {}, evidenceStrength: {}, corroboratedClaims: 0, averageExtractionConfidence: null, freshnessAtRisk: [], conflictedClaims: [] }, transparencyGapsByType: { contradiction: 0, provenance_gap: 0, policy_violation: 0, freshness_breach: 0, corroboration_absent: 0, unsupported_inference: 0 }, highImpactUnsupported: [], staleClaims: [], disputedClaims: [], recomputeNeededClaims: [] }, statusFunctionVersion: "2", waiverValidityByClaimId: {}, waiverValidityFunctionVersion: "1" }; }
function explicitAssessment(overrides: Partial<AnswerAssessmentProjection> = {}): AnswerAssessmentProjection { return { version: SURFACE_BASIS_VERSION, ref: assessmentRef, found: true, bundle: { id: "bundle-a", schemaVersion: 7, source: "fixture", generatedAt: "2026-08-25T00:00:00.000Z" }, claim: { id: "claim-a", subject: { subjectType: "answer", subjectId: "message-a" }, status: "verified", freshness: null }, policy: createSurfacePolicyOutcome("surface-eval", "satisfied"), evidence: { cited: [], entails: [], counterevidence: [] }, derivation: { available: true, directInputs: [] }, gaps: [], ...overrides }; }

test("Surface builder projects coverage but never invents a policy verdict", () => {
  const built = buildAnswerAssessmentProjection(report(), "claim-a");
  assert.equal(built.ref.authority, "@kontourai/surface");
  assert.equal(built.policy, null);
  assert.equal(parseBasisComposition(JSON.parse(JSON.stringify(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: built })))).ok, true);
  assert.equal(composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: built })).standing, "assessed-with-gaps");
});
test("only explicit healthy Surface assessment can be policy-met", () => {
  const available = (value: AnswerAssessmentProjection): BasisCompositionInput["assessment"] => ({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value });
  assert.equal(composeBasisProjection(input(available(explicitAssessment()))).standing, "policy-met");
  for (const assessment of [explicitAssessment({ gaps: [{ code: "gap", message: "gap" }] }), explicitAssessment({ claim: { ...explicitAssessment().claim!, status: "stale" } }), explicitAssessment({ evidence: { cited: [], entails: [], counterevidence: [{ id: "failed", label: "failed", sourceRef: "source", observedAt: answer.observedAt }] } }), explicitAssessment({ policy: createSurfacePolicyOutcome("surface-eval", "not-satisfied") })]) assert.equal(composeBasisProjection(input(available(assessment))).standing, "assessed-with-gaps");
});
test("context is never standing evidence and valid factual words are allowed", () => {
  const projection = composeBasisProjection(input(noAssessment, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [contribution] }]));
  assert.equal(projection.standing, "execution-only");
  assert.equal(projection.regions.outcomes[0]?.context.kind, "station-output");
  assert.equal(composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment({ policy: null }) }, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [contribution] }])).standing, "assessed-with-gaps");
});
test("exact tuple identity, duplicate conflicts, and order are deterministic without mutation", () => {
  const other = { ...contribution, ref: { ...contribution.ref, taskId: "task-b" } as typeof contribution.ref };
  const conflict = { ...contribution, context: { ...contribution.context, title: "different" } };
  const original = [other, contribution, structuredClone(contribution), conflict]; const before = structuredClone(original);
  const p = composeBasisProjection(input(noAssessment, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: original }]));
  assert.equal(p.regions.outcomes.length, 1); assert.deepEqual(p.gaps.map((gap) => gap.code), ["corrupt-duplicate-contribution"]); assert.deepEqual(original, before);
});
test("parser accepts complete Surface assessment and projection, rejects spoofing and hostile input", async () => {
  const fixture = JSON.parse(await readFile("examples/fixtures/station-basis-context.json", "utf8"));
  assert.equal(parseBasisComposition(fixture).ok, true);
  const composed = composeBasisProjection(input(noAssessment, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [contribution] }]));
  assert.equal(parseBasisProjection(JSON.parse(JSON.stringify(composed))).ok, true);
  const spoof = structuredClone(fixture); spoof.assessment = { owner: { authority: "@kontourai/thread" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment() }; assert.equal(parseBasisComposition(spoof).ok, false);
  const unsupported = structuredClone(fixture); unsupported.contributions[0].value[0].ref.schemaVersion = "9"; assert.equal(parseBasisComposition(unsupported).ok, false);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; assert.equal(parseBasisComposition(cyclic).ok, false);
  const getter = Object.create(null, { version: { enumerable: true, get() { throw new Error("nope"); } } }); assert.equal(parseBasisComposition(getter).ok, false);
});
test("standing, owner authority, opaque Thread identities, and edge-local gaps are fail-closed", async () => {
  const fixture = JSON.parse(await readFile("examples/fixtures/station-basis-context.json", "utf8"));
  // Thread IDs are opaque: URI-looking and differently-normalized strings are
  // accepted and remain distinct rather than being canonicalized by Surface.
  fixture.answer.value.ref.threadId = "a%2fb/https://example.test/e\u0301";
  fixture.contributions[0].value[0].answer.threadId = "a%2Fb/https://example.test/é";
  assert.equal(parseBasisComposition(fixture).ok, true);
  assert.equal(fixture.answer.value.ref.threadId === fixture.contributions[0].value[0].answer.threadId, false);

  const wrongPlacement = structuredClone(fixture); wrongPlacement.contributions[0].value[0].role = "execution";
  assert.equal(parseBasisComposition(wrongPlacement).ok, false);
  const spoof = structuredClone(fixture); spoof.answer.owner.authority = "@kontourai/surface";
  assert.equal(composeBasisProjection(spoof as BasisCompositionInput).standing, "unresolved");

  const emptyContext = composeBasisProjection(input(noAssessment));
  assert.equal(emptyContext.standing, "execution-only");
  const projection = composeBasisProjection(input(noAssessment, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [{ ...contribution, gaps: [{ code: "edge-gap", message: "missing edge detail" }] }] } ]));
  assert.deepEqual(projection.regions.outcomes[0]?.gaps, [{ code: "edge-gap", message: "missing edge detail" }]);
  const badStanding = structuredClone(projection); badStanding.standing = "policy-met";
  assert.equal(parseBasisProjection(badStanding).ok, false);

  const policyInvariant = JSON.parse(JSON.stringify(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment() })));
  policyInvariant.assessment.value.policy.satisfied = false;
  assert.equal(parseBasisComposition(policyInvariant).ok, false);

  const edgeContribution = { ...contribution, relationships: [{ contract: { authority: "@kontourai/station", schemaVersion: "1", kind: "basis-context-relationship" as const }, kind: "produced" as const, from: contribution.ref, to: contribution.ref, gaps: [{ code: "edge", message: "owner edge gap" }] }] };
  const edgeProjection = composeBasisProjection(input(noAssessment, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [edgeContribution] } ]));
  assert.deepEqual(edgeProjection.relationships[0]?.gaps, [{ code: "edge", message: "owner edge gap" }]);
  assert.equal(parseBasisProjection(JSON.parse(JSON.stringify(edgeProjection))).ok, true);
  const assessmentProjection = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment({ evidence: { cited: [{ id: "evidence-a", label: "citation", sourceRef: "source", observedAt: answer.observedAt }], entails: [], counterevidence: [] }, gaps: [{ code: "claim-gap", message: "global only" }] }) }));
  assert.deepEqual(assessmentProjection.relationships[0]?.gaps, []);
  assert.deepEqual(assessmentProjection.gaps, [{ code: "claim-gap", message: "global only" }]);
  assert.equal(parseBasisProjection(JSON.parse(JSON.stringify(assessmentProjection))).ok, true);
});
test("snapshot rejects traps and cycles but permits shared acyclic records under bounded budgets", async () => {
  const fixture = JSON.parse(await readFile("examples/fixtures/station-basis-context.json", "utf8"));
  fixture.contributions[0].value[0].answer = fixture.answer.value.ref;
  assert.equal(parseBasisComposition(fixture).ok, true);
  const cycle = structuredClone(fixture); cycle.answer.value.ref.self = cycle.answer.value.ref;
  assert.equal(parseBasisComposition(cycle).ok, false);
  const proxy = new Proxy({}, { ownKeys() { throw new Error("nope"); } });
  assert.equal(parseBasisComposition(proxy).ok, false);
  const oversized = structuredClone(fixture); oversized.answer.value.ref.threadId = "x".repeat(4_097);
  assert.equal(parseBasisComposition(oversized).ok, false);
});
test("Basis has a browser bundle with no Node external runtime", async () => {
  const result = await build({ entryPoints: ["src/basis/index.ts"], bundle: true, platform: "browser", format: "esm", write: false, metafile: true });
  assert.equal(Object.keys(result.metafile!.inputs).some((name) => name.startsWith("node:")), false);
});
test("Basis remains subpath-only and absent from the package root", () => {
  assert.equal("composeBasisProjection" in rootSurface, false);
  assert.equal("parseBasisComposition" in rootSurface, false);
});
