import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  attachImportRecords,
  evaluateReviewedGroundingPolicy,
  findUncarriedImportRecordDigests,
  projectReviewedExtractionEvidence,
  resolverFromBundle,
  restoreReviewedExtractionEvidence,
  reviewedExtractionChoice,
  reviewedExtractionEvidenceChoiceProfile,
  reviewedExtractionEvidenceReferenceProfile,
  ReviewedExtractionImportRecordUnresolvedError,
  type ReviewedExtractionChoice,
  type ReviewedExtractionEvidenceInput,
  type ReviewedGroundingPolicy,
  type SurveyExtractionEnvelopeImport,
  type SurveyExtractionReviewDecision,
  type SurveyExtractionReviewItem,
} from "../src/index.js";
import { canonicalJson, sha256Hex } from "../src/canonical-digest.js";
import { restoreReviewedExtractionEvidenceBrowser } from "../src/reviewed-extraction-evidence-browser.js";
import type { Evidence } from "../src/types.js";

const v2 = { profile: reviewedExtractionEvidenceReferenceProfile } as const;
const v3 = { profile: reviewedExtractionEvidenceChoiceProfile } as const;
const producerKey = "survey.kontourai.io/extraction-envelope";

interface SurveyChoiceFixture {
  importRecord: SurveyExtractionEnvelopeImport;
  reviewItem: SurveyExtractionReviewItem;
  reviewDecision: SurveyExtractionReviewDecision;
  claim: { id: string; value: unknown; metadata: { survey: { candidates: Array<{ candidateId: string; value: unknown; selected?: true }> } } };
}

async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(`tests/fixtures/${name}`, `file://${process.cwd()}/`), "utf8")) as T;
}
/** A select-proposed choice of "Beta Inc" over "Alpha Corp", as Survey 7.0.0 writes it. */
const survey = () => json<SurveyChoiceFixture>("reviewed-extraction-choice.survey7.json");
const singleCandidate = () => json<ReviewedExtractionEvidenceInput>("reviewed-extraction-evidence.v1.json");

function bindingIndex(candidate: SurveyExtractionReviewItem["spec"]["candidates"][number]): number {
  return (candidate.producer![producerKey] as { proposalIndex: number }).proposalIndex;
}

/** The v3 input citing the candidate at `candidate` (item order). */
async function citing(candidate: number, fixture?: SurveyChoiceFixture): Promise<ReviewedExtractionEvidenceInput> {
  const source = fixture ?? await survey();
  return {
    evidenceId: `evidence.choice.${candidate}`, claimId: source.claim.id, proposalIndex: bindingIndex(source.reviewItem.spec.candidates[candidate]!),
    importRecord: source.importRecord, reviewItem: source.reviewItem, reviewDecision: source.reviewDecision,
    collectedBy: "survey-importer:fixture", structuralTrust: "validated",
  };
}

function reviewed(evidence: Evidence): { gaps: unknown[]; choice?: ReviewedExtractionChoice; input: Record<string, unknown> } {
  return evidence.metadata!.reviewedExtraction as { gaps: unknown[]; choice?: ReviewedExtractionChoice; input: Record<string, unknown> };
}

function rehash(evidence: Evidence): Evidence {
  const { metadata, ...anchors } = evidence;
  const profile = metadata!.reviewedExtraction as { profileDigest: string; input: unknown; gaps: unknown };
  profile.profileDigest = `sha256:${sha256Hex(canonicalJson({ anchors, input: profile.input, gaps: profile.gaps }))}`;
  return evidence;
}

const strict: ReviewedGroundingPolicy = {
  id: "policy.chosen", action: "publish", requiredClaimIds: [],
  requireExactLocator: true, requirePreparedArtifact: true, requireAcceptedReview: true, requireValidatedStructure: true, requireVerifiedExcerpts: true,
};

test("v1 and v2 project the golden fixture byte-identically to the release before v3", async () => {
  const input = await singleCandidate();
  const bytes = (evidence: Evidence) => sha256Hex(JSON.stringify(evidence));
  // Pinned from 4.3.0 before the v3 profile existed.
  assert.equal(bytes(projectReviewedExtractionEvidence(input).evidence), "70b5c3c7c9fb420aec0d1768cce6f9774b2ed647c99fe3d2c7a59d9e3e451feb");
  const reference = projectReviewedExtractionEvidence(input, v2).evidence;
  assert.equal(reviewed(reference as Evidence).input.importRecordDigest !== undefined, true);
  assert.equal((reference.metadata!.reviewedExtraction as { profileDigest: string }).profileDigest, "sha256:769fe7ed74400255330f49adaf889d848283e73999ad5234b369005b7eb084bc");
  assert.equal(bytes(reference), "533fcbab19a651f90c3b3a3b850ca7afc89db67315b0d3df4c05a03842a2d384");
  assert.equal(bytes(projectReviewedExtractionEvidence(input, { ...v2, includeImportRecord: true }).evidence), "77bcafe8cef2e1580c0b37e8aa4a2b842c6cd46e37685db5504283eb17cdc3d1");
  assert.equal("choice" in (reference.metadata!.reviewedExtraction as object), false);
});

