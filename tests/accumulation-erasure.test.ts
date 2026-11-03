import test from "node:test";
import assert from "node:assert/strict";
import { accumulationDigest, accumulationViewerSupersessionInput, projectAccumulation, viewerSupersessionView, type AccumulationAuthority, type AccumulationBundle, type BundleObservation } from "../src/index.js";

/** Same tombstone envelope and dependency graph used by #355's erasure tests. */
function fixture() {
  const time = "2026-04-25T00:00:00.000Z";
  const ids = ["source", "other", "sole", "survivor", "downstream"];
  const bundle: AccumulationBundle = {
    schemaVersion: 3, source: "erasure-test", producerId: "host",
    claims: ids.map(id => ({ id, subjectType: "repo", subjectId: "example", claimType: "software-evidence", fieldOrBehavior: id, value: id === "source" ? null : true, createdAt: time, updatedAt: time,
      ...(id === "source" ? { status: "assumed" as const, metadata: { visibility: { audiences: ["private-team"] }, surfaceRetention: { state: "deleted", erasedAt: time, actor: "owner", rationale: "request" } } } : { metadata: { visibility: "public" } }),
      ...(id === "sole" ? { derivedFrom: ["source"] } : {}),
      ...(id === "survivor" ? { derivedFrom: ["source", "other"] } : {}),
      ...(id === "downstream" ? { derivedFrom: ["survivor"] } : {}),
    })),
    evidence: ids.filter(id => id !== "source").map(id => ({ id: `evidence-${id}`, claimId: id, evidenceType: "human_attestation", method: "attestation", sourceRef: "owner", excerptOrSummary: "attested", observedAt: time, collectedBy: "owner" })),
    policies: [{ id: "policy", claimType: "software-evidence", requiredEvidence: ["human_attestation"], acceptanceCriteria: [], reviewAuthority: "owner", validityRule: { kind: "manual" }, stalenessTriggers: [], conflictRules: [], impactLevel: "medium" }],
    events: ids.filter(id => id !== "source").map(id => ({ id: `event-${id}`, claimId: id, status: "verified" as const, actor: "owner", method: "attestation", evidenceIds: [], createdAt: time })),
  };
  const observation: BundleObservation = { id: "erasure", bundle, observedAt: time, authenticatedPublisher: "host", contentDigest: accumulationDigest(bundle) };
  const policy = { version: "1" as const, ownerByClaimId: Object.fromEntries(ids.map(id => [id, "host"])), eventDecisions: bundle.events.map(event => ({ eventId: event.id, eventDigest: accumulationDigest(event), publisher: "host", admitted: true })) };
  const authority: AccumulationAuthority = { ...policy, integrityRef: accumulationDigest(policy) };
  const query = (fieldOrBehavior: string) => ({ slot: { subjectType: "repo", subjectId: "example", claimType: "software-evidence", fieldOrBehavior }, now: "2026-04-26T00:00:00.000Z", valuePolicy: "single-json-v1" as const });
  return { observation, authority, query };
}

test("a tombstone is not a current null value and sole erased support cannot supply an answer", () => {
  const f = fixture();
  const source = projectAccumulation([f.observation], f.authority, f.query("source"));
  assert.equal(source.outcome, "none"); assert.equal(source.reason, "deleted");
  assert.equal(source.excluded.source, "deleted");
  assert.deepEqual(source.supportingClaimIds, []);
  const sole = projectAccumulation([f.observation], f.authority, f.query("sole"));
  assert.equal(sole.outcome, "none"); assert.equal(sole.reason, "erasure-unsupported");
  assert.equal(sole.statusByClaimId.sole, "unknown");
  assert.deepEqual(sole.erasureUnsupportedClaimIds, ["sole"]);
  assert.deepEqual(sole.deletedInputIdsByClaimId.sole, ["source"]);
  assert.ok(sole.erasureChangeRecords.some(record => record.reason === "input-deleted" && record.inputClaimIds.includes("source")));
  const view = accumulationViewerSupersessionInput({ ...sole, edgeVisibilityByKey: new Map(), viewer: { audiences: ["private-team"] } });
  assert.deepEqual(viewerSupersessionView(view).visibleClaimIds, []);
});

