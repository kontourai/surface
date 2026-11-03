import test from "node:test";
import assert from "node:assert/strict";
import { buildIdentityIndex, buildTrustReport, validateTrustBundle } from "../src/index.js";
import type { TrustBundle } from "../src/index.js";

const baseClaim = {
  id: "claim-base",
  subjectType: "repo-governance.repo",
  subjectId: "repo-A",
  facet: "repo-governance.developer-evidence",
  claimType: "software-evidence",
  fieldOrBehavior: "passes",
  value: true,
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
};

function makeInput(overrides: Partial<TrustBundle>): TrustBundle {
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
  const input = validateTrustBundle(makeInput({
    claims: [
      {
        ...baseClaim,
        subjectAliases: [{ subjectType: "attested-record.provider", subjectId: "provider-A" }],
      },
    ],
  }));

  const index = buildIdentityIndex(input);
  const repoKey = index.canonicalKey({ subjectType: "repo-governance.repo", subjectId: "repo-A" });
  const providerKey = index.canonicalKey({ subjectType: "attested-record.provider", subjectId: "provider-A" });
  assert.equal(repoKey, providerKey);
});

test("identityLinks merge subjects across claims transitively", () => {
  const input = validateTrustBundle(makeInput({
    claims: [
      { ...baseClaim, id: "claim-a", subjectId: "repo-A" },
      { ...baseClaim, id: "claim-b", subjectId: "repo-B" },
      { ...baseClaim, id: "claim-c", subjectType: "attested-record.provider", subjectId: "provider-X" },
    ],
    identityLinks: [
      {
        subjects: [
          { subjectType: "repo-governance.repo", subjectId: "repo-A" },
          { subjectType: "repo-governance.repo", subjectId: "repo-B" },
        ],
      },
      {
        subjects: [
          { subjectType: "repo-governance.repo", subjectId: "repo-B" },
          { subjectType: "attested-record.provider", subjectId: "provider-X" },
        ],
        reason: "Verified handoff",
      },
    ],
  }));

  const index = buildIdentityIndex(input);
  const a = index.canonicalKey({ subjectType: "repo-governance.repo", subjectId: "repo-A" });
  const b = index.canonicalKey({ subjectType: "repo-governance.repo", subjectId: "repo-B" });
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

test("only equivalent identity links join subject groups", () => {
  const a = { subjectType: "org", subjectId: "a" };
  const b = { subjectType: "org", subjectId: "b" };
  for (const relation of ["equivalent", "subsumes", "converts"] as const) {
    const input = validateTrustBundle(makeInput({ identityLinks: [{ relation, subjects: [a, b] }] }));
    const index = buildIdentityIndex(input);
    assert.equal(index.canonicalKey(a) === index.canonicalKey(b), relation === "equivalent", relation);
    assert.equal(index.groups.length, relation === "equivalent" ? 1 : 2, relation);
    assert.equal(buildTrustReport(input).identityLinks?.[0]?.relation, relation);
  }
});

test("trust report carries identityLinks and computed subjectGroups", () => {
  const input = validateTrustBundle(makeInput({
    claims: [
      { ...baseClaim, id: "claim-a", subjectId: "repo-A" },
      { ...baseClaim, id: "claim-b", subjectId: "repo-B" },
    ],
    identityLinks: [
      {
        subjects: [
          { subjectType: "repo-governance.repo", subjectId: "repo-A" },
          { subjectType: "repo-governance.repo", subjectId: "repo-B" },
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
      validateTrustBundle(makeInput({
        identityLinks: [{ subjects: [{ subjectType: "x", subjectId: "y" }] }] as TrustBundle["identityLinks"],
      })),
    /at least two/,
  );
});

test("validator rejects subjectAliases with extra fields", () => {
  assert.throws(
    () =>
      validateTrustBundle(makeInput({
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
