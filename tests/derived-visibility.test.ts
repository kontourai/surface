import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDerivation,
  deriveClaimVisibility,
  deriveTrustSnapshot,
  supersessionEdgeDecisions,
  supersessionStatusRecomputeClaimIds,
  MAX_AUDIENCES,
  meetVisibility,
  readDeclaredVisibility,
  validateTrustBundle,
  viewerSupersessionView,
  visibilityAllows,
} from "../src/index.js";
import type { Claim, TrustBundle, Visibility, ViewerContext } from "../src/index.js";

const NOW = new Date("2026-11-03T00:00:00.000Z");

function claim(id: string, extra: Partial<Claim> = {}): Claim {
  return {
    id,
    subjectType: "memory.person",
    subjectId: "person-1",
    claimType: "memory-fact",
    fieldOrBehavior: id,
    value: id,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

const withVisibility = (visibility: unknown, extra: Partial<Claim> = {}): Partial<Claim> => ({
  ...extra,
  metadata: { ...(extra.metadata ?? {}), visibility },
});

function bundle(claims: Claim[]): TrustBundle {
  return validateTrustBundle({ schemaVersion: 3, source: "derived-visibility-test", claims, evidence: [], policies: [], events: [] });
}

function visibilityOf(claims: Claim[], id: string) {
  const snapshot = deriveTrustSnapshot(bundle(claims), { now: NOW });
  const found = snapshot.visibilityByClaimId[id];
  assert.ok(found, `no derived visibility for ${id}`);
  return found;
}

const PUBLIC: Visibility = { kind: "public" };
const restricted = (...audiences: string[]): Visibility => ({ kind: "restricted", audiences });
const SEALED = restricted();

// ---- lattice -------------------------------------------------------------

test("meet is intersection of audiences with public as the identity", () => {
  assert.deepEqual(meetVisibility(), PUBLIC);
  assert.deepEqual(meetVisibility(PUBLIC, PUBLIC), PUBLIC);
  assert.deepEqual(meetVisibility(PUBLIC, restricted("staff")), restricted("staff"));
  assert.deepEqual(meetVisibility(restricted("a", "b"), restricted("b", "c")), restricted("b"));
  assert.deepEqual(meetVisibility(restricted("a"), restricted("b")), SEALED);
  assert.deepEqual(meetVisibility(restricted("a", "b"), PUBLIC, restricted("a")), restricted("a"));
});

test("a restricted visibility admits only a viewer holding one of its audiences", () => {
  assert.equal(visibilityAllows(PUBLIC, { audiences: [] }), true);
  assert.equal(visibilityAllows(PUBLIC, undefined), true);
  assert.equal(visibilityAllows(restricted("staff"), { audiences: ["staff", "x"] }), true);
  assert.equal(visibilityAllows(restricted("staff"), { audiences: ["client"] }), false);
  assert.equal(visibilityAllows(restricted("staff"), { audiences: [] }), false);
  assert.equal(visibilityAllows(restricted("staff"), undefined), false);
  assert.equal(visibilityAllows(SEALED, { audiences: ["staff"] }), false);
  assert.equal(visibilityAllows(undefined, { audiences: ["staff"] }), false, "no visibility is not visible");
});

test("declared visibility reads the documented metadata locations and nothing else", () => {
  assert.deepEqual(readDeclaredVisibility(claim("a", withVisibility("public"))), { state: "declared", visibility: PUBLIC });
  assert.deepEqual(readDeclaredVisibility(claim("a", withVisibility({ audiences: ["b", "a", "a"] }))), { state: "declared", visibility: restricted("a", "b") });
  assert.deepEqual(readDeclaredVisibility(claim("a", { metadata: { disclosure: { visibility: "public" } } })), { state: "declared", visibility: PUBLIC });
  for (const legacy of ["private", "permissioned", "redacted", "unavailable"]) {
    assert.deepEqual(readDeclaredVisibility(claim("a", withVisibility(legacy))), { state: "declared", visibility: SEALED }, legacy);
  }
  assert.deepEqual(readDeclaredVisibility(claim("a")), { state: "undeclared" });
  assert.deepEqual(readDeclaredVisibility(claim("a", { metadata: { other: 1 } })), { state: "undeclared" });
  for (const junk of ["Public", "everyone", "", 7, true, null, [], {}, { audiences: "staff" }, { audiences: [1] }, { audiences: [""] }]) {
    assert.deepEqual(readDeclaredVisibility(claim("a", withVisibility(junk))), { state: "unrecognized" }, JSON.stringify(junk));
  }
  assert.deepEqual(readDeclaredVisibility(claim("a", { metadata: { disclosure: "public" } })), { state: "unrecognized" });
  // Both locations written: the narrower applies, so a wide one cannot mask a narrow one.
  assert.deepEqual(
    readDeclaredVisibility(claim("a", { metadata: { visibility: "public", disclosure: { visibility: { audiences: ["x"] } } } })),
    { state: "declared", visibility: restricted("x") },
  );
});

// ---- derivation ----------------------------------------------------------

test("a two-input claim of restricted + public derives restricted and the trace names the restricting input", () => {
  const claims = [
    claim("conversation", withVisibility({ audiences: ["author"] })),
    claim("shared-doc", withVisibility("public")),
    claim("distilled", { derivedFrom: ["conversation", "shared-doc"] }),
  ];
  const derived = visibilityOf(claims, "distilled");
  assert.deepEqual(derived.visibility, restricted("author"));
  assert.deepEqual(derived.trace.filter((entry) => entry.restricts).map((entry) => entry.claimId), ["conversation"]);
  const doc = derived.trace.find((entry) => entry.claimId === "shared-doc");
  assert.deepEqual(doc, { claimId: "shared-doc", role: "input", basis: "declared", visibility: PUBLIC, restricts: false });
  // The public input stays public for everyone: deriving did not narrow it.
  assert.deepEqual(visibilityOf(claims, "shared-doc").visibility, PUBLIC);
  // A viewer who can see the document but not the conversation cannot see the fact distilled from both.
  assert.equal(visibilityAllows(derived.visibility, { audiences: [] }), false);
  assert.equal(visibilityAllows(derived.visibility, { audiences: ["author"] }), true);
});

test("derived visibility is the intersection of input audiences, through derivationEdges and transitively", () => {
  const claims = [
    claim("a", withVisibility({ audiences: ["x", "y"] })),
    claim("b", withVisibility({ audiences: ["y", "z"] })),
    claim("mid", { derivationEdges: [{ inputClaimId: "a", supportStrength: "strong" }] , ...withVisibility("public") }),
    claim("top", { derivedFrom: ["mid", "b"] }),
  ];
  assert.deepEqual(visibilityOf(claims, "mid").visibility, restricted("x", "y"));
  const top = visibilityOf(claims, "top");
  assert.deepEqual(top.visibility, restricted("y"));
  assert.deepEqual(top.trace.filter((entry) => entry.restricts).map((entry) => entry.claimId), ["a", "b"]);
});

test("the derived claim may narrow its inputs but never widen them", () => {
  const inputs = [claim("p", withVisibility("public")), claim("q", withVisibility({ audiences: ["staff"] }))];
  const narrower = [...inputs, claim("d", { derivedFrom: ["p", "q"], ...withVisibility({ audiences: ["owner"] }) })];
  assert.deepEqual(visibilityOf(narrower, "d").visibility, SEALED, "owner ∩ staff has no viewer");
  const wider = [...inputs, claim("d", { derivedFrom: ["p", "q"], ...withVisibility("public") })];
  assert.deepEqual(visibilityOf(wider, "d").visibility, restricted("staff"));
});

test("a derived claim that declares nothing is bounded by its inputs; a leaf that declares nothing is sealed", () => {
  const claims = [claim("in", withVisibility({ audiences: ["staff"] })), claim("d", { derivedFrom: ["in"] }), claim("leaf")];
  const derived = visibilityOf(claims, "d");
  assert.deepEqual(derived.visibility, restricted("staff"));
  assert.deepEqual(derived.trace[0], { claimId: "d", role: "self", basis: "undeclared", visibility: PUBLIC, restricts: false });
  const leaf = visibilityOf(claims, "leaf");
  assert.deepEqual(leaf.visibility, SEALED);
  assert.deepEqual(leaf.trace.map((entry) => [entry.claimId, entry.basis]), [["leaf", "undeclared"]]);
});

test("fail closed: an input with no visibility seals the derived claim and is named", () => {
  const claims = [
    claim("public-in", withVisibility("public")),
    claim("silent-in"),
    claim("d", { derivedFrom: ["public-in", "silent-in"], ...withVisibility("public") }),
  ];
  const derived = visibilityOf(claims, "d");
  assert.deepEqual(derived.visibility, SEALED);
  assert.deepEqual(derived.trace.filter((entry) => entry.restricts).map((entry) => [entry.claimId, entry.basis]), [["silent-in", "undeclared"]]);
});

test("fail closed: unreadable visibility, a missing input claim, and a silent transitive input all seal", () => {
  const unreadable = [claim("u", withVisibility("everyone")), claim("d", { derivedFrom: ["u"] })];
  assert.deepEqual(visibilityOf(unreadable, "d").visibility, SEALED);
  assert.equal(visibilityOf(unreadable, "d").trace.find((entry) => entry.claimId === "u")?.basis, "unrecognized");

  const missing = [claim("pub", withVisibility("public")), claim("d", { derivedFrom: ["pub", "ghost"] })];
  const derivedMissing = deriveClaimVisibility(missing[1]!, new Map(missing.map((c) => [c.id, c])));
  assert.deepEqual(derivedMissing.visibility, SEALED);
  assert.deepEqual(derivedMissing.trace.find((entry) => entry.claimId === "ghost"), { claimId: "ghost", role: "input", basis: "missing-claim", visibility: SEALED, restricts: true });

  const deep = [claim("silent"), claim("mid", { derivedFrom: ["silent"], ...withVisibility("public") }), claim("top", { derivedFrom: ["mid"], ...withVisibility("public") })];
  assert.deepEqual(visibilityOf(deep, "top").visibility, SEALED);
});

test("a derivation cycle terminates and still takes the meet", () => {
  const a = claim("a", { derivedFrom: ["b"], ...withVisibility({ audiences: ["x", "y"] }) });
  const b = claim("b", { derivedFrom: ["a"], ...withVisibility({ audiences: ["y", "z"] }) });
  const outcome = deriveClaimVisibility(a, new Map([[a.id, a], [b.id, b]]));
  assert.deepEqual(outcome.visibility, restricted("y"));
});

test("applyDerivation carries the visibility next to the status ceiling", () => {
  const input = claim("in", withVisibility({ audiences: ["staff"] }));
  const derived = claim("d", { derivedFrom: ["in"] });
  const outcome = applyDerivation({
    claim: derived,
    ownStatus: "verified",
    ownStatusByClaimId: new Map([["in", "verified"]]),
    claimsById: new Map([[input.id, input], [derived.id, derived]]),
    now: NOW,
  });
  assert.equal(outcome.status, "verified");
  assert.deepEqual(outcome.visibility.visibility, restricted("staff"));
});

// ---- property: omission never widens -------------------------------------

const VIEWER_UNIVERSE = ["a", "b", "c"];
function allViewers(): ViewerContext[] {
  const viewers: ViewerContext[] = [];
  for (let mask = 0; mask < 1 << VIEWER_UNIVERSE.length; mask++) {
    viewers.push({ audiences: VIEWER_UNIVERSE.filter((_, index) => (mask >> index) & 1) });
  }
  return viewers;
}

const DECLARATIONS: Array<Visibility> = [PUBLIC, restricted("a"), restricted("a", "b"), restricted("b", "c"), SEALED];

function wrapDeclaration(visibility: Visibility): Partial<Claim> {
  return withVisibility(visibility.kind === "public" ? "public" : { audiences: visibility.audiences });
}

test("property: removing or corrupting the visibility of any input never widens the derived visibility", () => {
  const viewers = allViewers();
  const shape = (inputCount: number, declarations: Visibility[], broken: number | undefined, how: "remove" | "junk" | "ghost"): { claims: Claim[]; ids: string[] } => {
    const ids = declarations.slice(0, inputCount).map((_, index) => `in-${index}`);
    const claims = declarations.slice(0, inputCount).map((declaration, index) => {
      if (index !== broken) return claim(ids[index]!, wrapDeclaration(declaration));
      if (how === "remove") return claim(ids[index]!);
      if (how === "junk") return claim(ids[index]!, withVisibility("everybody"));
      return undefined;
    }).filter((value): value is Claim => value !== undefined);
    return { claims: [...claims, claim("d", { derivedFrom: ids })], ids };
  };

  let compared = 0;
  let strictlyNarrowed = 0;
  for (let inputCount = 1; inputCount <= 3; inputCount++) {
    const total = DECLARATIONS.length ** inputCount;
    for (let code = 0; code < total; code++) {
      const declarations: Visibility[] = [];
      for (let slot = 0, rest = code; slot < inputCount; slot++, rest = Math.floor(rest / DECLARATIONS.length)) {
        declarations.push(DECLARATIONS[rest % DECLARATIONS.length]!);
      }
      const baselineShape = shape(inputCount, declarations, undefined, "remove");
      const baseline = deriveClaimVisibility(baselineShape.claims.at(-1)!, new Map(baselineShape.claims.map((c) => [c.id, c]))).visibility;
      for (let broken = 0; broken < inputCount; broken++) {
        for (const how of ["remove", "junk", "ghost"] as const) {
          const mutated = shape(inputCount, declarations, broken, how);
          const after = deriveClaimVisibility(mutated.claims.at(-1)!, new Map(mutated.claims.map((c) => [c.id, c]))).visibility;
          for (const viewer of viewers) {
            if (visibilityAllows(after, viewer)) {
              assert.ok(
                visibilityAllows(baseline, viewer),
                `omission widened visibility: inputs=${JSON.stringify(declarations)} broke #${broken} (${how}) viewer=${JSON.stringify(viewer.audiences)}`,
              );
            }
          }
          // Omission is sealed, not merely "no wider": nobody gains access and nobody keeps it.
          assert.deepEqual(after, SEALED, `inputs=${JSON.stringify(declarations)} broke #${broken} (${how})`);
          if (JSON.stringify(baseline) !== JSON.stringify(SEALED)) strictlyNarrowed++;
          compared++;
        }
      }
    }
  }
  assert.ok(compared > 1000, `property covered too little: ${compared}`);
  assert.ok(strictlyNarrowed > 100, "the property never saw a case where omission changed the answer");
});

test("property: the derived visibility admits exactly the viewers every input admits", () => {
  const viewers = allViewers();
  const ids = ["i0", "i1", "i2"];
  for (let code = 0; code < DECLARATIONS.length ** 3; code++) {
    const declarations = ids.map((_, slot) => DECLARATIONS[Math.floor(code / DECLARATIONS.length ** slot) % DECLARATIONS.length]!);
    const claims = [...ids.map((id, index) => claim(id, wrapDeclaration(declarations[index]!))), claim("d", { derivedFrom: ids })];
    const derived = deriveClaimVisibility(claims.at(-1)!, new Map(claims.map((c) => [c.id, c]))).visibility;
    for (const viewer of viewers) {
      // Audience labels are intersected, so a viewer is admitted when their labels reach every input.
      const everyInput = declarations.every((declaration) => visibilityAllows(declaration, viewer));
      if (visibilityAllows(derived, viewer)) {
        assert.ok(everyInput, `derived admits a viewer an input refuses: ${JSON.stringify(declarations)} / ${JSON.stringify(viewer.audiences)}`);
      }
    }
  }
});

// ---- supersession per visibility context ---------------------------------

test("a viewer without access to the newer value sees the prior value as current, with no trace of the newer one", () => {
  // v1 is public. v2 replaces v1 and is distilled from a private conversation plus a public document.
  const claims = [
    claim("conversation", withVisibility({ audiences: ["staff"] })),
    claim("shared-doc", withVisibility("public")),
    claim("v1", withVisibility("public", { value: "old" })),
    claim("v2", { value: "new", derivedFrom: ["conversation", "shared-doc"] }),
  ];
  const snapshot = deriveTrustSnapshot(bundle(claims), { now: NOW });
  const visibilityByClaimId = new Map(Object.entries(snapshot.visibilityByClaimId).map(([id, derived]) => [id, derived.visibility]));
  const edges = [{ predecessorId: "v1", successorId: "v2", visibility: PUBLIC }];

  const outsider = viewerSupersessionView({ visibilityByClaimId, edges, viewer: { audiences: ["client"] } });
  assert.deepEqual(outsider.currentClaimIds.filter((id) => id.startsWith("v")), ["v1"]);
  assert.deepEqual({ ...outsider.supersededBy }, {});
  assert.deepEqual(
    supersessionStatusRecomputeClaimIds({ visibilityByClaimId, edges, viewer: { audiences: ["client"] } }),
    ["v1"],
    "v1's stored status may encode v2; the host must not serve it as is",
  );
  const leaked = JSON.stringify(outsider);
  assert.ok(!leaked.includes("v2") && !leaked.includes("conversation"), `view leaks a hidden claim: ${leaked}`);
  assert.ok(!("recomputeStatusClaimIds" in outsider), "the host-only list is not part of the viewer view");

  const insider = viewerSupersessionView({ visibilityByClaimId, edges, viewer: { audiences: ["staff"] } });
  assert.deepEqual(insider.currentClaimIds.filter((id) => id.startsWith("v")), ["v2"]);
  assert.deepEqual({ ...insider.supersededBy }, { v1: ["v2"] });
  assert.deepEqual(supersessionStatusRecomputeClaimIds({ visibilityByClaimId, edges, viewer: { audiences: ["staff"] } }), []);

  // Anonymous viewer: public-only.
  const anonymous = viewerSupersessionView({ visibilityByClaimId, edges, viewer: { audiences: [] } });
  assert.deepEqual(anonymous.currentClaimIds.filter((id) => id.startsWith("v")), ["v1"]);
});

test("supersession chains collapse through hidden claims and a claim with no visibility is hidden", () => {
  const visibilityByClaimId = new Map<string, Visibility>([
    ["v1", PUBLIC],
    ["v2", restricted("staff")],
    ["v3", PUBLIC],
    // v4 has no entry at all.
  ]);
  const edges = [
    { predecessorId: "v1", successorId: "v2", visibility: PUBLIC },
    { predecessorId: "v2", successorId: "v3", visibility: PUBLIC },
    { predecessorId: "v3", successorId: "v4", visibility: PUBLIC },
  ];
  const outsider = viewerSupersessionView({ visibilityByClaimId, edges, viewer: { audiences: [] } });
  assert.deepEqual(outsider.visibleClaimIds, ["v1", "v3"]);
  assert.deepEqual({ ...outsider.supersededBy }, { v1: ["v3"] });
  assert.deepEqual(outsider.currentClaimIds, ["v3"]);
  assert.deepEqual(supersessionStatusRecomputeClaimIds({ visibilityByClaimId, edges, viewer: { audiences: [] } }), ["v1", "v3"]);
  assert.ok(!JSON.stringify(outsider).includes("v4"));
  const insider = viewerSupersessionView({ visibilityByClaimId, edges, viewer: { audiences: ["staff"] } });
  assert.deepEqual(insider.currentClaimIds, ["v3"]);
  assert.deepEqual({ ...insider.supersededBy }, { v1: ["v2"], v2: ["v3"] });
});

test("a visible replacement cycle reaches no current value and is reported, not guessed", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC], ["c", PUBLIC]]);
  const view = viewerSupersessionView({
    visibilityByClaimId,
    edges: [{ predecessorId: "a", successorId: "b", visibility: PUBLIC }, { predecessorId: "b", successorId: "a", visibility: PUBLIC }, { predecessorId: "c", successorId: "a", visibility: PUBLIC }],
    viewer: { audiences: [] },
  });
  assert.deepEqual(view.currentClaimIds, []);
  assert.deepEqual(view.unresolvedClaimIds, ["a", "b", "c"]);
});

