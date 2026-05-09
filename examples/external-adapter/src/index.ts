import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTrustReport,
  getAdapter,
  registerAdapter,
  validateTrustInput,
  type Adapter,
  type TrustInput,
} from "@kontourai/surface";

interface TicketRecord {
  id: string;
  title: string;
  status: "verified" | "open";
  verifiedAt: string;
  source: string;
}

const ticketAdapter: Adapter<TicketRecord> = {
  name: "external-ticket-system",
  defaultFixture: "fixture.json",
  adapt(record): TrustInput {
    const claimId = `external-ticket.${record.id}.status`;
    const evidenceId = `${claimId}.evidence`;
    return {
      schemaVersion: 2,
      source: record.source,
      claims: [
        {
          id: claimId,
          subjectType: "ticket",
          subjectId: record.id,
          surface: "external-ticket-system.workflow",
          claimType: "ticket-status",
          fieldOrBehavior: "status",
          value: record.status,
          createdAt: record.verifiedAt,
          updatedAt: record.verifiedAt,
          impactLevel: "medium",
          verificationPolicyId: "external-ticket.status-policy",
        },
      ],
      evidence: [
        {
          id: evidenceId,
          claimId,
          evidenceType: "source_excerpt",
          method: "observation",
          sourceRef: record.source,
          sourceLocator: record.id,
          excerptOrSummary: record.title,
          observedAt: record.verifiedAt,
          collectedBy: "external-ticket-system",
        },
      ],
      policies: [
        {
          id: "external-ticket.status-policy",
          claimType: "ticket-status",
          requiredEvidence: ["source_excerpt"],
          requiredMethods: ["observation"],
          requiresCorroboration: false,
          requiredProof: ["ticket export row"],
          reviewAuthority: "ticket system",
          validityRule: { kind: "manual" },
          stalenessTriggers: ["ticket status changes"],
          conflictRules: ["newer ticket status supersedes older status"],
          impactLevel: "medium",
        },
      ],
      events: [
        {
          id: `${claimId}.verified`,
          claimId,
          status: record.status === "verified" ? "verified" : "proposed",
          actor: "external-ticket-system",
          method: "ticket export",
          evidenceIds: [evidenceId],
          createdAt: record.verifiedAt,
          verifiedAt: record.status === "verified" ? record.verifiedAt : undefined,
        },
      ],
    };
  },
};

registerAdapter(ticketAdapter);

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), "../fixture.json");
const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as TicketRecord;
const adapter = getAdapter("external-ticket-system");
if (!adapter) throw new Error("external-ticket-system adapter was not registered");

const report = buildTrustReport(validateTrustInput(adapter.adapt(raw)), {
  id: "external-ticket-system-demo",
  now: new Date("2026-05-01T12:05:00.000Z"),
});

console.log(JSON.stringify({
  source: report.source,
  totalClaims: report.summary.totalClaims,
  verified: report.summary.byStatus.verified,
}));
