/**
 * Task S3 — parity proof for the waiver validity report projection.
 *
 * Builds a synthetic bundle covering all 6 `WaiverVerdict` outcomes (plus a
 * precedence case), runs `buildTrustReport`, and asserts per claim that
 * `report.waiverValidityByClaimId[claim.id]` deep-equals `deriveWaiverValidity`
 * called directly with that claim's derived status/evidence — the same
 * parity-proof pattern `tests/derive-claim-status.test.ts` uses for
 * `deriveClaimStatus`. Also proves `waiverValidityFunctionVersion` is present
 * on the report and that adding this projection caused zero JSON schema
 * drift (see `tests/schema-parity.test.ts`, re-run separately per the task).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrustReport,
  buildDisputeResolutionEvent,
  deriveWaiverValidity,
  validateTrustBundle,
  waiverValidityFunctionVersion,
  type AuthorityTrace,
  type Claim,
  type Evidence,
  type TrustBundle,
  type VerificationEvent,
} from "../src/index.js";

const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
  subjectType: "repo-governance.repo",
  subjectId: "repo-A",
  facet: "repo-governance.developer-evidence",
  claimType: "software-evidence",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const completeWaiver = {
  reason: "Deferred to next release cycle.",
  approved_by: "actor:eng-lead-1",
  approved_at: "2026-06-01T00:00:00.000Z",
};

const incompleteWaiver = {
  reason: "Deferred to next release cycle.",
  // approved_by intentionally omitted
  approved_at: "2026-06-01T00:00:00.000Z",
};

function verifiedEvent(claimId: string): VerificationEvent {
  return {
    id: `event.${claimId}.verified`,
    claimId,
    status: "verified",
    actor: "ci",
    method: "validation",
    evidenceIds: [],
    createdAt: "2026-06-01T00:05:00.000Z",
  };
}

function assumedEvent(claimId: string): VerificationEvent {
  return {
    id: `event.${claimId}.assumed`,
    claimId,
    status: "assumed",
    actor: "planner",
    method: "planning-assumption",
    evidenceIds: [],
    createdAt: "2026-06-01T00:05:00.000Z",
  };
}

function staleEvent(claimId: string): VerificationEvent {
  return {
    id: `event.${claimId}.stale`,
    claimId,
    status: "stale",
    actor: "monitor",
    method: "freshness-check",
    evidenceIds: [],
    createdAt: "2026-06-01T00:05:00.000Z",
  };
}

const resolverAuthorityTrace: AuthorityTrace = {
  id: "authority.reviewer-1",
  subject: { subjectType: "repo-governance.repo", subjectId: "repo-A" },
  actorRef: "actor:reviewer-1",
  authorityType: "role",
  authorityRef: "role:domain-expert",
  sourceRef: "directory:team",
  observedAt: "2026-01-01T00:00:00.000Z",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T23:59:59.000Z",
};

function revokedResolutionEvent(claimId: string): VerificationEvent {
  return buildDisputeResolutionEvent({
    claimId,
    decidedStatus: "revoked",
    actor: "actor:reviewer-1",
    authorityRef: "role:domain-expert",
    rationale: "Superseded by a newer record.",
    decidedAt: "2026-06-01T00:10:00.000Z",
  });
}

function testOutputEvidence(claimId: string): Evidence {
  return {
    id: `evidence.${claimId}.test-output`,
    claimId,
    evidenceType: "test_output",
    method: "validation",
    sourceRef: `run:${claimId}`,
    excerptOrSummary: `${claimId} CI run`,
    observedAt: "2026-06-01T00:00:00.000Z",
    collectedBy: "ci",
  };
}

// One claim per WaiverVerdict outcome (plus a second stale-or-revoked-waiver
// case reached via an authority-gated dispute-resolution event, to prove the
// "revoked" derived status branch as well as the plain "stale" branch).
const claims: Claim[] = [
  { ...baseClaim, id: "claim.not-applicable", fieldOrBehavior: "verified-no-waiver", value: "OPEN" },
  { ...baseClaim, id: "claim.bare-assumed", fieldOrBehavior: "assumed-no-waiver", value: "OPEN" },
  {
    ...baseClaim,
    id: "claim.complete-waiver",
    fieldOrBehavior: "assumed-complete-waiver",
    value: "OPEN",
    metadata: { waiver: completeWaiver },
  },
  {
    ...baseClaim,
    id: "claim.incomplete-waiver",
    fieldOrBehavior: "assumed-incomplete-waiver",
    value: "OPEN",
    metadata: { waiver: incompleteWaiver },
  },
  {
    ...baseClaim,
    id: "claim.stale-waiver",
    fieldOrBehavior: "stale-with-waiver",
    value: "OPEN",
    metadata: { waiver: completeWaiver },
  },
  {
    ...baseClaim,
    id: "claim.revoked-waiver",
    fieldOrBehavior: "revoked-with-waiver",
    value: "OPEN",
    metadata: { waiver: completeWaiver },
  },
  {
    ...baseClaim,
    id: "claim.command-backed-rejection",
    fieldOrBehavior: "assumed-command-backed",
    value: "OPEN",
    metadata: { waiver: completeWaiver },
  },
];

const events: VerificationEvent[] = [
  verifiedEvent("claim.not-applicable"),
  assumedEvent("claim.bare-assumed"),
  assumedEvent("claim.complete-waiver"),
  assumedEvent("claim.incomplete-waiver"),
  staleEvent("claim.stale-waiver"),
  revokedResolutionEvent("claim.revoked-waiver"),
  assumedEvent("claim.command-backed-rejection"),
];

const evidence: Evidence[] = [testOutputEvidence("claim.command-backed-rejection")];

function buildBundle(): TrustBundle {
  return validateTrustBundle({
    schemaVersion: 3,
    source: "waiver-validity-report-test",
    claims,
    evidence,
    policies: [],
    events,
    authorityTrace: [resolverAuthorityTrace],
  });
}

const now = new Date("2026-06-02T00:00:00.000Z");

const EXPECTED_VERDICT_BY_CLAIM_ID: Record<string, string> = {
  "claim.not-applicable": "not-applicable",
  "claim.bare-assumed": "bare-assumed",
  "claim.complete-waiver": "complete-waiver",
  "claim.incomplete-waiver": "incomplete-waiver",
  "claim.stale-waiver": "stale-or-revoked-waiver",
  "claim.revoked-waiver": "stale-or-revoked-waiver",
  "claim.command-backed-rejection": "command-backed-waiver-rejection",
};

test("waiverValidityFunctionVersion is present on the report and is a non-empty string", () => {
  const report = buildTrustReport(buildBundle(), { now });
  assert.equal(report.waiverValidityFunctionVersion, waiverValidityFunctionVersion);
  assert.equal(typeof report.waiverValidityFunctionVersion, "string");
  assert.ok((report.waiverValidityFunctionVersion as string).length > 0);
});

test("report covers all 6 WaiverVerdict outcomes across the fixture claims", () => {
  const report = buildTrustReport(buildBundle(), { now });
  const seenVerdicts = new Set(
    Object.values(report.waiverValidityByClaimId ?? {}).map((result) => result.verdict),
  );
  assert.deepEqual(
    [...seenVerdicts].sort(),
    [
      "bare-assumed",
      "command-backed-waiver-rejection",
      "complete-waiver",
      "incomplete-waiver",
      "not-applicable",
      "stale-or-revoked-waiver",
    ].sort(),
  );
});

test("each fixture claim derives the expected WaiverVerdict", () => {
  const report = buildTrustReport(buildBundle(), { now });
  for (const [claimId, expectedVerdict] of Object.entries(EXPECTED_VERDICT_BY_CLAIM_ID)) {
    const result = report.waiverValidityByClaimId?.[claimId];
    assert.ok(result, `expected a waiver validity result for ${claimId}`);
    assert.equal(result?.verdict, expectedVerdict, `unexpected verdict for ${claimId}`);
  }
});

test(
  "deriveWaiverValidity matches buildTrustReport.waiverValidityByClaimId for every claim (parity proof)",
  () => {
    const bundle = buildBundle();
    const report = buildTrustReport(bundle, { now });

    assert.equal(report.claims.length, claims.length);
    for (const reportClaim of report.claims) {
      const claimEvidence = bundle.evidence.filter((item) => item.claimId === reportClaim.id);
      const direct = deriveWaiverValidity({
        claim: reportClaim,
        status: reportClaim.status,
        evidence: claimEvidence,
      });
      assert.deepEqual(
        report.waiverValidityByClaimId?.[reportClaim.id],
        direct,
        `waiver validity mismatch for claim ${reportClaim.id}`,
      );
    }
  },
);
