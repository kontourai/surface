import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildReviewedExtractionSourceState,
  buildTrustReport,
  buildUnknownReviewedExtractionSourceState,
  evaluateAnswerAssessmentPolicy,
  evaluateReviewedGroundingPolicy,
  ordinaryVerificationPolicy,
  projectReviewedExtractionEvidence,
  restoreReviewedExtractionEvidence,
  ReviewedExtractionImportRecordUnresolvedError,
  ReviewedExtractionSourceObservationError,
  reviewedExtractionEvidenceReferenceProfile,
  reviewedExtractionImportRecordDigest,
  attachImportRecords,
  findUncarriedImportRecordDigests,
  mergeBundles,
  resolverFromBundle,
  validateTrustBundle,
  type ReviewedExtractionEvidenceInput,
  type ReviewedExtractionProjectionOptions,
  type ReviewedExtractionSourceObservation,
  type ReviewedGroundingPolicy,
  type SurveyExtractionEnvelopeImport,
} from "../src/index.js";
import { canonicalJson, sha256Hex } from "../src/canonical-digest.js";
import { restoreReviewedExtractionEvidenceBrowser } from "../src/reviewed-extraction-evidence-browser.js";
import { buildReviewedSourceBasisContribution, type AnswerAssessmentProjection } from "../src/basis/index.js";
import type { Evidence, TrustBundle } from "../src/types.js";

const v2: ReviewedExtractionProjectionOptions = { profile: reviewedExtractionEvidenceReferenceProfile };
const fixtureUrl = new URL("tests/fixtures/reviewed-extraction-evidence.v1.json", `file://${process.cwd()}/`);
async function fixture(): Promise<ReviewedExtractionEvidenceInput> { return JSON.parse(await readFile(fixtureUrl, "utf8")) as ReviewedExtractionEvidenceInput; }

/** The fixture with its import record grown to `count` proposals (one claim target each), citing `index`. */
async function runOf(count: number, index = 0): Promise<ReviewedExtractionEvidenceInput> {
  const input = await fixture();
  const spec = input.importRecord.spec;
  const cited = spec.envelope.result.proposals[0]!;
  const target = spec.claimTargets[0]!;
  spec.envelope.result.proposals = Array.from({ length: count }, (_, i) => i === index ? cited : { ...structuredClone(cited), fieldPath: `field.${i}` });
  spec.claimTargets = Array.from({ length: count }, (_, i) => i === index ? target : { ...target, fieldOrBehavior: `field.${i}` });
  input.proposalIndex = index;
  return input;
}

function resolverFor(...records: SurveyExtractionEnvelopeImport[]) {
  const byDigest = new Map(records.map((record) => [reviewedExtractionImportRecordDigest(record), record]));
  return (digest: string) => byDigest.get(digest);
}

function profileInput(evidence: Evidence): Record<string, unknown> {
  return (evidence.metadata!.reviewedExtraction as { input: Record<string, unknown> }).input;
}

test("a v2 evidence item embeds one proposal and its size does not grow with the run", async () => {
  const one = await runOf(1);
  const many = await runOf(32);
  const small = projectReviewedExtractionEvidence(one, v2).evidence;
  const large = projectReviewedExtractionEvidence(many, v2).evidence;
  for (const evidence of [small, large]) {
    const input = profileInput(evidence);
    assert.equal("importRecord" in input, false);
    assert.deepEqual(input.proposal, one.importRecord.spec.envelope.result.proposals[0]);
    assert.equal(JSON.stringify(evidence).split('"provenance"').length - 1, 1);
  }
  // Same fields, different record digest: the serialized size is identical up to a small constant.
  assert.ok(Math.abs(JSON.stringify(large).length - JSON.stringify(small).length) < 64);
  // v1 embeds every proposal, which is the growth v2 removes.
  const v1Growth = JSON.stringify(projectReviewedExtractionEvidence(many).evidence).length - JSON.stringify(projectReviewedExtractionEvidence(one).evidence).length;
  assert.ok(v1Growth > 31 * JSON.stringify(one.importRecord.spec.envelope.result.proposals[0]).length);
});

