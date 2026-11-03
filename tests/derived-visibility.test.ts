import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDerivation,
  deriveClaimVisibility,
  deriveTrustSnapshot,
  supersessionStatusRecomputeClaimIds,
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
  const edges = [{ predecessorId: "v1", successorId: "v2" }];

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
    { predecessorId: "v1", successorId: "v2" },
    { predecessorId: "v2", successorId: "v3" },
    { predecessorId: "v3", successorId: "v4" },
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
    edges: [{ predecessorId: "a", successorId: "b" }, { predecessorId: "b", successorId: "a" }, { predecessorId: "c", successorId: "a" }],
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
    edges: [{ predecessorId: "old", successorId: "secret" }, { predecessorId: "secret", successorId: "sealed" }, { predecessorId: "other", successorId: "sealed" }],
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
    edges: [{ predecessorId: "old", successorId: "old" }],
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
