/**
 * Tests for the evidenced-ontology vocabulary extension to IdentityLink
 * and the mapping-based inquiry resolution in resolveInquiry.
 *
 * Covers:
 *  - equivalent-link resolution (direct value forwarding)
 *  - converts-link with factor/offset applied to numeric values
 *  - mapping claim disputed → answer status capped (weakest-link)
 *  - link without mappingClaimId still resolves; resolutionPath shows linkId
 *  - subsumes relation is NOT used for resolution (not co-referent)
 *  - validateTrustBundle accepts the new IdentityLink fields
 *  - validateTrustBundle rejects invalid relation values
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveInquiry, validateTrustBundle } from "../src/index.js";
import type {
  Claim,
  Evidence,
  IdentityLink,
  Inquiry,
  TrustBundle,
  VerificationEvent,
  VerificationPolicy,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBundle(overrides: Partial<TrustBundle> = {}): TrustBundle {
  return {
    schemaVersion: 3,
    source: "test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

const SOFTWARE_POLICY: VerificationPolicy = {
  id: "policy-sw",
  claimType: "software-evidence",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["tests pass"],
  reviewAuthority: "system",
  validityRule: { kind: "duration", durationDays: 30 },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "high",
};

function makeVerifiedClaim(
  id: string,
  subjectType: string,
  subjectId: string,
  fieldOrBehavior: string,
  value: unknown,
): { claim: Claim; evidence: Evidence; event: VerificationEvent } {
  const claim: Claim = {
    id,
    subjectType,
    subjectId,
    facet: "test-surface",
    claimType: "software-evidence",
    fieldOrBehavior,
    value,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const evidence: Evidence = {
    id: `ev-${id}`,
    claimId: id,
    evidenceType: "test_output",
    method: "validation",
    sourceRef: "ci",
    excerptOrSummary: "pass",
    observedAt: "2026-06-01T00:05:00.000Z",
    collectedBy: "ci",
  };
  const event: VerificationEvent = {
    id: `evt-${id}`,
    claimId: id,
    status: "verified",
    actor: "ci",
    method: "test-run",
    evidenceIds: [`ev-${id}`],
    createdAt: "2026-06-01T00:10:00.000Z",
    verifiedAt: "2026-06-01T00:10:00.000Z",
  };
  return { claim, evidence, event };
}

function makeInquiry(
  subjectType: string,
  subjectId: string,
  fieldOrBehavior: string,
): Inquiry {
  return {
    id: "inq-1",
    question: "test",
    target: { subjectType, subjectId, fieldOrBehavior },
    askedBy: "test",
    askedAt: "2026-06-10T00:00:00.000Z",
  };
}

const NOW = new Date("2026-06-10T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Equivalent-link resolution
// ---------------------------------------------------------------------------

test("resolveInquiry via equivalent link: resolves to co-referent claim's value", () => {
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-coverage",
    "repo",
    "acme/api",
    "coveragepercent",
    92,
  );

  const link: IdentityLink = {
    id: "link-equiv-1",
    subjects: [
      { subjectType: "service", subjectId: "acme-api-svc" },
      { subjectType: "repo", subjectId: "acme/api" },
    ],
    relation: "equivalent",
  };

  const bundle = makeBundle({
    claims: [claim],
    evidence: [evidence],
    events: [event],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  // Inquire about the service subject — no claim exists directly, but the link
  // declares it equivalent to the repo subject.
  const inquiry = makeInquiry("service", "acme-api-svc", "coveragepercent");
  const record = resolveInquiry(bundle, inquiry, { now: NOW });

  assert.equal(record.outcome, "matched");
  assert.equal(record.answer?.value, 92);
  assert.equal(record.answer?.status, "verified");
  assert.ok(
    record.resolutionPath.identityLinkIds?.includes("link-equiv-1"),
    "resolutionPath must include the link id",
  );
  assert.ok(
    record.resolutionPath.claimIds.includes("claim-coverage"),
    "resolutionPath must include the source claim id",
  );
});

test("resolveInquiry via equivalent link: default relation (no relation field) is equivalent", () => {
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-tests",
    "repo",
    "acme/api",
    "testspassing",
    true,
  );

  // No relation field — should default to equivalent
  const link: IdentityLink = {
    id: "link-default",
    subjects: [
      { subjectType: "mirror", subjectId: "acme-mirror" },
      { subjectType: "repo", subjectId: "acme/api" },
    ],
  };

  const bundle = makeBundle({
    claims: [claim],
    evidence: [evidence],
    events: [event],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const record = resolveInquiry(bundle, makeInquiry("mirror", "acme-mirror", "testspassing"), { now: NOW });
  assert.equal(record.outcome, "matched");
  assert.equal(record.answer?.value, true);
});

// ---------------------------------------------------------------------------
// Converts-link with factor/offset
// ---------------------------------------------------------------------------

test("resolveInquiry via converts link: applies factor to numeric value", () => {
  // Claim: temperature in Celsius = 100
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-temp-c",
    "sensor",
    "boiler-1",
    "temperature",
    100,
  );

  const link: IdentityLink = {
    id: "link-c-to-f",
    subjects: [
      { subjectType: "sensor-f", subjectId: "boiler-1" }, // Fahrenheit view
      { subjectType: "sensor", subjectId: "boiler-1" },   // Celsius source
    ],
    relation: "converts",
    conversion: { factor: 1.8, offset: 32, note: "Celsius to Fahrenheit" },
  };

  const bundle = makeBundle({
    claims: [claim],
    evidence: [evidence],
    events: [event],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const inquiry = makeInquiry("sensor-f", "boiler-1", "temperature");
  const record = resolveInquiry(bundle, inquiry, { now: NOW });

  assert.equal(record.outcome, "matched");
  // 100°C * 1.8 + 32 = 212°F
  assert.equal(record.answer?.value, 212);
  assert.equal(record.answer?.status, "verified");
});

test("resolveInquiry via converts link: factor only (no offset)", () => {
  // Claim: distance in metres = 1000
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-metres",
    "segment",
    "route-42",
    "distance",
    1000,
  );

  const link: IdentityLink = {
    id: "link-m-to-km",
    subjects: [
      { subjectType: "segment-km", subjectId: "route-42" },
      { subjectType: "segment", subjectId: "route-42" },
    ],
    relation: "converts",
    conversion: { factor: 0.001 }, // m to km
  };

  const bundle = makeBundle({
    claims: [claim],
    evidence: [evidence],
    events: [event],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const record = resolveInquiry(
    bundle,
    makeInquiry("segment-km", "route-42", "distance"),
    { now: NOW },
  );
  assert.equal(record.outcome, "matched");
  assert.equal(record.answer?.value, 1); // 1000 * 0.001 = 1 km
});

test("resolveInquiry via converts link: non-numeric value skips conversion, returns raw", () => {
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-str",
    "repo",
    "acme/api",
    "mode",
    "production",
  );

  const link: IdentityLink = {
    id: "link-str-conv",
    subjects: [
      { subjectType: "service", subjectId: "acme-svc" },
      { subjectType: "repo", subjectId: "acme/api" },
    ],
    relation: "converts",
    conversion: { factor: 2 },
  };

  const bundle = makeBundle({
    claims: [claim],
    evidence: [evidence],
    events: [event],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const record = resolveInquiry(
    bundle,
    makeInquiry("service", "acme-svc", "mode"),
    { now: NOW },
  );
  // Non-numeric → raw value unchanged
  assert.equal(record.outcome, "matched");
  assert.equal(record.answer?.value, "production");
});

// ---------------------------------------------------------------------------
// Mapping claim disputed → answer capped
// ---------------------------------------------------------------------------

test("resolveInquiry: disputed mapping claim caps answer to disputed", () => {
  // The source claim is verified.
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-coverage",
    "repo",
    "acme/api",
    "coveragepercent",
    90,
  );

  // The mapping claim is disputed (blocking bad evidence).
  const mappingClaim: Claim = {
    id: "claim-mapping",
    subjectType: "mapping",
    subjectId: "service-to-repo",
    facet: "test-surface",
    claimType: "software-evidence",
    fieldOrBehavior: "mapsTo",
    value: "acme/api",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    status: "verified",
  };
  const mappingVerifiedEvent: VerificationEvent = {
    id: "evt-mapping",
    claimId: "claim-mapping",
    status: "verified",
    actor: "ci",
    method: "test-run",
    evidenceIds: ["ev-mapping-good"],
    createdAt: "2026-06-01T00:10:00.000Z",
    verifiedAt: "2026-06-01T00:10:00.000Z",
  };
  // Blocking bad evidence opens a dispute on the mapping claim.
  const disputeEvidence: Evidence = {
    id: "ev-mapping-bad",
    claimId: "claim-mapping",
    evidenceType: "human_attestation",
    method: "attestation",
    sourceRef: "manual-review",
    excerptOrSummary: "This mapping is incorrect",
    observedAt: "2026-06-05T00:00:00.000Z",
    collectedBy: "reviewer",
    passing: false,
    blocking: true,
  };
  const mappingGoodEvidence: Evidence = {
    id: "ev-mapping-good",
    claimId: "claim-mapping",
    evidenceType: "test_output",
    method: "validation",
    sourceRef: "ci",
    excerptOrSummary: "pass",
    observedAt: "2026-06-01T00:05:00.000Z",
    collectedBy: "ci",
  };

  const link: IdentityLink = {
    id: "link-with-mapping",
    subjects: [
      { subjectType: "service", subjectId: "acme-svc" },
      { subjectType: "repo", subjectId: "acme/api" },
    ],
    relation: "equivalent",
    mappingClaimId: "claim-mapping",
  };

  const bundle = makeBundle({
    claims: [claim, mappingClaim],
    evidence: [evidence, mappingGoodEvidence, disputeEvidence],
    events: [event, mappingVerifiedEvent],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const inquiry = makeInquiry("service", "acme-svc", "coveragepercent");
  const record = resolveInquiry(bundle, inquiry, { now: NOW });

  assert.equal(record.outcome, "matched");
  // Answer status is capped: source is "verified", mapping is "disputed" → result "disputed"
  assert.equal(record.answer?.status, "disputed");
  // The original claim status in snapshot is still the raw (verified)
  assert.equal(record.inputSnapshot[0].status, "verified");
});

test("resolveInquiry: verified mapping claim does not cap verified answer", () => {
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-coverage",
    "repo",
    "acme/api",
    "coveragepercent",
    85,
  );

  const mappingClaim: Claim = {
    id: "claim-mapping-ok",
    subjectType: "mapping",
    subjectId: "svc-to-repo",
    facet: "test-surface",
    claimType: "software-evidence",
    fieldOrBehavior: "mapsTo",
    value: "ok",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const mappingEvidence: Evidence = {
    id: "ev-mapping-ok",
    claimId: "claim-mapping-ok",
    evidenceType: "test_output",
    method: "validation",
    sourceRef: "ci",
    excerptOrSummary: "pass",
    observedAt: "2026-06-01T00:05:00.000Z",
    collectedBy: "ci",
  };
  const mappingEvent: VerificationEvent = {
    id: "evt-mapping-ok",
    claimId: "claim-mapping-ok",
    status: "verified",
    actor: "ci",
    method: "test-run",
    evidenceIds: ["ev-mapping-ok"],
    createdAt: "2026-06-01T00:10:00.000Z",
    verifiedAt: "2026-06-01T00:10:00.000Z",
  };

  const link: IdentityLink = {
    id: "link-with-verified-mapping",
    subjects: [
      { subjectType: "service", subjectId: "my-svc" },
      { subjectType: "repo", subjectId: "acme/api" },
    ],
    relation: "equivalent",
    mappingClaimId: "claim-mapping-ok",
  };

  const bundle = makeBundle({
    claims: [claim, mappingClaim],
    evidence: [evidence, mappingEvidence],
    events: [event, mappingEvent],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const record = resolveInquiry(
    bundle,
    makeInquiry("service", "my-svc", "coveragepercent"),
    { now: NOW },
  );
  assert.equal(record.outcome, "matched");
  // Both source and mapping are verified → answer is verified
  assert.equal(record.answer?.status, "verified");
});

// ---------------------------------------------------------------------------
// Link without mappingClaimId resolves and shows linkId
// ---------------------------------------------------------------------------

test("resolveInquiry via link without mappingClaimId: resolves, resolutionPath shows link id", () => {
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-tests-2",
    "repo",
    "acme/api",
    "testspassing",
    true,
  );

  const link: IdentityLink = {
    id: "link-no-mapping-claim",
    subjects: [
      { subjectType: "service", subjectId: "acme-svc-2" },
      { subjectType: "repo", subjectId: "acme/api" },
    ],
    relation: "equivalent",
    // No mappingClaimId
  };

  const bundle = makeBundle({
    claims: [claim],
    evidence: [evidence],
    events: [event],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const record = resolveInquiry(
    bundle,
    makeInquiry("service", "acme-svc-2", "testspassing"),
    { now: NOW },
  );

  assert.equal(record.outcome, "matched");
  assert.equal(record.answer?.value, true);
  // resolutionPath.identityLinkIds must include the link id
  assert.ok(
    Array.isArray(record.resolutionPath.identityLinkIds) &&
      record.resolutionPath.identityLinkIds.includes("link-no-mapping-claim"),
    "identityLinkIds should contain the link id",
  );
});

// ---------------------------------------------------------------------------
// Subsumes relation is NOT used for resolution
// ---------------------------------------------------------------------------

test("resolveInquiry: subsumes relation does not resolve inquiry", () => {
  const { claim, evidence, event } = makeVerifiedClaim(
    "claim-sub",
    "repo",
    "acme/api",
    "testspassing",
    true,
  );

  const link: IdentityLink = {
    id: "link-subsumes",
    subjects: [
      { subjectType: "service", subjectId: "parent-svc" },
      { subjectType: "repo", subjectId: "acme/api" },
    ],
    relation: "subsumes",
  };

  const bundle = makeBundle({
    claims: [claim],
    evidence: [evidence],
    events: [event],
    policies: [SOFTWARE_POLICY],
    identityLinks: [link],
  });

  const record = resolveInquiry(
    bundle,
    makeInquiry("service", "parent-svc", "testspassing"),
    { now: NOW },
  );
  // Subsumes should NOT produce a match
  assert.equal(record.outcome, "unsupported");
});

// ---------------------------------------------------------------------------
// validateTrustBundle: accepts new IdentityLink fields
// ---------------------------------------------------------------------------

test("validateTrustBundle: accepts identityLink with id, relation, conversion, mappingClaimId", () => {
  const raw = {
    schemaVersion: 3,
    source: "test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    identityLinks: [
      {
        id: "link-full",
        subjects: [
          { subjectType: "a", subjectId: "1" },
          { subjectType: "b", subjectId: "2" },
        ],
        relation: "converts",
        conversion: { factor: 1.8, offset: 32, note: "C to F" },
        mappingClaimId: "claim-abc",
        reason: "unit mapping",
        attestedBy: "admin",
      },
    ],
  };
  // Should not throw
  const bundle = validateTrustBundle(raw);
  assert.equal(bundle.identityLinks?.length, 1);
  assert.equal(bundle.identityLinks?.[0]?.id, "link-full");
  assert.equal(bundle.identityLinks?.[0]?.relation, "converts");
});

test("validateTrustBundle: accepts identityLink with relation=equivalent", () => {
  const raw = {
    schemaVersion: 3,
    source: "test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    identityLinks: [
      {
        subjects: [
          { subjectType: "a", subjectId: "1" },
          { subjectType: "b", subjectId: "2" },
        ],
        relation: "equivalent",
      },
    ],
  };
  assert.doesNotThrow(() => validateTrustBundle(raw));
});

test("validateTrustBundle: rejects invalid relation value", () => {
  const raw = {
    schemaVersion: 3,
    source: "test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    identityLinks: [
      {
        subjects: [
          { subjectType: "a", subjectId: "1" },
          { subjectType: "b", subjectId: "2" },
        ],
        relation: "invalid-relation",
      },
    ],
  };
  assert.throws(() => validateTrustBundle(raw), /relation/);
});

test("validateTrustBundle: rejects conversion.factor that is not a number", () => {
  const raw = {
    schemaVersion: 3,
    source: "test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    identityLinks: [
      {
        subjects: [
          { subjectType: "a", subjectId: "1" },
          { subjectType: "b", subjectId: "2" },
        ],
        relation: "converts",
        conversion: { factor: "not-a-number" },
      },
    ],
  };
  assert.throws(() => validateTrustBundle(raw), /factor must be a number/);
});
