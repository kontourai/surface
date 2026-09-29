/**
 * claimBasisView (kontourai/ui#87): the basis line shown after the status chip.
 *
 * Each rule below has a test that fails when the rule is reverted: caveats
 * first and never truncated, absent `passing` never read as a pass, every
 * failure on the line (execution errors included), methods in enum order, and the producer's
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
import { summarizeClaims } from "../src/report.js";
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

test("execution.isError is a check that ran and failed: classified by passing/blocking, never 'could not run'", () => {
  // Producers set isError from a non-zero exit code or an MCP tool error, so a
  // real failure carries it; the view must agree with status derivation.
  const view = claimBasisView(claim(), [
    evidence({ method: "validation", passing: false, execution: { runner: "bash", label: "npm test", exitCode: 1, isError: true } }),
  ]);
  assert.deepEqual(labels(view), ["1 contradicts the claim", "Checked against expectations"]);
  assert.equal(detailValue(view, "Results"), "1 failed");
  for (const text of [...labels(view), ...(view.detail ?? []).map((row) => row.value)]) assert.doesNotMatch(text, /could not run/i);

  const nonBlocking = claimBasisView(claim(), [
    evidence({ passing: false, blocking: false, execution: { runner: "mcp", label: "tool@server", isError: true } }),
  ]);
  assert.deepEqual(labels(nonBlocking), ["1 failed (not blocking)", "Extracted from a source"]);

  const noResult = claimBasisView(claim(), [evidence({ passing: undefined, execution: { runner: "mcp", label: "tool@server", isError: true } })]);
  assert.deepEqual(labels(noResult), ["1 not evaluated", "Extracted from a source", "1 entails the claim"]);
});

test("a non-zero exitCode without isError is classified the same way", () => {
  const view = claimBasisView(claim(), [
    evidence({ method: "validation", passing: false, execution: { runner: "bash", label: "npm test", exitCode: 1 } }),
  ]);
  assert.deepEqual(labels(view), ["1 contradicts the claim", "Checked against expectations"]);
});

test("only evidence linked to this claim bears on it: another claim's failed check never reaches the line or counts", () => {
  const unrelated = evidence({
    claimId: "claim.other",
    method: "validation",
    passing: false,
    blocking: true,
    sourceRef: "https://example.org/other",
    execution: { runner: "bash", label: "unrelated tool call", exitCode: 1, isError: true },
  });
  const withUnrelated = claimBasisView(claim(), [evidence(), unrelated]);
  assert.deepEqual(withUnrelated, claimBasisView(claim(), [evidence()]));
  assert.deepEqual(labels(withUnrelated), ["Extracted from a source", "1 entails the claim"]);
  assert.equal(detailValue(withUnrelated, "Results"), "1 passed");
  assert.equal(detailValue(withUnrelated, "Sources"), "1 distinct source");
});

test("a failure that is not counterevidence still reaches the line as 'failed (not blocking)'", () => {
  const nonBlocking = claimBasisView(claim(), [evidence({ passing: false, blocking: false })]);
  assert.deepEqual(recorded(nonBlocking).facets[0], { field: "result", code: "failed-not-blocking", label: "1 failed (not blocking)", caveat: true });
  assert.ok(!labels(nonBlocking).some((label) => /entail/.test(label)));

  // Cited failures are not counterevidence because they are cited, even when
  // marked blocking; they must not read as "not blocking".
  const citedFailures = claimBasisView(claim(), [
    evidence({ supportStrength: "cited", passing: false, blocking: true }),
    evidence({ supportStrength: "cited", passing: false }),
  ]);
  assert.deepEqual(recorded(citedFailures).facets[0], { field: "result", code: "failed-cited-only", label: "2 failed (cited only)", caveat: true });
  assert.ok(!labels(citedFailures).some((label) => /not blocking/.test(label)));

  // Cited and non-blocking: cited is checked first.
  const both = claimBasisView(claim(), [evidence({ supportStrength: "cited", passing: false, blocking: false })]);
  assert.equal(labels(both)[0], "1 failed (cited only)");

  const mixed = claimBasisView(claim(), [
    evidence({ passing: false, blocking: false }),
    evidence({ supportStrength: "cited", passing: false, blocking: true }),
    evidence({ supportStrength: "cited", passing: false }),
  ]);
  assert.deepEqual(recorded(mixed).facets[0], { field: "result", code: "failed-mixed", label: "3 failed (1 not blocking, 2 cited only)", caveat: true });
});

test("line support counts only evidence that did not fail; the inspector keeps the full partition", () => {
  // A sole entailing, blocking failure must not read as both contradicting and entailing the claim.
  const view = claimBasisView(claim(), [evidence({ passing: false, blocking: true })]);
  assert.deepEqual(labels(view), ["1 contradicts the claim", "Extracted from a source"]);
  assert.equal(detailValue(view, "Support"), "1 entails the claim · 1 contradicts the claim");
  assert.equal(detailValue(view, "Results"), "1 failed — blocking");

  const mixed = claimBasisView(claim(), [evidence(), evidence({ passing: false }), evidence({ supportStrength: undefined })]);
  assert.deepEqual(labels(mixed), ["1 contradicts the claim", "Extracted from a source", "1 entails the claim"]);
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
      evidence({ method: "validation", passing: false, blocking: false, execution: { runner: "bash", label: "check", isError: true } }), // failed (not blocking)
    ],
  );
  assert.deepEqual(
    recorded(view).facets.map((facet) => facet.code),
    ["model", "not-evaluated", "cited", "counterevidence", "failed-not-blocking"],
    "all five caveats, in the fixed order, and no non-caveat facet",
  );
  assert.ok(recorded(view).facets.every((facet) => facet.caveat));

  const all = claimBasisView(claim({ derivationEdges: [{ inputClaimId: "claim.input", method: "model" }] }), [
    evidence({ passing: undefined }),
    evidence({ supportStrength: "cited" }),
    evidence({ passing: false }),
    evidence({ passing: false, blocking: false }),
    evidence(),
  ]);
  assert.deepEqual(labels(all), [
    "Model-derived",
    "1 not evaluated",
    "1 cited only",
    "1 contradicts the claim",
    "1 failed (not blocking)",
  ]);
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
  const unstatedSupport = claimBasisView(claim(), [evidence({ supportStrength: undefined }), evidence({ supportStrength: undefined })]);
  assert.deepEqual(labels(unstatedSupport), ["Extracted from a source", "2 with support not stated"]);
  const unstated = claimBasisView(claim({ derivationEdges: [{ inputClaimId: "a" }, { inputClaimId: "b" }] }), []);
  assert.deepEqual(labels(unstated), ["Derived from 2 inputs"]);
});

// ── producer-supplied signals stay in the inspector ────────────────────────

test("calibrated confidence is shown only when it is a probability in [0, 1]", () => {
  const row = (conclusionConfidence: Claim["conclusionConfidence"]) =>
    detailValue(claimBasisView(claim({ conclusionConfidence }), [evidence()]), "Calibrated confidence (producer-supplied)");
  assert.equal(row({ value: 1.5 }), undefined);
  assert.equal(row({ value: Number.NaN }), undefined);
  assert.equal(row({ value: -0.1 }), undefined);
  assert.equal(row({ value: 0.5, interval: { low: -1, high: 0.7 } }), "0.5 probability the conclusion is correct");
  assert.equal(row({ value: 0.5, interval: { low: 0.7, high: 0.4 } }), "0.5 probability the conclusion is correct");
  assert.equal(row({ value: 0 }), "0 probability the conclusion is correct");
});

test("unrecognized wire values are named as unrecognized, never shown bare", () => {
  const view = claimBasisView(
    claim({ confidenceBasis: { reviewerAuthority: "oracle" as never } }),
    [evidence({ method: "telepathy" as never })],
  );
  assert.deepEqual(labels(view), ["Unrecognized method (telepathy)", "1 entails the claim", "Unrecognized reviewer (oracle)"]);
  assert.equal(detailValue(view, "How"), "Unrecognized method (telepathy) (1)");
  const derived = claimBasisView(claim({ derivationEdges: [{ inputClaimId: "a", method: "guess" as never }] }), []);
  assert.deepEqual(labels(derived), ["Unrecognized method (guess)"]);
});

test("a reviewerAuthority or evidenceStrength that is not a non-empty string is treated as absent (#282)", () => {
  // Every facet code the view may emit for this input: the reviewer enum
  // (types.ts, pinned literally here) plus the derived codes this claim can
  // produce. A non-string value must never reach `code`.
  const knownCodes = new Set(["operator", "domain_expert", "system", "cited", "entails", "extraction"]);
  for (const bad of [null, 5, { level: "operator" }, ""]) {
    const view = claimBasisView(
      claim({ confidenceBasis: { reviewerAuthority: bad as never, evidenceStrength: bad as never } }),
      [evidence({ supportStrength: "cited" })],
    );
    const facets = recorded(view).facets;
    for (const facet of facets) {
      assert.equal(typeof facet.code, "string", `non-string code for ${JSON.stringify(bad)}: ${JSON.stringify(facet)}`);
      assert.ok(knownCodes.has(facet.code), `unknown code ${JSON.stringify(facet.code)} for ${JSON.stringify(bad)}`);
      assert.equal(typeof facet.label, "string");
    }
    assert.deepEqual(labels(view), ["1 cited only", "Extracted from a source"], `line for ${JSON.stringify(bad)}`);
    assert.ok(!facets.some((facet) => facet.field === "reviewerAuthority"));
    assert.equal(detailValue(view, "Review"), undefined);
    assert.equal(detailValue(view, "Producer rating"), undefined);
  }
  // A claim whose only basis is a malformed reviewer has no basis, not an unrecognized one.
  assert.equal(claimBasisView(claim({ confidenceBasis: { reviewerAuthority: null as never } }), []).state, "not-recorded");
});

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

// ── malformed wire values: view and report agree (#300) ───────────────────

// Values `validateTrustBundle` would reject but unvalidated input can carry.
// Each must be treated exactly like the field being absent.
const MALFORMED_WIRE_VALUES: readonly unknown[] = [null, 5, 0, false, { level: "operator" }, ["operator"], "", "   ", "\t\n"];

function reportReviewers(input: Claim): Record<string, number> {
  return summarizeClaims([{ ...input, status: "verified" }]).confidenceBasis.reviewerAuthority;
}

function assertCodesKnown(view: TrustBasisView, known: ReadonlySet<string>, context: string): void {
  if (view.state !== "recorded") return;
  for (const facet of view.facets) {
    assert.equal(typeof facet.code, "string", `non-string code (${context}): ${JSON.stringify(facet)}`);
    assert.ok(known.has(facet.code), `unknown code ${JSON.stringify(facet.code)} (${context})`);
  }
}

test("a malformed reviewerAuthority is absent in both claimBasisView and the report summary (#300)", () => {
  for (const bad of MALFORMED_WIRE_VALUES) {
    const context = JSON.stringify(bad);
    const input = claim({ confidenceBasis: { reviewerAuthority: bad as never } });
    const view = claimBasisView(input, [evidence()]);
    assertCodesKnown(view, new Set(["extraction", "entails"]), context);
    assert.deepEqual(labels(view), ["Extracted from a source", "1 entails the claim"], `line for ${context}`);
    assert.equal(detailValue(view, "Review"), undefined, `Review row for ${context}`);
    assert.deepEqual(reportReviewers(input), {}, `report reviewer buckets for ${context}`);
    // Nothing but a malformed reviewer means no basis at all.
    assert.equal(claimBasisView(input, []).state, "not-recorded", `state for ${context}`);
  }
});

test("claimBasisView and the report summary agree on every reviewerAuthority value (#300)", () => {
  // Literal pins next to the derived check: known, unrecognized, "none", padded.
  assert.deepEqual(reportReviewers(claim({ confidenceBasis: { reviewerAuthority: "operator" } })), { operator: 1 });
  assert.deepEqual(reportReviewers(claim({ confidenceBasis: { reviewerAuthority: "oracle" as never } })), { oracle: 1 });
  assert.equal(
    detailValue(claimBasisView(claim({ confidenceBasis: { reviewerAuthority: " operator" as never } }), []), "Review"),
    "Unrecognized reviewer ( operator)",
  );
  const values: unknown[] = [...MALFORMED_WIRE_VALUES, "operator", "domain_expert", "system", "none", "oracle", " operator", undefined];
  for (const value of values) {
    const context = JSON.stringify(value);
    const input = claim({ confidenceBasis: { reviewerAuthority: value as never } });
    const view = claimBasisView(input, []);
    const buckets = Object.keys(reportReviewers(input));
    const facetCodes = view.state === "recorded" ? view.facets.filter((facet) => facet.field === "reviewerAuthority").map((facet) => facet.code) : [];
    // The report buckets exactly the value the view reviews ("none" is
    // reviewed in the inspector but never a line facet).
    assert.equal(buckets.length > 0, detailValue(view, "Review") !== undefined, `Review row vs report for ${context}`);
    assert.deepEqual(facetCodes, buckets.filter((code) => code !== "none"), `facet code vs report bucket for ${context}`);
    for (const code of buckets) assert.equal(code, value, `report bucket is the wire value for ${context}`);
  }
});

test("claimBasisView and the report summary agree on every evidenceStrength value (#300)", () => {
  const reportStrengths = (input: Claim) => summarizeClaims([{ ...input, status: "verified" }]).confidenceBasis.evidenceStrength;
  // Literal pins next to the derived check.
  assert.deepEqual(reportStrengths(claim({ confidenceBasis: { evidenceStrength: "strong" } })), { strong: 1 });
  assert.deepEqual(reportStrengths(claim({ confidenceBasis: { evidenceStrength: "   " as never } })), {});
  assert.deepEqual(reportStrengths(claim({ confidenceBasis: { evidenceStrength: 5 as never } })), {});
  const values: unknown[] = [...MALFORMED_WIRE_VALUES, "none", "weak", "moderate", "strong", "vibes", " strong", undefined];
  for (const value of values) {
    const context = JSON.stringify(value);
    const input = claim({ confidenceBasis: { evidenceStrength: value as never } });
    const view = claimBasisView(input, [evidence()]);
    const buckets = Object.keys(reportStrengths(input));
    // evidenceStrength is never a facet; the view shows it only as the
    // "Producer rating" row, which exists exactly when the report buckets it.
    assertCodesKnown(view, new Set(["extraction", "entails"]), context);
    assert.equal(buckets.length > 0, detailValue(view, "Producer rating") !== undefined, `Producer rating row vs report for ${context}`);
    for (const code of buckets) assert.equal(code, value, `report bucket is the wire value for ${context}`);
    if (MALFORMED_WIRE_VALUES.includes(value)) assert.deepEqual(buckets, [], `report strength buckets for ${context}`);
  }
});

test("a malformed evidence method is treated as absent, never coerced to a code (#300)", () => {
  const absent = claimBasisView(claim(), [evidence({ method: undefined })]);
  assert.deepEqual(labels(absent), ["1 entails the claim"]);
  assert.equal(detailValue(absent, "How"), undefined);
  for (const bad of MALFORMED_WIRE_VALUES) {
    const context = JSON.stringify(bad);
    const view = claimBasisView(claim(), [evidence({ method: bad as never })]);
    assertCodesKnown(view, new Set(["entails"]), context);
    assert.deepEqual(view, absent, `view for ${context}`);
    // Alongside a valid method, the malformed one adds nothing.
    const mixed = claimBasisView(claim(), [evidence({ method: bad as never }), evidence({ method: "validation" })]);
    assertCodesKnown(mixed, new Set(["validation", "entails"]), context);
    assert.equal(detailValue(mixed, "How"), "Checked against expectations (1)", `How row for ${context}`);
    assert.ok(!detailValue(mixed, "How")!.includes("Unrecognized"), `How row for ${context}`);
  }
});

test("a malformed derivation-edge method is 'not stated', counted once (#300)", () => {
  const absent = claimBasisView(claim({ derivationEdges: [{ inputClaimId: "a" }] }), []);
  assert.deepEqual(labels(absent), ["Derived from 1 input"]);
  assert.equal(detailValue(absent, "Derived"), "Method not stated (1 input)");
  for (const bad of MALFORMED_WIRE_VALUES) {
    const context = JSON.stringify(bad);
    const view = claimBasisView(claim({ derivationEdges: [{ inputClaimId: "a", method: bad as never }] }), []);
    assertCodesKnown(view, new Set(["unstated"]), context);
    assert.deepEqual(view, absent, `view for ${context}`);
    const mixed = claimBasisView(claim({ derivationEdges: [{ inputClaimId: "a", method: "sum" }, { inputClaimId: "b", method: bad as never }] }), []);
    assertCodesKnown(mixed, new Set(["sum"]), context);
    assert.deepEqual(labels(mixed), ["Calculated (sum)"], `line for ${context}`);
    assert.equal(detailValue(mixed, "Derived"), "Calculated (sum) (1 input) · Method not stated (1 input)", `Derived row for ${context}`);
  }
});