test("surviving support keeps its status and deletion and visibility traces", () => {
  const f = fixture();
  const survivor = projectAccumulation([f.observation], f.authority, f.query("survivor"));
  assert.equal(survivor.outcome, "current"); assert.equal(survivor.status, "verified");
  assert.ok(survivor.gapCodes.includes("erasure-affected"));
  assert.deepEqual(survivor.deletedInputIdsByClaimId.survivor, ["source"]);
  assert.deepEqual(survivor.erasureUnsupportedClaimIds, []);
  assert.deepEqual(survivor.visibilityByClaimId.get("survivor"), { kind: "restricted", audiences: ["private-team"] });
  assert.ok(survivor.visibilityTraceByClaimId.get("survivor")?.trace.some(entry => entry.claimId === "source"));
  const downstream = projectAccumulation([f.observation], f.authority, f.query("downstream"));
  assert.equal(downstream.outcome, "current");
  assert.ok(downstream.gapCodes.includes("erasure-affected"));
  assert.deepEqual(downstream.deletedInputIdsByClaimId.downstream, ["source"]);
});

test("a tombstone cannot coexist with retained evidence or conflicting old content", () => {
  const f = fixture();
  const bad = structuredClone(f.observation);
  bad.bundle.evidence.push({ ...bad.bundle.evidence[0], id: "erased-evidence", claimId: "source" });
  bad.contentDigest = accumulationDigest(bad.bundle);
  assert.throws(() => projectAccumulation([bad], f.authority, f.query("source")), /deleted claims must not retain attached evidence/);
  const old = structuredClone(f.observation); old.id = "old";
  old.bundle.claims[0].value = "old content"; delete old.bundle.claims[0].metadata;
  old.contentDigest = accumulationDigest(old.bundle);
  assert.throws(() => projectAccumulation([old, f.observation], f.authority, f.query("source")), /conflicting claim/);
});

test("independent surviving support remains visible and an erased-only rival cannot strengthen it", () => {
  const f = fixture();
  const observation = structuredClone(f.observation);
  const other = observation.bundle.claims.find(claim => claim.id === "other")!;
  observation.bundle.claims.push({ ...other, id: "independent", fieldOrBehavior: "sole" });
  const evidence = { ...observation.bundle.evidence.find(item => item.claimId === "other")!, id: "evidence-independent", claimId: "independent" };
  const event = { ...observation.bundle.events.find(item => item.claimId === "other")!, id: "event-independent", claimId: "independent" };
  observation.bundle.evidence.push(evidence); observation.bundle.events.push(event);
  observation.contentDigest = accumulationDigest(observation.bundle);
  const authority = structuredClone(f.authority); (authority.ownerByClaimId as Record<string,string>).independent = "host";
  (authority.eventDecisions as typeof authority.eventDecisions[number][]).push({ eventId: event.id, eventDigest: accumulationDigest(event), publisher: "host", admitted: true });
  const { integrityRef: _, ...fields } = authority; authority.integrityRef = accumulationDigest(fields);
  const result = projectAccumulation([observation], authority, f.query("sole"));
  assert.equal(result.outcome, "current"); assert.equal(result.status, "verified");
  assert.deepEqual(result.independentSupportClaimIds, ["independent"]);
  assert.deepEqual(result.supportingClaimIds, ["independent"]);
  assert.deepEqual(result.erasureUnsupportedClaimIds, ["sole"]);
  assert.ok(result.gapCodes.includes("erasure-affected"));
  observation.bundle.claims.find(claim => claim.id === "sole")!.value = false;
  observation.contentDigest = accumulationDigest(observation.bundle);
  const conflict = projectAccumulation([observation], authority, f.query("sole"));
  assert.equal(conflict.outcome, "contested");
  assert.deepEqual(conflict.candidateClaimIds, ["independent", "sole"]);
});

test("erased-only stale or disputed claims cannot establish independent standing", () => {
  for (const status of ["stale", "disputed"] as const) {
    const f = fixture();
    const observation = structuredClone(f.observation);
    const other = observation.bundle.claims.find(claim => claim.id === "other")!;
    observation.bundle.claims.push({ ...other, id: "independent", fieldOrBehavior: "sole" });
    observation.bundle.events.find(event => event.claimId === "sole")!.status = status;
    observation.contentDigest = accumulationDigest(observation.bundle);
    const authority = structuredClone(f.authority); (authority.ownerByClaimId as Record<string,string>).independent = "host";
    const event = observation.bundle.events.find(item => item.claimId === "sole")!;
    authority.eventDecisions.find(item => item.eventId === event.id)!.eventDigest = accumulationDigest(event);
    const { integrityRef: _, ...fields } = authority; authority.integrityRef = accumulationDigest(fields);
    const result = projectAccumulation([observation], authority, f.query("sole"));
    assert.equal(result.outcome, "current"); assert.equal(result.status, "unknown");
    assert.equal(result.statusByClaimId.sole, status);
    assert.deepEqual(result.independentSupportClaimIds, []);
    assert.deepEqual(result.erasureUnsupportedClaimIds, ["sole"]);
  }
});
