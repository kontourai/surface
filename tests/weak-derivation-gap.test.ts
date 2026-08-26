import assert from "node:assert/strict";
import test from "node:test";
import { buildTrustReport } from "../src/index.js";
import type { TrustBundle } from "../src/types.js";

test("weak derivation remains a gap without changing the status function", () => {
  const bundle: TrustBundle = {
    schemaVersion: 5,
    source: "fixture:weak-derivation",
    claims: [
      { id: "input", subjectType: "x", subjectId: "x", claimType: "x", fieldOrBehavior: "x", value: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "conclusion", subjectType: "x", subjectId: "y", claimType: "x", fieldOrBehavior: "y", value: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", derivationEdges: [{ inputClaimId: "input", supportStrength: "weak" }] },
    ],
    evidence: [], policies: [], events: [],
  };
  const report = buildTrustReport(bundle, { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.equal(report.claims.find((claim) => claim.id === "conclusion")?.status, "unknown");
  assert.ok(report.transparencyGaps.some((gap) => gap.claimId === "conclusion" && gap.type === "unsupported_inference"));
});

test("weak direct, transitive, and mixed edges preserve verified status and expose affected edge identity", () => {
  const at = "2026-01-01T00:00:00.000Z";
  const baseClaims = [
    { id: "leaf", subjectType: "x", subjectId: "leaf", claimType: "x", fieldOrBehavior: "leaf", value: true, createdAt: at, updatedAt: at },
    { id: "other", subjectType: "x", subjectId: "other", claimType: "x", fieldOrBehavior: "other", value: true, createdAt: at, updatedAt: at },
    { id: "middle", subjectType: "x", subjectId: "middle", claimType: "x", fieldOrBehavior: "middle", value: true, createdAt: at, updatedAt: at, derivationEdges: [{ inputClaimId: "leaf", supportStrength: "weak" as const }] },
    { id: "conclusion", subjectType: "x", subjectId: "conclusion", claimType: "x", fieldOrBehavior: "conclusion", value: true, createdAt: at, updatedAt: at, derivationEdges: [{ inputClaimId: "middle", supportStrength: "strong" as const }, { inputClaimId: "other", supportStrength: "weak" as const }] },
  ];
  const events = baseClaims.map((claim) => ({ id: `verified-${claim.id}`, claimId: claim.id, status: "verified" as const, actor: "owner", method: "review" as const, evidenceIds: [], createdAt: at }));
  const report = buildTrustReport({ schemaVersion: 5, source: "fixture:weak-transitive", claims: baseClaims, evidence: [], policies: [], events }, { now: new Date("2026-01-02T00:00:00.000Z") });
  assert.equal(report.statusFunctionVersion, "2");
  assert.equal(report.claims.find((claim) => claim.id === "middle")?.status, "verified");
  assert.equal(report.claims.find((claim) => claim.id === "conclusion")?.status, "verified");
  const gap = report.transparencyGaps.find((candidate) => candidate.claimId === "conclusion" && candidate.metadata?.source === "derivation.weak");
  assert.deepEqual(gap?.metadata?.weakEdges, [{ claimId: "conclusion", inputClaimId: "other" }, { claimId: "middle", inputClaimId: "leaf" }]);
});
