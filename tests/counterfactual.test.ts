/**
 * Issue #17 — counterfactual traversal for derived trust impact analysis.
 *
 * Covers both directions the issue requires:
 *  - reverse drilldown (a conclusion → the inputs it depends on),
 *  - forward impact (an input → the conclusions affected if it flips / stales /
 *    becomes disputed),
 * across at least two derivation depths.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { TrustReport, TrustStatus } from "../src/types.js";
import { analyzeCounterfactual, traceDependencies, traceDependents } from "../src/counterfactual.js";

interface ClaimSpec {
  id: string;
  status: TrustStatus;
  derivedFrom?: string[];
  derivationEdges?: Array<{ inputClaimId: string }>;
}

// The counterfactual functions read only `report.claims` (id, status, and the
// derivation inputs), so a minimal claim list is a faithful fixture.
function report(claims: ClaimSpec[]): TrustReport {
  return { claims } as unknown as TrustReport;
}

// A → B → C chain (C derives from B, B derives from A); A is a leaf input.
function chain(statuses: Partial<Record<"A" | "B" | "C", TrustStatus>> = {}): TrustReport {
  return report([
    { id: "A", status: statuses.A ?? "verified" },
    { id: "B", status: statuses.B ?? "verified", derivedFrom: ["A"] },
    { id: "C", status: statuses.C ?? "verified", derivedFrom: ["B"] },
  ]);
}

test("reverse drilldown: traceDependencies returns transitive inputs with depth", () => {
  assert.deepEqual(traceDependencies(chain(), "C"), [
    { claimId: "B", depth: 1 },
    { claimId: "A", depth: 2 },
  ]);
  assert.deepEqual(traceDependencies(chain(), "A"), []); // a leaf input depends on nothing
});

test("forward: traceDependents returns which derived claims depend on an input, transitively", () => {
  assert.deepEqual(traceDependents(chain(), "A"), [
    { claimId: "B", depth: 1 },
    { claimId: "C", depth: 2 },
  ]);
  assert.deepEqual(traceDependents(chain(), "C"), []); // nothing derives from the conclusion
});

test("forward impact: flipping an input to disputed weakens conclusions across two depths", () => {
  const result = analyzeCounterfactual(chain(), "A", "disputed");
  assert.equal(result.targetClaimId, "A");
  assert.deepEqual(result.affected, [
    { claimId: "B", fromStatus: "verified", toStatus: "disputed", depth: 1 },
    { claimId: "C", fromStatus: "verified", toStatus: "disputed", depth: 2 },
  ]);
});

test("forward impact: staling an input cascades a stale ceiling downstream", () => {
  const result = analyzeCounterfactual(chain(), "A", "stale");
  assert.deepEqual(result.affected.map((a) => [a.claimId, a.toStatus]), [
    ["B", "stale"],
    ["C", "stale"],
  ]);
});

test("forward impact via derivationEdges (not just derivedFrom) is traversed", () => {
  const r = report([
    { id: "A", status: "verified" },
    { id: "B", status: "verified", derivationEdges: [{ inputClaimId: "A" }] },
  ]);
  assert.deepEqual(traceDependents(r, "A"), [{ claimId: "B", depth: 1 }]);
  assert.deepEqual(analyzeCounterfactual(r, "A", "rejected").affected, [
    { claimId: "B", fromStatus: "verified", toStatus: "rejected", depth: 1 },
  ]);
});

test("partial reachability: only conclusions downstream of the input are affected", () => {
  // D derives from both A and an independent input E. Flipping A must affect D
  // but never E (which does not depend on A).
  const r = report([
    { id: "A", status: "verified" },
    { id: "E", status: "verified" },
    { id: "D", status: "verified", derivedFrom: ["A", "E"] },
  ]);
  const result = analyzeCounterfactual(r, "A", "disputed");
  assert.deepEqual(result.affected, [
    { claimId: "D", fromStatus: "verified", toStatus: "disputed", depth: 1 },
  ]);
});

test("a conclusion already weaker than the hypothesised ceiling is not reported as changed", () => {
  // B is already rejected (weaker than disputed), so flipping A to disputed does
  // not move B — the derivation ceiling only bounds downward.
  const r = chain({ B: "rejected" });
  const result = analyzeCounterfactual(r, "A", "disputed");
  // C derives from the already-rejected B, so C is bounded to rejected regardless
  // of A; B itself does not change and must not appear.
  assert.equal(result.affected.some((a) => a.claimId === "B"), false);
});

test("an input with no dependents yields no affected conclusions", () => {
  assert.deepEqual(analyzeCounterfactual(chain(), "C", "disputed").affected, []);
});

test("a strengthening hypothetical yields no modelled change (ceiling only bounds downward)", () => {
  const r = chain({ A: "disputed", B: "disputed", C: "disputed" });
  // Even improving A to verified cannot raise B/C above their own derived status.
  assert.deepEqual(analyzeCounterfactual(r, "A", "verified").affected, []);
});

test("cycles are traversed safely without looping", () => {
  const r = report([
    { id: "A", status: "verified", derivedFrom: ["B"] },
    { id: "B", status: "verified", derivedFrom: ["A"] },
  ]);
  // Both directions and the counterfactual must terminate on a cycle.
  assert.deepEqual(traceDependents(r, "A").map((d) => d.claimId).sort(), ["B"]);
  assert.deepEqual(traceDependencies(r, "A").map((d) => d.claimId).sort(), ["B"]);
  const result = analyzeCounterfactual(r, "A", "disputed");
  assert.equal(result.affected.some((a) => a.claimId === "B"), true);
});

test("affected conclusions are ordered weakest-first by depth then id", () => {
  // Diamond: A → B, A → C, and D derives from both B and C (depth 2).
  const r = report([
    { id: "A", status: "verified" },
    { id: "C", status: "verified", derivedFrom: ["A"] },
    { id: "B", status: "verified", derivedFrom: ["A"] },
    { id: "D", status: "verified", derivedFrom: ["B", "C"] },
  ]);
  const result = analyzeCounterfactual(r, "A", "disputed");
  assert.deepEqual(result.affected.map((a) => [a.claimId, a.depth]), [
    ["B", 1],
    ["C", 1],
    ["D", 2],
  ]);
});
