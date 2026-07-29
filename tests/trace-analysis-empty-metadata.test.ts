import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrustAnalyticsProjection,
  buildTrustReport,
  validateTrustBundle,
  type Claim,
  type Evidence,
  type VerificationEvent,
} from "../src/index.js";

/**
 * An attestation gap must be cleared by a value, not merely by a key.
 *
 * The failure this covers: `metadata: { identityProof: "" }` promoted an
 * attestation from `weak` to `valid`, because the check tested only that the
 * key was not undefined. The empty string was the entire payload.
 */

const claim: Claim = {
  id: "claim-1",
  subjectType: "attested-record",
  subjectId: "record-1",
  facet: "field-attested-records.public-data",
  claimType: "public-data-field",
  fieldOrBehavior: "registrationStatus",
  value: "OPEN",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

const event: VerificationEvent = {
  id: "event-1",
  claimId: "claim-1",
  status: "verified",
  evidenceIds: ["evidence-1"],
  actor: "operator",
  method: "attestation",
  createdAt: "2026-04-01T00:00:00.000Z",
  verifiedAt: "2026-04-01T00:00:00.000Z",
};

function attestation(metadata: Record<string, unknown> | undefined): Evidence {
  return {
    id: "evidence-1",
    claimId: "claim-1",
    evidenceType: "human_attestation",
    method: "attestation",
    sourceRef: "admin",
    excerptOrSummary: "Reviewed by operator.",
    observedAt: "2026-04-01T00:00:00.000Z",
    collectedBy: "admin",
    integrityRef: "sha256:aaaa",
    ...(metadata ? { metadata } : {}),
  } as Evidence;
}

/** Gaps reported for the single attestation in a bundle carrying `metadata`. */
function attestationGaps(metadata: Record<string, unknown> | undefined): string[] {
  const input = validateTrustBundle({
    schemaVersion: 4,
    source: "test:trace-analysis-empty-metadata",
    claims: [claim],
    evidence: [attestation(metadata)],
    events: [event],
    policies: [],
  });
  const report = buildTrustReport(input, {
    id: "empty-metadata-report",
    now: new Date("2026-04-02T00:00:00.000Z"),
  });
  const projection = buildTrustAnalyticsProjection(report);
  return [...(projection.attestationValidity.items[0]?.gaps ?? [])].sort();
}

test("baseline: an attestation with no metadata reports identity and authority gaps", () => {
  // Guards the tests below from becoming vacuous if the projection stops
  // emitting these gaps for an unrelated reason.
  const gaps = attestationGaps(undefined);
  assert.ok(gaps.length > 0, `expected gaps for a bare attestation, got ${JSON.stringify(gaps)}`);
  assert.ok(gaps.includes("attestation_identity_unverified"), JSON.stringify(gaps));
});

test("empty-string identityProof does not clear the identity gap", () => {
  assert.deepEqual(
    attestationGaps({ identityProof: "", authoritySource: "" }),
    attestationGaps(undefined),
    "empty strings must be indistinguishable from supplying nothing",
  );
});

test("whitespace-only values do not clear the gaps", () => {
  assert.deepEqual(
    attestationGaps({ identityProof: "   ", authoritySource: "\t\n" }),
    attestationGaps(undefined),
  );
});

test("an empty-string value nested under actor does not clear the gaps either", () => {
  assert.deepEqual(
    attestationGaps({ actor: { identityProof: "", authoritySource: "" } }),
    attestationGaps(undefined),
  );
});

test("a real identityProof value still clears the identity gap", () => {
  const gaps = attestationGaps({ identityProof: "sigstore:bundle-ref" });
  assert.ok(
    !gaps.includes("attestation_identity_unverified"),
    `a non-empty identityProof must clear its gap, got ${JSON.stringify(gaps)}`,
  );
});

test("a real value nested under actor still clears the identity gap", () => {
  const gaps = attestationGaps({ actor: { identityProof: "sigstore:bundle-ref" } });
  assert.ok(!gaps.includes("attestation_identity_unverified"), JSON.stringify(gaps));
});

test("cheap non-string placeholders do not clear the gaps either", () => {
  // Same class as the empty string: an empty object or array carries no
  // identifying information and is just as cheap to supply.
  const baseline = attestationGaps(undefined);
  assert.deepEqual(attestationGaps({ identityProof: {}, authoritySource: {} }), baseline, "empty object");
  assert.deepEqual(attestationGaps({ identityProof: [], authoritySource: [] }), baseline, "empty array");
});

test("a populated object value still clears the identity gap", () => {
  const gaps = attestationGaps({ identityProof: { bundle: "sigstore:ref" } });
  assert.ok(!gaps.includes("attestation_identity_unverified"), JSON.stringify(gaps));
});

test("an inherited identityProof cannot forge presence — own properties only", () => {
  // A bracket read resolves through the prototype chain; an Evidence built
  // programmatically over a crafted prototype must not clear the gap.
  const forged = Object.create({ identityProof: "sigstore:inherited" }) as Record<string, unknown>;
  assert.deepEqual(attestationGaps(forged), attestationGaps(undefined));
});

test("an inherited actor.identityProof cannot forge presence either", () => {
  const forgedActor = Object.create({ identityProof: "sigstore:inherited" }) as Record<string, unknown>;
  assert.deepEqual(attestationGaps({ actor: forgedActor }), attestationGaps(undefined));
});
