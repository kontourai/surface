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
  reviewedExtractionReviewSignals,
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
import { buildReviewedSourceBasisContribution, composeBasisProjectionV2, parseBasisProjectionV2, type AnswerAssessmentProjection } from "../src/basis/index.js";
import { buildBasisPanelViewModel } from "../src/basis/view-index.js";

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

/** The downgrade a reviewer found: keep only the chosen candidate and drop the rivals the decision recorded. */
async function downgraded(mutate: (metadata: Record<string, unknown>, input: ReviewedExtractionEvidenceInput) => void = () => {}): Promise<ReviewedExtractionEvidenceInput> {
  const input = structuredClone(await citing(1));
  input.reviewItem!.spec.candidates = input.reviewItem!.spec.candidates.filter((candidate) => candidate.value === "Beta Inc");
  delete input.reviewDecision!.spec.unselectedCandidateIds;
  mutate(input.reviewItem!.metadata.producer![producerKey] as Record<string, unknown>, input);
  return input;
}

test("a chosen conflict downgraded to v1 or v2 by dropping its rivals is refused as a hidden conflict", async () => {
  const fixture = await survey();
  const policy = { ...strict, requiredClaimIds: [fixture.claim.id] };
  const variants: Array<[string, ReviewedExtractionEvidenceInput]> = [
    ["dropped candidates", await downgraded()],
    ["proposalIndices rewritten to the chosen proposal", await downgraded((metadata) => { metadata.proposalIndices = [1]; })],
    ["rival claimed as a same-value proposal", await downgraded((_metadata, input) => { (input.reviewItem!.spec.candidates[0]!.producer![producerKey] as Record<string, unknown>).sameValueProposals = [{ proposalIndex: 0 }, { proposalIndex: 2 }]; })],
  ];
  for (const [label, input] of variants) {
    for (const options of [{}, { ...v2, includeImportRecord: true }]) {
      const evidence = projectReviewedExtractionEvidence(input, options).evidence;
      const resolveImportRecord = resolverFromBundle({ evidence: [evidence] });
      const restored = restoreReviewedExtractionEvidence(evidence, { resolveImportRecord });
      const signals = reviewedExtractionReviewSignals(restored);
      assert.deepEqual([signals.hiddenRivalProposalIndices, signals.droppedProposalIndices], [[0, 2], [0, 2]], label);
      const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [evidence], claims: [fixture.claim], resolveImportRecord });
      assert.equal(decision.outcome, "refused", label);
      assert.deepEqual(decision.gaps, [{ kind: "hidden-conflict", claimId: fixture.claim.id, evidenceId: evidence.id, rivalProposalIndices: [0, 2], droppedProposalIndices: [0, 2] }], label);
      assert.deepEqual(decision.dimensions[0]!.hiddenConflict, { rivalProposalIndices: [0, 2], droppedProposalIndices: [0, 2] }, label);
    }
  }
});

interface SurveyReviewedFixture {
  proposalIndex: number;
  importRecord: SurveyExtractionEnvelopeImport;
  reviewItem?: SurveyExtractionReviewItem;
  reviewDecision?: SurveyExtractionReviewDecision;
  claim: { id: string; value: unknown };
}
/** Items as Survey 4.0.0 and 7.0.0 write them; see the fixture's own note. */
const surveyReviewed = async (name: "survey4Ungrouped" | "survey7Single" | "survey7DuplicateAgree" | "survey7UnresolvedUnreviewed") => (await json<Record<string, SurveyReviewedFixture>>("reviewed-extraction-hidden-conflict.survey.json"))[name]!;
function reviewedInput(fixture: SurveyReviewedFixture): ReviewedExtractionEvidenceInput {
  return {
    evidenceId: "evidence.reviewed", claimId: fixture.claim.id, proposalIndex: fixture.proposalIndex,
    importRecord: fixture.importRecord, ...(fixture.reviewItem ? { reviewItem: fixture.reviewItem, reviewDecision: fixture.reviewDecision } : {}),
    collectedBy: "survey-importer:fixture", structuralTrust: "validated",
  };
}
const acceptedOnly = (claimId: string): ReviewedGroundingPolicy => ({ id: "p", action: "a", requiredClaimIds: [claimId], requireAcceptedReview: true });

