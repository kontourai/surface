import test from "node:test";
import assert from "node:assert/strict";
import { claimTypeFamily, resolvePolicyForClaim } from "../src/index.js";
import type { Claim, VerificationPolicy } from "../src/index.js";

const baseClaim: Claim = {
  id: "claim-1",
  subjectType: "veritas.repo",
  subjectId: "repo-A",
  surface: "veritas.developer-proof",
  claimType: "software-proof",
  fieldOrBehavior: "passes",
  value: true,
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

const basePolicy: Omit<VerificationPolicy, "id" | "claimType"> = {
  requiredEvidence: ["test_output"],
  requiredProof: [],
  reviewAuthority: "owner",
  validityRule: { kind: "manual" },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "medium",
};

test("exact claimType match wins over parent policy", () => {
  const policies: VerificationPolicy[] = [
    { ...basePolicy, id: "policy-vehicle", claimType: "vehicle" },
    { ...basePolicy, id: "policy-truck", claimType: "truck", parentType: "vehicle" },
  ];
  const claim = { ...baseClaim, claimType: "truck" };
  const resolved = resolvePolicyForClaim(claim, policies);
  assert.equal(resolved?.id, "policy-truck");
});

test("parent policy applies when no exact match", () => {
  const policies: VerificationPolicy[] = [
    { ...basePolicy, id: "policy-vehicle", claimType: "vehicle" },
    { ...basePolicy, id: "policy-truck", claimType: "truck", parentType: "vehicle" },
  ];
  // claim of unknown type that walks via the truck → vehicle chain
  const claim = { ...baseClaim, claimType: "silverado" };
  // No policy declares silverado → ?, so resolution falls through to undefined.
  assert.equal(resolvePolicyForClaim(claim, policies), undefined);
});

test("multi-step parent walk resolves to most-specific available", () => {
  const policies: VerificationPolicy[] = [
    { ...basePolicy, id: "policy-thing", claimType: "thing" },
    { ...basePolicy, id: "policy-vehicle", claimType: "vehicle", parentType: "thing" },
    { ...basePolicy, id: "policy-truck", claimType: "truck", parentType: "vehicle" },
  ];
  // No silverado policy, but a truck policy that declares silverado IS NOT linked.
  // Add a policy that declares silverado → truck so the chain has a starting edge.
  policies.push({ ...basePolicy, id: "policy-silverado-link", claimType: "silverado", parentType: "truck" });
  const claim = { ...baseClaim, claimType: "silverado" };
  const resolved = resolvePolicyForClaim(claim, policies);
  // exact silverado policy exists (the linker), so it wins
  assert.equal(resolved?.id, "policy-silverado-link");
});

test("verificationPolicyId on claim overrides type-based resolution", () => {
  const policies: VerificationPolicy[] = [
    { ...basePolicy, id: "policy-truck", claimType: "truck" },
    { ...basePolicy, id: "policy-special", claimType: "anything" },
  ];
  const claim = { ...baseClaim, claimType: "truck", verificationPolicyId: "policy-special" };
  assert.equal(resolvePolicyForClaim(claim, policies)?.id, "policy-special");
});

test("cycle in parentType chain does not loop forever", () => {
  const policies: VerificationPolicy[] = [
    { ...basePolicy, id: "policy-a", claimType: "a", parentType: "b" },
    { ...basePolicy, id: "policy-b", claimType: "b", parentType: "a" },
  ];
  const claim = { ...baseClaim, claimType: "a" };
  // most-specific match still wins (policy-a)
  assert.equal(resolvePolicyForClaim(claim, policies)?.id, "policy-a");
  // family walk terminates
  const family = claimTypeFamily("a", policies);
  assert.deepEqual(family, ["a", "b"]);
});
