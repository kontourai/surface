import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSnapshotSourceRef } from "@kontourai/forage/fetch";
import { canonicalValueKey } from "@kontourai/lookout";
import type { Snapshot as ForageSnapshot } from "@kontourai/forage";
import type { CheckResult as LookoutCheckResult } from "@kontourai/lookout";
import {
  evaluateReviewedGroundingPolicy,
  buildReviewedExtractionSourceState,
  projectReviewedExtractionEvidence,
  ReviewedExtractionSourceObservationError,
  type ReviewedExtractionEvidenceInput,
  type ReviewedExtractionSourceObservation,
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

const digest = (value: string) => ({ algorithm: "sha256" as const, value: value.repeat(64).slice(0, 64) });

// These are the public shapes published by Forage 0.6.0 and Lookout 0.3.6.
// Surface deliberately keeps their retrieval semantics outside its pure policy.
const publishedForageCapture: ForageSnapshot = {
  sourceId: "directory-source", url: "https://example.test/directory", status: 200,
  fetchedAt: "2026-07-20T00:00:00.000Z", body: "Directory title", bodyHash: createHash("sha256").update("Directory title").digest("hex"),
  headers: { etag: "directory-v1" },
};
const publishedLookout304: LookoutCheckResult = {
  kind: "unchanged-304", sourceId: publishedForageCapture.sourceId,
  sourceUrl: publishedForageCapture.url, checkedAt: "2026-07-21T00:01:00.000Z",
  warnings: [], snapshotRef: buildSnapshotSourceRef(publishedForageCapture),
};
function observation(overrides: Partial<ReviewedExtractionSourceObservation> = {}): ReviewedExtractionSourceObservation {
  return {
    version: "surface.reviewed-source-observation/v1",
    owner: { authority: "@kontourai/fieldwork", observationRef: "fieldwork:observation-1" },
    expected: { snapshotRef: "snapshot:fixture-v1", sourceId: "forage:source-1", resourceRef: "https://example.test/directory", capturedAt: "2026-07-20T00:00:00.000Z", envelopeDigest: digest("a"), contentDigest: digest("b") },
    observed: { snapshotRef: "forage:capture-304", sourceId: "forage:source-1", resourceRef: "https://example.test/directory", capturedAt: "2026-07-21T00:00:00.000Z", envelopeDigest: digest("c"), contentDigest: digest("b") },
    ...overrides,
  };
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

test("builds a content-current state from distinct, owner-resolved captures while preserving both identities", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const fact = observation();
  const state = buildReviewedExtractionSourceState(projected.evidence, fact, "2026-07-21T00:01:00.000Z");
  assert.equal(state.status, "current");
  assert.equal(state.expectedSnapshotRef, fact.expected.snapshotRef);
  assert.equal(state.observedSnapshotRef, fact.observed.snapshotRef);
  assert.equal(state.extractedValueChanged, undefined);
  assert.equal(state.observation?.expected.envelopeDigest.value, digest("a").value);
  assert.equal(state.observation?.observed.envelopeDigest.value, digest("c").value);
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [state] });
  assert.equal(decision.outcome, "allowed");
});

test("accepts published Forage 0.6 and Lookout 0.3.6 304 capture facts without renewing the capture", async () => {
  const [forageManifest, lookoutManifest] = await Promise.all([
    readFile("node_modules/@kontourai/forage/package.json", "utf8"),
    readFile("node_modules/@kontourai/lookout/package.json", "utf8"),
  ]);
  assert.equal(JSON.parse(forageManifest).version, "0.6.0");
  assert.equal(JSON.parse(lookoutManifest).version, "0.3.6");
  assert.equal(canonicalValueKey(publishedLookout304).ok, true);
  const projected = projectReviewedExtractionEvidence(await fixture());
  const captureRef = publishedLookout304.snapshotRef;
  const fact = observation({
    expected: {
      snapshotRef: "snapshot:fixture-v1", sourceId: publishedForageCapture.sourceId,
      resourceRef: publishedForageCapture.url, capturedAt: publishedForageCapture.fetchedAt,
      envelopeDigest: digest("1"), contentDigest: { algorithm: "sha256", value: publishedForageCapture.bodyHash },
    },
    observed: {
      snapshotRef: "snapshot:fixture-v1", sourceId: publishedForageCapture.sourceId,
      resourceRef: publishedForageCapture.url, capturedAt: "2026-07-20T00:00:00+00:00",
      envelopeDigest: digest("1"), contentDigest: { algorithm: "sha256", value: publishedForageCapture.bodyHash },
    },
  });
  const state = buildReviewedExtractionSourceState(projected.evidence, fact, publishedLookout304.checkedAt);
  assert.equal(state.status, "current");
  assert.equal(state.observation?.expected.snapshotRef, "snapshot:fixture-v1");
  assert.equal(state.observation?.observed.snapshotRef, "snapshot:fixture-v1");
  assert.equal(state.observation?.expected.contentDigest.value, publishedForageCapture.bodyHash);
  assert.equal(state.observation?.observed.contentDigest.value, publishedForageCapture.bodyHash);
  assert.equal(state.observedAt, publishedLookout304.checkedAt);
  assert.equal("extractedValueChanged" in state, false);
  assert.equal(captureRef.startsWith("forage-snapshot:"), true);
});