test("an ungrouped item beside a rival value, as Survey 4 wrote them, shows the rival and is refused only on opt-in", async () => {
  const fixture = await surveyReviewed("survey4Ungrouped");
  assert.equal(Object.hasOwn(fixture.importRecord.status, "provenance"), false);
  const evidence = projectReviewedExtractionEvidence(reviewedInput(fixture)).evidence;
  const signals = reviewedExtractionReviewSignals(restoreReviewedExtractionEvidence(evidence));
  assert.deepEqual(signals.hiddenRivalProposalIndices, [0, 2]);
  assert.equal(signals.droppedProposalIndices, undefined);
  const policy = acceptedOnly(fixture.claim.id);
  const allowed = evaluateReviewedGroundingPolicy({ policy, evidence: [evidence], claims: [fixture.claim] });
  assert.equal(allowed.outcome, "allowed");
  assert.deepEqual(allowed.dimensions[0]!.hiddenConflict, { rivalProposalIndices: [0, 2], droppedProposalIndices: [] });
  for (const optIn of [{ refuseExcludedRivals: true }, { refuseChosenOverRivals: true }]) {
    const refused = evaluateReviewedGroundingPolicy({ policy: { ...policy, ...optIn }, evidence: [evidence], claims: [fixture.claim] });
    assert.deepEqual(refused.gaps, [{ kind: "hidden-conflict", claimId: fixture.claim.id, evidenceId: evidence.id, rivalProposalIndices: [0, 2], droppedProposalIndices: [] }]);
  }
});

test("a Survey 7 conflict with its rivals dropped and its binding broken is refused by default, because its import record carries status.provenance", async () => {
  const fixture = await survey();
  assert.equal(fixture.importRecord.status.provenance, "verified");
  const policy = acceptedOnly(fixture.claim.id);
  const variants: Array<[string, ReviewedExtractionEvidenceInput]> = [
    ["proposalIndices stripped", await downgraded((metadata) => { delete metadata.proposalIndices; })],
    ["importName renamed", await downgraded((metadata) => { metadata.importName = "renamed-import"; })],
  ];
  for (const [label, input] of variants) {
    for (const options of [{}, { ...v2, includeImportRecord: true }, v2]) {
      const evidence = projectReviewedExtractionEvidence(input, options).evidence;
      // v2 without the record in the bundle: the caller's resolver supplies it (restore checks its digest).
      const resolveImportRecord = "includeImportRecord" in options ? resolverFromBundle({ evidence: [evidence] }) : () => input.importRecord;
      const signals = reviewedExtractionReviewSignals(restoreReviewedExtractionEvidence(evidence, { resolveImportRecord }));
      assert.equal(signals.excerptVerification, "unverified", label);
      assert.deepEqual([signals.hiddenRivalProposalIndices, signals.droppedProposalIndices], [[0, 2], [0, 2]], label);
      const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [evidence], claims: [fixture.claim], resolveImportRecord });
      assert.equal(decision.outcome, "refused", label);
      assert.deepEqual(decision.gaps, [{ kind: "hidden-conflict", claimId: fixture.claim.id, evidenceId: evidence.id, rivalProposalIndices: [0, 2], droppedProposalIndices: [0, 2] }], label);
    }
  }
});

test("Survey 7 single-value and duplicate-agree items are allowed by default, even with their binding broken", async () => {
  for (const name of ["survey7Single", "survey7DuplicateAgree"] as const) {
    const fixture = await surveyReviewed(name);
    assert.equal(Object.hasOwn(fixture.importRecord.status, "provenance"), true, name);
    const intact = reviewedInput(fixture);
    const broken = structuredClone(intact);
    const metadata = broken.reviewItem!.metadata.producer![producerKey] as Record<string, unknown>;
    delete metadata.proposalIndices;
    // Also drop the same-value listing: an agreeing proposal is never a rival.
    delete (broken.reviewItem!.spec.candidates[0]!.producer![producerKey] as Record<string, unknown>).sameValueProposals;
    for (const [label, input] of [["intact", intact], ["broken", broken]] as const) {
      const evidence = projectReviewedExtractionEvidence(input).evidence;
      const signals = reviewedExtractionReviewSignals(restoreReviewedExtractionEvidence(evidence));
      assert.equal(signals.hiddenRivalProposalIndices, undefined, `${name} ${label}`);
      assert.equal(signals.droppedProposalIndices, undefined, `${name} ${label}`);
      const decision = evaluateReviewedGroundingPolicy({ policy: acceptedOnly(fixture.claim.id), evidence: [evidence], claims: [fixture.claim] });
      assert.deepEqual([decision.outcome, decision.gaps], ["allowed", []], `${name} ${label}`);
    }
  }
});