test("the viewer view is byte-identical whether or not a hidden successor exists", () => {
  const without = new Map<string, Visibility>([["old", PUBLIC], ["other", PUBLIC]]);
  const withHidden = new Map<string, Visibility>([...without, ["secret", restricted("staff")], ["sealed", SEALED]]);
  const viewer = { audiences: ["client"] };
  const a = viewerSupersessionView({ visibilityByClaimId: without, edges: [], viewer });
  const b = viewerSupersessionView({
    visibilityByClaimId: withHidden,
    edges: [{ predecessorId: "old", successorId: "secret", visibility: PUBLIC }, { predecessorId: "secret", successorId: "sealed", visibility: PUBLIC }, { predecessorId: "other", successorId: "sealed", visibility: PUBLIC }],
    viewer,
  });
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});

test("a sealed claim is visible to no viewer, whatever audiences the viewer holds", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["open", PUBLIC], ["sealed", SEALED], ["staff-only", restricted("staff")]]);
  for (const audiences of [[], ["staff"], ["staff", "client", "x"]]) {
    const view = viewerSupersessionView({ visibilityByClaimId, edges: [], viewer: { audiences } });
    assert.ok(!view.visibleClaimIds.includes("sealed"), `sealed visible to ${JSON.stringify(audiences)}`);
    assert.ok(!view.currentClaimIds.includes("sealed"));
  }
});