test("keeps a 304 capture time distinct from its later check time", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const state = buildReviewedExtractionSourceState(projected.evidence, observation(), "2026-07-22T10:00:00.000Z");
  assert.equal(state.observation?.observed.capturedAt, "2026-07-21T00:00:00.000Z");
  assert.equal(state.observedAt, "2026-07-22T10:00:00.000Z");
});

test("marks raw content drift without claiming an extracted field changed", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const fact = observation(); fact.observed.contentDigest = digest("d");
  const state = buildReviewedExtractionSourceState(projected.evidence, fact, "2026-07-21T00:01:00.000Z");
  assert.equal(state.status, "drifted");
  assert.equal(state.extractedValueChanged, undefined);
  assert.equal("extractedValueChanged" in state, false);
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [state] });
  assert.equal(decision.outcome, "refused");
  assert.equal(decision.dimensions[0]!.sourceState.extractedValueChanged, undefined);
});

test("fails closed for mismatched expected source, moved source, digest conflicts, and unknown versions", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const cases: Array<[string, ReviewedExtractionSourceObservation, string]> = [
    ["wrong expected", { ...observation(), expected: { ...observation().expected, snapshotRef: "snapshot:wrong" } }, "expected-snapshot-mismatch"],
    ["moved resource", { ...observation(), observed: { ...observation().observed, resourceRef: "https://example.test/moved" } }, "incompatible-source-identity"],
    ["contradictory ref", { ...observation(), observed: { ...observation().observed, snapshotRef: "snapshot:fixture-v1", envelopeDigest: digest("d") } }, "contradictory-capture"],
    ["unknown version", { ...observation(), version: "surface.reviewed-source-observation/v2" as never }, "unknown-version"],
  ];
  for (const [, fact, code] of cases) {
    assert.throws(() => buildReviewedExtractionSourceState(projected.evidence, fact, "2026-07-21T00:01:00.000Z"), (error: unknown) => error instanceof ReviewedExtractionSourceObservationError && error.code === code);
  }
});

test("rejects captures after their check and contradictory facts for one capture while allowing older 304 reuse", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const future = observation({ expected: { ...observation().expected, capturedAt: "2099-01-01T00:00:00.000Z" } });
  assert.throws(() => buildReviewedExtractionSourceState(projected.evidence, future, "2026-07-21T00:01:00.000Z"), (error: unknown) => error instanceof ReviewedExtractionSourceObservationError && error.code === "invalid-observation");
  const contradictsSameCapture = observation({
    observed: { ...observation().expected, capturedAt: "2026-07-20T00:01:00.000Z" },
  });
  assert.throws(() => buildReviewedExtractionSourceState(projected.evidence, contradictsSameCapture, "2026-07-21T00:01:00.000Z"), (error: unknown) => error instanceof ReviewedExtractionSourceObservationError && error.code === "contradictory-capture");
  const reused = observation({ observed: { ...observation().expected } });
  const state = buildReviewedExtractionSourceState(projected.evidence, reused, "2026-07-21T00:01:00.000Z");
  assert.equal(state.status, "current");
  assert.equal(state.observation?.observed.capturedAt, "2026-07-20T00:00:00.000Z");
});

test("rejects bad digests and conflicting duplicate states instead of accepting the last supplied state", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const bad = observation(); bad.observed.contentDigest.value = "ABC";
  assert.throws(() => buildReviewedExtractionSourceState(projected.evidence, bad, "2026-07-21T00:01:00.000Z"), (error: unknown) => error instanceof ReviewedExtractionSourceObservationError && error.code === "invalid-digest");
  const first = buildReviewedExtractionSourceState(projected.evidence, observation(), "2026-07-21T00:01:00.000Z");
  const second = { ...first, observedAt: "2026-07-22T00:01:00.000Z" };
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [first, second] });
  assert.ok(decision.gaps.some((gap) => gap.kind === "source-state-incoherent"));
});

test("treats property-order and deep-key reordered duplicate source states as equivalent", async () => {
  const projected = projectReviewedExtractionEvidence(await fixture());
  const state = buildReviewedExtractionSourceState(projected.evidence, observation(), "2026-07-21T00:01:00.000Z");
  const reordered = reorderKeys(state) as ReviewedExtractionSourceState;
  const decision = evaluateReviewedGroundingPolicy({ policy, evidence: [projected.evidence], sourceStates: [state, reordered] });
  assert.equal(decision.outcome, "allowed");
  assert.deepEqual(decision.gaps, []);
});

function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorderKeys(child)]));
}
