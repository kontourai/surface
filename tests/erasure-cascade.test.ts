import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { TrustBundle } from "../src/types.js";
import { analyzeCounterfactual, buildDerivationDrilldown, buildTrustReport, recomputeChangeRecords, traceDependents, validateTrustBundle } from "../src/index.js";

const now = new Date("2026-04-26T00:00:00.000Z");
const timestamp = "2026-04-25T00:00:00.000Z";

function report(erased: boolean) {
  const ids = ["source", "other", "sole", "survivor", "downstream"];
  const bundle = validateTrustBundle({
    schemaVersion: 3, source: "erasure-test",
    claims: ids.map((id) => ({
      id, subjectType: "repo", subjectId: "example", claimType: "software-evidence",
      fieldOrBehavior: id, value: id === "source" && erased ? null : true,
      createdAt: timestamp, updatedAt: timestamp,
      // A retained producer status must not restore support after erasure.
      ...(id === "source" ? { status: "assumed" } : {}),
      ...(id === "source" && erased ? { metadata: { surfaceRetention: { state: "deleted", erasedAt: timestamp, actor: "owner", rationale: "request" } } } : {}),
      ...(id === "sole" ? { derivedFrom: ["source"] } : {}),
      ...(id === "survivor" ? { derivedFrom: ["source", "other"] } : {}),
      ...(id === "downstream" ? { derivedFrom: ["survivor"] } : {}),
    })),
    evidence: ids.filter((id) => !(id === "source" && erased)).map((id) => ({
      id: `evidence-${id}`, claimId: id, evidenceType: "human_attestation", method: "attestation",
      sourceRef: "owner", excerptOrSummary: "attested", observedAt: timestamp, collectedBy: "owner",
    })),
    policies: [{ id: "policy", claimType: "software-evidence", requiredEvidence: ["human_attestation"],
      acceptanceCriteria: [], reviewAuthority: "owner", validityRule: { kind: "manual" },
      stalenessTriggers: [], conflictRules: [], impactLevel: "medium" }],
    events: ids.filter((id) => !(id === "source" && erased)).map((id) => ({
      id: `event-${id}`, claimId: id, status: "verified", actor: "owner", method: "attestation", evidenceIds: [], createdAt: timestamp,
    })),
  });
  return buildTrustReport(bundle, { now });
}

test("erasing the sole input removes derived support", () => {
  const prior = report(false);
  const next = report(true);
  assert.equal(prior.claims.find((claim) => claim.id === "sole")?.status, "verified");
  assert.equal(next.claims.find((claim) => claim.id === "sole")?.status, "unknown");
  assert.equal(next.claims.find((claim) => claim.id === "source")?.status, "unknown");
  assert.ok(next.transparencyGaps.some((gap) => gap.claimId === "sole" && gap.metadata?.source === "derivation.deleted"));
});

test("surviving support and transitive blast radius retain the deletion trace", () => {
  const prior = report(false);
  const next = report(true);
  assert.equal(next.claims.find((claim) => claim.id === "survivor")?.status, "verified");
  assert.ok(next.transparencyGaps.some((gap) => gap.claimId === "survivor" && gap.type === "provenance_gap" && gap.metadata?.source === "derivation.deleted"));
  assert.ok(next.changeRecords.some((record) => record.claimId === "survivor" && record.reason === "input-deleted" && record.action === "review" && record.inputClaimIds.includes("source")));
  assert.deepEqual(buildDerivationDrilldown(next, "survivor").directInputs.find((input) => input.inputClaimId === "source")?.claim.metadata?.surfaceRetention, { state: "deleted", erasedAt: timestamp, actor: "owner", rationale: "request" });
  assert.deepEqual(traceDependents(next, "source").map((item) => item.claimId).sort(), ["downstream", "sole", "survivor"]);
  const records = recomputeChangeRecords(prior, next);
  assert.deepEqual(records.map((item) => item.claimId), ["downstream", "sole", "survivor"]);
  assert.deepEqual(records.find((item) => item.claimId === "downstream")?.changedInputs[0].deletedInputIds, ["source"]);
});


test("a cycle cannot replace erased support", () => {
  const source = report(true).claims.find((claim) => claim.id === "source")!;
  const template = report(false).claims.find((claim) => claim.id === "survivor")!;
  const claims = [source, { ...template, id: "a", derivedFrom: ["source", "b"] }, { ...template, id: "b", derivedFrom: ["a"] }];
  const prior = report(false);
  const evidence = ["a", "b"].map((id) => ({ ...prior.evidence.find((item) => item.claimId === "survivor")!, id: `ev-${id}`, claimId: id }));
  const events = ["a", "b"].map((id) => ({ ...prior.events.find((item) => item.claimId === "survivor")!, id: `ev-${id}`, claimId: id }));
  const bundle = validateTrustBundle({ schemaVersion: 3, source: "cycle", claims, evidence, policies: prior.policies, events });
  const next = buildTrustReport(bundle, { now });
  assert.equal(next.claims.find((claim) => claim.id === "a")?.status, "unknown");
  assert.ok(next.transparencyGaps.some((gap) => gap.claimId === "a" && gap.metadata?.source === "derivation.cycle"));
});

