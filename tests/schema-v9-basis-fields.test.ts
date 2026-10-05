/**
 * Hachure 0.17.0: schemaVersion 9 (`evidence.inconclusive`,
 * `evidence.collectedByKind`), `checkBasisInvariants`, and the
 * basis-annotations profile (`metadata.sourceOfRecord`, `metadata.estimate`).
 *
 * Surface's hand-written validator and its ports of the `hachure` profile
 * functions are compared case by case with the specification's own: the
 * vendored JSON schemas (Ajv) and the `hachure` package's functions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";

import {
  TrustBundleBuilder,
  buildTrustReport,
  checkBasisInvariants,
  explainClaim,
  mergeBundlesDetailed,
  resolveSourceOfRecord,
  supportedStatusFunctionVersions,
  validateBasisAnnotations,
  validateTrustBundle,
  type Evidence,
  type TrustBundle,
} from "../src/index.js";
import { claimBasisView } from "../src/display.js";
import { requiredBundleSchemaVersion } from "../src/bundle-schema-version.js";
import { buildMergedConsoleReadModel } from "../src/console/merged-read-model.js";
import { buildSurfaceConsoleProjection } from "../src/console/projection.js";

const Ajv2020 = (Ajv2020Import as unknown as { default?: unknown }).default ?? Ajv2020Import;

function compileSchema(rootFile: string) {
  const AjvCtor = Ajv2020 as new (opts: Record<string, unknown>) => {
    addSchema: (schema: unknown, key: string) => void;
    compile: (schema: unknown) => (data: unknown) => boolean;
  };
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  for (const file of readdirSync("schemas").sort()) {
    if (!file.endsWith(".schema.json") || file === rootFile) continue;
    ajv.addSchema(JSON.parse(readFileSync(join("schemas", file), "utf8")), file);
  }
  return ajv.compile(JSON.parse(readFileSync(join("schemas", rootFile), "utf8")));
}

const schemaValid = compileSchema("trust-bundle.schema.json");

interface HachureBasis {
  checkBasisInvariants: (bundle: unknown) => Array<{ instancePath: string; message: string }>;
  validateBasisAnnotations: (bundle: unknown) => Array<{ instancePath: string; message: string }>;
  resolveSourceOfRecord: (bundle: unknown, evidence: unknown, options?: unknown) => { backed: boolean; reason?: string; revokedAt?: string; trace?: { id: string } };
}
// @ts-expect-error — the hachure package ships no TypeScript types
const hachure = (await import("hachure")) as HachureBasis;

const AT = "2026-06-01T00:00:00.000Z";
const NOW = new Date("2026-06-10T00:00:00.000Z");

const POLICY = {
  id: "policy.test",
  claimType: "check",
  requiredEvidence: ["test_output"],
  acceptanceCriteria: ["tests pass"],
  reviewAuthority: "ci",
  validityRule: { kind: "historical" },
  stalenessTriggers: [],
  conflictRules: [],
  impactLevel: "medium",
};

function claim(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, subjectType: "repo", subjectId: "r1", claimType: "check", fieldOrBehavior: id, value: true,
    createdAt: AT, updatedAt: AT, verificationPolicyId: "policy.test", ...extra,
  };
}

function evidence(id: string, claimId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, claimId, evidenceType: "test_output", method: "validation", sourceRef: `ci://${id}`, excerptOrSummary: id,
    observedAt: AT, collectedBy: "ci", ...extra,
  };
}

const TIMED_OUT = { supportStrength: "cited", inconclusive: { reason: "timeout" } };

function bundle(schemaVersion: number, items: Record<string, unknown>[], claims = [claim("claim.a")], events: unknown[] = []): Record<string, unknown> {
  return { schemaVersion, source: "schema-v9-test", claims, evidence: items, policies: [POLICY], events };
}

function surfaceAccepts(input: unknown): boolean {
  try {
    validateTrustBundle(structuredClone(input));
    return true;
  } catch {
    return false;
  }
}

// ── schemaVersion 9 acceptance and rejection, against the spec schema ──────

const EVIDENCE_CASES: Array<{ name: string; schemaVersion: number; extra: Record<string, unknown>; accepted: boolean }> = [
  { name: "inconclusive at 9", schemaVersion: 9, extra: TIMED_OUT, accepted: true },
  { name: "collectedByKind at 9", schemaVersion: 9, extra: { collectedByKind: "model", passing: true }, accepted: true },
  { name: "reason other with detail", schemaVersion: 9, extra: { supportStrength: "cited", inconclusive: { reason: "other", detail: "harness crashed" } }, accepted: true },
  { name: "no new fields at 9", schemaVersion: 9, extra: { passing: true }, accepted: true },
  { name: "inconclusive at 8", schemaVersion: 8, extra: TIMED_OUT, accepted: false },
  { name: "collectedByKind at 8", schemaVersion: 8, extra: { collectedByKind: "human" }, accepted: false },
  { name: "collectedByKind at 5", schemaVersion: 5, extra: { collectedByKind: "human" }, accepted: false },
  { name: "inconclusive with passing", schemaVersion: 9, extra: { ...TIMED_OUT, passing: false }, accepted: false },
  { name: "inconclusive entailing", schemaVersion: 9, extra: { supportStrength: "entails", inconclusive: { reason: "timeout" } }, accepted: false },
  { name: "inconclusive without supportStrength", schemaVersion: 9, extra: { inconclusive: { reason: "timeout" } }, accepted: false },
  { name: "reason other without detail", schemaVersion: 9, extra: { supportStrength: "cited", inconclusive: { reason: "other" } }, accepted: false },
  { name: "whitespace-only detail (incl. U+00A0, U+FEFF)", schemaVersion: 9, extra: { supportStrength: "cited", inconclusive: { reason: "timeout", detail: "  ﻿\n" } }, accepted: false },
  { name: "unknown reason", schemaVersion: 9, extra: { supportStrength: "cited", inconclusive: { reason: "flaky" } }, accepted: false },
  { name: "missing reason", schemaVersion: 9, extra: { supportStrength: "cited", inconclusive: {} }, accepted: false },
  { name: "unknown inconclusive key", schemaVersion: 9, extra: { supportStrength: "cited", inconclusive: { reason: "timeout", retry: true } }, accepted: false },
  { name: "inconclusive not an object", schemaVersion: 9, extra: { supportStrength: "cited", inconclusive: "timeout" }, accepted: false },
  { name: "unknown collectedByKind", schemaVersion: 9, extra: { collectedByKind: "robot" }, accepted: false },
];

for (const { name, schemaVersion, extra, accepted } of EVIDENCE_CASES) {
  test(`schemaVersion 9 evidence: ${name}`, () => {
    const input = bundle(schemaVersion, [evidence("ev.1", "claim.a", extra)]);
    assert.equal(schemaValid(input), accepted, "specification verdict (vendored JSON schema)");
    assert.equal(surfaceAccepts(input), accepted, "validateTrustBundle verdict");
  });
}

test("schemaVersion 9 round-trips inconclusive and collectedByKind", () => {
  const input = bundle(9, [evidence("ev.1", "claim.a", { ...TIMED_OUT, collectedByKind: "deterministic" })]);
  const validated = validateTrustBundle(structuredClone(input));
  assert.equal(validated.schemaVersion, 9);
  assert.deepEqual(validated.evidence[0]!.inconclusive, { reason: "timeout" });
  assert.equal(validated.evidence[0]!.collectedByKind, "deterministic");
});

test("a declared version below 9 names the field and the version in its refusal", () => {
  assert.throws(
    () => validateTrustBundle(bundle(8, [evidence("ev.1", "claim.a", TIMED_OUT)])),
    /Evidence ev\.1 carries inconclusive, which requires schemaVersion 9 or later \(declared 8\)/,
  );
});

// ── stamping ───────────────────────────────────────────────────────────────

test("requiredBundleSchemaVersion returns 9 only when a v9 field is present", () => {
  const base = { claims: [], policies: [] };
  assert.equal(requiredBundleSchemaVersion({ ...base, evidence: [evidence("e", "c") as unknown as Evidence] }), 5);
  assert.equal(requiredBundleSchemaVersion({ ...base, evidence: [evidence("e", "c", TIMED_OUT) as unknown as Evidence] }), 9);
  assert.equal(requiredBundleSchemaVersion({ ...base, evidence: [evidence("e", "c", { collectedByKind: "model" }) as unknown as Evidence] }), 9);
  // v9 outranks the v8 claim field and v7 vocabulary.
  assert.equal(
    requiredBundleSchemaVersion({
      claims: [{ conclusionConfidence: { value: 0.9, calibration: { tableRef: "t", tableVersion: "1" } } }],
      evidence: [evidence("e", "c", { evidenceType: "runtime_observation", collectedByKind: "model" }) as unknown as Evidence],
      policies: [],
    }),
    9,
  );
});

test("TrustBundleBuilder stamps 9 from content and refuses an explicit 8", () => {
  const { verificationPolicyId: _policy, ...unpoliced } = claim("claim.a");
  const draft = unpoliced as unknown as Parameters<TrustBundleBuilder["addClaim"]>[0];
  const ev = evidence("ev.1", "claim.a", { collectedByKind: "model", passing: true }) as unknown as Evidence;
  const builder = (schemaVersion?: 8) => {
    const b = new TrustBundleBuilder({ source: "b", schemaVersion }).addClaim(draft);
    b.addEvidence(ev);
    return b;
  };
  assert.equal(builder().build().schemaVersion, 9);
  assert.throws(
    () => builder(8).build(),
    /schemaVersion 8 is insufficient for evidence inconclusive \/ collectedByKind/,
  );
});

test("a merge of v9 content declares 9", () => {
  const a = validateTrustBundle(bundle(9, [evidence("ev.1", "claim.a", TIMED_OUT)]));
  const b = validateTrustBundle(bundle(5, [], [claim("claim.b")]));
  assert.equal(mergeBundlesDetailed([a, b]).bundle.schemaVersion, 9);
});

// ── checkBasisInvariants: parity, and the derivation wiring ────────────────

const INVARIANT_CASES: Array<[string, unknown]> = [
  ["valid inconclusive at 9", bundle(9, [evidence("ev.1", "claim.a", TIMED_OUT)])],
  ["entailing inconclusive", bundle(9, [evidence("ev.1", "claim.a", { supportStrength: "entails", inconclusive: { reason: "timeout" } })])],
  ["inconclusive with passing", bundle(9, [evidence("ev.1", "claim.a", { ...TIMED_OUT, passing: true })])],
  ["fields under 8", bundle(8, [evidence("ev.1", "claim.a", { ...TIMED_OUT, collectedByKind: "model" })])],
  ["no schemaVersion", { claims: [], evidence: [evidence("ev.1", "claim.a", { collectedByKind: "human" })] }],
  ["evidence not an array", { schemaVersion: 9, evidence: {} }],
  ["non-object item", { schemaVersion: 9, evidence: [null, 3] }],
  ["no evidence", { schemaVersion: 5 }],
  ["not an object", "bundle"],
];

for (const [name, input] of INVARIANT_CASES) {
  test(`checkBasisInvariants matches hachure: ${name}`, () => {
    assert.deepEqual(checkBasisInvariants(input), hachure.checkBasisInvariants(input));
  });
}

test("buildTrustReport refuses an unvalidated bundle that fails the basis invariants", () => {
  // Without the check the fold would count this attempt, which never ran, as a
  // passing-less entailing check and as a requirement-type match.
  const entailing = bundle(9, [evidence("ev.1", "claim.a", { supportStrength: "entails", inconclusive: { reason: "timeout" } })]);
  for (const statusFunctionVersion of supportedStatusFunctionVersions) {
    assert.throws(
      () => buildTrustReport(entailing as unknown as TrustBundle, { now: NOW, statusFunctionVersion }),
      /fails the schemaVersion 9 evidence invariants: \/evidence\/0: inconclusive evidence "ev\.1" must have supportStrength "cited" \(found "entails"\)/,
    );
  }
  const undeclared = bundle(8, [evidence("ev.1", "claim.a", { collectedByKind: "model", passing: true })]);
  assert.throws(
    () => buildTrustReport(undeclared as unknown as TrustBundle, { now: NOW }),
    /carries collectedByKind, which requires schemaVersion 9 or later \(declared 8\)/,
  );
});

// ── guard: an inconclusive item never disputes and never satisfies ─────────

function statuses(input: unknown, statusFunctionVersion: (typeof supportedStatusFunctionVersions)[number]): Record<string, string> {
  const report = buildTrustReport(structuredClone(input) as TrustBundle, { now: NOW, statusFunctionVersion });
  return Object.fromEntries(report.claims.map((c) => [c.id, c.status]));
}

test("an inconclusive item never disputes a claim and never satisfies requiredEvidence", () => {
  const verifiedEvent = (claimId: string) => ({ id: `ev.${claimId}`, claimId, status: "verified", actor: "ci", method: "test", evidenceIds: [], createdAt: AT });
  const claims = [claim("claim.passing"), claim("claim.only-attempt"), claim("claim.no-event")];
  const base = [evidence("ev.pass", "claim.passing", { passing: true, supportStrength: "entails" })];
  const attempts = [
    // Same evidence type the policy requires, marked blocking: if the fold saw
    // it, it could only weaken claim.passing or satisfy the other two.
    evidence("ev.try.1", "claim.passing", { ...TIMED_OUT, blocking: true, execution: { runner: "bash", label: "npm test", exitCode: 1, isError: true } }),
    evidence("ev.try.2", "claim.only-attempt", { supportStrength: "cited", inconclusive: { reason: "unreachable" }, blocking: true }),
    evidence("ev.try.3", "claim.no-event", { supportStrength: "cited", inconclusive: { reason: "permission_denied" } }),
  ];
  const events = [verifiedEvent("claim.passing"), verifiedEvent("claim.only-attempt")];
  const withAttempts = bundle(9, [...base, ...attempts], claims, events);
  const without = bundle(9, base, claims, events);
  validateTrustBundle(structuredClone(withAttempts));
  for (const version of supportedStatusFunctionVersions) {
    const actual = statuses(withAttempts, version);
    assert.deepEqual(actual, statuses(without, version), `v${version}: the attempts changed a status`);
    assert.equal(actual["claim.passing"], "verified", `v${version}: an attempt disputed a verified claim`);
    assert.notEqual(actual["claim.only-attempt"], "verified", `v${version}: an attempt satisfied requiredEvidence`);
    assert.notEqual(actual["claim.only-attempt"], "disputed", `v${version}: an attempt disputed a claim`);
  }
});

test("sf-basis-fields-inert: stripping the basis fields leaves every status unchanged", () => {
  const vector = JSON.parse(readFileSync("node_modules/hachure/conformance/sf-basis-fields-inert.json", "utf8")) as { input: TrustBundle; now: string };
  const stripped = structuredClone(vector.input);
  for (const item of stripped.evidence) {
    delete item.inconclusive;
    delete item.collectedByKind;
    if (item.metadata) delete item.metadata.sourceOfRecord;
  }
  for (const c of stripped.claims) if (c.metadata) delete c.metadata.estimate;
  stripped.schemaVersion = 8;
  assert.notDeepEqual(stripped, vector.input, "the vector carries basis fields to strip");
  for (const statusFunctionVersion of supportedStatusFunctionVersions) {
    const derive = (input: TrustBundle) =>
      buildTrustReport(structuredClone(input), { now: new Date(vector.now), statusFunctionVersion }).claims.map((c) => [c.id, c.status]);
    assert.deepEqual(derive(vector.input), derive(stripped));
  }
});

// ── projections: "could not run" ──────────────────────────────────────────

test("claim explanation projects an inconclusive item as could not run, whatever execution.isError says", () => {
  const input = validateTrustBundle(bundle(9, [
    evidence("ev.try", "claim.a", { ...TIMED_OUT, inconclusive: { reason: "tool_error", detail: "runner missing" }, execution: { runner: "bash", label: "npm test", exitCode: 127, isError: true } }),
    evidence("ev.fail", "claim.a", { passing: false, execution: { runner: "bash", label: "npm test", exitCode: 1, isError: true } }),
  ]));
  const explanation = explainClaim(buildTrustReport(input, { now: NOW }), "claim.a");
  const [attempt, failure] = explanation.evidence;
  assert.equal(attempt!.passing, null, "an attempt that never ran is not a failure");
  assert.deepEqual(attempt!.couldNotRun, { reason: "tool_error", detail: "runner missing" });
  // isError means "ran and failed"; an attempt that never ran did neither.
  assert.equal(attempt!.execution?.isError, false);
  assert.equal(attempt!.execution?.exitCode, 127, "the rest of the execution record is reported as recorded");
  // isError alone still means ran-and-failed.
  assert.equal(failure!.passing, false);
  assert.equal("couldNotRun" in failure!, false);
});

test("claim basis view shows a could-not-run caveat after Model-derived, and does not count the attempt as not evaluated or cited", () => {
  const c = { ...claim("claim.a"), derivationEdges: [{ inputClaimId: "claim.x", method: "model" }] } as unknown as TrustBundle["claims"][number];
  const items = [
    evidence("ev.try", "claim.a", TIMED_OUT),
    evidence("ev.try2", "claim.a", { supportStrength: "cited", inconclusive: { reason: "unreachable" } }),
    evidence("ev.pass", "claim.a", { passing: true, supportStrength: "entails", collectedByKind: "model" }),
  ] as unknown as Evidence[];
  const view = claimBasisView(c, items);
  assert.equal(view.state, "recorded");
  const facets = view.state === "recorded" ? view.facets : [];
  assert.deepEqual(facets.slice(0, 2).map((f) => [f.code, f.label]), [["model", "Model-derived"], ["could-not-run", "2 could not run"]]);
  assert.ok(!facets.some((f) => f.code === "not-evaluated" || f.code === "cited"), JSON.stringify(facets));
  const detail = Object.fromEntries((view.detail ?? []).map((row) => [row.label, row.value]));
  assert.equal(detail.Results, "1 passed · 2 could not run");
  assert.equal(detail["Collected by"], "Collected by a model (1) · Collector not stated (2)");
});

test("claim basis view names an estimate, and never shows bounds from a malformed one", () => {
  const ok = { ...claim("claim.a"), value: 1240, metadata: { estimate: { basis: "fuel spend × factor", low: 1100, high: 1400 } } } as unknown as TrustBundle["claims"][number];
  const bad = { ...claim("claim.a"), value: 2000, metadata: { estimate: { basis: "fuel spend × factor", low: 1100, high: 1400 } } } as unknown as TrustBundle["claims"][number];
  const row = (c: TrustBundle["claims"][number]) => (claimBasisView(c, []).detail ?? []).find((r) => r.label === "Estimate")?.value;
  assert.equal(row(ok), "Estimated · 1100–1400 (fuel spend × factor)");
  assert.equal(row(bad), "Estimate recorded but malformed; bounds not shown");
  assert.equal(row(claim("claim.a") as unknown as TrustBundle["claims"][number]), undefined, "absence is not an estimate and not 'exact'");
});

// ── basis-annotations profile: parity with hachure ────────────────────────

const TRACE = {
  id: "trace.sor", subject: { subjectType: "repo", subjectId: "r1" }, actorRef: "payroll.example", authorityType: "system",
  authorityRef: "system-of-record:wages", sourceRef: "https://payroll.example/about", observedAt: AT,
  validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z",
};
const SOR = { metadata: { sourceOfRecord: { authorityTraceId: "trace.sor" } }, passing: true };

function profileBundle(evidenceExtra: Record<string, unknown>, traces: unknown[] = [TRACE], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...bundle(9, [evidence("ev.1", "claim.a", evidenceExtra)]), authorityTrace: traces, ...extra };
}

const RESOLUTION_CASES: Array<[string, Record<string, unknown>, unknown?]> = [
  ["backed", profileBundle(SOR)],
  ["backed, later revoked", profileBundle(SOR, [{ ...TRACE, revokedAt: "2026-07-01T00:00:00.000Z" }])],
  ["not declared", profileBundle({ passing: true })],
  ["inconclusive", profileBundle({ ...TIMED_OUT, metadata: SOR.metadata })],
  ["malformed (extra key)", profileBundle({ metadata: { sourceOfRecord: { authorityTraceId: "trace.sor", trusted: true } } })],
  ["malformed (boolean form)", profileBundle({ metadata: { sourceOfRecord: true } })],
  ["claim not found", { ...profileBundle(SOR), claims: [claim("claim.other")] }],
  ["trace not found", profileBundle(SOR, [])],
  ["trace ambiguous", profileBundle(SOR, [TRACE, { ...TRACE, actorRef: "other" }])],
  ["authority type role", profileBundle(SOR, [{ ...TRACE, authorityType: "role" }])],
  ["subject mismatch", profileBundle(SOR, [{ ...TRACE, subject: { subjectType: "repo", subjectId: "r2" } }])],
  ["subject via alias", profileBundle(SOR, [{ ...TRACE, subject: { subjectType: "repo", subjectId: "alias" } }], { claims: [claim("claim.a", { subjectAliases: [{ subjectType: "repo", subjectId: "alias" }] })] })],
  ["subject via equivalent link", profileBundle(SOR, [{ ...TRACE, subject: { subjectType: "repo", subjectId: "r3" } }], { identityLinks: [{ subjects: [{ subjectType: "repo", subjectId: "r1" }, { subjectType: "repo", subjectId: "r3" }] }] })],
  ["subsumes link does not count", profileBundle(SOR, [{ ...TRACE, subject: { subjectType: "repo", subjectId: "r3" } }], { identityLinks: [{ relation: "subsumes", subjects: [{ subjectType: "repo", subjectId: "r1" }, { subjectType: "repo", subjectId: "r3" }] }] })],
  ["revoked before observation", profileBundle(SOR, [{ ...TRACE, revokedAt: "2026-05-01T00:00:00.000Z" }])],
  ["not yet valid", profileBundle(SOR, [{ ...TRACE, validFrom: "2026-06-02T00:00:00.000Z" }])],
  ["expired", profileBundle(SOR, [{ ...TRACE, validUntil: "2026-05-31T00:00:00.000Z" }])],
  ["unparseable bound", profileBundle(SOR, [{ ...TRACE, validUntil: "soon" }])],
  // Bounds are inclusive except revokedAt, which must be strictly later.
  ["validFrom equal to observedAt", profileBundle(SOR, [{ ...TRACE, validFrom: AT }])],
  ["validUntil equal to observedAt", profileBundle(SOR, [{ ...TRACE, validUntil: AT }])],
  ["revokedAt equal to observedAt", profileBundle(SOR, [{ ...TRACE, revokedAt: AT }])],
  ["revokedAt one millisecond later", profileBundle(SOR, [{ ...TRACE, revokedAt: "2026-06-01T00:00:00.001Z" }])],
  ["collision list names the trace", profileBundle(SOR), { collisions: [{ collection: "authorityTrace", id: "trace.sor" }] }],
  ["collision list names another trace", profileBundle(SOR), { collisions: [{ collection: "authorityTrace", id: "trace.other" }] }],
  ["collisions malformed", profileBundle(SOR), { collisions: [{ collection: "traces", id: "trace.sor" }] }],
  ["collisions not a list", profileBundle(SOR), { collisions: {} }],
];

for (const [name, input, options] of RESOLUTION_CASES) {
  test(`resolveSourceOfRecord matches hachure: ${name}`, () => {
    const item = (input.evidence as Evidence[])[0]!;
    const ours = resolveSourceOfRecord(input as unknown as TrustBundle, item, options as never);
    const theirs = hachure.resolveSourceOfRecord(input, item, options);
    assert.deepEqual(ours, theirs);
  });
}

test("every not-backed reason is reached by the parity cases", () => {
  const reasons = new Set(
    RESOLUTION_CASES.map(([, input, options]) => resolveSourceOfRecord(input as unknown as TrustBundle, (input.evidence as Evidence[])[0]!, options as never))
      .filter((r) => !r.backed)
      .map((r) => (r as { reason: string }).reason),
  );
  assert.deepEqual([...reasons].sort(), [
    "authority-type", "claim-not-found", "collisions-malformed", "inconclusive", "malformed", "not-active",
    "not-declared", "subject-mismatch", "trace-ambiguous", "trace-collision", "trace-not-found",
  ]);
});

const ESTIMATE_CASES: Array<[string, unknown, unknown]> = [
  ["well-formed with bounds", 1240, { basis: "b", low: 1100, high: 1400 }],
  ["well-formed without bounds", "about a thousand", { basis: "b" }],
  ["empty basis", 1, { basis: "" }],
  ["one bound", 1, { basis: "b", low: 0 }],
  ["inverted bounds", 1, { basis: "b", low: 2, high: 0 }],
  ["value outside bounds", 5, { basis: "b", low: 0, high: 1 }],
  ["bounds on a string value", "x", { basis: "b", low: 0, high: 1 }],
  ["non-finite bound", 1, { basis: "b", low: 0, high: Infinity }],
  ["unknown key", 1, { basis: "b", unit: "t" }],
  ["not an object", 1, "estimated"],
];

for (const [name, value, estimate] of ESTIMATE_CASES) {
  test(`validateBasisAnnotations matches hachure: estimate ${name}`, () => {
    const input = { ...bundle(9, [evidence("ev.1", "claim.a", { metadata: { sourceOfRecord: { authorityTraceId: "" } } })]), claims: [claim("claim.a", { value, metadata: { estimate } })] };
    const ours = validateBasisAnnotations(input);
    assert.deepEqual(ours, hachure.validateBasisAnnotations(input));
    assert.ok(ours.some((e) => e.instancePath === "/evidence/0/metadata/sourceOfRecord/authorityTraceId"));
  });
}

test("inclusive bounds are pinned literally, not only by parity", () => {
  const backed = (trace: Record<string, unknown>) =>
    resolveSourceOfRecord(profileBundle(SOR, [trace]) as unknown as TrustBundle, evidence("ev.1", "claim.a", SOR) as unknown as Evidence).backed;
  assert.equal(backed({ ...TRACE, validFrom: AT }), true);
  assert.equal(backed({ ...TRACE, validUntil: AT }), true);
  assert.equal(backed({ ...TRACE, revokedAt: AT }), false);
});

test("validateBasisAnnotations tolerates a truthy non-array claims or evidence, where hachure 0.17.0 throws", () => {
  // Divergence, pinned: hachure calls `.forEach` on `bundle.claims || []`, so a
  // truthy non-array throws a TypeError. The port reads only arrays and checks
  // nothing else, as validateTrustBundle owns the bundle's shape.
  for (const input of [{ claims: {}, evidence: [] }, { claims: [], evidence: "x" }]) {
    assert.deepEqual(validateBasisAnnotations(input), []);
    assert.throws(() => hachure.validateBasisAnnotations(input), TypeError);
  }
});

test("validateTrustBundle does not refuse a malformed profile value (metadata stays open)", () => {
  const input = { ...bundle(9, [evidence("ev.1", "claim.a", { metadata: { sourceOfRecord: true } })]), claims: [claim("claim.a", { metadata: { estimate: "about" } })] };
  validateTrustBundle(input);
  assert.equal(validateBasisAnnotations(input).length, 2);
});

// ── console: merged bundles resolve with the merge's collisions ───────────

test("console read model resolves source of record over a merge with its collisions", () => {
  const producer = (source: string, actorRef: string) =>
    validateTrustBundle({ ...profileBundle(SOR, [{ ...TRACE, actorRef }]), source, producerId: source });
  const single = buildMergedConsoleReadModel([producer("ci", "payroll.example")], { now: NOW });
  assert.deepEqual(single.evidenceBasisById?.["ev.1"]?.sourceOfRecord, { backed: true, label: "From the system of record · payroll.example" });

  // Two producers wrote differing traces under one id: the merge keeps one and
  // reports a collision, so neither producer's reference may read as backed.
  const merged = buildMergedConsoleReadModel([producer("ci", "payroll.example"), producer("review", "someone.else")], { now: NOW });
  assert.ok(merged.mergeCollisions.some((c) => c.collection === "authorityTrace" && c.id === "trace.sor"));
  assert.deepEqual(merged.evidenceBasisById?.["ev.1"]?.sourceOfRecord, { backed: false, label: "Source-of-record label not backed (trace-collision)" });
});

test("console read model labels could-not-run and collector kind, and adds no key for bundles without them", () => {
  const withFields = buildMergedConsoleReadModel([
    validateTrustBundle(bundle(9, [
      evidence("ev.try", "claim.a", { ...TIMED_OUT, inconclusive: { reason: "timeout", detail: "after 10m" } }),
      evidence("ev.pass", "claim.a", { passing: true, collectedByKind: "deterministic" }),
    ])),
  ], { now: NOW });
  assert.deepEqual(withFields.evidenceBasisById, {
    "ev.try": { couldNotRun: "Could not run: Timed out — after 10m" },
    "ev.pass": { collectedBy: "Collected by a program" },
  });
  const plain = buildMergedConsoleReadModel([validateTrustBundle(bundle(5, [evidence("ev.pass", "claim.a", { passing: true })]))], { now: NOW });
  assert.equal("evidenceBasisById" in plain, false);
});

// ── the shipped worked example (adapted from Hachure's basis-annotations example) ──────

test("examples/basis-annotations-bundle.json validates, derives, and resolves as the profile describes", () => {
  const input = validateTrustBundle(JSON.parse(readFileSync("examples/basis-annotations-bundle.json", "utf8")));
  assert.equal(input.schemaVersion, 9);
  assert.deepEqual(validateBasisAnnotations(input), []);
  assert.deepEqual(checkBasisInvariants(input), []);
  const report = buildTrustReport(input, { now: NOW });
  assert.deepEqual(Object.fromEntries(report.claims.map((c) => [c.id, c.status])), {
    "claim.invoice.total": "verified",
    // The telematics check the policy also requires could not run.
    "claim.fleet.co2-2025": "unknown",
  });
  const box1 = input.evidence.find((e) => e.id === "evidence.invoice.total")!;
  const resolution = resolveSourceOfRecord(input, box1);
  assert.equal(resolution.backed, true);
  const fleet = input.claims.find((c) => c.id === "claim.fleet.co2-2025")!;
  const view = claimBasisView(fleet, input.evidence);
  assert.ok(view.state === "recorded" && view.facets.some((f) => f.code === "could-not-run"));
});

// ── gaps: an attempt that never ran is not an unsupported inference ───────

test("an inconclusive item raises no unsupported_inference gap, so the console never titles it a failed verification", () => {
  const input = validateTrustBundle(JSON.parse(readFileSync("examples/basis-annotations-bundle.json", "utf8")));
  const projection = buildSurfaceConsoleProjection(buildMergedConsoleReadModel([input], { now: NOW }));
  const claimId = "claim.fleet.co2-2025";
  const gaps = (projection.readModel as { transparencyGaps: Array<{ claimId: string; type: string; evidenceIds: string[] }> }).transparencyGaps
    .filter((gap) => gap.claimId === claimId);
  assert.deepEqual(gaps.map((gap) => gap.type).sort(), ["provenance_gap"]);
  assert.ok(!gaps.some((gap) => (gap.evidenceIds ?? []).includes("evidence.co2.telematics-attempt") && gap.type !== "provenance_gap"));
  const titles = projection.claimDetails[claimId]!.gaps.map((gap) => gap.title);
  assert.ok(!titles.includes("Verification failed"), JSON.stringify(titles));

  // Control: the same item without `inconclusive` is an ordinary citation and
  // still raises the gap, so the rule itself is intact.
  const cited = structuredClone(input);
  delete cited.evidence.find((item) => item.id === "evidence.co2.telematics-attempt")!.inconclusive;
  const citedGaps = buildTrustReport(cited, { now: NOW }).transparencyGaps.filter((gap) => gap.claimId === claimId);
  assert.ok(citedGaps.some((gap) => gap.type === "unsupported_inference" && (gap.evidenceIds ?? []).includes("evidence.co2.telematics-attempt")));
});