test("v1 and v2 still refuse a Survey 7 chosen conflict; v3 refuses a single-candidate item", async () => {
  const input = await citing(1);
  for (const options of [{}, v2]) assert.throws(() => projectReviewedExtractionEvidence(input, options), /exactly one candidate/);
  const single = await singleCandidate();
  assert.throws(() => projectReviewedExtractionEvidence(single, v3), /records a choice between candidates/);
});

test("a Survey 7 chosen conflict projects, restores from the bundle alone, and grounds the chosen value", async () => {
  const fixture = await survey();
  const inputs = [await citing(0, fixture), await citing(1, fixture)];
  const evidence = attachImportRecords(inputs.map((input) => projectReviewedExtractionEvidence(input, v3).evidence), [fixture.importRecord]);
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence }), []);
  const [rival, chosen] = evidence as [Evidence, Evidence];
  const [alphaId, betaId] = fixture.reviewItem.spec.candidates.map((candidate) => candidate.id) as [string, string];

  // The chosen candidate entails; the rival it was chosen over is only cited.
  assert.deepEqual([chosen.supportStrength, chosen.passing, chosen.blocking, chosen.excerptOrSummary], ["entails", true, false, "Beta Inc"]);
  assert.deepEqual(reviewed(chosen).gaps, []);
  assert.deepEqual([rival.supportStrength, rival.passing, rival.blocking, rival.excerptOrSummary], ["cited", false, true, "Alpha Corp"]);
  assert.deepEqual(reviewed(rival).gaps, [{ kind: "candidate-not-chosen", decisionCandidateId: betaId }]);

  // The rival is visible on the chosen evidence itself, as Survey's claim lists it.
  const choice = reviewed(chosen).choice!;
  assert.equal(reviewed(chosen).input.proposalIndex, 1);
  assert.deepEqual(choice, {
    citedCandidateId: betaId, decisionCandidateId: betaId, chosenOver: [alphaId],
    candidates: [
      { candidateId: alphaId, role: "proposed", proposalIndex: 0, valueDigest: `sha256:${sha256Hex(canonicalJson("Alpha Corp"))}` },
      { candidateId: betaId, role: "proposed", proposalIndex: 1, valueDigest: `sha256:${sha256Hex(canonicalJson("Beta Inc"))}` },
    ],
  });
  assert.deepEqual(choice.candidates.map((candidate) => candidate.candidateId), fixture.claim.metadata.survey.candidates.map((candidate) => candidate.candidateId));
  assert.equal(fixture.claim.metadata.survey.candidates.find((candidate) => candidate.selected)!.candidateId, choice.citedCandidateId);
  assert.deepEqual(reviewed(rival).choice!.chosenOver, []);

  const resolveImportRecord = resolverFromBundle({ evidence });
  evidence.forEach((item, index) => assert.deepEqual(restoreReviewedExtractionEvidence(item, { resolveImportRecord }), inputs[index]));
  for (const item of evidence) assert.deepEqual(await restoreReviewedExtractionEvidenceBrowser(item, { resolveImportRecord }), item);
  assert.deepEqual(reviewedExtractionChoice(restoreReviewedExtractionEvidence(chosen, { resolveImportRecord })), choice);

  const policy = { ...strict, requiredClaimIds: [fixture.claim.id] };
  const allowed = evaluateReviewedGroundingPolicy({ policy, evidence: [chosen], claims: [fixture.claim], resolveImportRecord });
  assert.equal(allowed.outcome, "allowed");
  assert.deepEqual(allowed.dimensions[0]!.choice, choice);
  assert.equal(allowed.dimensions[0]!.excerptVerification, "verified");

  const refused = evaluateReviewedGroundingPolicy({ policy: { ...policy, refuseChosenOverRivals: true }, evidence: [chosen], claims: [fixture.claim], resolveImportRecord });
  assert.equal(refused.outcome, "refused");
  assert.deepEqual(refused.gaps, [{ kind: "chosen-over-rival-unresolved", claimId: fixture.claim.id, evidenceId: chosen.id, rivalCandidateIds: [alphaId] }]);
});

