import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustReport, validateTrustBundle } from "../src/index.js";

const now = "2026-04-25T00:00:00.000Z";

test("derives claimGroup rollups from validated claims and requirements", () => {
  const input = validateTrustBundle({
    schemaVersion: 3,
    source: "claimGroup-test",
    claims: [{
      id: "claim.public-surface",
      subjectType: "repo",
      subjectId: "demo",
      facet: "repo.publication",
      claimType: "public-surface-requirement",
      fieldOrBehavior: "public files contain no private references",
      value: true,
      createdAt: now,
      updatedAt: now,
      impactLevel: "high",
      verificationPolicyId: "policy.public-surface",
    }, {
      id: "claim.docs-readable",
      subjectType: "repo",
      subjectId: "demo",
      facet: "repo.publication",
      claimType: "public-surface-requirement",
      fieldOrBehavior: "docs are readable",
      value: true,
      createdAt: now,
      updatedAt: now,
      impactLevel: "medium",
      verificationPolicyId: "policy.public-surface",
    }],
    evidence: [{
      id: "evidence.public-surface",
      claimId: "claim.public-surface",
      evidenceType: "policy_rule",
      method: "validation",
      sourceRef: "veritas repo standards",
      excerptOrSummary: "Policy rule passed.",
      observedAt: now,
      collectedBy: "veritas",
      passing: true,
    }, {
      id: "evidence.docs-readable",
      claimId: "claim.docs-readable",
      evidenceType: "policy_rule",
      method: "validation",
      sourceRef: "veritas repo standards",
      excerptOrSummary: "Policy rule failed.",
      observedAt: now,
      collectedBy: "veritas",
      passing: false,
    }],
    policies: [{
      id: "policy.public-surface",
      claimType: "public-surface-requirement",
      requiredEvidence: ["policy_rule"],
      requiredMethods: ["validation"],
      acceptanceCriteria: ["rule evaluation"],
      reviewAuthority: "system",
      validityRule: { kind: "manual" },
      stalenessTriggers: [],
      conflictRules: [],
      impactLevel: "high",
    }],
    events: [{
      id: "event.public-surface",
      claimId: "claim.public-surface",
      status: "verified",
      actor: "veritas",
      method: "policy evaluation",
      evidenceIds: ["evidence.public-surface"],
      createdAt: now,
    }, {
      id: "event.docs-readable",
      claimId: "claim.docs-readable",
      status: "rejected",
      actor: "veritas",
      method: "policy evaluation",
      evidenceIds: ["evidence.docs-readable"],
      createdAt: now,
    }],
    claimGroups: [{
      id: "framework.public-readiness",
      title: "Public readiness",
      kind: "framework",
      requirements: [{
        id: "requirement.public-surface",
        title: "Public surface policy",
        claimIds: ["claim.public-surface"],
        severity: "high",
        validationStrategy: {
          requiredEvidence: ["policy_rule"],
          requiredMethods: ["validation"],
          acceptanceCriteria: ["repo standards evaluation"],
        },
      }, {
        id: "requirement.docs-readable",
        title: "Documentation readability",
        claimIds: ["claim.docs-readable"],
      }],
    }],
  });

  const report = buildTrustReport(input, { id: "claimGroup-report", now: new Date(now) });

  assert.equal(report.claimGroupRollups.length, 1);
  assert.equal(report.claimGroupRollups[0].status, "rejected");
  assert.equal(report.claimGroupRollups[0].summary.totalRequirements, 2);
  assert.equal(report.claimGroupRollups[0].summary.verifiedRequirements, 1);
  assert.equal(report.claimGroupRollups[0].summary.disputedRequirements, 1);
  assert.equal(report.claimGroupRollups[0].requirements[0].validationStrategy?.requiredEvidence?.[0], "policy_rule");
});

test("rejects claimGroup references to unknown claims and requirements", () => {
  assert.throws(() => validateTrustBundle({
    schemaVersion: 3,
    source: "bad-claimGroup",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    claimGroups: [{
      id: "framework.bad",
      title: "Bad framework",
      kind: "framework",
      requirements: [{
        id: "requirement.missing",
        title: "Missing",
        claimIds: ["claim.missing"],
      }],
      rollupPolicy: {
        mode: "all-required",
        requiredRequirementIds: ["requirement.other"],
      },
    }],
  }), /references unknown claim/);
});