test("an unreviewed Survey 7 import shows a rival but lists nothing as dropped: there is no item to drop it from", async () => {
  const fixture = await surveyReviewed("survey7UnresolvedUnreviewed");
  assert.equal(fixture.importRecord.status.provenance, "unverified");
  const evidence = projectReviewedExtractionEvidence(reviewedInput(fixture)).evidence;
  const signals = reviewedExtractionReviewSignals(restoreReviewedExtractionEvidence(evidence));
  assert.deepEqual(signals.hiddenRivalProposalIndices, [0, 2]);
  assert.equal(signals.droppedProposalIndices, undefined);
  const decision = evaluateReviewedGroundingPolicy({ policy: { id: "p", action: "a", requiredClaimIds: [fixture.claim.id] }, evidence: [evidence], claims: [fixture.claim] });
  assert.deepEqual(decision.dimensions[0]!.hiddenConflict, { rivalProposalIndices: [0, 2], droppedProposalIndices: [] });
  assert.equal(decision.gaps.some((gap) => gap.kind === "hidden-conflict"), false);
});

function unknownState(evidence: Evidence) {
  return { evidenceId: evidence.id, status: "unknown" as const, expectedSnapshotRef: "snapshot:e2e", observedAt: "2026-09-04T00:00:00.000Z" };
}
function basisAssessment(evidence: Evidence): AnswerAssessmentProjection {
  const at = "2026-09-04T00:00:00.000Z";
  return { version: "surface.answer-assessment/v2", ref: { authority: "@kontourai/surface", schemaVersion: "surface.answer-assessment/v2", kind: "answer-assessment", bundleId: "bundle-1", claimId: "answer-claim" }, found: true, bundle: { id: "bundle-1", schemaVersion: 1, source: "Surface", generatedAt: at }, claim: { id: "answer-claim", subject: { subjectType: "answer", subjectId: "answer-1" }, status: "assessed", freshness: null }, policy: { version: "surface.answer-assessment-policy/v1", id: "policy-1", evaluatedAt: at, outcome: "not-satisfied", satisfied: false, reasons: ["explicit-entailing-evidence-missing"] }, evidence: { cited: [{ id: "citation-1", label: "Cited source", sourceRef: evidence.sourceRef, locator: evidence.sourceLocator ?? null, observedAt: at, supportStrength: "cited", result: "passed", blocksClaim: false }], entails: [], undeclared: [], counterevidence: [] }, derivation: { available: true, directInputs: [{ claimId: evidence.claimId, status: "verified", source: "derivationEdges", edge: { method: "rule-application", supportStrength: "strong", rationale: null } }] }, gaps: [] };
}
async function basisFor(evidence: Evidence, resolveImportRecord: ReturnType<typeof resolverFromBundle>) {
  const answer = { authority: "@kontourai/thread" as const, schemaVersion: "1.2.0" as const, kind: "assistant-message" as const, standing: "observed" as const, threadId: "thread-42", messageId: "message-9" };
  const contribution = await buildReviewedSourceBasisContribution({ answer, ref: { authority: "@kontourai/fieldwork", schemaVersion: "fieldwork.kontourai.io/v1", kind: "reviewed-web-source", exactRef: `fieldwork-reviewed-source:v1:${"d".repeat(64)}`, evidenceId: evidence.id }, evidence, sourceState: unknownState(evidence), association: { version: "surface.reviewed-source-basis-association/v1", sourceClaimId: evidence.claimId, sourceEvidenceId: evidence.id, answerClaimId: "answer-claim", answerCitationEvidenceId: "citation-1", assessmentRevision: 1 }, assessment: { revision: 1, value: basisAssessment(evidence) }, resolveImportRecord });
  const at = "2026-09-04T00:00:00.000Z";
  const projection = composeBasisProjectionV2({ version: "surface.basis-projection/v2", answer: { owner: { authority: "@kontourai/thread" }, state: "available", observedAt: at, value: { ref: answer, fact: "answer-observed", observedAt: at } }, assessment: { owner: { authority: "@kontourai/surface" }, state: "available", observedAt: at, value: basisAssessment(evidence) }, contributions: [{ owner: { authority: "@kontourai/fieldwork" }, state: "available", observedAt: at, value: [contribution] }] });
  return { contribution, projection };
}

