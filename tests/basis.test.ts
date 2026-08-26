import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { buildAnswerAssessmentProjection, composeBasisProjection, parseBasisComposition, parseBasisProjection, parseThreadAnswerRef, SURFACE_ANSWER_ASSESSMENT_VERSION, SURFACE_BASIS_VERSION, type AnswerAssessmentProjection, type BasisCompositionInput, type BasisContribution, type BasisContributionRef, type ThreadAnswerRef } from "../src/basis/index.js";
import { buildTrustReport, ordinaryVerificationPolicy, type TrustBundle } from "../src/index.js";
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
function assessmentEvidence(id: string, label: string, supportStrength: "cited" | "entails" | null, overrides: Partial<AnswerAssessmentProjection["evidence"]["cited"][number]> = {}): AnswerAssessmentProjection["evidence"]["cited"][number] { return { id, label, sourceRef: "source", locator: null, observedAt: answer.observedAt, supportStrength, result: "passed", blocksClaim: false, ...overrides }; }
function policy(outcome: "satisfied" | "not-satisfied" = "satisfied"): NonNullable<AnswerAssessmentProjection["policy"]> { return { version: "surface.answer-assessment-policy/v1", id: "surface-eval", evaluatedAt: answer.observedAt, outcome, satisfied: outcome === "satisfied", reasons: outcome === "satisfied" ? [] : ["required-evidence-unmet"] }; }
function explicitAssessment(overrides: Partial<AnswerAssessmentProjection> = {}): AnswerAssessmentProjection { return { version: SURFACE_ANSWER_ASSESSMENT_VERSION, ref: assessmentRef, found: true, bundle: { id: "bundle-a", schemaVersion: 7, source: "fixture", generatedAt: "2026-08-25T00:00:00.000Z" }, claim: { id: "claim-a", subject: { subjectType: "answer", subjectId: "message-a" }, status: "verified", freshness: null }, policy: policy(), evidence: { cited: [], entails: [], undeclared: [], counterevidence: [] }, derivation: { available: true, directInputs: [] }, gaps: [], ...overrides }; }

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
  assert.deepEqual(built.evidence.undeclared, []);
  assert.deepEqual(built.evidence.counterevidence.map((item) => item.id), ["blocking-failure"]);
  assert.deepEqual(built.evidence.counterevidence[0], assessmentEvidence("blocking-failure", "blocking", "entails", { result: "failed", blocksClaim: true }));
});
test("failed evidence is visible without positive support, and legacy blocking evidence round-trips v2", () => {
  const failedNonblocking = report();
  failedNonblocking.claims[0] = { ...failedNonblocking.claims[0]!, status: "verified", verificationPolicyId: ordinaryVerificationPolicy.id };
  failedNonblocking.policies = [ordinaryVerificationPolicy];
  failedNonblocking.evidence = [{ id: "failed-nonblocking", claimId: "claim-a", supportStrength: "entails", evidenceType: "test_output", method: "validation", sourceRef: "source", excerptOrSummary: "failed but nonblocking", observedAt: answer.observedAt, collectedBy: "fixture", passing: false, blocking: false }];
  const failedAssessment = buildAnswerAssessmentProjection(failedNonblocking, "claim-a");
  assert.equal(failedAssessment.policy?.satisfied, false);
  const failedProjection = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: failedAssessment }));
  assert.equal(failedProjection.standing, "assessed-with-gaps");
  assert.deepEqual(failedProjection.relationships, []);

  const legacyBlocking = report();
  legacyBlocking.evidence = [{ id: "legacy-blocking", claimId: "claim-a", evidenceType: "test_output", method: "validation", sourceRef: "source", excerptOrSummary: "legacy blocking", observedAt: answer.observedAt, collectedBy: "fixture", passing: false }];
  const legacyAssessment = buildAnswerAssessmentProjection(legacyBlocking, "claim-a");
  assert.equal(legacyAssessment.evidence.counterevidence[0]?.supportStrength, null);
  const legacyInput = input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: legacyAssessment });
  assert.equal(parseBasisComposition(legacyInput).ok, true);
  assert.deepEqual(composeBasisProjection(legacyInput).relationships.map((edge) => edge.kind), ["counterevidence"]);
});
test("assessment wire v2 preserves declared and undeclared evidence, direct edge facts, and gap-only weakness", () => {
  const source = report();
  source.claims = [
    { ...source.claims[0]!, status: "verified", derivationEdges: [{ inputClaimId: "input-a", method: "rule-application", supportStrength: "weak", rationale: "A declared direct transformation." }] },
    { id: "input-a", subjectType: "answer", subjectId: "input-a", claimType: "input", fieldOrBehavior: "input", value: true, status: "verified", createdAt: answer.observedAt, updatedAt: answer.observedAt },
  ];
  source.evidence = [
    { id: "undeclared", claimId: "claim-a", evidenceType: "source_excerpt", method: "observation", sourceRef: "source-undec", excerptOrSummary: "undeclared", observedAt: answer.observedAt, collectedBy: "fixture" },
    { id: "cited", claimId: "claim-a", supportStrength: "cited", evidenceType: "source_excerpt", method: "observation", sourceRef: "source-cited", excerptOrSummary: "cited", observedAt: answer.observedAt, collectedBy: "fixture", passing: true, sourceLocator: "line-4" },
    { id: "entails", claimId: "claim-a", supportStrength: "entails", evidenceType: "source_excerpt", method: "observation", sourceRef: "source-entails", excerptOrSummary: "entails", observedAt: answer.observedAt, collectedBy: "fixture", passing: true },
  ];
  source.transparencyGaps = [{ id: "weak-gap", claimId: "claim-a", type: "unsupported_inference", severity: "medium", message: "Claim depends on weak derivation support.", createdAt: answer.observedAt }];
  const built = buildAnswerAssessmentProjection(source, "claim-a");
  assert.equal(built.version, SURFACE_ANSWER_ASSESSMENT_VERSION);
  assert.deepEqual(built.evidence.undeclared[0], assessmentEvidence("undeclared", "undeclared", null, { sourceRef: "source-undec", result: "not-evaluated" }));
  assert.deepEqual(built.evidence.cited[0], assessmentEvidence("cited", "cited", "cited", { sourceRef: "source-cited", locator: "line-4" }));
  assert.equal(built.evidence.entails[0]?.supportStrength, "entails");
  assert.deepEqual(built.derivation.directInputs, [{ claimId: "input-a", status: "verified", source: "derivationEdges", edge: { method: "rule-application", supportStrength: "weak", rationale: "A declared direct transformation." } }]);
  assert.deepEqual(built.gaps, [{ code: "unsupported_inference", message: "Claim depends on weak derivation support." }]);
  const projection = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: built }));
  assert.deepEqual(projection.relationships.map((item) => item.kind), ["cites", "supports", "derived-from"]);
  assert.equal(projection.relationships.some((item) => item.to === "evidence:undeclared" || item.from === "evidence:undeclared"), false);
});
test("Basis panel view owns standing, evidence partitions, context order, and hostile fallback", () => {
  const assessed = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment({ evidence: { cited: [assessmentEvidence("citation", "citation", "cited")], entails: [assessmentEvidence("support", "support", "entails")], undeclared: [assessmentEvidence("unknown", "unknown", null)], counterevidence: [] } }) }, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [contribution] }]));
  const model = buildBasisPanelViewModel(assessed);
  assert.equal(model.version, SURFACE_BASIS_PANEL_VIEW_VERSION);
  assert.equal(model.state, "ready");
  if (model.state !== "ready") return;
  assert.equal(model.standing.label, "Policy met");
  assert.deepEqual(model.assessment?.evidence.map((partition) => [partition.label, partition.items.length]), [["Entailing evidence", 1], ["Citations", 1], ["Support relationship not declared", 1], ["Counterevidence", 0]]);
  assert.deepEqual(model.contextGroups.map((group) => group.label), ["Inputs", "Execution", "Process", "Outcomes", "Sources", "Live"]);
  assert.deepEqual(model.contextGroups.find((group) => group.id === "outcomes")?.items[0]?.ref, contribution.ref);
  assert.match(model.contextNotice, /do not establish support/u);
  (model.disclosures as { context: string }).context = "expanded";
  const later = buildBasisPanelViewModel(assessed);
  assert.equal(later.disclosures.context, "collapsed");
  assert.notEqual(later.disclosures, model.disclosures);
  const hostile = new Proxy({}, { ownKeys() { throw new Error("no"); } });
  const unavailable = buildBasisPanelViewModel(hostile);
  assert.deepEqual(unavailable, buildBasisPanelViewModel({}));
  assert.equal(unavailable.state, "unavailable");
});
test("Basis panel view preserves exact validated contribution refs for caller routing", () => {
  const inputContribution: BasisContribution<Extract<BasisContributionRef, { authority: "@kontourai/station"; kind: "input" }>> = { ref: { authority: "@kontourai/station", schemaVersion: "1", kind: "input", sessionId: "session-a", eventId: "input-a" }, answer: answerRef, role: "input", context: { kind: "station-input", inputKind: "prompt", attachmentCount: 0 } };
  const executionContribution: BasisContribution<Extract<BasisContributionRef, { authority: "@kontourai/thread" }>> = { ref: { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "result", threadId: "thread-a", resultId: "result-a" }, answer: answerRef, role: "execution", context: { kind: "thread-result", name: "tool", terminalStatus: "success", truncatedParts: 0, omittedParts: 0 } };
  const model = buildBasisPanelViewModel(composeBasisProjection(input(noAssessment, [{ owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [inputContribution] }, { owner: { authority: "@kontourai/thread" }, state: "available", observedAt: answer.observedAt, value: [executionContribution] }, { owner: { authority: "@kontourai/station" }, state: "available", observedAt: answer.observedAt, value: [contribution] }])));
  assert.equal(model.state, "ready");
  if (model.state !== "ready") return;
  assert.deepEqual(model.contextGroups.find((group) => group.id === "inputs")?.items[0]?.ref, inputContribution.ref);
  assert.deepEqual(model.contextGroups.find((group) => group.id === "execution")?.items[0]?.ref, executionContribution.ref);
  assert.deepEqual(model.contextGroups.find((group) => group.id === "outcomes")?.items[0]?.ref, contribution.ref);
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
  for (const assessment of [explicitAssessment({ gaps: [{ code: "gap", message: "gap" }] }), explicitAssessment({ claim: { ...explicitAssessment().claim!, status: "stale" } }), explicitAssessment({ evidence: { cited: [], entails: [assessmentEvidence("failed", "failed", "entails", { result: "failed", blocksClaim: true })], undeclared: [], counterevidence: [assessmentEvidence("failed", "failed", "entails", { result: "failed", blocksClaim: true })] } }), explicitAssessment({ policy: policy("not-satisfied") })]) assert.equal(composeBasisProjection(input(available(assessment))).standing, "assessed-with-gaps");
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
test("assessment wire is closed: v1, unknown versions, wrong group facts, and extra keys are unavailable", () => {
  const available = { owner: { authority: "@kontourai/surface" as const }, state: "available" as const, observedAt: answer.observedAt, value: explicitAssessment({ evidence: { cited: [], entails: [assessmentEvidence("entails", "entails", "entails")], undeclared: [assessmentEvidence("undeclared", "undeclared", null)], counterevidence: [] } }) };
  assert.equal(parseBasisComposition(input(available)).ok, true);
  const v1 = structuredClone(available); v1.value.version = "surface.answer-assessment/v1" as never;
  assert.equal(parseBasisComposition(input(v1)).ok, false);
  const unknown = structuredClone(available); unknown.value.ref.schemaVersion = "surface.answer-assessment/v99" as never;
  assert.equal(parseBasisComposition(input(unknown)).ok, false);
  const promoted = structuredClone(available); promoted.value.evidence.undeclared[0]!.supportStrength = "entails";
  assert.equal(parseBasisComposition(input(promoted)).ok, false);
  const extra = structuredClone(available) as typeof available & { value: { evidence: { entails: Array<Record<string, unknown>> } } }; extra.value.evidence.entails[0]!.callerSaysPass = true;
  assert.equal(parseBasisComposition(input(extra as BasisCompositionInput["assessment"])).ok, false);
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
  const assessmentProjection = composeBasisProjection(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: explicitAssessment({ evidence: { cited: [assessmentEvidence("evidence-a", "citation", "cited")], entails: [], undeclared: [], counterevidence: [] }, gaps: [{ code: "claim-gap", message: "global only" }] }) }));
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
test("Surface policy wire preserves only the evaluated outcome invariant", () => {
  const assessment = explicitAssessment({ policy: { ...policy(), id: "https://surface.example/policy/😀" } });
  assert.equal(parseBasisComposition(JSON.parse(JSON.stringify(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: assessment })))).ok, true);
  const invalid = structuredClone(assessment); invalid.policy!.satisfied = false;
  assert.equal(parseBasisComposition(input({ owner: { authority: "@kontourai/surface" }, state: "available", observedAt: answer.observedAt, value: invalid })).ok, false);
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
  const assessment = explicitAssessment({ evidence: { cited: [assessmentEvidence("evidence-a", "citation", "cited")], entails: [], undeclared: [], counterevidence: [] } });
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