test("a claim that replaces itself reaches no current value", () => {
  const view = viewerSupersessionView({
    visibilityByClaimId: new Map<string, Visibility>([["old", PUBLIC]]),
    edges: [{ predecessorId: "old", successorId: "old", visibility: PUBLIC }],
    viewer: { audiences: [] },
  });
  assert.deepEqual(view.currentClaimIds, []);
  assert.deepEqual(view.unresolvedClaimIds, ["old"]);
});

// ---- hardening: shapes a validated bundle cannot reach but a direct caller can ----

test("a declaration inherited through a prototype is not a declaration", () => {
  const inherited = Object.create({ visibility: "public", disclosure: { visibility: "public" } }) as Record<string, unknown>;
  assert.deepEqual(readDeclaredVisibility({ metadata: inherited }), { state: "undeclared" });
  const own = Object.create({ visibility: "public" }) as Record<string, unknown>;
  own.visibility = { audiences: ["staff"] };
  assert.deepEqual(readDeclaredVisibility({ metadata: own }), { state: "declared", visibility: restricted("staff") });
  // Deleting the own restriction must not fall back to the inherited public one.
  delete own.visibility;
  assert.deepEqual(readDeclaredVisibility({ metadata: own }), { state: "undeclared" });
  const inheritedAudiences = { visibility: Object.create({ audiences: ["staff"] }) as Record<string, unknown> };
  assert.deepEqual(readDeclaredVisibility({ metadata: inheritedAudiences }), { state: "unrecognized" });
});

