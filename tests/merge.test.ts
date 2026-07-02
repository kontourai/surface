import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrustReport,
  mergeBundles,
  mergeBundlesDetailed,
  validateTrustBundle,
} from "../src/index.js";
import type { Claim, TrustBundle, VerificationPolicy } from "../src/index.js";

const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
  subjectType: "repo-governance.repo",
  subjectId: "repo-A",
  facet: "repo-governance.developer-evidence",
  claimType: "release-status",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

const basePolicy: Omit<VerificationPolicy, "id" | "claimType"> = {
  requiredEvidence: [],
  acceptanceCriteria: [],
  reviewAuthority: "owner",
  validityRule: { kind: "manual" },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "medium",
};

function makeBundle(overrides: Partial<TrustBundle>): TrustBundle {
  return {
    schemaVersion: 3,
    source: "producer",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

test("mergeBundles rejects empty input", () => {
  assert.throws(() => mergeBundles([]), /at least one bundle/);
});

test("mergeBundles of a single bundle equals the input (no-op union)", () => {
  const bundle = makeBundle({
    source: "producer-a",
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" }],
    policies: [{ ...basePolicy, id: "policy-release", claimType: "release-status" }],
  });

  const merged = mergeBundles([bundle]);
  assert.equal(merged.source, "producer-a");
  assert.deepEqual(merged.claims, bundle.claims);
  assert.deepEqual(merged.policies, bundle.policies);
  assert.deepEqual(merged.evidence, []);
  assert.deepEqual(merged.events, []);
});

test("mergeBundles always emits the current schemaVersion, even mixing legacy and current input bundles", () => {
  // Hachure facet rename (0.9.0): a merged bundle is a freshly synthesized
  // artifact (like `source`, synthesized as `merged:<a>+<b>`) — it no longer
  // requires every input to share one schemaVersion, and always self-declares
  // the current one (5), regardless of what any input bundle declared.
  const legacy = makeBundle({ schemaVersion: 3 });
  const current = makeBundle({ schemaVersion: 5 });
  const merged = mergeBundles([legacy, current]);
  assert.equal(merged.schemaVersion, 5);

  const allLegacy = mergeBundles([makeBundle({ schemaVersion: 2 }), makeBundle({ schemaVersion: 4 })]);
  assert.equal(allLegacy.schemaVersion, 5);
});

test("mergeBundles unions claims/evidence/policies/events from two producers", () => {
  const a = makeBundle({
    source: "producer-a",
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" }],
    policies: [{ ...basePolicy, id: "policy-release", claimType: "release-status" }],
    evidence: [
      {
        id: "ev-a",
        claimId: "claim-a",
        evidenceType: "attestation",
        method: "attestation",
        sourceRef: "producer-a",
        excerptOrSummary: "attested",
        observedAt: "2026-04-25T00:00:00.000Z",
        collectedBy: "producer-a",
      },
    ],
  });
  const b = makeBundle({
    source: "producer-b",
    claims: [{ ...baseClaim, id: "claim-b", subjectId: "repo-B", fieldOrBehavior: "channel", value: "ga" }],
    events: [
      {
        id: "ev-event-b",
        claimId: "claim-b",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
    ],
  });

  const merged = mergeBundles([a, b]);
  assert.deepEqual(
    merged.claims.map((c) => c.id).sort(),
    ["claim-a", "claim-b"],
  );
  assert.equal(merged.evidence.length, 1);
  assert.equal(merged.events.length, 1);
  assert.equal(merged.policies.length, 1);
  // distinct child sources are combined under a merged: prefix
  assert.equal(merged.source, "merged:producer-a+producer-b");
  // provenance preserved: claim surfaces untouched
  assert.ok(merged.claims.every((c) => c.facet === "repo-governance.developer-evidence"));
});

test("mergeBundles dedupes identical records by id (first occurrence wins)", () => {
  const claim: Claim = { ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" };
  const a = makeBundle({ source: "producer-a", claims: [claim] });
  const b = makeBundle({ source: "producer-b", claims: [{ ...claim }] });

  const merged = mergeBundles([a, b]);
  assert.equal(merged.claims.length, 1);
});

test("mergeBundlesDetailed reports a claim-id collision instead of corrupting", () => {
  const a = makeBundle({
    source: "producer-a",
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" }],
  });
  const b = makeBundle({
    source: "producer-b",
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "withdrawn" }],
  });

  const { bundle, collisions } = mergeBundlesDetailed([a, b]);
  assert.equal(bundle.claims.length, 1);
  // first occurrence kept; later value not silently applied
  assert.equal(bundle.claims[0].value, "ga");
  assert.equal(collisions.length, 1);
  assert.deepEqual(collisions[0], {
    collection: "claims",
    id: "claim-a",
    keptFromBundle: 0,
    droppedFromBundle: 1,
  });
});

test("mergeBundles throws on a claim-id collision with differing content", () => {
  const a = makeBundle({
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" }],
  });
  const b = makeBundle({
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "withdrawn" }],
  });
  assert.throws(() => mergeBundles([a, b]), /conflicting claims share an id/);
});

