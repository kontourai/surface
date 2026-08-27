import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildReviewedExtractionSourceState, projectReviewedExtractionEvidence, type ReviewedExtractionEvidenceInput } from "../src/index.js";
import { buildReviewedSourceBasisContribution, composeBasisProjectionV2, parseBasisComposition, parseBasisCompositionV2, parseBasisProjectionV2, type AnswerAssessmentProjection, type BasisCompositionInputV2 } from "../src/basis/index.js";
import { buildBasisPanelViewModel } from "../src/basis/view-index.js";

const at = "2026-08-25T00:00:00.000Z";
const answer = { authority: "@kontourai/thread" as const, schemaVersion: "1.2.0" as const, kind: "assistant-message" as const, standing: "observed" as const, threadId: "thread-42", messageId: "message-9" };
const sha = (char: string) => char.repeat(64);
async function reviewed() { return projectReviewedExtractionEvidence(JSON.parse(await readFile("tests/fixtures/reviewed-extraction-evidence.v1.json", "utf8")) as ReviewedExtractionEvidenceInput).evidence; }
function assessment(evidence: Awaited<ReturnType<typeof reviewed>>): AnswerAssessmentProjection { return { version: "surface.answer-assessment/v2", ref: { authority: "@kontourai/surface", schemaVersion: "surface.answer-assessment/v2", kind: "answer-assessment", bundleId: "bundle-1", claimId: "answer-claim" }, found: true, bundle: { id: "bundle-1", schemaVersion: 1, source: "Surface", generatedAt: at }, claim: { id: "answer-claim", subject: { subjectType: "answer", subjectId: "answer-1" }, status: "assessed", freshness: null }, policy: { version: "surface.answer-assessment-policy/v1", id: "policy-1", evaluatedAt: at, outcome: "not-satisfied", satisfied: false, reasons: ["explicit-entailing-evidence-missing"] }, evidence: { cited: [{ id: "citation-1", label: "Cited source", sourceRef: evidence.sourceRef, locator: evidence.sourceLocator ?? null, observedAt: at, supportStrength: "cited", result: "passed", blocksClaim: false }], entails: [], undeclared: [], counterevidence: [] }, derivation: { available: true, directInputs: [{ claimId: evidence.claimId, status: "verified", source: "derivationEdges", edge: { method: "rule-application", supportStrength: "strong", rationale: null } }] }, gaps: [] }; }

test("reviewed source adapter creates one bounded v2 Sources contribution without policy promotion", async () => {
  const evidence = await reviewed();
  const sourceState = buildReviewedExtractionSourceState(evidence, { version: "surface.reviewed-source-observation/v1", owner: { authority: "@kontourai/fieldwork", observationRef: "observation-1" }, expected: { snapshotRef: "snapshot:fixture-v1", sourceId: "source-1", resourceRef: "https://example.test/source", capturedAt: "2026-08-20T00:00:00.000Z", envelopeDigest: { algorithm: "sha256", value: sha("a") }, contentDigest: { algorithm: "sha256", value: sha("b") } }, observed: { snapshotRef: "capture-2", sourceId: "source-1", resourceRef: "https://example.test/source", capturedAt: at, envelopeDigest: { algorithm: "sha256", value: sha("c") }, contentDigest: { algorithm: "sha256", value: sha("b") } } }, at);
  const contribution = await buildReviewedSourceBasisContribution({ answer, ref: { authority: "@kontourai/fieldwork", schemaVersion: "fieldwork.kontourai.io/v1", kind: "reviewed-web-source", exactRef: `fieldwork-reviewed-source:v1:${sha("d")}`, evidenceId: evidence.id }, evidence, sourceState, association: { version: "surface.reviewed-source-basis-association/v1", sourceClaimId: evidence.claimId, sourceEvidenceId: evidence.id, answerClaimId: "answer-claim", answerCitationEvidenceId: "citation-1", assessmentRevision: 1 }, assessment: { revision: 1, value: assessment(evidence) } });
  const wire = JSON.stringify(contribution);
  assert.equal(contribution.role, "source"); assert.equal(contribution.context.kind, "reviewed-source"); if (contribution.context.kind === "reviewed-source") assert.equal(contribution.context.currentness, "current"); assert.equal(wire.includes("https://example.test/source"), false); assert.equal(wire.includes("Directory title"), false);
  const composition: BasisCompositionInputV2 = { version: "surface.basis-projection/v2", answer: { owner: { authority: "@kontourai/thread" }, state: "available", observedAt: at, value: { ref: answer, fact: "answer-observed", observedAt: at } }, assessment: { owner: { authority: "@kontourai/surface" }, state: "available", observedAt: at, value: assessment(evidence) }, contributions: [{ owner: { authority: "@kontourai/fieldwork" }, state: "available", observedAt: at, value: [contribution] }] };
  const projection = composeBasisProjectionV2(composition);
  assert.equal(projection.standing, "assessed-with-gaps"); assert.equal(projection.regions.sources.length, 1); assert.equal(projection.relationships.some((edge) => edge.kind === "supports"), false);
  const view = buildBasisPanelViewModel(projection); assert.equal(view.state, "ready"); if (view.state === "ready") assert.deepEqual(view.contextGroups.find((group) => group.id === "sources")?.items[0]?.facts.map((fact) => fact.label), ["Review", "Currentness", "Checked", "Reviewed", "Historical capture", "Observed capture"]);
});

test("v1 remains frozen while v2 accepts the reviewed-source fixture", async () => {
  const fixture = JSON.parse(await readFile("examples/fixtures/station-basis-context.v2.json", "utf8"));
  assert.equal(parseBasisComposition(fixture).ok, false);
  const parsed = parseBasisCompositionV2(fixture);
  assert.equal(parsed.ok, true); if (!parsed.ok) return;
  const projection = composeBasisProjectionV2(parsed.value);
  assert.equal(parseBasisProjectionV2(projection).ok, true);
});

test("v2 rejects unsafe Fieldwork gaps and ignores a contribution for another answer", async () => {
  const fixture = JSON.parse(await readFile("examples/fixtures/station-basis-context.v2.json", "utf8"));
  fixture.contributions[0].value[0].gaps = [{ code: "unsafe", message: "https://private.example/path" }];
  assert.equal(parseBasisCompositionV2(fixture).ok, false);
  delete fixture.contributions[0].value[0].gaps;
  fixture.contributions[0].value[0].answer.messageId = "other-message";
  assert.equal(parseBasisCompositionV2(fixture).ok, false);
});