test("a claim that lists only itself as an input has no input to be bounded by", () => {
  const self = claim("d", { derivedFrom: ["d"] });
  assert.deepEqual(deriveClaimVisibility(self, new Map()).visibility, SEALED);
});

test("an unreadable declaration on a derived claim itself is sealed, not bounded by its inputs", () => {
  const inputs = [claim("in", withVisibility("public"))];
  const unreadable = [...inputs, claim("d", { derivedFrom: ["in"], ...withVisibility("everyone") })];
  const derived = visibilityOf(unreadable, "d");
  assert.deepEqual(derived.visibility, SEALED);
  assert.equal(derived.trace[0]?.basis, "unrecognized");
});

test("two claims carrying one id seal everything built on that id, in either order", () => {
  const priv = claim("dup", withVisibility({ audiences: ["staff"] }));
  const pub = claim("dup", withVisibility("public"));
  for (const order of [[priv, pub], [pub, priv]]) {
    // Not validated: duplicate ids are rejected by validateTrustBundle, but deriveTrustSnapshot accepts unvalidated bundles.
    const snapshot = deriveTrustSnapshot({ schemaVersion: 3, source: "t", claims: [...order, claim("d", { derivedFrom: ["dup"], ...withVisibility("public") })], evidence: [], policies: [], events: [] }, { now: NOW });
    const derived = snapshot.visibilityByClaimId["d"]!;
    assert.deepEqual(derived.visibility, SEALED);
    assert.deepEqual(derived.trace.find((entry) => entry.claimId === "dup")?.basis, "duplicate-claim");
  }
});

