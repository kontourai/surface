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
