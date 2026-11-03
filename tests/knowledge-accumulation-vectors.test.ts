/**
 * Premise checks for the knowledge-accumulation design vectors
 * (docs/decisions/knowledge-accumulation.md, issue #204).
 *
 * No current-state projection exists yet, so nothing here executes a query's
 * `expect` block. What this suite does prove is that the vectors are built on
 * true premises about today's code, so a future implementation is checked
 * against cases whose inputs mean what the record says they mean:
 *
 * - every bundle validates once the proposed claim fields are removed;
 * - a claim id that appears in several bundles has identical content in each
 *   (the record's verbatim-carry rule; merge would throw otherwise);
 * - every supersession edge targets a claim carried in the same bundle;
 * - the statuses each case states as its premise are the statuses today's
 *   status fold derives (before any supersession pass);
 * - every claim id an expectation names is present in that query's inputs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrustReport, mergeBundles, validateTrustBundle } from "../src/index.js";
import type { TrustBundle } from "../src/index.js";

interface SupersessionEdge { claimId: string; kind: string; reason: string }
interface VectorClaim { id: string; supersedes?: SupersessionEdge[]; validTime?: { from?: string; until?: string }; [key: string]: unknown }
interface VectorBundle extends Omit<TrustBundle, "claims"> { claims: VectorClaim[] }
interface VectorExpect {
  outcome: "current" | "contested" | "none" | "invalid";
  supportingClaimIds?: string[];
  candidateClaimIds?: string[];
  excluded?: Record<string, string>;
  statusByClaimId?: Record<string, string>;
  supersessions: Array<{ claimId: string; byClaimId: string; kind: string; state: string }>;
  gapCodes: string[];
}
interface VectorQuery { id: string; bundles: string[]; slot: Record<string, string>; validAt?: string; knownAt?: string; expect?: VectorExpect; sameAs?: string }
interface VectorCase { id: string; now: string; bundles: Record<string, VectorBundle>; observedAtByBundle: Record<string, string>; premise: { bundles: string[]; statusByClaimId: Record<string, string> }; queries: VectorQuery[] }
interface Vectors { proposedClaimFields: string[]; cases: VectorCase[] }

const vectors = JSON.parse(await readFile("tests/fixtures/knowledge-accumulation/vectors.json", "utf8")) as Vectors;
const expectedFails = JSON.parse(await readFile("tests/knowledge-accumulation-expected-fails.json", "utf8")) as { reason: string; cases: string[] };

const OUTCOMES = new Set(["current", "contested", "none", "invalid"]);
const EDGE_KINDS = new Set(["correction", "succession"]);
const EDGE_STATES = new Set(["accepted", "pending", "inert", "withdrawn"]);

function withoutProposedFields(bundle: VectorBundle): TrustBundle {
  const copy = structuredClone(bundle) as VectorBundle;
  for (const claim of copy.claims) {
    for (const field of vectors.proposedClaimFields) delete claim[field];
  }
  return copy as unknown as TrustBundle;
}

test("vectors name exactly the two proposed claim fields", () => {
  assert.deepEqual([...vectors.proposedClaimFields].sort(), ["supersedes", "validTime"]);
  assert.ok(vectors.cases.length >= 9, "the vector set must not silently shrink");
});

test("every unimplemented projection query is explicitly listed", () => {
  const ids = vectors.cases.flatMap((entry) => entry.queries.map((query) => `${entry.id}/${query.id}`));
  assert.equal(new Set(ids).size, ids.length, "query ids must be unique");
  assert.equal(new Set(expectedFails.cases).size, expectedFails.cases.length, "expected failures must be unique");
  assert.deepEqual([...expectedFails.cases].sort(), ids.sort());
  assert.ok(expectedFails.reason);
});

for (const vectorCase of vectors.cases) {
  for (const query of vectorCase.queries) {
    test.todo(`projection expected failure: ${vectorCase.id}/${query.id} — ${expectedFails.reason}`);
  }
  test(`${vectorCase.id}: each bundle has a recorded knowledge time`, () => {
    assert.deepEqual(Object.keys(vectorCase.observedAtByBundle).sort(), Object.keys(vectorCase.bundles).sort());
    for (const value of Object.values(vectorCase.observedAtByBundle)) assert.ok(Number.isFinite(Date.parse(value)));
  });
  test(`${vectorCase.id}: bundles validate without the proposed fields`, () => {
    for (const [key, bundle] of Object.entries(vectorCase.bundles)) {
      assert.doesNotThrow(() => validateTrustBundle(withoutProposedFields(bundle)), `bundle ${key}`);
    }
  });

  test(`${vectorCase.id}: carried claims are verbatim and edges target carried claims`, () => {
    const firstSeen = new Map<string, string>();
    for (const [key, bundle] of Object.entries(vectorCase.bundles)) {
      const idsInBundle = new Set(bundle.claims.map((claim) => claim.id));
      for (const claim of bundle.claims) {
        const content = JSON.stringify(claim);
        const prior = firstSeen.get(claim.id);
        if (prior === undefined) firstSeen.set(claim.id, content);
        else assert.equal(content, prior, `claim ${claim.id} in bundle ${key} differs from an earlier copy`);
        for (const edge of claim.supersedes ?? []) {
          assert.ok(idsInBundle.has(edge.claimId), `edge ${claim.id} -> ${edge.claimId} in bundle ${key} targets a claim the bundle does not carry`);
          assert.ok(EDGE_KINDS.has(edge.kind), `edge kind ${edge.kind}`);
          assert.ok(edge.reason.trim().length > 0, `edge ${claim.id} -> ${edge.claimId} has no reason`);
        }
      }
    }
  });

  test(`${vectorCase.id}: premise statuses are what today's fold derives`, () => {
    const merged = mergeBundles(vectorCase.premise.bundles.map((key) => withoutProposedFields(vectorCase.bundles[key])));
    const report = buildTrustReport(merged, { now: new Date(vectorCase.now) });
    const derived = Object.fromEntries(report.claims.map((claim) => [claim.id, claim.status]));
    for (const [claimId, status] of Object.entries(vectorCase.premise.statusByClaimId)) {
      assert.equal(derived[claimId], status, `premise status of ${claimId}`);
    }
  });

  test(`${vectorCase.id}: queries reference known bundles and claims`, () => {
    const queryIds = new Set(vectorCase.queries.map((query) => query.id));
    for (const query of vectorCase.queries) {
      for (const key of query.bundles) assert.ok(vectorCase.bundles[key], `query ${query.id} names unknown bundle ${key}`);
      if (query.sameAs !== undefined) {
        assert.ok(queryIds.has(query.sameAs) && query.expect === undefined, `query ${query.id} sameAs`);
        continue;
      }
      const expect = query.expect;
      assert.ok(expect && OUTCOMES.has(expect.outcome), `query ${query.id} outcome`);
      const present = new Set(query.bundles.flatMap((key) => vectorCase.bundles[key].claims.map((claim) => claim.id)));
      const named = [
        ...(expect.supportingClaimIds ?? []),
        ...(expect.candidateClaimIds ?? []),
        ...Object.keys(expect.excluded ?? {}),
        ...Object.keys(expect.statusByClaimId ?? {}),
        ...expect.supersessions.flatMap((edge) => [edge.claimId, edge.byClaimId]),
      ];
      for (const claimId of named) assert.ok(present.has(claimId), `query ${query.id} names ${claimId}, absent from its inputs`);
      for (const edge of expect.supersessions) assert.ok(EDGE_STATES.has(edge.state), `query ${query.id} edge state ${edge.state}`);
      assert.equal(expect.outcome === "contested", (expect.candidateClaimIds?.length ?? 0) >= 2, `query ${query.id}: contested iff two or more candidates`);
      assert.equal(expect.outcome === "contested", expect.gapCodes.includes("contested-value"), `query ${query.id}: contested iff contested-value gap`);
    }
  });
}
