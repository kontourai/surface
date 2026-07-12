/**
 * Issue #4 — Claim Detail Projection tests.
 *
 * The Surface Console detail sheet used to derive guidance, gap labels, policy
 * facts, and integrity scope inline in the browser while rendering DOM. That
 * derivation now lives in `buildClaimDetail` (server-side), shipped inside the
 * console projection. These tests pin the rendered detail model outputs for the
 * covered fields across representative claim states.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildClaimDetail, buildClaimDetails } from "../src/console/claim-detail-projection.js";
import { buildSurfaceConsoleProjection } from "../src/console/projection.js";

test("guidance: unknown claim with no evidence explains it was never evaluated; no command suggested", () => {
  const detail = buildClaimDetail(
    { id: "claim-1", status: "unknown", evidenceIds: [] },
    { producer: { name: "surface" } },
  );
  assert.match(detail.guidance ?? "", /never been evaluated/);
  assert.equal(detail.suggestedCommand, null);
});

test("guidance: verified claim needs no guidance and suggests no command", () => {
  const detail = buildClaimDetail({ id: "c", status: "verified", evidenceIds: ["e1"] }, {});
  assert.equal(detail.guidance, null);
  assert.equal(detail.suggestedCommand, null);
});

test("suggestedCommand: a claim carrying metadata.command surfaces it as the next step", () => {
  const detail = buildClaimDetail(
    { id: "c", status: "stale", evidenceIds: ["e1"], metadata: { command: "npm test" } },
    {},
  );
  assert.deepEqual(detail.suggestedCommand, {
    command: "npm test",
    note: "Runs the evidence check and captures output as evidence.",
  });
});

test("suggestedCommand: a veritas producer suggests `veritas checkin` for a stale claim", () => {
  const detail = buildClaimDetail(
    { id: "c", status: "stale", evidenceIds: [] },
    { producer: { name: "veritas" } },
  );
  assert.equal(detail.suggestedCommand?.command, "veritas checkin");
  assert.match(detail.suggestedCommand?.note ?? "", /Refreshes/);
});

test("gap labels: a 'Missing required evidence' provenance gap classifies as a setup issue", () => {
  const detail = buildClaimDetail(
    { id: "claim-1", status: "proposed", transparencyGapIds: ["gap-1"] },
    {
      transparencyGaps: [
        { id: "gap-1", claimId: "claim-1", type: "provenance_gap", severity: "high", blocking: true, message: "Missing required evidence: test_output." },
      ],
    },
  );
  assert.equal(detail.gaps.length, 1);
  assert.deepEqual(
    { kind: detail.gaps[0].kind, kindLabel: detail.gaps[0].kindLabel, title: detail.gaps[0].title, severity: detail.gaps[0].severity, blocking: detail.gaps[0].blocking },
    { kind: "setup", kindLabel: "Setup issue", title: "Evidence never collected", severity: "high", blocking: true },
  );
  assert.match(detail.gaps[0].hint ?? "", /did not emit the required evidence/);
});

test("gap labels: evidence-requirement gaps merge in, skipping types already covered by a transparency gap", () => {
  const detail = buildClaimDetail(
    { id: "claim-1", status: "proposed" },
    {
      transparencyGaps: [
        { id: "g1", claimId: "claim-1", type: "policy_violation", message: "Missing required verification method: attestation." },
      ],
      analytics: {
        evidenceRequirementGaps: [
          // Deduped away: same type already present as a transparency gap.
          { claimId: "claim-1", gapType: "policy_violation", message: "dup" },
          // Kept: a distinct type.
          { claimId: "claim-1", gapType: "provenance_gap", severity: "low", message: "Provenance incomplete" },
        ],
      },
    },
  );
  assert.deepEqual(detail.gaps.map((g) => g.title), ["Required method not collected", "Provenance gap"]);
  assert.equal(detail.gaps[0].kind, "config");
  assert.equal(detail.gaps[1].severity, "low");
});

test("policy facts: missing required evidence and methods are reported against the claim", () => {
  const detail = buildClaimDetail(
    { id: "claim-1", status: "proposed", verificationPolicyId: "pol-1", evidenceTypes: ["source_excerpt"], evidenceMethods: [] },
    {
      policies: [
        { id: "pol-1", requiredEvidence: ["source_excerpt", "test_output"], requiredMethods: ["validation"] },
      ],
    },
  );
  assert.ok(detail.policyGap);
  assert.deepEqual(detail.policyGap?.missingEvidence, ["test_output"]);
  assert.deepEqual(detail.policyGap?.missingMethods, ["validation"]);
  assert.deepEqual(detail.policyGap?.hasEvidence, ["source_excerpt"]);
});

test("policy facts: a fully-satisfied requirement yields no policy gap", () => {
  const detail = buildClaimDetail(
    { id: "c", status: "verified", verificationPolicyId: "pol-1", evidenceTypes: ["test_output"], evidenceMethods: ["validation"] },
    { policies: [{ id: "pol-1", requiredEvidence: ["test_output"], requiredMethods: ["validation"] }] },
  );
  assert.equal(detail.policyGap, null);
});

test("integrity scope: source, file, and config anchors are collected from the claim's evidence", () => {
  const detail = buildClaimDetail(
    { id: "claim-1", status: "verified", evidenceIds: ["e1"], currentIntegrityRef: "sha256:aaa" },
    {
      evidence: [
        {
          id: "e1",
          integrityRef: "sha256:bbb",
          metadata: {
            integrity: {
              fileRefs: [{ path: "src/a.ts", hash: "sha256:file", status: "unchanged" }],
              configRefs: { policy: { name: "policy.json", hash: "sha256:cfg", path: "cfg/policy.json" } },
            },
          },
        },
      ],
    },
  );
  assert.deepEqual(detail.integrityScope.sourceRefs, ["sha256:aaa", "sha256:bbb"]);
  assert.deepEqual(detail.integrityScope.fileRefs, [{ path: "src/a.ts", hash: "sha256:file", status: "unchanged" }]);
  assert.deepEqual(detail.integrityScope.configRefs, [{ kind: "policy", name: "policy.json", hash: "sha256:cfg", path: "cfg/policy.json" }]);
});

test("evidence is matched by evidenceIds membership only (mirrors the former browser context)", () => {
  // An evidence record that shares the claimId but is NOT in evidenceIds must be
  // excluded from integrity scope — the browser's collectClaimDetailContext used
  // evidenceIds membership only, and the projection preserves that.
  const detail = buildClaimDetail(
    { id: "claim-1", status: "verified", evidenceIds: [] },
    { evidence: [{ id: "e1", claimId: "claim-1", integrityRef: "sha256:orphan" }] },
  );
  assert.deepEqual(detail.integrityScope.sourceRefs, []);
});

test("nullish fallbacks: an explicit empty-string config name / gap severity is preserved, not replaced", () => {
  const detail = buildClaimDetail(
    { id: "claim-1", status: "proposed", evidenceIds: ["e1"], transparencyGapIds: ["g1"] },
    {
      transparencyGaps: [{ id: "g1", claimId: "claim-1", type: "provenance_gap", severity: "", message: "Missing required evidence: x." }],
      evidence: [{ id: "e1", metadata: { integrity: { configRefs: { policy: { name: "", hash: "sha256:cfg" } } } } }],
    },
  );
  // Mirrors the original browser `?? ` semantics (empty string is a real value).
  assert.equal(detail.gaps[0].severity, "");
  assert.equal(detail.integrityScope.configRefs[0].name, "");
});

test("buildClaimDetails keys the projection by claim id and is embedded in the console projection", () => {
  const projection = buildSurfaceConsoleProjection({
    producer: { runId: "run-1", name: "surface" },
    summary: { claimCount: 1, statusCounts: { unknown: 1 } },
    claims: [{ id: "claim-1", status: "unknown", evidenceIds: [], fieldOrBehavior: "npm test", facet: "veritas.evidence-check", subjectId: "repo" }],
  });
  assert.ok(projection.claimDetails["claim-1"], "claim detail projected under its id");
  assert.match(projection.claimDetails["claim-1"].guidance ?? "", /never been evaluated/);

  const map = buildClaimDetails(
    [{ id: "a", status: "verified" }, { status: "verified" }],
    {},
  );
  assert.deepEqual(Object.keys(map), ["a"], "claims without an id are skipped");
});
