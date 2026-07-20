import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateReviewedGroundingPolicy,
  projectReviewedExtractionEvidence,
  type ReviewedExtractionEvidenceInput,
  type ReviewedExtractionSourceState,
  type ReviewedGroundingPolicy,
} from "../src/index.js";

const fixtureUrl = new URL("tests/fixtures/reviewed-extraction-evidence.v1.json", `file://${process.cwd()}/`);
async function fixture(): Promise<ReviewedExtractionEvidenceInput> { return JSON.parse(await readFile(fixtureUrl, "utf8")) as ReviewedExtractionEvidenceInput; }

const policy: ReviewedGroundingPolicy = {
  id: "policy.publish-reviewed-directory",
  action: "publish-directory-entry",
  requiredClaimIds: ["claim.directory.title"],
  requireExactLocator: true,
  requirePreparedArtifact: true,
  requireAcceptedReview: true,
  requireValidatedStructure: true,
  requireCurrentSource: true,
};

function current(evidenceId: string): ReviewedExtractionSourceState {
  return { evidenceId, status: "current", expectedSnapshotRef: "snapshot:fixture-v1", observedSnapshotRef: "snapshot:fixture-v1", observedAt: "2026-07-20T00:06:00.000Z", extractedValueChanged: false };
}

test("allows an additive downstream policy and cites exact evidence and review resources", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [current(projected.evidence.id)] });
  assert.equal(decision.outcome, "allowed");
  assert.deepEqual(decision.evidenceIds, [projected.evidence.id]);
  assert.deepEqual(decision.reviewItemNames, ["extraction-envelope.5bfdf37f230ab6e21807"]);
  assert.deepEqual(decision.reviewDecisionNames, ["decision.directory.title"]);
  assert.deepEqual(decision.gaps, []);
  assert.deepEqual(decision.dimensions[0], {
    claimId: "claim.directory.title", evidenceId: projected.evidence.id,
    reviewItemName: "extraction-envelope.5bfdf37f230ab6e21807", reviewDecisionName: "decision.directory.title",
    candidateConfidence: 0.8, reviewDisposition: "verified", structuralTrust: "validated", typeOrigin: "explicit",
    exactLocator: "chars:0-5", preparedArtifact: { status: "available", integrityRef: projected.evidence.integrityRef }, sourceState: current(projected.evidence.id),
  });
});

test("refuses missing reviewed evidence without changing core policy or claim types", () => {
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [] });
  assert.equal(decision.outcome, "refused");
  assert.deepEqual(decision.gaps, [{ kind: "missing-reviewed-evidence", claimId: "claim.directory.title" }]);
});

test("malformed reviewed evidence fails closed as a typed refusal", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  projected.evidence.metadata = { reviewedExtraction: {} };
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence] });
  assert.equal(decision.outcome, "refused");
  assert.deepEqual(decision.gaps, [{ kind: "invalid-reviewed-evidence", claimId: "claim.directory.title", evidenceId: projected.evidence.id }]);
});

test("keeps source drift visible even when the extracted value is unchanged", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const drift: ReviewedExtractionSourceState = { ...current(projected.evidence.id), status: "drifted", observedSnapshotRef: "snapshot:fixture-v2", extractedValueChanged: false };
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [drift] });
  assert.equal(decision.outcome, "refused");
  assert.deepEqual(decision.gaps, [{ kind: "source-not-current", claimId: "claim.directory.title", evidenceId: projected.evidence.id, status: "drifted" }]);
  assert.equal(decision.dimensions[0]!.sourceState.extractedValueChanged, false);
});

test("refuses a forged current source observation that does not match the bound snapshot", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const forged = { ...current(projected.evidence.id), observedSnapshotRef: "snapshot:fixture-v2" };
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [forged] });
  assert.equal(decision.outcome, "refused");
  assert.ok(decision.gaps.some((gap) => gap.kind === "source-state-incoherent"));
});

test("missing artifacts and digest mismatches cannot satisfy a grounding policy", async () => {
  for (const mode of ["missing", "digest-mismatch"] as const) {
    const input = await fixture();
    if (mode === "missing") {
      delete input.importRecord.spec.envelope.result.preparedArtifact;
      delete input.importRecord.spec.envelope.result.preparedArtifactState;
    } else {
      input.importRecord.spec.envelope.result.preparedArtifactState = {
        status: "digest-mismatch", requestedRef: input.importRecord.spec.envelope.result.preparedArtifact!.ref,
        canonicalRef: input.importRecord.spec.envelope.result.preparedArtifact!.ref,
        actualDigest: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", actualContentLength: 9,
      };
      input.importRecord.status = { state: "unresolved", diagnostics: [{ kind: "digest-mismatch" }] };
      delete input.reviewItem; delete input.reviewDecision;
    }
    const projected = projectReviewedExtractionEvidence(input);
    const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [current(projected.evidence.id)] });
    assert.equal(decision.outcome, "refused");
    assert.ok(decision.gaps.some((gap) => gap.kind === "missing-prepared-artifact"));
    if (mode === "digest-mismatch") assert.ok(decision.gaps.some((gap) => gap.kind === "profile-gap" && gap.gap.kind === "digest-mismatch"));
  }
});

test("does not translate extraction confidence into reviewer or structural trust", async () => {
  const input = await fixture();
  input.importRecord.spec.envelope.result.proposals[0]!.confidence = 0.01;
  input.reviewItem!.spec.candidates[0]!.confidence = 0.01;
  const projected = projectReviewedExtractionEvidence(input);
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [current(projected.evidence.id)] });
  assert.equal(decision.outcome, "allowed");
  assert.equal(decision.dimensions[0]!.candidateConfidence, 0.01);
  assert.equal(decision.dimensions[0]!.reviewDisposition, "verified");
  assert.equal(decision.dimensions[0]!.structuralTrust, "validated");
});
