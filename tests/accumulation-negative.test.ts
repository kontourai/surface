import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accumulationDigest, advanceAccumulation, projectAccumulation, type AccumulationAuthority, type AccumulationBundle, type BundleObservation } from "../src/index.js";

const vectors = JSON.parse(readFileSync("tests/fixtures/knowledge-accumulation/vectors.json", "utf8"));
function fixture(id: string) {
  const c = vectors.cases.find((v: { id: string }) => v.id === id);
  const observations: BundleObservation[] = Object.entries(c.bundles as Record<string, AccumulationBundle>).map(([key, bundle]) => ({ id: key, bundle, observedAt: c.observedAtByBundle[key], authenticatedPublisher: bundle.producerId!, contentDigest: accumulationDigest(bundle) }));
  const eventDecisions = observations.flatMap(o => o.bundle.events.map(e => ({ eventId: e.id, eventDigest: accumulationDigest(e), publisher: o.authenticatedPublisher, admitted: c.fixtureAuthority.admittedEventIds.includes(e.id) })));
  const identityDecisions = observations.flatMap(o => (o.bundle.identityLinks ?? []).filter(link => link.id && link.mappingClaimId && c.fixtureAuthority.admittedIdentityLinkIds?.includes(link.id)).map(link => ({ linkDigest: accumulationDigest(link), publisher: o.authenticatedPublisher, mappingClaimId: link.mappingClaimId!, admitted: true })));
  const policy = { version: "1" as const, ownerByClaimId: c.fixtureAuthority.authenticatedOwnerByClaimId as Record<string,string>, eventDecisions, identityDecisions };
  const authority: AccumulationAuthority = { ...policy, integrityRef: accumulationDigest(policy) };
  const query = { slot: c.queries[0].slot, now: c.now, valuePolicy: "single-json-v1" as const };
  return { observations, authority, query };
}

test("admission and owner mutations invalidate the protected policy", () => {
  const f = fixture("simultaneous-conflict");
  const changed = structuredClone(f.authority);
  (changed.eventDecisions[0] as { admitted: boolean }).admitted = false;
  assert.throws(() => projectAccumulation(f.observations, changed, f.query), /admission policy/);
  const owner = structuredClone(f.authority);
  (owner.ownerByClaimId as Record<string,string>)[Object.keys(owner.ownerByClaimId)[0]] = "rival";
  assert.throws(() => projectAccumulation(f.observations, owner, f.query), /admission policy/);
});

test("non-admitted terminal events do not suppress either conflicting candidate", () => {
  const f = fixture("untrusted-terminal-event");
  const result = projectAccumulation(f.observations, f.authority, f.query);
  assert.equal(result.outcome, "contested");
  assert.deepEqual(result.candidateClaimIds, ["producer-a.acme.hq.1", "producer-b.acme.hq.1"]);
  assert.equal(result.statusByClaimId["producer-b.acme.hq.1"], "verified");
  assert.ok(result.gapCodes.includes("event-authority-pending"));
  const pendingId = result.pendingEventIds[0];
  assert.deepEqual(result.eventProvenance[pendingId].map(p => p.admitted), [false]);
});

test("contradictory values remain visible despite recency", () => {
  const f = fixture("recency-does-not-override");
  const result = projectAccumulation(f.observations.slice(0,2), f.authority, f.query);
  assert.equal(result.outcome, "contested");
  assert.deepEqual(result.candidateClaimIds, ["producer-a.acme.hq.1", "producer-b.acme.hq.1"]);
});

test("qualifiers do not match a different slot", () => {
  const f = fixture("qualified-property");
  const result = projectAccumulation(f.observations, f.authority, { ...f.query, slot: { ...f.query.slot, qualifiers: { division: "other" } } });
  assert.equal(result.outcome, "none");
  assert.deepEqual(result.supportingClaimIds, []);
});

test("bad custody and intervals fail closed", () => {
  const f = fixture("self-revision-correction");
  const damaged = structuredClone(f.observations);
  damaged[0].bundle.claims[0].value = "tampered";
  assert.throws(() => projectAccumulation(damaged, f.authority, f.query), /custody/);
  const invalid = structuredClone(f.observations);
  invalid[0].bundle.claims[0].validTime = { from: "2026-02-01T00:00:00Z", until: "2026-01-01T00:00:00Z" };
  invalid[0].contentDigest = accumulationDigest(invalid[0].bundle);
  assert.throws(() => projectAccumulation(invalid, f.authority, f.query), /interval/);
});

