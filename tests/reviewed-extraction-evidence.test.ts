import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020Import from "ajv/dist/2020.js";
import { buildReviewDecision } from "@kontourai/survey/review-workbench";
import type { ReviewItem } from "@kontourai/survey";
import {
  buildTrustReport,
  projectReviewedExtractionEvidence,
  restoreReviewedExtractionEvidence,
  validateTrustBundle,
  type ReviewedExtractionEvidenceInput,
} from "../src/index.js";

const fixtureUrl = new URL("tests/fixtures/reviewed-extraction-evidence.v1.json", `file://${process.cwd()}/`);
async function fixture(): Promise<ReviewedExtractionEvidenceInput> { return JSON.parse(await readFile(fixtureUrl, "utf8")) as ReviewedExtractionEvidenceInput; }

test("landed Survey import, ReviewItem, and ReviewDecision round-trip through Hachure Evidence", async () => {
  const input = await fixture();
  const projection = projectReviewedExtractionEvidence(input);
  assert.deepEqual(restoreReviewedExtractionEvidence(projection.evidence), input);
  assert.deepEqual(projection.gaps, []);
  assert.equal(projection.evidence.supportStrength, "entails");
  assert.equal(projection.evidence.passing, true);
  assert.equal(projection.evidence.blocking, false);
  assert.equal(projection.compatibility.upstreamSchemaChangeNeeded, false);

  const schema = JSON.parse(await readFile(new URL("schemas/evidence.schema.json", `file://${process.cwd()}/`), "utf8"));
  const Ajv2020 = (Ajv2020Import as unknown as { default?: unknown }).default ?? Ajv2020Import;
  const AjvCtor = Ajv2020 as new (options: Record<string, unknown>) => { compile: (schema: unknown) => ((value: unknown) => boolean) & { errors?: unknown } };
  const ajv = new AjvCtor({ strict: false, validateFormats: false });
  const validateEvidenceSchema = ajv.compile(schema);
  assert.equal(validateEvidenceSchema(projection.evidence), true, JSON.stringify(validateEvidenceSchema.errors));

  const bundle = validateTrustBundle(bundleFor(input, projection.evidence));
  assert.deepEqual(bundle.evidence[0], projection.evidence);
});

test("review disposition, candidate confidence, and structural trust remain independent", async () => {
  const input = await fixture();
  input.importRecord.spec.envelope.result.proposals[0]!.confidence = 0.04;
  input.reviewItem!.spec.candidates[0]!.confidence = 0.04;
  input.structuralTrust = "unvalidated";
  const projection = projectReviewedExtractionEvidence(input);
  assert.equal(input.reviewDecision!.spec.resolution, undefined);
  assert.equal(input.importRecord.spec.envelope.result.proposals[0]!.confidence, 0.04);
  assert.deepEqual(projection.gaps, [{ kind: "structural-trust", status: "unvalidated" }]);
  assert.equal(projection.evidence.supportStrength, "cited");
  assert.equal(projection.evidence.passing, false);
  assert.equal(projection.evidence.blocking, true);
});

test("artifact state retains canonical details and becomes an in-band portable gap", async () => {
  const input = await fixture();
  const result = input.importRecord.spec.envelope.result;
  result.preparedArtifactState = {
    status: "digest-mismatch",
    requestedRef: result.preparedArtifact!.ref,
    canonicalRef: result.preparedArtifact!.ref,
    actualDigest: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    actualContentLength: 17,
  };
  input.importRecord.status = { state: "unresolved", diagnostics: [{ kind: "digest-mismatch" }] };
  delete input.reviewItem;
  delete input.reviewDecision;
  const projection = projectReviewedExtractionEvidence(input);
  assert.deepEqual(projection.gaps[0], {
    kind: "digest-mismatch", requestedRef: result.preparedArtifact!.ref, canonicalRef: result.preparedArtifact!.ref,
    expectedDigest: result.preparedArtifact!.digest, actualDigest: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", actualContentLength: 17,
  });
  assert.deepEqual((projection.evidence.metadata!.reviewedExtraction as { gaps: unknown[] }).gaps, projection.gaps);
  assert.equal(projection.evidence.supportStrength, "cited");
});