test("malformed tombstones and retained claim content are rejected at validation", () => {
  const source = report(true).claims.find((claim) => claim.id === "source")!;
  const validate = (claim: unknown) => validateTrustBundle({ schemaVersion: 3, source: "invalid", claims: [claim], evidence: [], policies: [], events: [] });
  for (const surfaceRetention of ["deleted", { state: "DELETED" }, { state: "deleted", erasedAt: 42 },
    { state: "expired", erasedAt: timestamp, actor: "owner", rationale: "request" },
    { state: "deleted", erasedAt: "March 7", actor: "owner", rationale: "request" },
    { state: "deleted", erasedAt: timestamp, actor: " ", rationale: "request" }]) {
    assert.throws(() => validate({ ...source, metadata: { surfaceRetention } }), /surfaceRetention|erasedAt/);
  }
  assert.throws(() => validate({ ...source, value: "erased" }), /null value/);
  assert.throws(() => validate({ ...source, currentIntegrityRef: "sha256:abc" }), /integrity reference/);
});

test("shared deletion ancestry is processed within a bounded time", () => {
  const index = new URL("../src/index.js", import.meta.url).href;
  const script = `
    import { buildTrustReport, validateTrustBundle } from ${JSON.stringify(index)};
    const time = "2026-04-25T00:00:00.000Z";
    const base = {subjectType:"repo",subjectId:"x",claimType:"fact",fieldOrBehavior:"fact",value:true,createdAt:time,updatedAt:time};
    const claims = [{...base,id:"root",value:null,metadata:{surfaceRetention:{state:"deleted",erasedAt:time,actor:"owner",rationale:"request"}}}];
    let prev = ["root"];
    for (let i = 0; i < 28; i++) { const next = ["a"+i,"b"+i]; for (const id of next) claims.push({...base,id,derivedFrom:prev}); prev = next; }
    claims.push({...base,id:"top",derivedFrom:prev});
    const bundle = validateTrustBundle({schemaVersion:3,source:"diamond",claims,evidence:[],policies:[],events:[]});
    const report = buildTrustReport(bundle,{now:new Date(time)});
    if (report.claims.at(-1).status !== "unknown") process.exit(2);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 8000, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});


test("removing a rejected input can lift the ceiling and leaves a provenance gap", () => {
  const original = report(false);
  const input = {
    schemaVersion: 3, source: "lift", claims: original.claims,
    evidence: original.evidence, policies: original.policies,
    events: original.events.map((event) => event.claimId === "source" ? { ...event, status: "rejected" } : event),
  };
  const before = buildTrustReport(validateTrustBundle(input), { now });
  const after = buildTrustReport(validateTrustBundle({
    ...input,
    claims: input.claims.map((claim) => claim.id === "source" ? {
      ...claim, value: null, metadata: { surfaceRetention: { state: "deleted", erasedAt: timestamp, actor: "owner", rationale: "request" } },
    } : claim),
    evidence: input.evidence.filter((item) => item.claimId !== "source"),
    events: input.events.filter((item) => item.claimId !== "source"),
  }), { now });
  assert.equal(before.claims.find((claim) => claim.id === "survivor")?.status, "rejected");
  assert.equal(after.claims.find((claim) => claim.id === "survivor")?.status, "verified");
  assert.ok(after.transparencyGaps.some((gap) => gap.claimId === "survivor" && gap.type === "provenance_gap" && gap.metadata?.source === "derivation.deleted"));
});


test("a live rejected intermediate remains a ceiling after its sole input is erased", () => {
  const original = report(false);
  const source = report(true).claims.find((claim) => claim.id === "source")!;
  const template = original.claims.find((claim) => claim.id === "survivor")!;
  const claims = [source, original.claims.find((claim) => claim.id === "other")!,
    { ...template, id: "intermediate", derivedFrom: ["source"] },
    { ...template, id: "target", derivedFrom: ["intermediate", "other"] }];
  const evidence = ["other", "intermediate", "target"].map((id) => ({ ...original.evidence.find((item) => item.claimId === "survivor")!, id: `e-${id}`, claimId: id }));
  const events = ["other", "intermediate", "target"].map((id) => ({ ...original.events.find((item) => item.claimId === "survivor")!, id: `ev-${id}`, claimId: id, status: id === "intermediate" ? "rejected" : "verified" }));
  const next = buildTrustReport(validateTrustBundle({ schemaVersion: 3, source: "intermediate", claims, evidence, events, policies: original.policies }), { now });
  assert.equal(next.claims.find((claim) => claim.id === "target")?.status, "rejected");
  assert.ok(next.changeRecords.some((record) => record.claimId === "target" && record.reason === "input-rejected" && record.inputClaimIds.includes("intermediate")));
});

test("attached evidence on a tombstone is refused at validation and report derivation", () => {
  const erased = report(true);
  const old = report(false);
  const bundle = { schemaVersion: 3, source: "leak", claims: erased.claims,
    evidence: [old.evidence.find((item) => item.claimId === "source")!], policies: [], events: [] } as TrustBundle;
  assert.throws(() => validateTrustBundle(bundle), /deleted claims must not retain attached evidence/);
  assert.throws(() => buildTrustReport(bundle, { now }), /deleted claims must not retain attached evidence/);
});

test("many dependents share the survival index within a bounded time", () => {
  const index = new URL("../src/index.js", import.meta.url).href;
  const script = `
    import { buildTrustReport, validateTrustBundle } from ${JSON.stringify(index)};
    const time = "2026-04-25T00:00:00.000Z";
    const base = {subjectType:"repo",subjectId:"x",claimType:"fact",fieldOrBehavior:"fact",value:true,createdAt:time,updatedAt:time};
    const claims = [{...base,id:"root",value:null,metadata:{surfaceRetention:{state:"deleted",erasedAt:time,actor:"owner",rationale:"request"}}},{...base,id:"live"}];
    for (let i=0;i<12000;i++) claims.push({...base,id:"claim"+i,derivedFrom:["root","live"]});
    const bundle = validateTrustBundle({schemaVersion:3,source:"star",claims,evidence:[],policies:[],events:[]});
    if (buildTrustReport(bundle,{now:new Date(time)}).claims.length !== claims.length) process.exit(2);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 8000, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});