test("rebuild equals incrementally assembled observations for every permutation", () => {
  const f = fixture("identity-merge-split");
  const inputs = f.observations.slice(0, 4);
  const permutations = <T>(xs: T[]): T[][] => xs.length === 0 ? [[]] : xs.flatMap((x, i) => permutations([...xs.slice(0,i), ...xs.slice(i+1)]).map(rest => [x, ...rest]));
  const rebuilt = projectAccumulation(inputs, f.authority, f.query);
  for (const order of permutations(inputs)) {
    let state: BundleObservation[] = [];
    const independentlyCollected: BundleObservation[] = [];
    for (const observation of order) {
      const next = advanceAccumulation(state, observation, f.authority, f.query);
      state = next.observations;
      independentlyCollected.unshift(observation);
      const replay = [...independentlyCollected, independentlyCollected[0]];
      assert.deepEqual(next.result, projectAccumulation(replay, f.authority, f.query));
    }
    assert.deepEqual(projectAccumulation(state, f.authority, f.query), rebuilt);
  }
});

test("complete correction status and disposition maps remain distinct", () => {
  const f = fixture("self-revision-correction");
  const result = projectAccumulation(f.observations, f.authority, f.query);
  assert.deepEqual({ ...result.statusByClaimId }, { "producer-a.acme.hq.1": "verified", "producer-a.acme.hq.2": "verified" });
  assert.deepEqual({ ...result.dispositionByClaimId }, { "producer-a.acme.hq.1": "superseded" });
  assert.deepEqual(result.supportingClaimIds, ["producer-a.acme.hq.2"]);
  assert.deepEqual(result.independentSupportClaimIds, ["producer-a.acme.hq.2"]);
});

test("derived copies cannot count as independent corroboration", () => {
  const f = fixture("derivation-lineage");
  const result = projectAccumulation(f.observations, f.authority, f.query);
  assert.deepEqual(result.supportingClaimIds, ["producer-a.acme.hq.1", "producer-a.acme.hq.derived"]);
  assert.deepEqual(result.independentSupportClaimIds, ["producer-a.acme.hq.1"]);
  assert.deepEqual({ ...result.statusByClaimId }, { "producer-a.acme.hq.1": "proposed", "producer-a.acme.hq.derived": "proposed" });
});

test("an unbacked equivalent identity is visible and cannot select a unique answer", () => {
  const f = fixture("identity-merge-split");
  const observations = structuredClone(f.observations.slice(0, 2));
  observations[0].bundle.identityLinks = [{ id: "unbacked", subjects: [{ subjectType: "org", subjectId: "acme" }, { subjectType: "company", subjectId: "acme-gmbh" }] }];
  observations[0].contentDigest = accumulationDigest(observations[0].bundle);
  const result = projectAccumulation(observations, f.authority, f.query);
  assert.equal(result.outcome, "invalid");
  assert.ok(result.gapCodes.includes("identity-unresolved"));
  assert.deepEqual(result.inertIdentityLinkIds, ["unbacked"]);
});

test("publisher is retained per observation and event", () => {
  const f = fixture("simultaneous-conflict");
  const result = projectAccumulation(f.observations, f.authority, f.query);
  assert.equal(result.claimProvenance["producer-a.acme.hq.1"][0].publisher, "producer-a");
  assert.equal(result.eventProvenance["producer-b.acme.hq.1.verified"][0].publisher, "producer-b");
});

test("withdrawal without an invalidation type remains a retraction", () => {
  const f = fixture("retraction-and-no-current-answer");
  const observations = structuredClone(f.observations.slice(0, 3));
  const event = observations[2].bundle.events.find(e => e.status === "revoked")!;
  delete event.type;
  observations[2].contentDigest = accumulationDigest(observations[2].bundle);
  const policy = structuredClone(f.authority);
  const decision = policy.eventDecisions.find(e => e.eventId === event.id)!;
  decision.eventDigest = accumulationDigest(event);
  const { integrityRef: _, ...fields } = policy;
  policy.integrityRef = accumulationDigest(fields);
  const result = projectAccumulation(observations, policy, f.query);
  assert.equal(result.outcome, "current");
  assert.equal(result.value, "Berlin");
  assert.equal(result.excluded["producer-a.acme.hq.2"], "retracted");
});

