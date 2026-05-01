import test from "node:test";
import assert from "node:assert/strict";
import { buildIdentityIndex, buildTrustReport, validateTrustInput } from "../src/index.js";
import type { TrustInput } from "../src/index.js";

const baseClaim = {
  id: "claim-base",
  subjectType: "veritas.repo",
  subjectId: "repo-A",
  surface: "veritas.developer-proof",
  claimType: "software-proof",
  fieldOrBehavior: "passes",
  value: true,
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

function makeInput(overrides: Partial<TrustInput>): TrustInput {
  return {
    schemaVersion: 3,
    source: "identity-test",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

test("subjectAliases on a claim group co-referent subjects", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      {
        ...baseClaim,
        subjectAliases: [{ subjectType: "attested-record.provider", subjectId: "provider-A" }],
      },
    ],
  }));

  const index = buildIdentityIndex(input);
  const repoKey = index.canonicalKey({ subjectType: "veritas.repo", subjectId: "repo-A" });
  const providerKey = index.canonicalKey({ subjectType: "attested-record.provider", subjectId: "provider-A" });
  assert.equal(repoKey, providerKey);
});

test("identityLinks merge subjects across claims transitively", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "claim-a", subjectId: "repo-A" },
      { ...baseClaim, id: "claim-b", subjectId: "repo-B" },
      { ...baseClaim, id: "claim-c", subjectType: "attested-record.provider", subjectId: "provider-X" },
    ],
    identityLinks: [
      {
        subjects: [
          { subjectType: "veritas.repo", subjectId: "repo-A" },
          { subjectType: "veritas.repo", subjectId: "repo-B" },
        ],
      },
      {
        subjects: [
          { subjectType: "veritas.repo", subjectId: "repo-B" },
          { subjectType: "attested-record.provider", subjectId: "provider-X" },
        ],
        reason: "Verified handoff",
      },
    ],
  }));

  const index = buildIdentityIndex(input);
  const a = index.canonicalKey({ subjectType: "veritas.repo", subjectId: "repo-A" });
  const b = index.canonicalKey({ subjectType: "veritas.repo", subjectId: "repo-B" });
  const c = index.canonicalKey({ subjectType: "attested-record.provider", subjectId: "provider-X" });
  assert.equal(a, b);
  assert.equal(b, c);

  const group = index.groups.find((entry) => entry.canonicalKey === a);
  assert.ok(group, "transitive group should exist");
  assert.deepEqual(
    new Set(group!.claimIds),
    new Set(["claim-a", "claim-b", "claim-c"]),
  );
  assert.equal(group!.members.length, 3);
});

test("trust report carries identityLinks and computed subjectGroups", () => {
  const input = validateTrustInput(makeInput({
    claims: [
      { ...baseClaim, id: "claim-a", subjectId: "repo-A" },
      { ...baseClaim, id: "claim-b", subjectId: "repo-B" },
    ],
    identityLinks: [
      {
        subjects: [
          { subjectType: "veritas.repo", subjectId: "repo-A" },
          { subjectType: "veritas.repo", subjectId: "repo-B" },
        ],
      },
    ],
  }));

  const report = buildTrustReport(input, { id: "identity-report" });
  assert.equal(report.identityLinks?.length, 1);
  assert.equal(report.subjectGroups.length, 1);
  assert.equal(report.subjectGroups[0].members.length, 2);
  assert.deepEqual(new Set(report.subjectGroups[0].claimIds), new Set(["claim-a", "claim-b"]));
});

test("validator rejects identityLinks with fewer than two subjects", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        identityLinks: [{ subjects: [{ subjectType: "x", subjectId: "y" }] }] as TrustInput["identityLinks"],
      })),
    /at least two/,
  );
});

test("validator rejects subjectAliases with extra fields", () => {
  assert.throws(
    () =>
      validateTrustInput(makeInput({
        claims: [
          {
            ...baseClaim,
            subjectAliases: [{ subjectType: "x", subjectId: "y", surprise: true } as never],
          },
        ],
      })),
    /unsupported field: surprise/,
  );
});
