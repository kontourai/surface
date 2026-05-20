import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustReport, validateTrustInput } from "../src/index.js";

const now = "2026-04-25T00:00:00.000Z";

test("derives collection rollups from validated claims and controls", () => {
  const input = validateTrustInput({
    schemaVersion: 3,
    source: "collection-test",
    claims: [{
      id: "claim.public-surface",
      subjectType: "repo",
      subjectId: "demo",
      surface: "repo.publication",
      claimType: "public-surface-control",
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
      surface: "repo.publication",
      claimType: "public-surface-control",
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
      sourceRef: "veritas policy pack",
      excerptOrSummary: "Policy rule passed.",
      observedAt: now,
      collectedBy: "veritas",
      passing: true,
    }, {
      id: "evidence.docs-readable",
      claimId: "claim.docs-readable",
      evidenceType: "policy_rule",
      method: "validation",
      sourceRef: "veritas policy pack",
      excerptOrSummary: "Policy rule failed.",
      observedAt: now,
      collectedBy: "veritas",
      passing: false,
    }],
    policies: [{
      id: "policy.public-surface",
      claimType: "public-surface-control",
      requiredEvidence: ["policy_rule"],
      requiredMethods: ["validation"],
      requiredProof: ["rule evaluation"],
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
    collections: [{
      id: "framework.public-readiness",
      title: "Public readiness",
      kind: "framework",
      controls: [{
        id: "control.public-surface",
        title: "Public surface policy",
        claimIds: ["claim.public-surface"],
        severity: "high",
        validationStrategy: {
          requiredEvidence: ["policy_rule"],
          requiredMethods: ["validation"],
          requiredProof: ["policy pack evaluation"],
        },
      }, {
        id: "control.docs-readable",
        title: "Documentation readability",
        claimIds: ["claim.docs-readable"],
      }],
    }],
  });

  const report = buildTrustReport(input, { id: "collection-report", now: new Date(now) });

  assert.equal(report.collectionRollups.length, 1);
  assert.equal(report.collectionRollups[0].status, "rejected");
  assert.equal(report.collectionRollups[0].summary.totalControls, 2);
  assert.equal(report.collectionRollups[0].summary.verifiedControls, 1);
  assert.equal(report.collectionRollups[0].summary.disputedControls, 1);
  assert.equal(report.collectionRollups[0].controls[0].validationStrategy?.requiredEvidence?.[0], "policy_rule");
});

test("rejects collection references to unknown claims and controls", () => {
  assert.throws(() => validateTrustInput({
    schemaVersion: 3,
    source: "bad-collection",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    collections: [{
      id: "framework.bad",
      title: "Bad framework",
      kind: "framework",
      controls: [{
        id: "control.missing",
        title: "Missing",
        claimIds: ["claim.missing"],
      }],
      rollupPolicy: {
        mode: "all-required",
        requiredControlIds: ["control.other"],
      },
    }],
  }), /references unknown claim/);
});