test("a stale invalidation does not retract the assertion", () => {
  const f = fixture("retraction-and-no-current-answer");
  const observations = structuredClone(f.observations.slice(0, 3));
  const event = observations[2].bundle.events[0];
  event.status = "stale";
  observations[2].contentDigest = accumulationDigest(observations[2].bundle);
  const policy = structuredClone(f.authority);
  policy.eventDecisions.find(e => e.eventId === event.id)!.eventDigest = accumulationDigest(event);
  const { integrityRef: _, ...fields } = policy;
  policy.integrityRef = accumulationDigest(fields);
  const result = projectAccumulation(observations, policy, f.query);
  assert.equal(result.statusByClaimId["producer-a.acme.hq.2"], "stale");
  assert.equal(result.excluded["producer-a.acme.hq.2"], undefined);
  assert.equal(result.outcome, "contested");
});

test("invalid observation IDs, timestamps and colliding claims fail closed", () => {
  const f = fixture("self-revision-correction");
  const missing = structuredClone(f.observations);
  missing[0].observedAt = "not-a-time";
  assert.throws(() => projectAccumulation(missing, f.authority, f.query), /custody/);
  const collision = structuredClone(f.observations);
  collision[1].bundle.claims[0].value = "rival";
  collision[1].contentDigest = accumulationDigest(collision[1].bundle);
  assert.throws(() => projectAccumulation(collision, f.authority, f.query), /conflicting claim/);
});

test("a copied successor published by a rival does not establish owner revision authority", () => {
  const f = fixture("self-revision-correction");
  const observations = structuredClone(f.observations);
  observations[1].authenticatedPublisher = "rival";
  const policy = structuredClone(f.authority);
  for (const decision of policy.eventDecisions) if (observations[1].bundle.events.some(e => e.id === decision.eventId)) decision.publisher = "rival";
  const { integrityRef: _, ...fields } = policy;
  policy.integrityRef = accumulationDigest(fields);
  const result = projectAccumulation(observations, policy, f.query);
  assert.equal(result.outcome, "contested");
  assert.equal(result.supersessions[0].state, "pending");
  assert.deepEqual(result.claimProvenance["producer-a.acme.hq.2"].map(p => p.publisher), ["rival"]);
});

test("a support claim matches through an admitted identity class, then stops matching after split", () => {
  const f = fixture("identity-merge-split");
  const query = { ...f.query, slot: { ...f.query.slot, subjectType: "company", subjectId: "acme-gmbh" } };
  const merged = projectAccumulation([f.observations[0], f.observations[2]], f.authority, query);
  assert.equal(merged.outcome, "current");
  assert.deepEqual(merged.supportingClaimIds, ["producer-a.acme.hq.1"]);
  assert.deepEqual(merged.identityLinkIds, ["identity-desk.link.acme"]);
  const split = projectAccumulation([f.observations[0], f.observations[2], f.observations[3]], f.authority, query);
  assert.equal(split.outcome, "none");
  assert.deepEqual(split.supportingClaimIds, []);
  assert.deepEqual(split.inertIdentityLinkIds, ["identity-desk.link.acme"]);
});

test("missing input custody caps derived status", () => {
  const f = fixture("derivation-lineage");
  const policy = structuredClone(f.authority);
  delete (policy.ownerByClaimId as Record<string, string>)["producer-a.acme.hq.1"];
  const { integrityRef: _, ...fields } = policy;
  policy.integrityRef = accumulationDigest(fields);
  const result = projectAccumulation(f.observations, policy, f.query);
  assert.equal(result.statusByClaimId["producer-a.acme.hq.1"], "unknown");
  assert.equal(result.statusByClaimId["producer-a.acme.hq.derived"], "unknown");
  assert.equal(result.outcome, "current");
  assert.equal(result.status, "unknown");
  assert.ok(result.gapCodes.includes("owner-unverified"));
});

