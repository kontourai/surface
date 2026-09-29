import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import * as root from "../src/index.js";
import * as entry from "../src/reviewed-extraction-evidence.js";
import {
  evaluateReviewedGroundingPolicy,
  projectReviewedExtractionEvidence,
  resolverFromBundle,
  restoreReviewedExtractionEvidence,
  reviewedExtractionEvidenceReferenceProfile,
  reviewedExtractionReviewSignals,
  type ReviewedExtractionEvidenceInput,
  type ReviewedGroundingPolicy,
} from "../src/index.js";

const fixtureUrl = new URL("tests/fixtures/reviewed-extraction-evidence.v1.json", `file://${process.cwd()}/`);
async function fixture(): Promise<ReviewedExtractionEvidenceInput> { return JSON.parse(await readFile(fixtureUrl, "utf8")) as ReviewedExtractionEvidenceInput; }

const producerKey = "survey.kontourai.io/extraction-envelope";
const claims = [{ id: "claim.directory.title", value: "Alpha" }];
const basePolicy: ReviewedGroundingPolicy = { id: "policy.signals", action: "publish", requiredClaimIds: ["claim.directory.title"] };

function itemMetadata(input: ReviewedExtractionEvidenceInput): Record<string, unknown> {
  return input.reviewItem!.metadata.producer![producerKey] as Record<string, unknown>;
}

/** Marks the import and its item verified, as Survey does for an import that checked excerpts against the prepared artifact. */
function verified(input: ReviewedExtractionEvidenceInput): ReviewedExtractionEvidenceInput {
  (input.importRecord.status as Record<string, unknown>).provenance = "verified";
  itemMetadata(input).excerptVerification = "verified";
  return input;
}

/**
 * Adds a second proposal for the same field and records it on the item as
 * excluded, in the entry shape Survey's `buildReviewItem` writes.
 */
function withExcluded(input: ReviewedExtractionEvidenceInput, value: unknown): ReviewedExtractionEvidenceInput {
  const proposals = input.importRecord.spec.envelope.result.proposals;
  const rival = { ...structuredClone(proposals[0]!), candidateValue: value, provenance: { ...structuredClone(proposals[0]!.provenance), locator: "chars:10-14", excerpt: "Beta" } };
  proposals.push(rival);
  input.importRecord.spec.claimTargets.push(structuredClone(input.importRecord.spec.claimTargets[0]!));
  itemMetadata(input).excludedProposals = [{ proposalIndex: 1, value, locator: "chars:10-14", excerpt: "Beta", reason: "excerpt-mismatch" }];
  return input;
}

function evaluate(input: ReviewedExtractionEvidenceInput, policy: Partial<ReviewedGroundingPolicy> = {}) {
  return evaluateReviewedGroundingPolicy({ policy: { ...basePolicy, ...policy }, evidence: [projectReviewedExtractionEvidence(input).evidence], claims });
}

test("capability flags are exported from the reviewed-extraction module and the package root", () => {
  for (const module of [root, entry] as Record<string, unknown>[]) {
    assert.equal(module.REVIEWED_EXTRACTION_ACCEPTS_UNREPORTED_CONFIDENCE, true);
    assert.deepEqual(module.REVIEWED_EXTRACTION_CAPABILITIES, { acceptsUnreportedConfidence: true, excerptVerification: true, excludedProposals: true });
    assert.ok(Object.isFrozen(module.REVIEWED_EXTRACTION_CAPABILITIES));
  }
});