// ---- edge-level visibility (accumulation extension point) ----

test("a restricted edge is not followed for a viewer who may not see it, even when both endpoints are visible", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["old", PUBLIC], ["new", PUBLIC]]);
  const edges = [{ predecessorId: "old", successorId: "new", visibility: restricted("staff") }];
  const outsider = { visibilityByClaimId, edges, viewer: { audiences: ["client"] } };
  assert.deepEqual(viewerSupersessionView(outsider).currentClaimIds, ["new", "old"]);
  assert.deepEqual({ ...viewerSupersessionView(outsider).supersededBy }, {});
  assert.deepEqual(supersessionStatusRecomputeClaimIds(outsider), ["old"]);
  const insider = { visibilityByClaimId, edges, viewer: { audiences: ["staff"] } };
  assert.deepEqual(viewerSupersessionView(insider).currentClaimIds, ["new"]);
  assert.deepEqual(supersessionStatusRecomputeClaimIds(insider), []);
});

test("an edge visibility can only narrow: a public edge does not reveal hidden endpoints", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["old", PUBLIC], ["new", restricted("staff")]]);
  const view = viewerSupersessionView({
    visibilityByClaimId,
    edges: [{ predecessorId: "old", successorId: "new", visibility: PUBLIC }],
    viewer: { audiences: [] },
  });
  assert.deepEqual(view.currentClaimIds, ["old"]);
  assert.ok(!JSON.stringify(view).includes("new"));
});

test("a malformed visibility value is visible to no one", () => {
  for (const bad of [null, {}, { kind: "restricted" }, { kind: "restricted", audiences: "staff" }, { kind: "everyone" }]) {
    assert.equal(visibilityAllows(bad as unknown as Visibility, { audiences: ["staff"] }), false, JSON.stringify(bad));
  }
});

// ---- delta-review regressions ----

test("a path that returns to a visible claim only through hidden claims changes nothing the viewer sees", () => {
  const viewer = { audiences: [] };
  const plain = new Map<string, Visibility>([["old", PUBLIC], ["other", PUBLIC]]);
  const hidden = new Map<string, Visibility>([...plain, ["secret", restricted("staff")], ["sealed", SEALED]]);
  const baseline = JSON.stringify(viewerSupersessionView({ visibilityByClaimId: plain, edges: [], viewer }));
  for (const edges of [
    [{ predecessorId: "old", successorId: "secret", visibility: PUBLIC }, { predecessorId: "secret", successorId: "old", visibility: PUBLIC }],
    [{ predecessorId: "old", successorId: "secret", visibility: PUBLIC }, { predecessorId: "secret", successorId: "sealed", visibility: PUBLIC }, { predecessorId: "sealed", successorId: "old", visibility: PUBLIC }],
  ]) {
    assert.equal(JSON.stringify(viewerSupersessionView({ visibilityByClaimId: hidden, edges, viewer })), baseline);
  }
  // Beside a real visible successor the hidden return branch adds no extra self entry.
  const withNew = new Map<string, Visibility>([["old", PUBLIC], ["new", PUBLIC]]);
  const hiddenToo = new Map<string, Visibility>([...withNew, ["secret", restricted("staff")]]);
  const clean = viewerSupersessionView({ visibilityByClaimId: withNew, edges: [{ predecessorId: "old", successorId: "new", visibility: PUBLIC }], viewer });
  const noisy = viewerSupersessionView({
    visibilityByClaimId: hiddenToo,
    edges: [{ predecessorId: "old", successorId: "new", visibility: PUBLIC }, { predecessorId: "old", successorId: "secret", visibility: PUBLIC }, { predecessorId: "secret", successorId: "old", visibility: PUBLIC }],
    viewer,
  });
  assert.equal(JSON.stringify(noisy), JSON.stringify(clean));
});

test("a direct visible self-replacement stays an unresolved cycle even beside a hidden return path", () => {
  const view = viewerSupersessionView({
    visibilityByClaimId: new Map<string, Visibility>([["old", PUBLIC], ["secret", restricted("staff")]]),
    edges: [{ predecessorId: "old", successorId: "secret", visibility: PUBLIC }, { predecessorId: "secret", successorId: "old", visibility: PUBLIC }, { predecessorId: "old", successorId: "old", visibility: PUBLIC }],
    viewer: { audiences: [] },
  });
  assert.deepEqual(view.unresolvedClaimIds, ["old"]);
  assert.deepEqual({ ...view.supersededBy }, { old: ["old"] });
});

