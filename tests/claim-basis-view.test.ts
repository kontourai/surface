/**
 * claimBasisView (kontourai/ui#87): the basis line shown after the status chip.
 *
 * Each rule below has a test that fails when the rule is reverted: caveats
 * first and never truncated, absent `passing` never read as a pass, a check
 * that could not run named as such, methods in enum order, and the producer's
 * own strength rating kept out of the line.
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as root from "../src/index.js";
import * as display from "../src/display.js";
import {
  CLAIM_BASIS_LINE_MAX_FACETS,
  claimBasisView,
  evidenceResultState,
  evidenceSupportState,
  missingClaimBasisView,
  type TrustBasisRecordedView,
  type TrustBasisView,
} from "../src/claim-basis-view.js";
import type { Claim, Evidence } from "../src/types.js";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "claim.basis",
    subjectType: "record",
    subjectId: "record-1",
    claimType: "record-status",
    fieldOrBehavior: "status",
    value: "active",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

let nextId = 0;
function evidence(overrides: Partial<Evidence> = {}): Evidence {
  nextId += 1;
  return {
    id: `evidence.basis.${nextId}`,
    claimId: "claim.basis",
    supportStrength: "entails",
    evidenceType: "source_excerpt",
    method: "extraction",
    sourceRef: "https://example.org/registry",
    excerptOrSummary: "The registry lists the record as active.",
    observedAt: "2026-05-01T00:00:00.000Z",
    collectedBy: "registry-crawler",
    passing: true,
    ...overrides,
  };
}

function recorded(view: TrustBasisView): TrustBasisRecordedView {
  assert.equal(view.state, "recorded", `expected a recorded view, got ${JSON.stringify(view)}`);
  return view as TrustBasisRecordedView;
}

function labels(view: TrustBasisView): string[] {
  return recorded(view).facets.map((facet) => facet.label);
}

function detailValue(view: TrustBasisView, label: string): string | undefined {
  return view.detail?.find((row) => row.label === label)?.value;
}

// ── missing states ─────────────────────────────────────────────────────────

test("a claim with no evidence, derivation, or review is 'Basis not recorded', never blank", () => {
  const view = claimBasisView(claim(), []);
  assert.deepEqual(view, { state: "not-recorded", label: "Basis not recorded" });
});

test("evidence for another claim is not attributed to this one", () => {
  const view = claimBasisView(claim(), [evidence({ claimId: "claim.other" })]);
  assert.equal(view.state, "not-recorded");
});

test("a missing claim is 'Basis not available'; host-detected states carry their labels", () => {
  assert.deepEqual(claimBasisView(undefined, []), { state: "not-available", label: "Basis not available" });
  assert.deepEqual(missingClaimBasisView("restricted"), { state: "restricted", label: "Basis restricted" });
  assert.deepEqual(missingClaimBasisView("unavailable"), { state: "unavailable", label: "Basis unavailable" });
});

test("a producer rating alone does not make a basis line: not recorded, rating kept for the inspector", () => {
  const view = claimBasisView(claim({ confidenceBasis: { evidenceStrength: "strong", reviewerAuthority: "none" } }), []);
  assert.equal(view.state, "not-recorded");
  assert.equal(view.label, "Basis not recorded");
  assert.equal(detailValue(view, "Producer rating"), "Strong support (producer-rated)");
  assert.equal(detailValue(view, "Review"), "Not reviewed");
});

// ── caveats ────────────────────────────────────────────────────────────────

test("a model-derived claim with passing evidence leads with 'Model-derived'", () => {
  const view = claimBasisView(
    claim({ derivationEdges: [{ inputClaimId: "claim.input", method: "model" }] }),
    [evidence(), evidence()],
  );
  const { facets } = recorded(view);
  assert.deepEqual(facets[0], { field: "derivationMethod", code: "model", label: "Model-derived", caveat: true });
  assert.deepEqual(labels(view), ["Model-derived", "Extracted from a source", "2 entail the claim"]);
  assert.equal(detailValue(view, "Derived"), "Model-derived (1 input)");
});

test("execution.isError reads 'check could not run', and is not also counted as not evaluated", () => {
  const view = claimBasisView(claim(), [
    evidence({ method: "validation", evidenceType: "test_output", passing: undefined, execution: { runner: "bash", label: "npm test", isError: true } }),
  ]);
  const { facets } = recorded(view);
  assert.deepEqual(facets[0], { field: "execution", code: "could-not-run", label: "1 check could not run", caveat: true });
  assert.ok(!facets.some((facet) => facet.code === "not-evaluated"));
  assert.match(detailValue(view, "Results") ?? "", /1 could not run/);
});

test("a check that could not run is never a failed result or counterevidence, even with passing: false", () => {
  const view = claimBasisView(claim(), [
    evidence({ method: "validation", passing: false, execution: { runner: "bash", label: "npm test", exitCode: 1, isError: true } }),
  ]);
  const { facets } = recorded(view);
  assert.deepEqual(facets.map((facet) => facet.code), ["could-not-run", "validation", "entails"]);
  assert.equal(detailValue(view, "Results"), "1 could not run");
  assert.doesNotMatch(detailValue(view, "Support") ?? "", /counterevidence/);
});

test("absent `passing` is 'Not evaluated', never a pass", () => {
  const view = claimBasisView(claim(), [evidence({ passing: undefined })]);
  const { facets } = recorded(view);
  assert.deepEqual(facets[0], { field: "result", code: "not-evaluated", label: "1 not evaluated", caveat: true });
  const results = detailValue(view, "Results") ?? "";
  assert.equal(results, "1 not evaluated");
  assert.doesNotMatch(results, /passed/i);
  for (const facet of facets) assert.doesNotMatch(facet.label, /pass/i);
});

test("cited-only evidence and standing counterevidence are caveats", () => {
  const view = claimBasisView(claim(), [
    evidence({ supportStrength: "cited" }),
    evidence({ passing: false }),
  ]);
  assert.deepEqual(
    recorded(view).facets.map((facet) => [facet.code, facet.caveat]),
    [
      ["cited", true],
      ["counterevidence", true],
      ["extraction", false],
    ],
  );
});

test("more than 3 candidate facets: caveats come first and none is dropped by truncation", () => {
  const view = claimBasisView(
    claim({
      derivationEdges: [{ inputClaimId: "claim.input", method: "model" }],
      confidenceBasis: { reviewerAuthority: "domain_expert" },
    }),
    [
      evidence(), // entails + passed + extraction
      evidence({ passing: undefined }), // not evaluated
      evidence({ supportStrength: "cited" }), // cited only
      evidence({ passing: false }), // counterevidence
      evidence({ method: "validation", passing: false, blocking: false, execution: { runner: "bash", label: "check", isError: true } }),
    ],
  );
  assert.deepEqual(
    recorded(view).facets.map((facet) => facet.code),
    ["model", "could-not-run", "not-evaluated", "cited", "counterevidence"],
    "all five caveats, in the fixed order, and no non-caveat facet",
  );
  assert.ok(recorded(view).facets.every((facet) => facet.caveat));
});

test("with fewer caveats than the limit, remaining slots go to method, then support, then review", () => {
  const view = claimBasisView(claim({ confidenceBasis: { reviewerAuthority: "operator" } }), [
    evidence({ supportStrength: "cited" }),
    evidence(),
  ]);
  assert.equal(recorded(view).facets.length, CLAIM_BASIS_LINE_MAX_FACETS);
  assert.deepEqual(labels(view), ["1 cited only", "Extracted from a source", "1 entails the claim"]);

  const reviewed = claimBasisView(claim({ confidenceBasis: { reviewerAuthority: "operator" } }), [evidence()]);
  assert.deepEqual(labels(reviewed), ["Extracted from a source", "1 entails the claim", "Operator reviewed"]);
});

// ── methods ────────────────────────────────────────────────────────────────

test("multiple methods are listed in Surface enum order, collapsed to 'X + N more methods'", () => {
  // Supplied out of enum order: monitoring, validation, extraction.
  const view = claimBasisView(claim(), [
    evidence({ method: "monitoring" }),
    evidence({ method: "validation" }),
    evidence({ method: "extraction" }),
    evidence({ method: "validation" }),
  ]);
  const method = recorded(view).facets.find((facet) => facet.field === "method");
  assert.deepEqual(method, { field: "method", code: "extraction", label: "Extracted from a source + 2 more methods", caveat: false });
  assert.equal(
    detailValue(view, "How"),
    "Extracted from a source (1) · Checked against expectations (2) · Continuously monitored (1)",
  );

  const two = claimBasisView(claim(), [evidence({ method: "validation" }), evidence({ method: "observation" })]);
  assert.equal(recorded(two).facets[0]?.label, "Directly observed + 1 more method");
});

test("a derived claim without evidence shows its derivation method; unstated methods still read as derived", () => {
  const view = claimBasisView(
    claim({ derivationEdges: [{ inputClaimId: "a", method: "copy" }, { inputClaimId: "b", method: "sum" }] }),
    [],
  );
  assert.deepEqual(recorded(view).facets, [
    { field: "derivationMethod", code: "sum", label: "Calculated (sum) + 1 more method", caveat: false },
  ]);
  const unstated = claimBasisView(claim({ derivationEdges: [{ inputClaimId: "a" }, { inputClaimId: "b" }] }), []);
  assert.deepEqual(labels(unstated), ["Derived from 2 inputs"]);
});

// ── producer-supplied signals stay in the inspector ────────────────────────

test("producer-rated evidence strength and calibrated confidence never appear as facets", () => {
  const view = claimBasisView(
    claim({
      confidenceBasis: { evidenceStrength: "strong" },
      conclusionConfidence: { value: 0.82, interval: { low: 0.74, high: 0.88 }, method: "ensemble" },
    }),
    [evidence()],
  );
  const facets = recorded(view).facets;
  for (const facet of facets) {
    assert.notEqual(facet.field as string, "evidenceStrength");
    assert.doesNotMatch(facet.label, /strong|producer|0\.82|confidence/i);
  }
  assert.equal(detailValue(view, "Producer rating"), "Strong support (producer-rated)");
  assert.equal(
    detailValue(view, "Calibrated confidence (producer-supplied)"),
    "0.82 probability the conclusion is correct, interval 0.74–0.88 · ensemble",
  );
});

// ── invariants ─────────────────────────────────────────────────────────────

test("pure and deterministic: same input, same view; inputs are not mutated", () => {
  const input = claim({ derivationEdges: [{ inputClaimId: "a", method: "model" }], confidenceBasis: { reviewerAuthority: "system" } });
  const items = [evidence({ method: "validation" }), evidence({ supportStrength: undefined, passing: undefined })];
  const before = JSON.stringify([input, items]);
  assert.deepEqual(claimBasisView(input, items), claimBasisView(input, items));
  assert.equal(JSON.stringify([input, items]), before);
});

test("every view has a non-empty line: facets with labels, or a missing-state label", () => {
  const cases: TrustBasisView[] = [
    claimBasisView(claim(), []),
    claimBasisView(null, []),
    claimBasisView(claim({ confidenceBasis: { reviewerAuthority: "none" } }), []),
    claimBasisView(claim({ confidenceBasis: { reviewerAuthority: "system" } }), []),
    claimBasisView(claim(), [evidence({ supportStrength: undefined })]),
    claimBasisView(claim({ derivationEdges: [{ inputClaimId: "a" }] }), []),
  ];
  for (const view of cases) {
    if (view.state === "recorded") {
      assert.ok(view.facets.length > 0);
      for (const facet of view.facets) assert.ok(facet.label.trim().length > 0);
    } else {
      assert.ok(view.label.trim().length > 0);
    }
  }
});

test("support and result states match the trust panel's partition", () => {
  assert.equal(evidenceSupportState({ supportStrength: undefined }), "unstated");
  assert.equal(evidenceSupportState({ supportStrength: "cited" }), "cited");
  assert.equal(evidenceResultState({ passing: undefined }), "not-evaluated");
  assert.equal(evidenceResultState({ passing: false }), "failed");
  assert.equal(evidenceResultState({ passing: false, blocking: true }), "failed-blocking");
  assert.equal(evidenceResultState({ passing: true, blocking: true }), "passed");
});

test("./display exports claimBasisView and the label tables; the root keeps the tables but not the view", () => {
  assert.equal(display.claimBasisView, claimBasisView);
  assert.equal(display.DERIVATION_METHOD_LABELS, root.DERIVATION_METHOD_LABELS);
  assert.equal(display.EVIDENCE_STRENGTH_DISPLAY_NAMES, root.EVIDENCE_STRENGTH_DISPLAY_NAMES);
  assert.ok(!("claimBasisView" in root), "basis projections stay out of the root barrel");
});