test("the Basis source adapter never reads a rival as accepted and carries the choice for the chosen value", async () => {
  const fixture = await survey();
  const evidence = attachImportRecords([projectReviewedExtractionEvidence(await citing(0, fixture), v3).evidence, projectReviewedExtractionEvidence(await citing(1, fixture), v3).evidence], [fixture.importRecord]);
  const resolveImportRecord = resolverFromBundle({ evidence });
  const [alphaId] = fixture.reviewItem.spec.candidates.map((candidate) => candidate.id) as [string];

  const rival = await basisFor(evidence[0]!, resolveImportRecord);
  assert.equal(rival.contribution.context.kind, "reviewed-source");
  if (rival.contribution.context.kind !== "reviewed-source") return;
  assert.deepEqual([rival.contribution.context.review, rival.contribution.context.reviewedAt, rival.contribution.context.choice], ["not-chosen", null, { candidateCount: 2, chosenOverCandidateIds: [] }]);
  assert.ok(rival.contribution.gaps!.some((gap) => gap.code === "reviewed-source-review-not-chosen"));

  const chosen = await basisFor(evidence[1]!, resolveImportRecord);
  if (chosen.contribution.context.kind !== "reviewed-source") return assert.fail("expected reviewed-source context");
  assert.deepEqual([chosen.contribution.context.review, chosen.contribution.context.reviewedAt, chosen.contribution.context.choice], ["accepted", fixture.reviewDecision.spec.reviewedAt, { candidateCount: 2, chosenOverCandidateIds: [alphaId] }]);
  assert.equal(chosen.contribution.gaps!.some((gap) => gap.code.startsWith("reviewed-source-review")), false);

  for (const { projection } of [rival, chosen]) assert.equal(parseBasisProjectionV2(projection).ok, true);
  const view = buildBasisPanelViewModel(chosen.projection);
  if (view.state !== "ready") return assert.fail("expected a ready view");
  assert.deepEqual(view.contextGroups.find((group) => group.id === "sources")?.items[0]?.facts.slice(0, 2), [{ label: "Review", value: "Accepted" }, { label: "Choice", value: "Chosen over 1 other value" }]);

  // The parser refuses a context that claims acceptance without its rivals, or not-chosen without a choice.
  const forged = structuredClone(chosen.projection) as unknown as { regions: { sources: Array<{ context: Record<string, unknown> }> } };
  (forged.regions.sources[0]!.context.choice as { chosenOverCandidateIds: string[] }).chosenOverCandidateIds = [];
  assert.equal(parseBasisProjectionV2(forged).ok, false);
  const bare = structuredClone(rival.projection) as unknown as { regions: { sources: Array<{ context: Record<string, unknown> }> } };
  delete bare.regions.sources[0]!.context.choice;
  assert.equal(parseBasisProjectionV2(bare).ok, false);
  // The field budget grew by exactly the optional choice: a fourteenth field is still hostile.
  const oversized = structuredClone(chosen.projection) as unknown as { regions: { sources: Array<{ context: Record<string, unknown> }> } };
  oversized.regions.sources[0]!.context.extra = "x";
  const refused = parseBasisProjectionV2(oversized);
  assert.equal(refused.ok ? "ok" : refused.gap.code, "hostile-input");
});