test("a metadata object inherited through a prototype is not the claim's declaration", () => {
  const prototype = { metadata: { visibility: "public" } };
  const own = Object.assign(Object.create(prototype) as object, claim("c", withVisibility({ audiences: ["staff"] })));
  assert.deepEqual(readDeclaredVisibility(own as Claim), { state: "declared", visibility: restricted("staff") });
  delete (own as { metadata?: unknown }).metadata;
  assert.deepEqual(readDeclaredVisibility(own as Claim), { state: "undeclared" });
  const derived = Object.assign(Object.create(prototype) as object, claim("d", { derivedFrom: ["in"] }));
  delete (derived as { metadata?: unknown }).metadata;
  const input = claim("in", withVisibility({ audiences: ["staff"] }));
  assert.deepEqual(deriveClaimVisibility(derived as Claim, new Map([["in", input]])).visibility, restricted("staff"));
});

test("a nested disclosure.visibility inherited through a prototype is not a declaration", () => {
  const disclosure = Object.create({ visibility: "public" }) as Record<string, unknown>;
  assert.deepEqual(readDeclaredVisibility({ metadata: { disclosure } }), { state: "undeclared" });
});

test("a duplicated claim id is sealed in the snapshot's own entry for that id, in either order", () => {
  const priv = claim("dup", withVisibility({ audiences: ["staff"] }));
  const pub = claim("dup", withVisibility("public"));
  for (const order of [[priv, pub], [pub, priv]]) {
    const snapshot = deriveTrustSnapshot({ schemaVersion: 3, source: "t", claims: order, evidence: [], policies: [], events: [] }, { now: NOW });
    assert.deepEqual(snapshot.visibilityByClaimId["dup"]?.visibility, SEALED);
    assert.equal(snapshot.visibilityByClaimId["dup"]?.trace[0]?.basis, "duplicate-claim");
  }
});

// ---- delta-review 2 regressions ----

const edge = (predecessorId: string, successorId: string, visibility: Visibility = PUBLIC) => ({ predecessorId, successorId, visibility });

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

test("a cycle that exists only through hidden claims changes nothing the viewer sees, in every edge and map order", () => {
  const viewer = { audiences: [] };
  const plain = JSON.stringify(viewerSupersessionView({ visibilityByClaimId: new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC]]), edges: [], viewer }));
  const entries: Array<[string, Visibility]> = [["a", PUBLIC], ["b", PUBLIC], ["h1", restricted("staff")], ["h2", SEALED]];
  const edges = [edge("a", "h1"), edge("h1", "b"), edge("b", "h2"), edge("h2", "a")];
  for (const edgeOrder of permutations(edges)) {
    for (const entryOrder of permutations(entries)) {
      assert.equal(JSON.stringify(viewerSupersessionView({ visibilityByClaimId: new Map(entryOrder), edges: edgeOrder, viewer })), plain);
    }
  }
});

test("acyclic collapse through a hidden claim is kept: the viewer sees the visible far successor win", () => {
  const view = viewerSupersessionView({
    visibilityByClaimId: new Map<string, Visibility>([["a", PUBLIC], ["h", restricted("staff")], ["c", PUBLIC]]),
    edges: [edge("a", "h"), edge("h", "c")],
    viewer: { audiences: [] },
  });
  assert.deepEqual({ ...view.supersededBy }, { a: ["c"] });
  assert.deepEqual(view.currentClaimIds, ["c"]);
});

test("a cycle with an escape selects no winner: everything linked to it is unresolved", () => {
  const abc = new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC], ["c", PUBLIC], ["z", PUBLIC]]);
  const viewer = { audiences: [] };
  const escape = viewerSupersessionView({ visibilityByClaimId: abc, edges: [edge("a", "b"), edge("b", "a"), edge("b", "c")], viewer });
  assert.deepEqual(escape.currentClaimIds, ["z"], "z is unrelated and stays current");
  assert.deepEqual(escape.unresolvedClaimIds, ["a", "b", "c"]);
  const selfEscape = viewerSupersessionView({ visibilityByClaimId: abc, edges: [edge("a", "a"), edge("a", "b")], viewer });
  assert.deepEqual(selfEscape.currentClaimIds, ["c", "z"]);
  assert.deepEqual(selfEscape.unresolvedClaimIds, ["a", "b"]);
});

test("the serialized view does not depend on edge order or map insertion order", () => {
  const entries: Array<[string, Visibility]> = [["x", PUBLIC], ["y", PUBLIC], ["z", PUBLIC], ["w", PUBLIC]];
  const edges = [edge("x", "z"), edge("x", "y"), edge("w", "x"), edge("w", "z")];
  const seen = new Set<string>();
  for (const edgeOrder of permutations(edges)) {
    for (const entryOrder of permutations(entries)) {
      seen.add(JSON.stringify(viewerSupersessionView({ visibilityByClaimId: new Map(entryOrder), edges: edgeOrder, viewer: { audiences: [] } })));
    }
  }
  assert.equal(seen.size, 1, `view depends on input order: ${[...seen].join("\n")}`);
});

test("an edge with no visibility decision is not followed: omission never reveals a supersession", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC]]);
  const viewer = { audiences: ["staff"] };
  const omitted = { predecessorId: "a", successorId: "b" } as unknown as { predecessorId: string; successorId: string; visibility: Visibility };
  for (const edges of [[omitted], [{ ...omitted, visibility: {} as Visibility }], [{ ...omitted, visibility: null as unknown as Visibility }]]) {
    const view = viewerSupersessionView({ visibilityByClaimId, edges, viewer });
    assert.deepEqual(view.currentClaimIds, ["a", "b"]);
    assert.deepEqual({ ...view.supersededBy }, {});
    assert.deepEqual(supersessionStatusRecomputeClaimIds({ visibilityByClaimId, edges, viewer }), ["a"]);
  }
});