test("v2 evidence restores with the matching import record to the exact v1 input", async () => {
  const input = await runOf(8, 5);
  const evidence = projectReviewedExtractionEvidence(input, v2).evidence;
  assert.equal(profileInput(evidence).importRecordDigest, reviewedExtractionImportRecordDigest(input.importRecord));
  assert.deepEqual(restoreReviewedExtractionEvidence(evidence, { resolveImportRecord: resolverFor(input.importRecord) }), input);
  // Anchors are the same as the equivalent v1 evidence.
  const { metadata: _v1, ...v1Anchors } = projectReviewedExtractionEvidence(input).evidence;
  const { metadata: _v2, ...v2Anchors } = evidence;
  assert.deepEqual(v2Anchors, v1Anchors);
  assert.deepEqual(await restoreReviewedExtractionEvidenceBrowser(evidence, { resolveImportRecord: resolverFor(input.importRecord) }), evidence);
});

test("v2 restore refuses an altered or different import record and a missing one", async () => {
  const input = await runOf(8, 5);
  const evidence = projectReviewedExtractionEvidence(input, v2).evidence;
  for (const altered of [0, 7]) {
    const record = structuredClone(input.importRecord);
    record.spec.envelope.result.proposals[altered]!.candidateValue = "Tampered";
    assert.throws(() => restoreReviewedExtractionEvidence(evidence, { resolveImportRecord: () => record }), /Resolved import record does not match the bound importRecordDigest/);
    await assert.rejects(restoreReviewedExtractionEvidenceBrowser(evidence, { resolveImportRecord: () => record }), /does not match the bound importRecordDigest/);
  }
  const other = (await runOf(9, 5)).importRecord;
  assert.throws(() => restoreReviewedExtractionEvidence(evidence, { resolveImportRecord: () => other }), /does not match the bound importRecordDigest/);
  for (const options of [{}, { resolveImportRecord: () => undefined }]) {
    assert.throws(() => restoreReviewedExtractionEvidence(evidence, options), (error: unknown) => error instanceof ReviewedExtractionImportRecordUnresolvedError && error.code === "import-record-unresolved" && error.importRecordDigest === profileInput(evidence).importRecordDigest);
  }
});

test("v2 restore refuses an embedded proposal that is not the record's, even with a recomputed profile digest", async () => {
  const input = await runOf(8, 5);
  const resolveImportRecord = resolverFor(input.importRecord);
  const evidence = structuredClone(projectReviewedExtractionEvidence(input, v2).evidence);
  (profileInput(evidence).proposal as { candidateValue: unknown }).candidateValue = "Beta";
  const { metadata, ...anchors } = evidence;
  const reviewed = metadata!.reviewedExtraction as { profileDigest: string; input: unknown; gaps: unknown };
  reviewed.profileDigest = `sha256:${sha256Hex(canonicalJson({ anchors, input: reviewed.input, gaps: reviewed.gaps }))}`;
  assert.throws(() => restoreReviewedExtractionEvidence(evidence, { resolveImportRecord }), /Embedded proposal does not match the resolved import record/);
  const embedded = structuredClone(projectReviewedExtractionEvidence(input, v2).evidence);
  profileInput(embedded).importRecord = input.importRecord;
  assert.throws(() => restoreReviewedExtractionEvidence(embedded, { resolveImportRecord }), /cannot embed an import record/);
});

test("existing v1 evidence still restores without a resolver", async () => {
  const input = await fixture();
  const evidence = projectReviewedExtractionEvidence(input).evidence;
  assert.equal((evidence.metadata!.reviewedExtraction as { profile: string }).profile, "surface.reviewed-extraction-evidence/v1");
  assert.deepEqual(restoreReviewedExtractionEvidence(evidence), input);
  assert.deepEqual(restoreReviewedExtractionEvidence(evidence, { resolveImportRecord: () => { throw new Error("v1 must not resolve"); } }), input);
});