test("rejected or structurally invalid extraction evidence cannot satisfy policy verification", async () => {
  for (const mode of ["rejected", "invalid"] as const) {
    const input = await fixture();
    if (mode === "rejected") { input.reviewDecision!.spec.status = "rejected"; input.reviewDecision!.spec.resolution = "rejected"; }
    else input.structuralTrust = "invalid";
    const projection = projectReviewedExtractionEvidence(input);
    const report = buildTrustReport(validateTrustBundle(bundleFor(input, projection.evidence)), { now: new Date("2026-07-20T00:06:00.000Z") });
    assert.notEqual(report.claims[0]!.status, "verified");
    assert.equal(projection.evidence.supportStrength, "cited");
    assert.equal(projection.evidence.passing, false);
    assert.equal(projection.evidence.blocking, true);
  }
});

test("restore rejects tampering across every portable binding", async () => {
  const projection = projectReviewedExtractionEvidence(await fixture());
  for (const patch of [
    { claimId: "claim.other" }, { evidenceType: "document_citation" }, { method: "observation" },
    { observedAt: "2026-07-20T00:00:01.000Z" }, { collectedBy: "collector:other" },
    { sourceRef: "source:other" }, { sourceLocator: "chars:1-6" }, { excerptOrSummary: "Bravo" },
    { integrityRef: undefined }, { supportStrength: "cited" }, { passing: false }, { blocking: true },
  ] as Array<Record<string, unknown>>) {
    assert.throws(() => restoreReviewedExtractionEvidence({ ...projection.evidence, ...patch } as typeof projection.evidence), /integrity binding|bound profile/);
  }
  const changedDecision = structuredClone(projection.evidence);
  const metadata = changedDecision.metadata!.reviewedExtraction as { input: ReviewedExtractionEvidenceInput };
  metadata.input.reviewDecision!.spec.rationale = "tampered";
  assert.throws(() => restoreReviewedExtractionEvidence(changedDecision), /integrity binding/);
});

test("projection fails closed on credentials, incoherent locators, and forged artifact identity", async () => {
  const credential = await fixture(); credential.importRecord.spec.envelope.source.ref = "https://user:secret@example.test/source";
  assert.throws(() => projectReviewedExtractionEvidence(credential), /authorization material/);
  const locator = await fixture(); locator.importRecord.spec.envelope.result.proposals[0]!.provenance.locator = "chars:0-4";
  assert.throws(() => projectReviewedExtractionEvidence(locator), /incoherent/);
  const artifact = await fixture(); artifact.importRecord.spec.envelope.result.preparedArtifact!.ref = "traverse-prepared-artifact:v1:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.throws(() => projectReviewedExtractionEvidence(artifact), /identity binding/);
  const sparse = await fixture(); sparse.importRecord.spec.envelope.result.proposals[0]!.candidateValue = Array(1);
  assert.throws(() => projectReviewedExtractionEvidence(sparse), /sparse or extended array/);
});

test("accept-proposed uses Survey's real verified decision with no fabricated resolution", async () => {
  const input = await fixture();
  assert.equal(input.reviewDecision!.spec.status, "verified");
  assert.equal(input.reviewDecision!.spec.resolution, undefined);
  const projection = projectReviewedExtractionEvidence(input);
  assert.equal(projection.evidence.supportStrength, "entails");
  assert.equal(projection.gaps.length, 0);
});

