import test from "node:test";
import assert from "node:assert/strict";
import {
  TrustBundleBuilder,
  buildClaim,
  buildEvidence,
  buildEvent,
  buildPolicy,
  buildTrustReport,
} from "../src/index.js";

test("TrustBundleBuilder creates validated input and links evidence fluently", () => {
  const claimId = "sdk.ticket-1.status";
  const evidenceId = `${claimId}.evidence`;
  const input = new TrustBundleBuilder({ source: "sdk:test" })
    .addClaim(buildClaim({
      id: claimId,
      subjectType: "ticket",
      subjectId: "ticket-1",
      surface: "tickets.workflow",
      claimType: "ticket-status",
      fieldOrBehavior: "status",
      value: "verified",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      verificationPolicyId: "ticket.status",
    }))
    .addPolicy(buildPolicy({
      id: "ticket.status",
      claimType: "ticket-status",
      requiredEvidence: ["source_excerpt"],
      requiredMethods: ["observation"],
      requiresCorroboration: false,
      acceptanceCriteria: ["ticket export row"],
      reviewAuthority: "ticket system",
      validityRule: { kind: "manual" },
      stalenessTriggers: ["ticket status changes"],
      conflictRules: ["newer status supersedes older status"],
      impactLevel: "medium",
    }))
    .addEvent(buildEvent({
      id: `${claimId}.verified`,
      claimId,
      status: "verified",
      actor: "ticket system",
      method: "ticket export",
      evidenceIds: [evidenceId],
      createdAt: "2026-05-01T00:00:00.000Z",
      verifiedAt: "2026-05-01T00:00:00.000Z",
    }));

  input.addEvidence(buildEvidence({
    id: evidenceId,
    evidenceType: "source_excerpt",
    method: "observation",
    sourceRef: "ticket-export",
    sourceLocator: "ticket-1",
    excerptOrSummary: "ticket-1 is verified",
    observedAt: "2026-05-01T00:00:00.000Z",
    collectedBy: "ticket system",
  })).linkTo(claimId);

  const built = input.build();
  assert.equal(built.schemaVersion, 2);
  assert.equal(built.evidence[0].claimId, claimId);
  assert.equal(buildTrustReport(built).summary.byStatus.verified, 1);
});

test("TrustBundleBuilder preserves legacy entailing default and cited support behavior", () => {
  const claimId = "sdk.ticket-2.status";
  const evidenceId = `${claimId}.evidence`;
  const base = new TrustBundleBuilder({ source: "sdk:support-strength" })
    .addClaim(buildClaim({
      id: claimId,
      subjectType: "ticket",
      subjectId: "ticket-2",
      surface: "tickets.workflow",
      claimType: "ticket-status",
      fieldOrBehavior: "status",
      value: "verified",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      verificationPolicyId: "ticket.status",
    }))
    .addPolicy(buildPolicy({
      id: "ticket.status",
      claimType: "ticket-status",
      requiredEvidence: ["source_excerpt"],
      requiredMethods: ["observation"],
      requiresCorroboration: false,
      acceptanceCriteria: ["ticket export row"],
      reviewAuthority: "ticket system",
      validityRule: { kind: "manual" },
      stalenessTriggers: ["ticket status changes"],
      conflictRules: ["newer status supersedes older status"],
      impactLevel: "medium",
    }))
    .addEvent(buildEvent({
      id: `${claimId}.verified`,
      claimId,
      status: "verified",
      actor: "ticket system",
      method: "ticket export",
      evidenceIds: [evidenceId],
      createdAt: "2026-05-01T00:00:00.000Z",
      verifiedAt: "2026-05-01T00:00:00.000Z",
    }));

  base.addEvidence(buildEvidence({
    id: evidenceId,
    supportStrength: "cited",
    evidenceType: "source_excerpt",
    method: "observation",
    sourceRef: "ticket-export",
    sourceLocator: "ticket-2",
    excerptOrSummary: "ticket-2 is mentioned in the export",
    observedAt: "2026-05-01T00:00:00.000Z",
    collectedBy: "ticket system",
  })).linkTo(claimId);

  const citedReport = buildTrustReport(base.build(), { now: new Date("2026-05-01T00:05:00.000Z") });
  assert.equal(citedReport.summary.byStatus.proposed, 1);
  assert.equal(citedReport.summary.transparencyGapsByType.unsupported_inference, 1);

  const legacy = new TrustBundleBuilder({ source: "sdk:support-strength-legacy" })
    .addClaim(citedReport.claims[0])
    .addPolicy(citedReport.policies[0])
    .addEvent(citedReport.events[0]);

  legacy.addEvidence(buildEvidence({
    ...citedReport.evidence[0],
    supportStrength: undefined,
  })).linkTo(claimId);

  assert.equal(buildTrustReport(legacy.build()).summary.byStatus.verified, 1);
});

test("TrustBundleBuilder validates before returning input", () => {
  assert.throws(
    () => new TrustBundleBuilder({ source: "sdk:invalid" })
      .addClaim({
        id: "missing-date",
        subjectType: "ticket",
        subjectId: "ticket-1",
        surface: "tickets.workflow",
        claimType: "ticket-status",
        fieldOrBehavior: "status",
        value: "verified",
        createdAt: "not-a-date",
        updatedAt: "2026-05-01T00:00:00.000Z",
      })
      .build(),
    /createdAt/,
  );
});

test("TrustBundleBuilder emits a common verified claim bundle in one step", () => {
  const built = new TrustBundleBuilder({ source: "sdk:verified-claim" })
    .addVerifiedClaim({
      claim: {
        id: "claim.release.tests",
        subjectType: "repo",
        subjectId: "surface",
        surface: "release",
        claimType: "release-check",
        fieldOrBehavior: "tests",
        value: "passing",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
        verificationPolicyId: "policy.release.tests",
      },
      evidence: {
        id: "evidence.release.tests",
        evidenceType: "test_output",
        method: "validation",
        sourceRef: "ci:test",
        excerptOrSummary: "Tests passed.",
        observedAt: "2026-05-01T00:01:00.000Z",
        collectedBy: "ci",
      },
      policy: {
        id: "policy.release.tests",
        claimType: "release-check",
        requiredEvidence: ["test_output"],
        requiredMethods: ["validation"],
        reviewAuthority: "ci",
        validityRule: { kind: "duration", durationDays: 1 },
        stalenessTriggers: [],
        conflictRules: [],
        acceptanceCriteria: ["Tests pass"],
        impactLevel: "medium",
      },
      event: {
        id: "event.release.tests",
        actor: "ci",
        method: "validation",
        createdAt: "2026-05-01T00:02:00.000Z",
      },
    })
    .build();

  const report = buildTrustReport(built, { now: new Date("2026-05-01T00:03:00.000Z") });
  assert.equal(report.claims[0].status, "verified");
});