const policy: ReviewedGroundingPolicy = {
  id: "policy.publish-reviewed-directory", action: "publish-directory-entry", requiredClaimIds: ["claim.directory.title"],
  requireExactLocator: true, requirePreparedArtifact: true, requireAcceptedReview: true, requireValidatedStructure: true, requireCurrentSource: true,
};
const claims = [{ id: "claim.directory.title", value: "Alpha" }];
const hex = (char: string) => char.repeat(64);
const observation: ReviewedExtractionSourceObservation = {
  version: "surface.reviewed-source-observation/v1",
  owner: { authority: "fieldwork-source-check-receipt/v2", observationRef: "observation-1" },
  expected: { snapshotRef: "snapshot:fixture-v1", sourceId: "source-1", resourceRef: "https://example.test/source", capturedAt: "2026-07-20T00:00:00.000Z", envelopeDigest: { algorithm: "sha256", value: hex("a") }, contentDigest: { algorithm: "sha256", value: hex("b") } },
  observed: { snapshotRef: "capture-2", sourceId: "source-1", resourceRef: "https://example.test/source", capturedAt: "2026-07-21T00:00:00.000Z", envelopeDigest: { algorithm: "sha256", value: hex("c") }, contentDigest: { algorithm: "sha256", value: hex("b") } },
};
const checkedAt = "2026-07-21T00:01:00.000Z";

test("grounding policy and source state treat v2 evidence with a resolver exactly like v1", async () => {
  const input = await runOf(8, 5);
  const resolveImportRecord = resolverFor(input.importRecord);
  const v1Evidence = projectReviewedExtractionEvidence(input).evidence;
  const v2Evidence = projectReviewedExtractionEvidence(input, v2).evidence;
  const v1State = buildReviewedExtractionSourceState(v1Evidence, observation, checkedAt);
  const v2State = buildReviewedExtractionSourceState(v2Evidence, observation, checkedAt, { resolveImportRecord });
  assert.deepEqual(v2State, v1State);
  const v1Decision = evaluateReviewedGroundingPolicy({ claims, policy, evidence: [v1Evidence], sourceStates: [v1State] });
  const v2Decision = evaluateReviewedGroundingPolicy({ claims, policy, evidence: [v2Evidence], sourceStates: [v2State], resolveImportRecord });
  assert.equal(v1Decision.outcome, "allowed");
  assert.deepEqual(v2Decision, v1Decision);
  assert.deepEqual(await buildUnknownReviewedExtractionSourceState(v2Evidence, checkedAt, { resolveImportRecord }), await buildUnknownReviewedExtractionSourceState(v1Evidence, checkedAt));
});

test("grounding policy and source state refuse v2 evidence without a resolver with a typed error", async () => {
  const input = await runOf(8, 5);
  const evidence = projectReviewedExtractionEvidence(input, v2).evidence;
  const importRecordDigest = reviewedExtractionImportRecordDigest(input.importRecord);
  const decision = evaluateReviewedGroundingPolicy({ claims, policy, evidence: [evidence] });
  assert.equal(decision.outcome, "refused");
  assert.deepEqual(decision.gaps, [{ kind: "import-record-unresolved", claimId: "claim.directory.title", evidenceId: evidence.id, importRecordDigest }]);
  const wrong = evaluateReviewedGroundingPolicy({ claims, policy, evidence: [evidence], resolveImportRecord: () => ({ ...structuredClone(input.importRecord), metadata: { name: "other", producerNamespace: "directory-producer" } }) });
  assert.deepEqual(wrong.gaps, [{ kind: "invalid-reviewed-evidence", claimId: "claim.directory.title", evidenceId: evidence.id }]);
  const unresolved = (error: unknown) => error instanceof ReviewedExtractionSourceObservationError && error.code === "import-record-unresolved";
  assert.throws(() => buildReviewedExtractionSourceState(evidence, observation, checkedAt), unresolved);
  await assert.rejects(buildUnknownReviewedExtractionSourceState(evidence, checkedAt), unresolved);
});