test("accepts Survey's direct in-memory ReviewDecision without a serialization repair step", async () => {
  const input = await fixture();
  const decision = buildReviewDecision({
    item: input.reviewItem as unknown as ReviewItem,
    decision: "accept-proposed",
    note: "The exact source span supports the selected value.",
    actorId: "reviewer:fixture",
    reviewedAt: "2026-07-20T00:05:00.000Z",
  });
  assert.ok(decision);
  assert.equal(hasUndefinedOwnProperty(decision), false);
  input.reviewDecision = decision as unknown as ReviewedExtractionEvidenceInput["reviewDecision"];
  const projection = projectReviewedExtractionEvidence(input);
  assert.equal(projection.evidence.supportStrength, "entails");
  assert.deepEqual(projection.gaps, []);
});

test("owner invariants reject credential identities, occurrence drift, artifact-state drift, and contradictory decisions", async () => {
  for (const credential of ["sk-secret", "ghp_token", `AKIA${"ABCDEFGHIJKLMNOP"}`, `ASIA${"ABCDEFGHIJKLMNOP"}`, "eyJabc.eyJdef.sig", "Bearer abcdef"]) {
    const input = await fixture(); input.importRecord.spec.envelope.result.provider = credential;
    assert.throws(() => projectReviewedExtractionEvidence(input), /credential-free stable identity/);
  }
  for (const mutate of [
    (input: ReviewedExtractionEvidenceInput) => { input.importRecord.spec.envelope.result.proposals[0]!.provenance.occurrence.count = 1; },
    (input: ReviewedExtractionEvidenceInput) => { input.importRecord.spec.envelope.result.proposals[0]!.provenance.occurrence.selected.index = 2; },
    (input: ReviewedExtractionEvidenceInput) => { input.importRecord.spec.envelope.result.proposals[0]!.provenance.occurrence.hintUsed = true; },
  ]) { const input=await fixture(); mutate(input); assert.throws(()=>projectReviewedExtractionEvidence(input),/occurrence/); }
  const state = await fixture(); (state.importRecord.spec.envelope.result.preparedArtifactState as { requestedRef: string }).requestedRef = "source:different";
  assert.throws(() => projectReviewedExtractionEvidence(state), /requested\/canonical relationship/);
  const extra = await fixture(); (extra.importRecord.spec.envelope.result.preparedArtifactState as unknown as Record<string, unknown>).extra = true;
  assert.throws(() => projectReviewedExtractionEvidence(extra), /unexpected/);
  const contradictory = await fixture(); contradictory.reviewDecision!.spec.resolution = "could_not_confirm"; contradictory.reviewDecision!.spec.status = "verified";
  assert.throws(() => projectReviewedExtractionEvidence(contradictory), /cannot use status/);
});

function bundleFor(input: ReviewedExtractionEvidenceInput, evidence: ReturnType<typeof projectReviewedExtractionEvidence>["evidence"]): Parameters<typeof validateTrustBundle>[0] {
  const proposal = input.importRecord.spec.envelope.result.proposals[input.proposalIndex]!;
  return {
    schemaVersion: 5, source: "reviewed-extraction.fixture",
    claims: [{ id: input.claimId, subjectType: "record", subjectId: "fixture", facet: "directory", claimType: "directory.field", fieldOrBehavior: proposal.fieldPath, value: proposal.candidateValue, verificationPolicyId: "policy.reviewed-extraction", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:05:00.000Z" }],
    evidence: [evidence],
    policies: [{ id: "policy.reviewed-extraction", claimType: "directory.field", requiredEvidence: ["source_excerpt"], requiredMethods: ["extraction"], acceptanceCriteria: ["Reviewed and grounded extraction"], reviewAuthority: "reviewer", validityRule: { kind: "manual" }, stalenessTriggers: [], conflictRules: [], impactLevel: "medium" }],
    events: [{ id: "event.review", claimId: input.claimId, type: "verification", status: "verified", createdAt: "2026-07-20T00:05:00.000Z", verifiedAt: "2026-07-20T00:05:00.000Z", actor: "reviewer:fixture", method: "review", evidenceIds: [input.evidenceId] }],
  };
}

function hasUndefinedOwnProperty(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return Object.values(value).some((entry) => entry === undefined || hasUndefinedOwnProperty(entry));
}