test("missing lineage is reported and cannot support verified status", () => {
  const f = fixture("derivation-lineage");
  const observations = structuredClone(f.observations);
  const bundle = observations[0].bundle;
  bundle.claims = bundle.claims.filter(c => c.id !== "producer-a.acme.hq.1");
  bundle.evidence = bundle.evidence.filter(e => e.claimId !== "producer-a.acme.hq.1");
  bundle.events = bundle.events.filter(e => e.claimId !== "producer-a.acme.hq.1");
  observations[0].contentDigest = accumulationDigest(bundle);
  const result = projectAccumulation(observations, f.authority, f.query);
  assert.equal(result.outcome, "invalid");
  assert.equal(result.reason, "lineage-missing");
  assert.ok(result.gapCodes.includes("lineage-missing"));
});

test("redelivery preserves the first recorded knowledge instant", () => {
  const f = fixture("self-revision-correction");
  const first = f.observations[0];
  const redelivery = { ...structuredClone(first), id: "redelivery", observedAt: "2026-04-01T00:00:00Z" };
  const query = { ...f.query, knownAt: "2026-02-01T00:00:00Z" };
  const result = projectAccumulation([redelivery, first], f.authority, query);
  assert.equal(result.outcome, "current");
  assert.equal(result.value, "Berlin");
  assert.deepEqual(result.claimProvenance["producer-a.acme.hq.1"].map(p => p.observationId), [first.id]);
});

test("an unrelated verified claim cannot authorize a rival identity link", () => {
  const f = fixture("identity-merge-split");
  const base = f.observations[1];
  const rival: BundleObservation = {
    id: "rival", observedAt: "2026-03-11T00:00:00Z", authenticatedPublisher: "rival", contentDigest: "",
    bundle: { schemaVersion: base.bundle.schemaVersion, source: "rival", producerId: "rival", claims: [], evidence: [], policies: [], events: [], identityLinks: [{ id: "rival-link", subjects: [{ subjectType: "org", subjectId: "acme" }, { subjectType: "company", subjectId: "acme-gmbh" }], mappingClaimId: "producer-b.acme-gmbh.hq.1" }] },
  };
  rival.contentDigest = accumulationDigest(rival.bundle);
  const result = projectAccumulation([base, rival], f.authority, f.query);
  assert.notEqual(result.outcome, "current");
  assert.deepEqual(result.identityLinkIds, []);
  assert.ok(result.gapCodes.includes("identity-unresolved"));
});

test("an admitted identity decision does not authorize a changed link or rival publisher", () => {
  const f = fixture("identity-merge-split");
  const observations = structuredClone([f.observations[0], f.observations[2]]);
  observations[1].authenticatedPublisher = "rival";
  let result = projectAccumulation(observations, f.authority, f.query);
  assert.deepEqual(result.identityLinkIds, []);
  assert.equal(result.outcome, "invalid");
  observations[1].authenticatedPublisher = "identity-desk";
  observations[1].bundle.identityLinks![0].subjects[1].subjectId = "different";
  observations[1].contentDigest = accumulationDigest(observations[1].bundle);
  result = projectAccumulation(observations, f.authority, f.query);
  assert.deepEqual(result.identityLinkIds, []);
  assert.equal(result.outcome, "invalid");
});

test("admitted retraction and rejection survive missing owner custody", () => {
  const f = fixture("retraction-and-no-current-answer");
  const policy = structuredClone(f.authority);
  delete (policy.ownerByClaimId as Record<string, string>)["producer-a.acme.hq.1"];
  const { integrityRef: _, ...fields } = policy;
  policy.integrityRef = accumulationDigest(fields);
  const withdrawn = projectAccumulation([f.observations[0], f.observations[3]], policy, f.query);
  assert.equal(withdrawn.outcome, "none");
  assert.equal(withdrawn.excluded["producer-a.acme.hq.1"], "retracted");
  const rival = fixture("competing-authority-resolution");
  const rivalPolicy = structuredClone(rival.authority);
  delete (rivalPolicy.ownerByClaimId as Record<string, string>)["producer-b.acme.hq.1"];
  const { integrityRef: ignored, ...rivalFields } = rivalPolicy;
  rivalPolicy.integrityRef = accumulationDigest(rivalFields);
  const rejected = projectAccumulation(rival.observations.slice(0, 3), rivalPolicy, rival.query);
  assert.equal(rejected.outcome, "current");
  assert.equal(rejected.excluded["producer-b.acme.hq.1"], "rejected");
});