test("a chosen conflict is allowed only when the chosen candidate's evidence is grounded", async () => {
  const fixture = await survey();
  const policy = { ...strict, requiredClaimIds: [fixture.claim.id] };
  const ungrounded = await citing(1, fixture);
  ungrounded.structuralTrust = "unvalidated";
  const evidence = projectReviewedExtractionEvidence(ungrounded, { ...v3, includeImportRecord: true }).evidence;
  assert.equal(evidence.supportStrength, "cited");
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [evidence], claims: [fixture.claim], resolveImportRecord: resolverFromBundle({ evidence: [evidence] }) });
  assert.equal(decision.outcome, "refused");
  assert.deepEqual(decision.gaps.map((gap) => gap.kind), ["evidence-not-entailing", "structure-not-validated", "profile-gap"]);
});

test("the rival's evidence never grounds the claim, even under a policy that only asks for an accepted review", async () => {
  const fixture = await survey();
  const rival = projectReviewedExtractionEvidence(await citing(0, fixture), { ...v3, includeImportRecord: true }).evidence;
  const resolveImportRecord = resolverFromBundle({ evidence: [rival] });
  const decision = evaluateReviewedGroundingPolicy({ policy: { id: "p", action: "a", requiredClaimIds: [fixture.claim.id], requireAcceptedReview: true }, evidence: [rival], claims: [{ id: fixture.claim.id, value: "Alpha Corp" }], resolveImportRecord });
  assert.equal(decision.outcome, "refused");
  // The decision is verified, but for a different candidate: it does not accept this one.
  assert.deepEqual(decision.gaps.map((gap) => gap.kind), ["evidence-not-entailing", "review-not-accepted", "profile-gap"]);
});