test("counterfactuals ignore tombstones in surviving input ceilings", () => {
  const next = report(true);
  assert.deepEqual(analyzeCounterfactual(next, "other", "verified").affected, []);
  assert.deepEqual(analyzeCounterfactual(next, "other", "proposed").affected.map((impact) => [impact.claimId, impact.toStatus]), [
    ["survivor", "proposed"], ["downstream", "proposed"],
  ]);
  assert.deepEqual(analyzeCounterfactual(next, "source", "rejected").affected, []);
});

test("a live unsupported intermediate limits downstream support", () => {
  const next = report(true);
  const template = next.claims.find((claim) => claim.id === "survivor")!;
  const target = { ...template, id: "target", derivedFrom: ["sole", "other"] };
  const evidence = { ...next.evidence.find((item) => item.claimId === "survivor")!, id: "target-evidence", claimId: "target" };
  const event = { ...next.events.find((item) => item.claimId === "survivor")!, id: "target-event", claimId: "target" };
  const bundle = validateTrustBundle({ schemaVersion: 3, source: "live-intermediate", claims: [...next.claims, target],
    evidence: [...next.evidence, evidence], events: [...next.events, event], policies: next.policies });
  const derived = buildTrustReport(bundle, { now });
  assert.equal(derived.claims.find((claim) => claim.id === "sole")?.status, "unknown");
  assert.equal(derived.claims.find((claim) => claim.id === "target")?.status, "unknown");
});

test("unvalidated report derivation rejects tombstone content and integrity references", () => {
  const next = report(true);
  for (const field of [{ value: "secret" }, { currentIntegrityRef: "sha256:abc" }, { currentIntegrityAnchor: null }]) {
    const bundle = { schemaVersion: 3, source: "unsafe", claims: next.claims.map((claim) => claim.id === "source" ? { ...claim, ...field } : claim),
      evidence: next.evidence, events: next.events, policies: next.policies } as TrustBundle;
    assert.throws(() => buildTrustReport(bundle, { now }), /null value and no content integrity/);
  }
});

test("deep erasure traversal and recompute avoid recursive stack exhaustion", () => {
  const index = new URL("../src/index.js", import.meta.url).href;
  const script = `
    import { applyDerivation, recomputeChangeRecords } from ${JSON.stringify(index)};
    const time = "2026-04-25T00:00:00.000Z";
    const base = {subjectType:"repo",subjectId:"x",claimType:"fact",fieldOrBehavior:"fact",value:true,createdAt:time,updatedAt:time};
    const oldRoot = {...base,id:"root",status:"verified"};
    const root = {...oldRoot,value:null,metadata:{surfaceRetention:{state:"deleted",erasedAt:time,actor:"owner",rationale:"request"}}};
    const chain = [];
    for (let i=0;i<12000;i++) chain.push({...base,id:"c"+i,status:"verified",derivedFrom:[i ? "c"+(i-1) : "root"]});
    const claims = [root,...chain];
    const byId = new Map(claims.map(c => [c.id,c]));
    const own = new Map(claims.map(c => [c.id,"verified"]));
    const result = applyDerivation({claim:chain.at(-1),ownStatus:"verified",ownStatusByClaimId:own,claimsById:byId,now:new Date(time)});
    if (result.status !== "unknown") process.exit(2);
    const records = recomputeChangeRecords({claims:[oldRoot,...chain]},{claims});
    if (records.length !== chain.length || !records.find(r => r.claimId === "c11999")?.changedInputs[0].deletedInputIds.includes("root")) process.exit(3);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 8000, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
