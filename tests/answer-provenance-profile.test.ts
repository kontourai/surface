import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildTrustPanelProjection,
  buildTrustReport,
  createAnswerAssessmentReferenceExtension,
  getExtension,
  registerExtension,
  resolveClaimTypeDefinition,
  validateTrustBundle,
  type SurfaceExtension,
  type TrustBundle,
} from "../src/index.js";
import { buildAnswerAssessmentProjection, composeBasisProjection, type BasisCompositionInput } from "../src/basis/index.js";

const at = "2026-08-25T00:00:03.000Z";

function answerProvenanceExtension(): SurfaceExtension {
  const reference = createAnswerAssessmentReferenceExtension({
    name: "answer-provenance-example",
    displayName: "Answer Provenance Example",
    vocab: {},
    theme: { brandName: "Answer Provenance Example" },
  });
  return {
    ...reference,
    claimTypes: [
      { id: "product.answer.llm-answer", displayName: "LLM answer content", description: "A concrete content assertion with frozen-source and owner-review backing.", defaultImpact: "medium", defaultFacet: "answer-provenance", policyTemplateId: "product.answer.llm-answer-policy/v1", metadataFields: [{ key: "conversationId", label: "Conversation ID", type: "string" }, { key: "messageId", label: "Message ID", type: "string" }, { key: "model", label: "Model", type: "string" }] },
      { id: "product.answer.routing-receipt", displayName: "Routing receipt", description: "Request context; never semantic support for the answer.", defaultImpact: "low", defaultFacet: "answer-provenance", metadataFields: [{ key: "requestId", label: "Request ID", type: "string" }, { key: "routeId", label: "Route ID", type: "string" }] },
      { id: "product.answer.tool-use", displayName: "Tool-use receipt", description: "Tool context; never semantic support for the answer without an explicit evidence edge.", defaultImpact: "low", defaultFacet: "answer-provenance", metadataFields: [{ key: "requestId", label: "Request ID", type: "string" }, { key: "toolName", label: "Tool name", type: "string" }, { key: "invocationId", label: "Invocation ID", type: "string" }] },
    ],
    policyTemplates: [
      ...(reference.policyTemplates ?? []),
      { id: "product.answer.llm-answer-policy/v1", template: { claimType: "product.answer.llm-answer", requiredEvidence: ["source_excerpt", "human_attestation"], requiredMethods: ["observation", "attestation"], acceptanceCriteria: ["A frozen source excerpt states this exact answer content.", "The owner review confirms the content against that frozen source."], reviewAuthority: "answer-product-owner", validityRule: { kind: "duration", durationDays: 7 }, stalenessTriggers: ["frozen source is replaced", "content review is superseded"], conflictRules: ["A blocking failed content review disputes the answer claim."], impactLevel: "medium" } },
    ],
  };
}

function answerRead(): BasisCompositionInput["answer"] {
  return { owner: { authority: "@kontourai/thread" }, state: "available", observedAt: at, value: { ref: { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "assistant-message", standing: "observed", threadId: "conversation-17", messageId: "message-42" }, fact: "answer-observed", observedAt: at } };
}

test("answer-provenance reference bundle validates, registers a product profile, and renders end-to-end", async () => {
  const bundle = validateTrustBundle(JSON.parse(await readFile("examples/answer-provenance.json", "utf8"))) as TrustBundle;
  assert.equal(bundle.schemaVersion, 7);
  const extension = answerProvenanceExtension();
  registerExtension(extension);
  assert.equal(getExtension(extension.name), extension);
  assert.equal(resolveClaimTypeDefinition("product.answer.llm-answer")?.defaultFacet, "answer-provenance");
  assert.equal(resolveClaimTypeDefinition("product.answer.routing-receipt")?.policyTemplateId, undefined);

  const report = buildTrustReport(bundle, { id: "example-answer-provenance-bundle", now: new Date(at) });
  const panel = buildTrustPanelProjection(report);
  assert.deepEqual(panel.claims.map((claim) => claim.id), ["answer.supported", "routing.receipt", "tool.use"]);
  assert.equal(panel.claims.find((claim) => claim.id === "answer.supported")?.status, "verified");

  const assessment = buildAnswerAssessmentProjection(report, "answer.supported");
  assert.equal(assessment.policy?.satisfied, true);
  const projection = composeBasisProjection({ version: "surface.basis-projection/v1", answer: answerRead(), assessment: { owner: { authority: "@kontourai/surface" }, state: "available", observedAt: at, value: assessment }, contributions: [] });
  assert.equal(projection.standing, "policy-met");
  assert.deepEqual(projection.relationships.map((edge) => edge.kind), ["supports", "supports"]);
});

test("all runtime context receipts remain when semantic content support is removed", async () => {
  const bundle = validateTrustBundle(JSON.parse(await readFile("examples/answer-provenance.json", "utf8"))) as TrustBundle;
  const runtimeContextIds = bundle.evidence.filter((item) => item.evidenceType === "runtime_observation").map((item) => item.id);
  assert.deepEqual(runtimeContextIds, ["routing.context-receipt", "tool.context-receipt"]);
  for (const id of ["answer.frozen-source-excerpt", "answer.content-review"]) bundle.evidence.find((item) => item.id === id)!.supportStrength = "cited";
  const report = buildTrustReport(bundle, { id: "example-answer-provenance-cited", now: new Date(at) });
  const assessment = buildAnswerAssessmentProjection(report, "answer.supported");
  assert.equal(assessment.policy?.satisfied, false);
  const projection = composeBasisProjection({ version: "surface.basis-projection/v1", answer: answerRead(), assessment: { owner: { authority: "@kontourai/surface" }, state: "available", observedAt: at, value: assessment }, contributions: [] });
  assert.equal(projection.standing, "assessed-with-gaps");
  assert.deepEqual(projection.relationships.map((edge) => edge.kind), ["cites", "cites"]);
  assert.deepEqual(report.evidence.filter((item) => item.evidenceType === "runtime_observation").map((item) => item.id), runtimeContextIds);
});
