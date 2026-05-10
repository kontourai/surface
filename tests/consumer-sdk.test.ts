import test from "node:test";
import assert from "node:assert/strict";
import {
  TrustInputBuilder,
  buildClaim,
  buildEvidence,
  buildEvent,
  buildPolicy,
  buildTrustReport,
} from "../src/index.js";

test("TrustInputBuilder creates validated input and links evidence fluently", () => {
  const claimId = "sdk.ticket-1.status";
  const evidenceId = `${claimId}.evidence`;
  const input = new TrustInputBuilder({ source: "sdk:test" })
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
      requiredProof: ["ticket export row"],
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

test("TrustInputBuilder validates before returning input", () => {
  assert.throws(
    () => new TrustInputBuilder({ source: "sdk:invalid" })
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
