/** Execute the accumulation vectors against admission and the projection. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildIdentityIndex, buildTrustReport, canonicalClaimKey, mergeBundles, parseTimestamp, validateTrustBundle } from "../src/index.js";
import type { TrustBundle } from "../src/index.js";
import { projectAccumulation } from "../src/accumulation.js";
import { accumulationDigest, type AccumulationBundle, type AccumulationAuthority, type BundleObservation } from "../src/accumulation-admission.js";

interface SupersessionEdge { claimId: string; kind: string; reason: string }
interface VectorClaim { id: string; supersedes?: SupersessionEdge[]; validTime?: { from?: string; until?: string }; [key: string]: unknown }
interface VectorBundle extends Omit<TrustBundle, "claims"> { claims: VectorClaim[] }
interface VectorExpect {
  outcome: "current" | "contested" | "none" | "invalid";
  value?: unknown;
  status?: string;
  reason?: string;
  supportingClaimIds?: string[];
  candidateClaimIds?: string[];
  excluded?: Record<string, string>;
  statusByClaimId?: Record<string, string>;
  supersessions: Array<{ claimId: string; byClaimId: string; kind: string; state: string }>;
  gapCodes: string[];
}
interface VectorSlot { subjectType: string; subjectId: string; fieldOrBehavior: string; claimType: string; qualifiers?: Record<string, string> }
interface VectorQuery { id: string; bundles: string[]; slot: VectorSlot; validAt?: string; knownAt?: string; expect?: VectorExpect; sameAs?: string }
interface VectorCase { id: string; now: string; bundles: Record<string, VectorBundle>; observedAtByBundle: Record<string, string>; fixtureAuthority: { authenticatedOwnerByClaimId: Record<string, string>; admittedEventIds: string[]; admittedIdentityLinkIds?: string[] }; premise: { bundles: string[]; statusByClaimId: Record<string, string> }; queries: VectorQuery[] }
interface Vectors { proposedClaimFields: string[]; cases: VectorCase[] }

const vectors = JSON.parse(await readFile("tests/fixtures/knowledge-accumulation/vectors.json", "utf8")) as Vectors;
const expectedFails = JSON.parse(await readFile("tests/knowledge-accumulation-expected-fails.json", "utf8")) as { reason: string; cases: string[] };

const OUTCOMES = new Set(["current", "contested", "none", "invalid"]);
const EDGE_KINDS = new Set(["correction", "succession"]);
const EDGE_STATES = new Set(["accepted", "pending", "inert", "withdrawn"]);
const STATUSES = new Set(["unknown", "proposed", "assumed", "verified", "stale", "disputed"]);

test("duplicate delivery reaches the real merge and deduplicates events", () => {
  const c = vectors.cases.find((entry) => entry.id === "duplicate-delivery-and-agreement")!;
  const merged = mergeBundles(["b1", "b1", "b2"].map((key) => withoutProposedFields(c.bundles[key])));
  assert.equal(merged.events.length, c.bundles.b1.events.length + c.bundles.b2.events.length);
  assert.equal(new Set(merged.events.map((event) => event.id)).size, merged.events.length);
});

test("subsumes fixture reaches the identity index without joining its subjects", () => {
  const c = vectors.cases.find((entry) => entry.id === "identity-merge-split")!;
  const bundle = withoutProposedFields(c.bundles.b5);
  assert.equal(bundle.identityLinks?.[0]?.relation, "subsumes");
  const index = buildIdentityIndex(bundle);
  const [a, b] = bundle.identityLinks![0].subjects;
  assert.notEqual(index.canonicalKey(a), index.canonicalKey(b));
});

test("lineage fixture carries the stated source and method", () => {
  const c = vectors.cases.find((entry) => entry.id === "derivation-lineage")!;
  const claim = c.bundles.b1.claims.find((item) => item.id === "producer-a.acme.hq.derived")!;
  assert.deepEqual(claim.derivedFrom, ["producer-a.acme.hq.1"]);
  assert.deepEqual(claim.derivationEdges, [{ inputClaimId: "producer-a.acme.hq.1", method: "copy", role: "source" }]);
  const report = buildTrustReport(withoutProposedFields(c.bundles.b1), { now: new Date(c.now) });
  assert.equal(report.claims.find((item) => item.id === claim.id)?.status, "proposed", "weaker input caps the derived claim");
});

test("untrusted terminal-event fixture demonstrates the current fold gap", () => {
  const c = vectors.cases.find((entry) => entry.id === "untrusted-terminal-event")!;
  const event = c.bundles.b3.events[0];
  assert.equal(event.actor, "producer-a");
  assert.equal(event.status, "rejected");
  assert.notEqual(event.resolvesDispute, true);
  assert.ok(!c.fixtureAuthority.admittedEventIds.includes(event.id));
  assert.equal(c.fixtureAuthority.authenticatedOwnerByClaimId[event.claimId], "producer-b");
  const merged = mergeBundles(["b1", "b2", "b3"].map((key) => withoutProposedFields(c.bundles[key])));
  const report = buildTrustReport(merged, { now: new Date(c.now) });
  assert.equal(report.claims.find((item) => item.id === "producer-b.acme.hq.1")?.status, "rejected");
});

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

test("expected-fail entries refer to known projection queries", () => {
  const ids = vectors.cases.flatMap((entry) => entry.queries.map((query) => `${entry.id}/${query.id}`));
  assert.equal(new Set(ids).size, ids.length, "query ids must be unique");
  assert.equal(new Set(expectedFails.cases).size, expectedFails.cases.length, "expected failures must be unique");
  assert.ok(expectedFails.cases.every((id) => ids.includes(id)));
  assert.ok(expectedFails.reason);
});

for (const vectorCase of vectors.cases) {
  for (const query of vectorCase.queries) {
    test(`projection: ${vectorCase.id}/${query.id}`, () => {
      const run = (q: VectorQuery) => {
        const observations: BundleObservation[] = q.bundles.map((key) => {
          const bundle = vectorCase.bundles[key] as unknown as AccumulationBundle;
          return { id: key, observedAt: vectorCase.observedAtByBundle[key], contentDigest: accumulationDigest(bundle), authenticatedPublisher: bundle.producerId!, bundle };
        });
        const eventDecisions = Object.values(vectorCase.bundles).flatMap((bundle) => bundle.events.map((event) => ({ eventId: event.id, eventDigest: accumulationDigest(event), publisher: bundle.producerId!, admitted: vectorCase.fixtureAuthority.admittedEventIds.includes(event.id) })));
        const identityDecisions = Object.values(vectorCase.bundles).flatMap(bundle => (bundle.identityLinks ?? []).filter(link => link.id && link.mappingClaimId && vectorCase.fixtureAuthority.admittedIdentityLinkIds?.includes(link.id)).map(link => ({ linkDigest: accumulationDigest(link), publisher: bundle.producerId!, mappingClaimId: link.mappingClaimId!, admitted: true })));
        const policy = { version: "1" as const, ownerByClaimId: vectorCase.fixtureAuthority.authenticatedOwnerByClaimId, eventDecisions, identityDecisions };
        const authority: AccumulationAuthority = { ...policy, integrityRef: accumulationDigest(policy) };
        return projectAccumulation(observations, authority, { slot: q.slot, now: vectorCase.now, knownAt: q.knownAt, validAt: q.validAt, valuePolicy: "single-json-v1" });
      };
      const result = run(query);
      const comparison = () => {
        if (query.sameAs) {
          assert.deepEqual(result, run(vectorCase.queries.find((q) => q.id === query.sameAs)!));
        } else {
          for (const [key, value] of Object.entries(query.expect!)) {
            const actual = (result as unknown as Record<string, unknown>)[key];
            if (["statusByClaimId", "dispositionByClaimId", "excluded"].includes(key)) {
              assert.deepEqual({ ...(actual as Record<string, string>) }, value, key);
            } else assert.deepEqual(actual, value, key);
          }
        }
      };
      if (expectedFails.cases.includes(`${vectorCase.id}/${query.id}`)) {
        assert.throws(comparison, { code: "ERR_ASSERTION" }, "unexpected pass in expected-fail list");
      } else comparison();
    });
  }
  test(`${vectorCase.id}: each bundle has a recorded knowledge time`, () => {
    assert.deepEqual(Object.keys(vectorCase.observedAtByBundle).sort(), Object.keys(vectorCase.bundles).sort());
    for (const value of Object.values(vectorCase.observedAtByBundle)) assert.ok(parseTimestamp(value));
  });
  test(`${vectorCase.id}: fixture authority inputs reference carried records`, () => {
    const claims = new Set(Object.values(vectorCase.bundles).flatMap((bundle) => bundle.claims.map((claim) => claim.id)));
    const events = new Set(Object.values(vectorCase.bundles).flatMap((bundle) => bundle.events.map((event) => event.id)));
    assert.deepEqual(Object.keys(vectorCase.fixtureAuthority.authenticatedOwnerByClaimId).sort(), [...claims].sort());
    for (const owner of Object.values(vectorCase.fixtureAuthority.authenticatedOwnerByClaimId)) assert.ok(owner);
    for (const id of vectorCase.fixtureAuthority.admittedEventIds) assert.ok(events.has(id), `admitted event ${id} missing`);
    const links = new Set(Object.values(vectorCase.bundles).flatMap(bundle => (bundle.identityLinks ?? []).flatMap(link => link.id ? [link.id] : [])));
    for (const id of vectorCase.fixtureAuthority.admittedIdentityLinkIds ?? []) assert.ok(links.has(id), `admitted identity link ${id} missing`);
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
        if (claim.validTime) {
          const { from, until } = claim.validTime;
          if (from !== undefined) assert.ok(parseTimestamp(from), `invalid validTime.from for ${claim.id}`);
          if (until !== undefined) assert.ok(parseTimestamp(until), `invalid validTime.until for ${claim.id}`);
          if (from !== undefined && until !== undefined) assert.ok(Date.parse(from) < Date.parse(until), `invalid validTime interval for ${claim.id}`);
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
      for (const time of [query.knownAt, query.validAt]) if (time !== undefined) assert.ok(parseTimestamp(time), `query ${query.id} invalid time`);
      assert.ok(query.slot.subjectType && query.slot.subjectId && query.slot.fieldOrBehavior && query.slot.claimType, `query ${query.id} incomplete slot`);
      if (query.sameAs !== undefined) {
        assert.ok(queryIds.has(query.sameAs) && query.expect === undefined, `query ${query.id} sameAs`);
        const other = vectorCase.queries.find((item) => item.id === query.sameAs)!;
        assert.deepEqual(query.slot, other.slot, `query ${query.id} sameAs slot`);
        assert.equal(query.knownAt, other.knownAt, `query ${query.id} sameAs knownAt`);
        assert.equal(query.validAt, other.validAt, `query ${query.id} sameAs validAt`);
        continue;
      }
      const expect = query.expect;
      assert.ok(expect && OUTCOMES.has(expect.outcome), `query ${query.id} outcome`);
      if (expect.outcome === "current") {
        assert.ok(Object.hasOwn(expect, "value"), `query ${query.id} current value missing`);
        assert.ok(expect.status && STATUSES.has(expect.status), `query ${query.id} invalid status`);
        assert.ok(expect.supportingClaimIds?.length, `query ${query.id} lacks support`);
        for (const id of expect.supportingClaimIds) {
          assert.ok(query.bundles.some((key) => Date.parse(vectorCase.observedAtByBundle[key]) <= Date.parse(query.knownAt ?? vectorCase.now) && vectorCase.bundles[key].claims.some((item) => item.id === id)), `query ${query.id} support not yet observed: ${id}`);
          const claim = query.bundles.flatMap((key) => vectorCase.bundles[key].claims).find((item) => item.id === id)!;
          assert.ok(claim, `query ${query.id} missing supporting claim ${id}`);
          assert.equal(canonicalClaimKey({ subjectType: query.slot.subjectType, subjectId: query.slot.subjectId, fieldOrBehavior: claim.fieldOrBehavior as string, qualifiers: claim.qualifiers as Record<string, string> | undefined }), canonicalClaimKey(query.slot), `query ${query.id} support field and qualifiers`);
          assert.equal(claim.claimType, query.slot.claimType, `query ${query.id} support type`);
          assert.deepEqual(claim.value, expect.value, `query ${query.id} support value`);
        }
      }
      if (expect.outcome === "none" || expect.outcome === "invalid") assert.ok(expect.reason, `query ${query.id} reason missing`);
      const present = new Set(query.bundles.flatMap((key) => vectorCase.bundles[key].claims.map((claim) => claim.id)));
      const named = [
        ...(expect.supportingClaimIds ?? []),
        ...(expect.candidateClaimIds ?? []),
        ...Object.keys(expect.excluded ?? {}),
        ...Object.keys(expect.statusByClaimId ?? {}),
        ...expect.supersessions.flatMap((edge) => [edge.claimId, edge.byClaimId]),
      ];
      for (const claimId of named) assert.ok(present.has(claimId), `query ${query.id} names ${claimId}, absent from its inputs`);
      for (const edge of expect.supersessions) {
        assert.ok(EDGE_STATES.has(edge.state), `query ${query.id} edge state ${edge.state}`);
        assert.ok(EDGE_KINDS.has(edge.kind), `query ${query.id} edge kind ${edge.kind}`);
      }
      assert.equal(expect.outcome === "contested", (expect.candidateClaimIds?.length ?? 0) >= 2, `query ${query.id}: contested iff two or more candidates`);
      assert.equal(expect.outcome === "contested", expect.gapCodes.includes("contested-value"), `query ${query.id}: contested iff contested-value gap`);
    }
  });
}