async function reviewedReport(evidence: Evidence, claimId: string): Promise<ReturnType<typeof buildTrustReport>> {
  const bundle: TrustBundle = {
    schemaVersion: 5, source: "fixture:reviewed-answer",
    claims: [{ id: claimId, subjectType: "record", subjectId: "fixture", claimType: ordinaryVerificationPolicy.claimType, fieldOrBehavior: "title", value: "Alpha", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:05:00.000Z", verificationPolicyId: ordinaryVerificationPolicy.id }],
    evidence: [evidence],
    policies: [{ ...ordinaryVerificationPolicy, requiredEvidence: ["source_excerpt"] }],
    events: [{ id: "event.review", claimId, status: "verified", actor: "reviewer:fixture", method: "review", evidenceIds: [evidence.id], createdAt: "2026-07-20T00:05:00.000Z" }],
  };
  return buildTrustReport(bundle, { now: new Date("2026-07-21T00:00:00.000Z") });
}

test("answer assessment binds a v2 reviewed value only with a resolver", async () => {
  const input = await runOf(8, 5);
  const report = await reviewedReport(projectReviewedExtractionEvidence(input, v2).evidence, input.claimId);
  assert.equal(evaluateAnswerAssessmentPolicy(report, input.claimId, { resolveImportRecord: resolverFor(input.importRecord) })?.outcome, "satisfied");
  assert.deepEqual(evaluateAnswerAssessmentPolicy(report, input.claimId)?.reasons, ["value-unbound"]);
});

test("the Basis reviewed-source adapter accepts v2 evidence with a resolver and refuses it without", async () => {
  const input = await runOf(8, 5);
  const resolveImportRecord = resolverFor(input.importRecord);
  const at = "2026-08-25T00:00:00.000Z";
  const build = async (evidence: Evidence, resolver?: typeof resolveImportRecord) => {
    const sourceState = buildReviewedExtractionSourceState(evidence, observation, at, { resolveImportRecord });
    const assessment: AnswerAssessmentProjection = { version: "surface.answer-assessment/v2", ref: { authority: "@kontourai/surface", schemaVersion: "surface.answer-assessment/v2", kind: "answer-assessment", bundleId: "bundle-1", claimId: "answer-claim" }, found: true, bundle: { id: "bundle-1", schemaVersion: 1, source: "Surface", generatedAt: at }, claim: { id: "answer-claim", subject: { subjectType: "answer", subjectId: "answer-1" }, status: "assessed", freshness: null }, policy: null, evidence: { cited: [{ id: "citation-1", label: "Cited source", sourceRef: evidence.sourceRef, locator: evidence.sourceLocator ?? null, observedAt: at, supportStrength: "cited", result: "passed", blocksClaim: false }], entails: [], undeclared: [], counterevidence: [] }, derivation: { available: true, directInputs: [{ claimId: evidence.claimId, status: "verified", source: "derivationEdges", edge: { method: "rule-application", supportStrength: "strong", rationale: null } }] }, gaps: [] };
    return buildReviewedSourceBasisContribution({
      answer: { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "assistant-message", standing: "observed", threadId: "thread-42", messageId: "message-9" },
      ref: { authority: "@kontourai/fieldwork", schemaVersion: "fieldwork.kontourai.io/v1", kind: "reviewed-web-source", exactRef: `fieldwork-reviewed-source:v1:${hex("d")}`, evidenceId: evidence.id },
      evidence, sourceState,
      association: { version: "surface.reviewed-source-basis-association/v1", sourceClaimId: evidence.claimId, sourceEvidenceId: evidence.id, answerClaimId: "answer-claim", answerCitationEvidenceId: "citation-1", assessmentRevision: 1 },
      assessment: { revision: 1, value: assessment },
      ...(resolver ? { resolveImportRecord: resolver } : {}),
    });
  };
  const v2Evidence = projectReviewedExtractionEvidence(input, v2).evidence;
  assert.deepEqual(await build(v2Evidence, resolveImportRecord), await build(projectReviewedExtractionEvidence(input).evidence));
  await assert.rejects(build(v2Evidence), /failed: invalid-reviewed-evidence\./);
});

/** A bundle of `count` v2 items that all cite proposals of one import record; item 0 carries the record sidecar. */
async function selfContainedBundle(count: number): Promise<{ record: SurveyExtractionEnvelopeImport; evidence: Evidence[] }> {
  const input = await runOf(count, 0);
  const evidence = Array.from({ length: count }, (_, i) => projectReviewedExtractionEvidence({ ...structuredClone(input), evidenceId: `evidence.${i}`, claimId: `claim.${i}` }, { ...v2, includeImportRecord: i === 0 }).evidence);
  return { record: input.importRecord, evidence };
}
const sidecarOf = (evidence: Evidence) => (evidence.metadata!.reviewedExtraction as { importRecord?: SurveyExtractionEnvelopeImport }).importRecord;
const unresolvedError = (error: unknown) => error instanceof ReviewedExtractionImportRecordUnresolvedError;

test("a bundle carrying each import record once verifies from the bundle alone", async () => {
  const { record, evidence } = await selfContainedBundle(8);
  assert.deepEqual(sidecarOf(evidence[0]!), record);
  assert.equal(evidence.slice(1).some((item) => sidecarOf(item) !== undefined), false);
  assert.equal("importRecord" in profileInput(evidence[0]!), false);
  // The sidecar is outside the digested input: the carrier's anchors and profile digest equal a sidecar-free item's.
  const plain = projectReviewedExtractionEvidence({ ...(await runOf(8, 0)), evidenceId: "evidence.0", claimId: "claim.0" }, v2).evidence;
  assert.equal((evidence[0]!.metadata!.reviewedExtraction as { profileDigest: string }).profileDigest, (plain.metadata!.reviewedExtraction as { profileDigest: string }).profileDigest);
  // It survives bundle validation, and a bundle-only reader restores every item.
  const bundle = validateTrustBundle({ schemaVersion: 5, source: "fixture:v2-bundle", claims: evidence.map((item) => ({ id: item.claimId, subjectType: "record", subjectId: "fixture", claimType: "directory.field", fieldOrBehavior: "title", value: "Alpha", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:05:00.000Z" })), evidence, policies: [], events: [] });
  const resolveImportRecord = resolverFromBundle(bundle);
  for (const item of bundle.evidence) assert.deepEqual(restoreReviewedExtractionEvidence(item, { resolveImportRecord }).importRecord, record);
  // Merge unions evidence verbatim, so the sidecar survives it.
  const merged = mergeBundles([bundle]);
  assert.deepEqual(restoreReviewedExtractionEvidence(merged.evidence[5]!, { resolveImportRecord: resolverFromBundle(merged) }).importRecord, record);
  // The carrier also verifies on its own.
  assert.deepEqual(restoreReviewedExtractionEvidence(evidence[0]!).importRecord, record);
  await restoreReviewedExtractionEvidenceBrowser(evidence[3]!, { resolveImportRecord });
  const decision = evaluateReviewedGroundingPolicy({ claims: [{ id: "claim.3", value: "Alpha" }], policy: { ...policy, requiredClaimIds: ["claim.3"], requireCurrentSource: false }, evidence: bundle.evidence, resolveImportRecord });
  assert.deepEqual(decision.gaps, []);
});

test("a sliced bundle that lost its carrier fails closed as unresolved", async () => {
  const { evidence } = await selfContainedBundle(8);
  const sliced = { evidence: evidence.slice(1) };
  assert.throws(() => restoreReviewedExtractionEvidence(evidence[3]!, { resolveImportRecord: resolverFromBundle(sliced) }), unresolvedError);
  const decision = evaluateReviewedGroundingPolicy({ claims: [{ id: "claim.3", value: "Alpha" }], policy: { ...policy, requiredClaimIds: ["claim.3"] }, evidence: sliced.evidence, resolveImportRecord: resolverFromBundle(sliced) });
  assert.deepEqual(decision.gaps.map((gap) => gap.kind), ["import-record-unresolved"]);
});

test("a tampered sidecar is refused, never skipped", async () => {
  const { evidence } = await selfContainedBundle(8);
  sidecarOf(evidence[0]!)!.spec.envelope.result.proposals[5]!.candidateValue = "Tampered";
  assert.throws(() => restoreReviewedExtractionEvidence(evidence[0]!), /importRecord sidecar does not match the bound importRecordDigest/);
  const resolveImportRecord = resolverFromBundle({ evidence });
  for (const item of evidence) assert.throws(() => restoreReviewedExtractionEvidence(item, { resolveImportRecord }), (error: unknown) => !unresolvedError(error) && /does not match/.test(String(error)));
  const decision = evaluateReviewedGroundingPolicy({ claims: [{ id: "claim.3", value: "Alpha" }], policy: { ...policy, requiredClaimIds: ["claim.3"] }, evidence, resolveImportRecord });
  assert.deepEqual(decision.gaps.map((gap) => gap.kind), ["invalid-reviewed-evidence"]);
});

test("two sidecars with the same digest and different content refuse every item of that record", async () => {
  const { evidence } = await selfContainedBundle(8);
  // A second carrier claims the same digest but carries different content; the genuine carrier comes first.
  const forged = structuredClone(evidence[0]!);
  forged.id = "evidence.forged";
  sidecarOf(forged)!.spec.envelope.result.proposals[5]!.candidateValue = "Tampered";
  const bundle = { evidence: [...evidence, forged] };
  const resolveImportRecord = resolverFromBundle(bundle);
  for (const item of [evidence[0]!, evidence[3]!]) {
    assert.throws(() => restoreReviewedExtractionEvidence(item, { resolveImportRecord }), /bundle carries an import record sidecar that does not match/);
  }
});

test("only v2 evidence may carry an import record sidecar", async () => {
  const input = await fixture();
  assert.throws(() => projectReviewedExtractionEvidence(input, { includeImportRecord: true }), /Only the v2 profile/);
  const v1 = structuredClone(projectReviewedExtractionEvidence(input).evidence);
  (v1.metadata!.reviewedExtraction as Record<string, unknown>).importRecord = input.importRecord;
  assert.throws(() => restoreReviewedExtractionEvidence(v1), /do not match their bound profile/);
});

test("attachImportRecords carries each record exactly once and resolverFromBundle round-trips it", async () => {
  // Two runs interleaved, all items projected with the per-item default (no sidecar).
  const first = await runOf(4, 0);
  const second = await runOf(5, 0);
  second.importRecord.metadata.name = "directory-refresh-18";
  const plain = [first, second, first, second, first].map((input, i) => projectReviewedExtractionEvidence({ ...structuredClone(input), evidenceId: `evidence.${i}`, claimId: `claim.${i}` }, v2).evidence);
  const digests = [reviewedExtractionImportRecordDigest(first.importRecord), reviewedExtractionImportRecordDigest(second.importRecord)];
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence: plain }), digests);
  const attached = attachImportRecords(plain, [first.importRecord, second.importRecord]);
  assert.deepEqual(attached.map((item) => sidecarOf(item) !== undefined), [true, true, false, false, false]);
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence: attached }), []);
  assert.equal(attached[2], plain[2]);
  assert.equal(sidecarOf(plain[0]!), undefined);
  const resolveImportRecord = resolverFromBundle({ evidence: attached });
  attached.forEach((item, i) => assert.deepEqual(restoreReviewedExtractionEvidence(item, { resolveImportRecord }).importRecord, [first, second][i % 2]!.importRecord));
  // Idempotent, and an item that already carries its record is left alone.
  const again = attachImportRecords(attached, [first.importRecord, second.importRecord]);
  assert.deepEqual(again, attached);
  attached.forEach((item, i) => assert.equal(again[i], item));
  // A digest with no supplied record stays uncarried and is reported.
  const partial = attachImportRecords(plain, [first.importRecord]);
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence: partial }), [digests[1]]);
  // An item whose sidecar does not match its digest is refused.
  const tampered = structuredClone(attached);
  sidecarOf(tampered[0]!)!.spec.envelope.result.proposals[2]!.candidateValue = "Tampered";
  assert.throws(() => attachImportRecords(tampered, [first.importRecord]), /evidence\.0 carries an import record sidecar that does not match/);
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence: tampered }), [digests[0]]);
});

test("findUncarriedImportRecordDigests flags a bundle sliced away from its carrier", async () => {
  const { record, evidence } = await selfContainedBundle(8);
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence }), []);
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence: evidence.slice(1) }), [reviewedExtractionImportRecordDigest(record)]);
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence: [projectReviewedExtractionEvidence(await fixture()).evidence] }), []);
});