test("mergeBundles concatenates identityLinks and dedupes claimGroups by id", () => {
  const a = makeBundle({
    identityLinks: [
      {
        subjects: [
          { subjectType: "repo-governance.repo", subjectId: "repo-A" },
          { subjectType: "attested-record.provider", subjectId: "provider-X" },
        ],
      },
    ],
    claimGroups: [{ id: "group-1", title: "Group 1", kind: "claimGroup" }],
  });
  const b = makeBundle({
    identityLinks: [
      {
        subjects: [
          { subjectType: "repo-governance.repo", subjectId: "repo-B" },
          { subjectType: "attested-record.provider", subjectId: "provider-Y" },
        ],
      },
    ],
    claimGroups: [{ id: "group-1", title: "Group 1", kind: "claimGroup" }],
  });

  const merged = mergeBundles([a, b]);
  assert.equal(merged.identityLinks?.length, 2);
  assert.equal(merged.claimGroups?.length, 1);
});

// Keystone proof: two producers assert incompatible values for the SAME
// subject+field under a shared policy. After merge + report, a contradiction
// transparency gap is surfaced (ADR 0002 merge semantics).
test("END-TO-END: merging conflicting producer bundles surfaces a contradiction", () => {
  const producerA = makeBundle({
    source: "producer-a",
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "channel", value: "ga" }],
    policies: [
      {
        ...basePolicy,
        id: "policy-release",
        claimType: "release-status",
        incompatibleValues: [
          { values: ["ga", "withdrawn"], message: "A release cannot be GA and withdrawn." },
        ],
      },
    ],
  });
  const producerB = makeBundle({
    source: "producer-b",
    // same subject (repo-A) and field (channel), incompatible value
    claims: [{ ...baseClaim, id: "claim-b", fieldOrBehavior: "channel", value: "withdrawn" }],
  });

  const merged = validateTrustBundle(mergeBundles([producerA, producerB]));
  const report = buildTrustReport(merged, {
    id: "merge-report",
    now: new Date("2026-04-26T00:00:00.000Z"),
  });

  const contradictions = report.transparencyGaps.filter((gap) => gap.type === "contradiction");
  assert.equal(contradictions.length, 1, "merged bundle should surface one contradiction");
  assert.equal(contradictions[0].policyId, "policy-release");
  assert.match(contradictions[0].message, /GA and withdrawn/);
  assert.equal(
    (contradictions[0].metadata as Record<string, unknown>).source,
    "policy.incompatibleValues",
  );
  // the contradiction names both producers' claims as the conflicting pair
  assert.equal(contradictions[0].claimId, "claim-a");
  assert.equal((contradictions[0].metadata as Record<string, unknown>).peerClaimId, "claim-b");

  // both claims survive the merge — the conflict is surfaced, never resolved by
  // last-write-wins (ADR 0002): both values are still present in the ledger.
  const claimA = report.claims.find((c) => c.id === "claim-a");
  const claimB = report.claims.find((c) => c.id === "claim-b");
  assert.equal(claimA?.value, "ga");
  assert.equal(claimB?.value, "withdrawn");
});

// incompatibleStatuses across merged producers flips derived status to disputed.
test("END-TO-END: merging status-conflicting producers yields disputed claims", () => {
  const producerA = makeBundle({
    source: "producer-a",
    claims: [{ ...baseClaim, id: "claim-a", fieldOrBehavior: "shipped", value: true }],
    policies: [
      {
        ...basePolicy,
        id: "policy-release",
        claimType: "release-status",
        incompatibleStatuses: [{ statuses: ["verified", "rejected"] }],
      },
    ],
    events: [
      {
        id: "ev-a",
        claimId: "claim-a",
        status: "verified",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
    ],
  });
  const producerB = makeBundle({
    source: "producer-b",
    claims: [{ ...baseClaim, id: "claim-b", fieldOrBehavior: "shipped", value: true }],
    events: [
      {
        id: "ev-b",
        claimId: "claim-b",
        status: "rejected",
        actor: "owner",
        method: "attestation",
        evidenceIds: [],
        createdAt: "2026-04-25T01:00:00.000Z",
      },
    ],
  });

  const merged = validateTrustBundle(mergeBundles([producerA, producerB]));
  const report = buildTrustReport(merged, {
    id: "merge-status-report",
    now: new Date("2026-04-26T00:00:00.000Z"),
  });

  const contradictions = report.transparencyGaps.filter((gap) => gap.type === "contradiction");
  assert.equal(contradictions.length, 1);
  assert.equal(
    (contradictions[0].metadata as Record<string, unknown>).source,
    "policy.incompatibleStatuses",
  );
  // claim-b's rejected event makes its derived status terminal-rejected/disputed
  const claimB = report.claims.find((c) => c.id === "claim-b");
  assert.equal(claimB?.status, "rejected");
});
