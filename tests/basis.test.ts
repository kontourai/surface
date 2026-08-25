import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { buildAnswerAssessmentProjection, composeBasisProjection, createSurfacePolicyOutcome, parseBasisComposition, parseBasisProjection, parseThreadAnswerRef, SURFACE_ANSWER_ASSESSMENT_VERSION, SURFACE_BASIS_VERSION, type AnswerAssessmentProjection, type BasisCompositionInput, type BasisContribution, type BasisContributionRef, type ThreadAnswerRef } from "../src/basis/index.js";
import { buildTrustReport, type TrustBundle } from "../src/index.js";
import { buildBasisPanelViewModel, SURFACE_BASIS_PANEL_VIEW_VERSION } from "../src/basis/view-index.js";
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
test("Basis counterevidence uses the canonical entailing, failed, blocking predicate", () => {
  const source = report();
  source.evidence = [
    { id: "cited-failure", claimId: "claim-a", supportStrength: "cited", evidenceType: "source_excerpt", method: "observation", sourceRef: "source", excerptOrSummary: "citation failure", observedAt: answer.observedAt, collectedBy: "fixture", passing: false },
    { id: "nonblocking-failure", claimId: "claim-a", supportStrength: "entails", evidenceType: "source_excerpt", method: "observation", sourceRef: "source", excerptOrSummary: "nonblocking", observedAt: answer.observedAt, collectedBy: "fixture", passing: false, blocking: false },
    { id: "blocking-failure", claimId: "claim-a", supportStrength: "entails", evidenceType: "source_excerpt", method: "observation", sourceRef: "source", excerptOrSummary: "blocking", observedAt: answer.observedAt, collectedBy: "fixture", passing: false },
  ];
  const built = buildAnswerAssessmentProjection(source, "claim-a");
  assert.deepEqual(built.evidence.cited.map((item) => item.id), ["cited-failure"]);
  assert.deepEqual(built.evidence.counterevidence.map((item) => item.id), ["blocking-failure"]);
});
test("Basis panel view owns standing, evidence partitions, context order, and hostile fallback", () => {
  const assessed = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment({ evidence: { cited: [{ id: "citation", label: "citation", sourceRef: "source", observedAt: answer.observedAt }], entails: [{ id: "support", label: "support", sourceRef: "source", observedAt: answer.observedAt }], counterevidence: [] } }) }, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [contribution] }]));
  const model = buildBasisPanelViewModel(assessed);
  assert.equal(model.version, SURFACE_BASIS_PANEL_VIEW_VERSION);
  assert.equal(model.state, "ready");
  if (model.state !== "ready") return;
  assert.equal(model.standing.label, "Policy met");
  assert.deepEqual(model.assessment?.evidence.map((partition) => [partition.label, partition.items.length]), [["Entailing evidence", 1], ["Citations", 1], ["Counterevidence", 0]]);
  assert.deepEqual(model.contextGroups.map((group) => group.label), ["Inputs", "Execution", "Process", "Outcomes", "Sources", "Live"]);
  assert.match(model.contextNotice, /do not establish support/u);
  const hostile = new Proxy({}, { ownKeys() { throw new Error("no"); } });
  const unavailable = buildBasisPanelViewModel(hostile);
  assert.deepEqual(unavailable, buildBasisPanelViewModel({}));
  assert.equal(unavailable.state, "unavailable");
});
test("real system-card report round-trips through Basis without degrading Surface evidence", async () => {
  const bundle = JSON.parse(await readFile("examples/system-card/bundle.json", "utf8")) as TrustBundle;
  const report = buildTrustReport(bundle, { id: "system-card-report", now: new Date("2025-11-05T12:00:00.000Z") });
  const claimId = "claim.acme-support-agent.pii-filtering";
  report.source = "https://example.test/<system-card>";
  const counterevidence = report.evidence.find((item) => item.claimId === claimId && item.passing === false)!;
  counterevidence.sourceRef = "https://example.test/e\u0301%2Fsource";
  counterevidence.excerptOrSummary = "<cite>Counterevidence at https://example.test/evidence</cite>";
  report.transparencyGaps.find((gap) => gap.claimId === claimId)!.message = "Inspect <gap> at https://example.test/gaps";
  const built = buildAnswerAssessmentProjection(report, claimId);
  assert.equal(built.bundle.source, report.source);
  assert.equal(built.evidence.counterevidence[0]!.sourceRef, counterevidence.sourceRef);
  assert.equal(built.evidence.counterevidence[0]!.label, counterevidence.excerptOrSummary);
  assert.equal(built.gaps[0]!.message, report.transparencyGaps.find((gap) => gap.claimId === claimId)!.message);
  const systemCardContext = {
    ...contribution,
    context: { ...contribution.context, title: "<System card> https://example.test/result" },
    gaps: [{ code: "owner-gap", message: "Inspect <details> at https://example.test/gaps" }],
  };
  const composition = input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: built }, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [systemCardContext] }]);
  const parsed = parseBasisComposition(JSON.parse(JSON.stringify(composition)));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const composed = composeBasisProjection(parsed.value);
  assert.equal(composed.assessment.state, "available");
  assert.equal(composed.assessment.state === "available" && composed.assessment.value.evidence.counterevidence[0]?.sourceRef, built.evidence.counterevidence[0]?.sourceRef);
  assert.equal(parseBasisProjection(JSON.parse(JSON.stringify(composed))).ok, true);
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

  const edgeContribution: typeof contribution = { ...contribution, gaps: [{ code: "relationship-not-captured", message: "Owner relationship context is not captured." }] };
  const edgeProjection = composeBasisProjection(input(noAssessment, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [edgeContribution] } ]));
  assert.deepEqual(edgeProjection.relationships, []);
  assert.deepEqual(edgeProjection.regions.outcomes[0]?.gaps, [{ code: "relationship-not-captured", message: "Owner relationship context is not captured." }]);
  assert.equal(parseBasisProjection(JSON.parse(JSON.stringify(edgeProjection))).ok, true);
  const assessmentProjection = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment({ evidence: { cited: [{ id: "evidence-a", label: "citation", sourceRef: "source", observedAt: answer.observedAt }], entails: [], counterevidence: [] }, gaps: [{ code: "claim-gap", message: "global only" }] }) }));
  assert.deepEqual(assessmentProjection.relationships[0]?.gaps, []);
  assert.deepEqual(assessmentProjection.gaps, [{ code: "claim-gap", message: "global only" }]);
  assert.equal(parseBasisProjection(JSON.parse(JSON.stringify(assessmentProjection))).ok, true);
});
test("Thread refs are total, opaque, and exact without executing hostile descriptors", () => {
  const opaque = { ...answerRef, threadId: "thread/e\u0301%2Fhttps://example.test", messageId: "message/%2F😀" };
  const parsed = parseThreadAnswerRef(opaque);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, opaque);
  assert.equal(parseThreadAnswerRef({ ...answerRef, threadId: "\ud800" }).ok, false);
  assert.equal(parseThreadAnswerRef(new Proxy({}, { get() { throw new Error("must not execute"); }, ownKeys() { throw new Error("must not enumerate"); } })).ok, false);
  assert.equal(parseThreadAnswerRef(Object.create(null, { authority: { enumerable: true, get() { throw new Error("must not read"); } } })).ok, false);
});
test("Surface policy factory and parser share the same opaque scalar and outcome invariant", () => {
  const policy = createSurfacePolicyOutcome("https://surface.example/policy/😀", "satisfied");
  assert.deepEqual(policy, { id: "https://surface.example/policy/😀", outcome: "satisfied", satisfied: true });
  assert.throws(() => createSurfacePolicyOutcome("\ud800", "satisfied"), TypeError);
  assert.throws(() => createSurfacePolicyOutcome("policy", "unknown"), TypeError);
  const assessment = explicitAssessment({ policy });
  assert.equal(parseBasisComposition(JSON.parse(JSON.stringify(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: assessment })))).ok, true);
});
test("owner relationships are deferred and only Surface assessment edges round-trip", () => {
  const flowRef: Extract<BasisContributionRef, { authority: "@kontourai/flow-agents" }> = { authority: "@kontourai/flow-agents", schemaVersion: "grounded-execution-narrative/v1", kind: "narrative", narrativeId: "narrative-1" };
  const flowContribution: BasisContribution<typeof flowRef> = { ref: flowRef, answer: answerRef, role: "execution", context: { kind: "grounded-narrative", statementCount: 1, sourceCompleteness: "complete" }, gaps: [{ code: "relationship-not-captured", message: "Flow relationship is not captured." }] };
  const valid = JSON.parse(JSON.stringify(input(noAssessment))) as { contributions: unknown[] };
  valid.contributions = [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [contribution] }, { owner: { authority: "@kontourai/flow-agents" }, state: "available", observedAt: answer.observedAt, value: [flowContribution] }];
  assert.equal(parseBasisComposition(valid).ok, true);
  for (const owner of ["@kontourai/station", "@kontourai/flow-agents"]) {
    const invented = structuredClone(valid) as { contributions: Array<{ owner: { authority: string }; value: Array<Record<string, unknown>> }> };
    const contributionRead = invented.contributions.find((item) => item.owner.authority === owner)!;
    contributionRead.value[0]!.relationships = [{ contract: { authority: owner, schemaVersion: "unpublished/v1", kind: "basis-context-relationship" }, kind: "produced", from: contribution.ref, to: contribution.ref }];
    assert.equal(parseBasisComposition(invented).ok, false);
  }
  const assessment = explicitAssessment({ evidence: { cited: [{ id: "evidence-a", label: "citation", sourceRef: "source", observedAt: answer.observedAt }], entails: [], counterevidence: [] } });
  const projection = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: assessment }));
  assert.deepEqual(projection.relationships.map((edge) => edge.source), ["surface-assessment"]);
  assert.equal(parseBasisProjection(JSON.parse(JSON.stringify(projection))).ok, true);
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