test("capability flags survive bundling without the package on disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "surface-capability-"));
  try {
    const consumer = path.join(directory, "consumer.mjs");
    const index = path.join(process.cwd(), "dist", "src", "index.js");
    await writeFile(consumer, `import * as surface from ${JSON.stringify(index)};\nexport const flag = surface.REVIEWED_EXTRACTION_ACCEPTS_UNREPORTED_CONFIDENCE;\nexport const capabilities = surface.REVIEWED_EXTRACTION_CAPABILITIES;\n`);
    const outfile = path.join(directory, "bundle.mjs");
    await build({ entryPoints: [consumer], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
    const bundled = await import(pathToFileURL(outfile).href) as { flag: unknown; capabilities: Record<string, unknown> | undefined };
    assert.equal(bundled.flag, true);
    assert.equal(bundled.capabilities?.excerptVerification, true);
    assert.equal(bundled.capabilities?.excludedProposals, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("evidence without the signals projects unchanged and reads as unverified with no rivals", async () => {
  const input = await fixture();
  assert.deepEqual(reviewedExtractionReviewSignals(input), { excerptVerification: "unverified", excludedRivalProposalIndices: [] });
  const decision = evaluate(input);
  assert.equal(decision.outcome, "allowed");
  assert.equal("excerptVerification" in decision.dimensions[0]!, false);
  assert.equal("excludedRivals" in decision.dimensions[0]!, false);
});

test("excerpt verification needs both the import record and the review item to say verified", async () => {
  const both = verified(await fixture());
  assert.equal(reviewedExtractionReviewSignals(both).excerptVerification, "verified");
  const decision = evaluate(both, { requireVerifiedExcerpts: true });
  assert.equal(decision.outcome, "allowed");
  assert.equal(decision.dimensions[0]!.excerptVerification, "verified");

  const itemOnly = await fixture(); itemMetadata(itemOnly).excerptVerification = "verified";
  const recordOnly = await fixture(); (recordOnly.importRecord.status as Record<string, unknown>).provenance = "verified";
  const bogus = verified(await fixture()); itemMetadata(bogus).excerptVerification = true;
  for (const input of [await fixture(), itemOnly, recordOnly, bogus]) {
    assert.equal(reviewedExtractionReviewSignals(input).excerptVerification, "unverified");
    const refused = evaluate(input, { requireVerifiedExcerpts: true });
    assert.equal(refused.outcome, "refused");
    assert.deepEqual(refused.gaps, [{ kind: "excerpt-not-verified", claimId: "claim.directory.title", evidenceId: refused.dimensions[0]!.evidenceId }]);
    // The requirement is opt-in: the default policy is unchanged.
    assert.equal(evaluate(input).outcome, "allowed");
  }
});

test("an excluded rival value is reported and refused only when the policy opts in", async () => {
  const input = withExcluded(verified(await fixture()), "Beta");
  assert.deepEqual(reviewedExtractionReviewSignals(input), { excerptVerification: "verified", excludedRivalProposalIndices: [1] });
  const allowed = evaluate(input);
  assert.equal(allowed.outcome, "allowed");
  assert.deepEqual(allowed.dimensions[0]!.excludedRivals, { proposalIndices: [1] });
  const refused = evaluate(input, { refuseExcludedRivals: true });
  assert.equal(refused.outcome, "refused");
  assert.deepEqual(refused.gaps, [{ kind: "excluded-rival-unresolved", claimId: "claim.directory.title", evidenceId: refused.dimensions[0]!.evidenceId, rivalProposalIndices: [1] }]);
});

test("an excluded proposal with the reviewed value is not a rival", async () => {
  const input = withExcluded(await fixture(), "Alpha");
  assert.deepEqual(reviewedExtractionReviewSignals(input).excludedRivalProposalIndices, []);
  assert.equal(evaluate(input, { refuseExcludedRivals: true }).outcome, "allowed");
});

test("excluded entries that cannot be read or bound to the import record count against the item", async () => {
  // The entry's value no longer matches the proposal it names, so it cannot hide the rival "Beta".
  const forged = withExcluded(await fixture(), "Beta"); (itemMetadata(forged).excludedProposals as Array<Record<string, unknown>>)[0]!.value = "Alpha";
  const outOfRange = withExcluded(await fixture(), "Beta"); (itemMetadata(outOfRange).excludedProposals as Array<Record<string, unknown>>)[0]!.proposalIndex = 7;
  const selfReference = withExcluded(await fixture(), "Beta"); (itemMetadata(selfReference).excludedProposals as Array<Record<string, unknown>>)[0]!.proposalIndex = 0;
  for (const input of [forged, outOfRange, selfReference]) {
    assert.deepEqual(reviewedExtractionReviewSignals(input).excludedProposalsUnreadable, { reason: "malformed-entries", count: 1 });
    const refused = evaluate(input, { refuseExcludedRivals: true });
    assert.equal(refused.outcome, "refused");
    assert.equal(refused.gaps[0]!.kind, "excluded-rival-unresolved");
  }
  const notArray = await fixture(); itemMetadata(notArray).excludedProposals = { proposalIndex: 1 };
  assert.deepEqual(reviewedExtractionReviewSignals(notArray).excludedProposalsUnreadable, { reason: "malformed-entries" });

  const bindingBroken = await fixture(); delete bindingBroken.reviewItem!.metadata.producer;
  assert.deepEqual(reviewedExtractionReviewSignals(bindingBroken).excludedProposalsUnreadable, { reason: "binding-broken" });
  assert.equal(evaluate(bindingBroken, { refuseExcludedRivals: true }).outcome, "refused");
  assert.equal(evaluate(bindingBroken).outcome, "allowed");
});

test("the signals are digest-bound and read the same from reference-profile evidence", async () => {
  const input = withExcluded(verified(await fixture()), "Beta");
  const evidence = projectReviewedExtractionEvidence(input, { profile: reviewedExtractionEvidenceReferenceProfile, includeImportRecord: true }).evidence;
  const restored = restoreReviewedExtractionEvidence(evidence, { resolveImportRecord: resolverFromBundle({ evidence: [evidence] }) });
  assert.deepEqual(reviewedExtractionReviewSignals(restored), { excerptVerification: "verified", excludedRivalProposalIndices: [1] });

  // Dropping the excluded entry after projection breaks the profile binding instead of hiding the rival.
  const tampered = projectReviewedExtractionEvidence(input).evidence;
  const reviewItem = (tampered.metadata!.reviewedExtraction as { input: ReviewedExtractionEvidenceInput }).input.reviewItem!;
  delete (reviewItem.metadata.producer![producerKey] as Record<string, unknown>).excludedProposals;
  const decision = evaluateReviewedGroundingPolicy({ policy: basePolicy, evidence: [tampered], claims });
  assert.deepEqual(decision.gaps.map((gap) => gap.kind), ["invalid-reviewed-evidence"]);
});