test("every candidate is bound to its own import-record proposal", async () => {
  const cases: Array<[string, (input: ReviewedExtractionEvidenceInput) => void, RegExp]> = [
    ["rival value", (input) => { input.reviewItem!.spec.candidates[0]!.value = "Gamma"; }, /candidate value or confidence does not match proposal/],
    ["rival locator", (input) => { input.reviewItem!.spec.candidates[0]!.locator!.locator = "chars:0-10"; }, /candidate locator does not match proposal/],
    ["rival model", (input) => { input.reviewItem!.spec.candidates[0]!.extraction.model = "other-model"; }, /candidate extraction does not match proposal/],
    ["rival bound to the chosen proposal", (input) => { (input.reviewItem!.spec.candidates[0]!.producer![producerKey] as Record<string, unknown>).proposalIndex = 1; }, /same proposal|does not match proposal/],
    ["rival bound past the record", (input) => { (input.reviewItem!.spec.candidates[0]!.producer![producerKey] as Record<string, unknown>).proposalIndex = 9; }, /does not identify a proposal/],
    ["rival bound to another import", (input) => { (input.reviewItem!.spec.candidates[0]!.producer![producerKey] as Record<string, unknown>).importName = "other-import"; }, /does not name the import record/],
    ["unbound proposed candidate", (input) => { delete input.reviewItem!.spec.candidates[0]!.producer; }, /must be the current \(prior\) value/],
    ["duplicate candidate id", (input) => { input.reviewItem!.spec.candidates[0]!.id = input.reviewItem!.spec.candidates[1]!.id; }, /ids must be unique/],
    ["cited proposal not a candidate's", (input) => { input.proposalIndex = 2; }, /not one of the reviewItem's candidates/],
  ];
  for (const [label, mutate, expected] of cases) {
    const input = structuredClone(await citing(1));
    mutate(input);
    assert.throws(() => projectReviewedExtractionEvidence(input, v3), expected, label);
  }
});

test("the decision must name the chosen candidate and record exactly the proposed values it passed over", async () => {
  const cases: Array<[string, (spec: SurveyExtractionReviewDecision["spec"]) => void, RegExp]> = [
    ["no candidate", (spec) => { delete spec.candidateId; }, /must name the chosen candidate/],
    ["unknown candidate", (spec) => { spec.candidateId = "extraction-envelope.unknown.proposed"; }, /absent from reviewItem/],
    ["rivals not recorded", (spec) => { delete spec.unselectedCandidateIds; }, /exactly the proposed candidates it passed over/],
    ["chosen listed as a rival", (spec) => { spec.unselectedCandidateIds = [spec.candidateId!]; }, /exactly the proposed candidates it passed over/],
  ];
  for (const [label, mutate, expected] of cases) {
    const input = structuredClone(await citing(1));
    mutate(input.reviewDecision!.spec);
    assert.throws(() => projectReviewedExtractionEvidence(input, v3), expected, label);
  }
});

test("restore refuses a v3 item whose choice or projection was altered", async () => {
  const fixture = await survey();
  const evidence = attachImportRecords([projectReviewedExtractionEvidence(await citing(0, fixture), v3).evidence], [fixture.importRecord]);
  const resolveImportRecord = resolverFromBundle({ evidence });
  const hidden = structuredClone(evidence[0]!);
  reviewed(hidden).choice!.candidates = reviewed(hidden).choice!.candidates.slice(0, 1);
  assert.throws(() => restoreReviewedExtractionEvidence(hidden, { resolveImportRecord }), /do not match their bound profile/);
  // Relabel the rival as the chosen value, with a recomputed profile digest.
  const promoted = structuredClone(evidence[0]!);
  Object.assign(promoted, { supportStrength: "entails", passing: true, blocking: false });
  reviewed(promoted).gaps = [];
  assert.throws(() => restoreReviewedExtractionEvidence(rehash(promoted), { resolveImportRecord }), /integrity binding|do not match/);
});

test("v3 evidence without its import record fails closed like v2", async () => {
  const fixture = await survey();
  const evidence = projectReviewedExtractionEvidence(await citing(1, fixture), v3).evidence;
  const digest = reviewed(evidence).input.importRecordDigest as string;
  assert.deepEqual(findUncarriedImportRecordDigests({ evidence: [evidence] }), [digest]);
  assert.throws(() => restoreReviewedExtractionEvidence(evidence), (error: unknown) => error instanceof ReviewedExtractionImportRecordUnresolvedError && error.importRecordDigest === digest);
  const decision = evaluateReviewedGroundingPolicy({ policy: { ...strict, requiredClaimIds: [fixture.claim.id] }, evidence: [evidence], claims: [fixture.claim] });
  assert.deepEqual(decision.gaps, [{ kind: "import-record-unresolved", claimId: fixture.claim.id, evidenceId: evidence.id, importRecordDigest: digest }]);
});

/** A recheck item: the prior value (role `current`, no proposal) next to the reviewed proposal. */
async function recheck(decision: "accept-proposed" | "keep-current"): Promise<ReviewedExtractionEvidenceInput> {
  const input = await singleCandidate();
  const proposed = input.reviewItem!.spec.candidates[0]!;
  const prior = { id: "recheck.title.current", role: "current", value: "Alpha (prior)", source: { sourceRef: "source:earlier-record", observedAt: "2026-06-01T00:00:00.000Z" }, extraction: { target: "title" }, claimTarget: proposed.claimTarget };
  input.reviewItem!.spec.candidates = [prior, proposed];
  input.reviewDecision!.spec.candidateId = decision === "accept-proposed" ? proposed.id : prior.id;
  return input;
}

test("a recheck of a prior value against one proposal projects with the prior as the rival", async () => {
  const accepted = await recheck("accept-proposed");
  const evidence = projectReviewedExtractionEvidence(accepted, { ...v3, includeImportRecord: true }).evidence;
  assert.equal(evidence.supportStrength, "entails");
  const choice = reviewed(evidence).choice!;
  assert.deepEqual(choice.candidates.map(({ candidateId, role, proposalIndex }) => ({ candidateId, role, proposalIndex })), [
    { candidateId: "recheck.title.current", role: "current", proposalIndex: undefined },
    { candidateId: accepted.reviewItem!.spec.candidates[1]!.id, role: "proposed", proposalIndex: 0 },
  ]);
  assert.deepEqual(choice.chosenOver, ["recheck.title.current"]);
  const resolveImportRecord = resolverFromBundle({ evidence: [evidence] });
  assert.deepEqual(restoreReviewedExtractionEvidence(evidence, { resolveImportRecord }), accepted);
  const policy = { id: "p", action: "a", requiredClaimIds: ["claim.directory.title"], requireAcceptedReview: true };
  assert.equal(evaluateReviewedGroundingPolicy({ policy, evidence: [evidence], claims: [{ id: "claim.directory.title", value: "Alpha" }], resolveImportRecord }).outcome, "allowed");
  assert.equal(evaluateReviewedGroundingPolicy({ policy: { ...policy, refuseChosenOverRivals: true }, evidence: [evidence], claims: [{ id: "claim.directory.title", value: "Alpha" }], resolveImportRecord }).outcome, "refused");

  // Keeping the prior value leaves the proposal's evidence cited.
  const kept = projectReviewedExtractionEvidence(await recheck("keep-current"), v3);
  assert.equal(kept.evidence.supportStrength, "cited");
  assert.deepEqual(kept.gaps, [{ kind: "candidate-not-chosen", decisionCandidateId: "recheck.title.current" }]);

  // A prior value carries no binding; a second one, or one marked proposed, is refused.
  const twoPriors = await recheck("accept-proposed");
  twoPriors.reviewItem!.spec.candidates.push({ ...structuredClone(twoPriors.reviewItem!.spec.candidates[0]!), id: "recheck.title.current-2" });
  assert.throws(() => projectReviewedExtractionEvidence(twoPriors, v3), /at most one current candidate/);
  const unboundProposed = await recheck("accept-proposed");
  unboundProposed.reviewItem!.spec.candidates[0]!.role = "proposed";
  assert.throws(() => projectReviewedExtractionEvidence(unboundProposed, v3), /must be the current \(prior\) value/);
});