test("the host-only edge trace names why each edge did or did not apply", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC], ["h", restricted("staff")]]);
  const decisions = supersessionEdgeDecisions({
    visibilityByClaimId,
    edges: [edge("a", "b"), edge("b", "a", restricted("staff")), edge("a", "h")],
    viewer: { audiences: [] },
  });
  assert.deepEqual(decisions, [
    { predecessorId: "a", successorId: "b", outcome: "followed" },
    { predecessorId: "a", successorId: "h", outcome: "endpoint-hidden" },
    { predecessorId: "b", successorId: "a", outcome: "edge-restricted" },
  ]);
});

test("fuzz: hidden sinks and hidden sources never change the viewer's view", () => {
  let state = 0x2f6e2b1;
  const next = (bound: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % bound;
  };
  const viewer = { audiences: ["client"] };
  let compared = 0;
  for (let round = 0; round < 300; round++) {
    const size = 2 + next(5);
    const ids = Array.from({ length: size }, (_, index) => `v${index}`);
    const visibleEdges: ReturnType<typeof edge>[] = [];
    for (let count = next(size + 2); count > 0; count--) visibleEdges.push(edge(ids[next(size)]!, ids[next(size)]!));
    const entries: Array<[string, Visibility]> = ids.map((id) => [id, PUBLIC]);
    const baseline = JSON.stringify(viewerSupersessionView({ visibilityByClaimId: new Map(entries), edges: visibleEdges, viewer }));

    const hiddenEntries: Array<[string, Visibility]> = [...entries];
    const edges = [...visibleEdges];
    const hiddenCount = 1 + next(3);
    for (let index = 0; index < hiddenCount; index++) {
      const hidden = `h${index}`;
      hiddenEntries.push([hidden, index % 2 === 0 ? restricted("staff") : SEALED]);
      // A hidden sink (edges into it) or a hidden source (edges out of it): no path runs through it.
      for (let count = 1 + next(3); count > 0; count--) {
        const visibleId = ids[next(size)]!;
        edges.push(index % 3 === 0 ? edge(visibleId, hidden) : edge(hidden, visibleId));
      }
    }
    assert.equal(
      JSON.stringify(viewerSupersessionView({ visibilityByClaimId: new Map(hiddenEntries), edges, viewer })),
      baseline,
      `round ${round}: a hidden claim with no path through it changed the view`,
    );
    compared++;
  }
  assert.equal(compared, 300);
});

// ---- delta-review 3 regressions ----

test("an edge decision with any unreadable audience is visible to no one, not merely that audience", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC]]);
  const viewer = { audiences: ["staff"] };
  for (const bad of [{ kind: "restricted", audiences: ["staff", 42] }, { kind: "restricted", audiences: ["staff", ""] }, { kind: "restricted", audiences: ["staff", null] }]) {
    assert.equal(visibilityAllows(bad as unknown as Visibility, viewer), false, JSON.stringify(bad));
    const view = viewerSupersessionView({ visibilityByClaimId, edges: [edge("a", "b", bad as unknown as Visibility)], viewer });
    assert.deepEqual(view.currentClaimIds, ["a", "b"], JSON.stringify(bad));
  }
});

test("a collapse that enters a visible cycle pulls the claim into the unresolved set", () => {
  const view = viewerSupersessionView({
    visibilityByClaimId: new Map<string, Visibility>([["a", PUBLIC], ["z", PUBLIC], ["h", restricted("staff")]]),
    edges: [edge("a", "a"), edge("z", "h"), edge("h", "a")],
    viewer: { audiences: [] },
  });
  assert.deepEqual({ ...view.supersededBy }, { a: ["a"], z: ["a"] });
  assert.deepEqual(view.unresolvedClaimIds, ["a", "z"]);
  assert.deepEqual(view.currentClaimIds, []);
});

test("the host-only edge trace calls an edge with no decision restricted, not endpoint-hidden", () => {
  const omitted = { predecessorId: "a", successorId: "b" } as unknown as ReturnType<typeof edge>;
  const decisions = supersessionEdgeDecisions({
    visibilityByClaimId: new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC]]),
    edges: [omitted],
    viewer: { audiences: [] },
  });
  assert.deepEqual(decisions, [{ predecessorId: "a", successorId: "b", outcome: "edge-restricted" }]);
});

test("the host-only edge trace is canonical for duplicate edges with different decisions", () => {
  const visibilityByClaimId = new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC]]);
  const open = edge("a", "b");
  const closed = edge("a", "b", restricted("staff"));
  const forward = supersessionEdgeDecisions({ visibilityByClaimId, edges: [open, closed], viewer: { audiences: [] } });
  const reverse = supersessionEdgeDecisions({ visibilityByClaimId, edges: [closed, open], viewer: { audiences: [] } });
  assert.deepEqual(forward, reverse);
});

test("a long alternating chain of visible and hidden claims stays cheap", () => {
  const size = 4000;
  const visibilityByClaimId = new Map<string, Visibility>();
  const edges: ReturnType<typeof edge>[] = [];
  for (let index = 0; index < size; index++) visibilityByClaimId.set(`c${index}`, index % 2 === 0 ? PUBLIC : restricted("staff"));
  for (let index = 0; index < size - 1; index++) edges.push(edge(`c${index}`, `c${index + 1}`));
  const started = Date.now();
  const view = viewerSupersessionView({ visibilityByClaimId, edges, viewer: { audiences: [] } });
  assert.equal(view.visibleClaimIds.length, size / 2);
  assert.deepEqual(view.currentClaimIds, [`c${size - 2}`]);
  assert.ok(Date.now() - started < 5000, "supersession on a few thousand claims must not blow up");
});

// ---- delta-review 4 regressions ----