test("a revoked claim with missing lineage remains excluded", () => {
  const f = fixture("derivation-lineage");
  const observations = structuredClone(f.observations);
  const bundle = observations[0].bundle;
  bundle.claims = bundle.claims.filter(c => c.id !== "producer-a.acme.hq.1");
  bundle.evidence = bundle.evidence.filter(e => e.claimId !== "producer-a.acme.hq.1");
  bundle.events = bundle.events.filter(e => e.claimId !== "producer-a.acme.hq.1");
  const event = { ...bundle.events[0], id: "derived-revoked", status: "revoked" as const, type: "invalidation" as const, createdAt: "2026-02-01T00:00:00Z" };
  bundle.events.push(event);
  observations[0].contentDigest = accumulationDigest(bundle);
  const policy = structuredClone(f.authority);
  (policy.eventDecisions as typeof policy.eventDecisions[number][]).push({ eventId: event.id, eventDigest: accumulationDigest(event), publisher: observations[0].authenticatedPublisher, admitted: true });
  const { integrityRef: _, ...fields } = policy;
  policy.integrityRef = accumulationDigest(fields);
  const result = projectAccumulation(observations, policy, f.query);
  assert.equal(result.outcome, "none");
  assert.equal(result.excluded["producer-a.acme.hq.derived"], "retracted");
});

test("an alias on another property cannot block a direct query", () => {
  const f = fixture("self-revision-correction");
  const rival = structuredClone(f.observations[0]);
  rival.id = "rival"; rival.authenticatedPublisher = "rival"; rival.bundle.producerId = "rival";
  rival.bundle.events = []; rival.bundle.evidence = [];
  rival.bundle.claims = [{ ...rival.bundle.claims[0], id: "rival.ceo", fieldOrBehavior: "ceo", value: "X", subjectAliases: [{ subjectType: "org", subjectId: "acme-old" }] }];
  rival.contentDigest = accumulationDigest(rival.bundle);
  const result = projectAccumulation([f.observations[0], rival], f.authority, f.query);
  assert.equal(result.outcome, "current");
  assert.equal(result.value, "Berlin");
});

test("invalid slots fail closed", () => {
  const f = fixture("self-revision-correction");
  const query = { ...f.query, slot: { ...f.query.slot, claimType: "" } };
  assert.throws(() => projectAccumulation(f.observations, f.authority, query), /invalid accumulation slot/);
});

test("event admission is bound to both exact event bytes and publisher", () => {
  const f = fixture("competing-authority-resolution");
  for (const field of ["eventDigest", "publisher"] as const) {
    const policy = structuredClone(f.authority);
    const event = f.observations[2].bundle.events[0];
    const decision = policy.eventDecisions.find(d => d.eventId === event.id)!;
    decision[field] = "wrong";
    const { integrityRef: _, ...fields } = policy;
    policy.integrityRef = accumulationDigest(fields);
    const result = projectAccumulation(f.observations.slice(0, 3), policy, f.query);
    assert.equal(result.outcome, "contested", field);
    assert.ok(result.pendingEventIds.includes(event.id), field);
    assert.equal(result.statusByClaimId["producer-b.acme.hq.1"], "verified", field);
  }
});

test("an explicit third-party grant admits only its exact replacement edge", () => {
  const f = fixture("competing-authority-resolution");
  const observations = [f.observations[0], f.observations[3]];
  const before = projectAccumulation(observations, f.authority, f.query);
  assert.equal(before.outcome, "contested");
  assert.equal(before.supersessions[0].state, "pending");
  const policy = structuredClone(f.authority);
  policy.replacementGrants = [{ successorId: before.supersessions[0].byClaimId, predecessorId: before.supersessions[0].claimId }];
  const { integrityRef: _, ...fields } = policy;
  policy.integrityRef = accumulationDigest(fields);
  const after = projectAccumulation(observations, policy, f.query);
  assert.equal(after.outcome, "current");
  assert.equal(after.supersessions[0].state, "accepted");
  assert.deepEqual(after.supportingClaimIds, [before.supersessions[0].byClaimId]);
});

test("identical observation redelivery retains one provenance entry", () => {
  const f = fixture("self-revision-correction");
  const result = projectAccumulation([f.observations[0], f.observations[0]], f.authority, f.query);
  assert.equal(result.claimProvenance["producer-a.acme.hq.1"].length, 1);
  assert.equal(result.eventProvenance["producer-a.acme.hq.1.verified"].length, 1);
});