test("a sparse or method-overriding audience list is unreadable as a whole", () => {
  // Methods that always answer "yes" would let a malformed list pass if they were trusted.
  const lying = Object.assign(["staff", 42], { every: () => true, some: () => true }) as unknown[];
  const sparse = Object.assign(new Array(2), { 0: "staff" }) as unknown[];
  const viewer = { audiences: ["staff"] };
  for (const audiences of [sparse, lying]) {
    const bad = { kind: "restricted", audiences } as unknown as Visibility;
    assert.equal(visibilityAllows(bad, viewer), false);
    assert.deepEqual(viewerSupersessionView({ visibilityByClaimId: new Map([["secret", bad]]), edges: [], viewer }).visibleClaimIds, []);
    const view = viewerSupersessionView({
      visibilityByClaimId: new Map<string, Visibility>([["a", PUBLIC], ["b", PUBLIC]]),
      edges: [edge("a", "b", bad)],
      viewer,
    });
    assert.deepEqual(view.currentClaimIds, ["a", "b"]);
  }
  // The declaration parser rejects the same shapes.
  assert.deepEqual(readDeclaredVisibility({ metadata: { visibility: { audiences: sparse } } }), { state: "unrecognized" });
  assert.deepEqual(readDeclaredVisibility({ metadata: { visibility: { audiences: lying } } }), { state: "unrecognized" });
  // A well-formed list from a subclass is still fine.
  assert.equal(visibilityAllows({ kind: "restricted", audiences: Array.from(["staff"]) }, viewer), true);
});

test("viewer audiences that are not strings never match", () => {
  assert.equal(visibilityAllows(restricted("42"), { audiences: [42 as unknown as string] }), false);
  // A viewer list with anything unreadable in it holds no audience at all.
  assert.equal(visibilityAllows(restricted("staff"), { audiences: [42 as unknown as string, "staff"] }), false);
});

test("a hole in an audience list is not filled from the prototype chain", () => {
  const sparse = Object.assign(new Array(2), { 0: "staff" }) as unknown[];
  const prototype = Array.prototype as unknown as Record<number, unknown>;
  prototype[1] = "staff";
  try {
    assert.equal(sparse[1], "staff", "the inherited index fills the hole when read");
    assert.equal(visibilityAllows({ kind: "restricted", audiences: sparse as string[] }, { audiences: ["staff"] }), false);
    assert.deepEqual(readDeclaredVisibility({ metadata: { visibility: { audiences: sparse } } }), { state: "unrecognized" });
  } finally {
    delete prototype[1];
  }
});

// ---- delta-review 5 regressions ----

test("a viewer audience list is read by index: a custom iterator grants nothing", () => {
  class Sneaky extends Array<string> {
    override [Symbol.iterator](): ArrayIterator<string> { return ["staff"][Symbol.iterator](); }
  }
  const viewer = { audiences: Sneaky.of("private") };
  assert.equal(visibilityAllows(restricted("staff"), viewer), false);
  const view = viewerSupersessionView({
    visibilityByClaimId: new Map<string, Visibility>([["old", PUBLIC], ["new", restricted("staff")]]),
    edges: [edge("old", "new")],
    viewer,
  });
  assert.deepEqual(view.currentClaimIds, ["old"]);
});

test("meetVisibility is total: an unvalidated restricted value contributes sealed, never wider", () => {
  const sneaky = Object.assign(["private"], { [Symbol.iterator]: () => ["staff"][Symbol.iterator]() }) as unknown as string[];
  const sparse = Object.assign(new Array(2), { 0: "staff" }) as string[];
  for (const bad of [
    { kind: "restricted", audiences: ["staff", 42] },
    { kind: "restricted", audiences: sparse },
    { kind: "restricted", audiences: "staff" },
    { kind: "restricted" },
    { kind: "everyone" },
    null,
    undefined,
    {},
  ]) {
    assert.deepEqual(meetVisibility(bad as unknown as Visibility), SEALED, JSON.stringify(bad));
    assert.deepEqual(meetVisibility(PUBLIC, bad as unknown as Visibility), SEALED);
  }
  assert.deepEqual(meetVisibility({ kind: "restricted", audiences: sneaky }), restricted("private"));
  assert.deepEqual(meetVisibility({ kind: "restricted", audiences: ["staff"] }, { kind: "restricted", audiences: ["staff", 42] } as unknown as Visibility), SEALED);
});

test("a maximum-length sparse list is refused at once, never scanned", () => {
  const huge = Object.assign(new Array(2 ** 32 - 1), { 0: "staff" }) as string[];
  const started = Date.now();
  // As the viewer's list.
  assert.equal(visibilityAllows(restricted("staff"), { audiences: huge }), false);
  assert.equal(visibilityAllows(PUBLIC, { audiences: huge }), true, "public needs no audience");
  // As a visibility's list, through every consumer.
  assert.equal(visibilityAllows({ kind: "restricted", audiences: huge }, { audiences: ["staff"] }), false);
  assert.deepEqual(readDeclaredVisibility({ metadata: { visibility: { audiences: huge } } }), { state: "unrecognized" });
  assert.deepEqual(meetVisibility({ kind: "restricted", audiences: huge }), SEALED);
  assert.ok(Date.now() - started < 2000, "an over-long list was scanned element by element");
});

test("the audience bound refuses max + 1 and accepts max", () => {
  const atMax = Array.from({ length: MAX_AUDIENCES }, (_, index) => `a${index}`);
  assert.equal(visibilityAllows({ kind: "restricted", audiences: atMax }, { audiences: ["a0"] }), true);
  assert.equal(visibilityAllows(restricted("a0"), { audiences: atMax }), true);
  const over = [...atMax, "extra"];
  assert.equal(visibilityAllows({ kind: "restricted", audiences: over }, { audiences: ["a0"] }), false);
  assert.equal(visibilityAllows(restricted("a0"), { audiences: over }), false);
});

