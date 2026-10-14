/**
 * Why a claim is stale. One stale claim of each reason in a single bundle,
 * derived end to end: the report summary, the freshness-breach gap, the
 * analytics stale queue, and the console guidance must all name the reason,
 * and the report must stay valid against the vendored Hachure report schema
 * and Surface's stale-reason extension schema.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";
import {
  buildTrustAnalyticsProjection,
  buildTrustReport,
  checkpointFromReport,
  summarizeClaims,
  type Claim,
  type Evidence,
  type StaleReason,
  type TrustBundle,
  type VerificationEvent,
  type VerificationPolicy,
} from "../src/index.js";
import { projectBundleToConsoleReadModel } from "../src/console/merged-read-model.js";
import { buildSurfaceConsoleProjection } from "../src/console/projection.js";

const Ajv2020 = (Ajv2020Import as unknown as { default?: unknown }).default ?? Ajv2020Import;

const now = new Date("2026-10-01T00:00:00.000Z");
const verifiedAt = "2026-09-01T00:00:00.000Z";

function policy(id: string, validityRule: VerificationPolicy["validityRule"]): VerificationPolicy {
  return {
    id,
    claimType: "software-evidence",
    requiredEvidence: ["test_output"],
    requiredMethods: ["validation"],
    requiresCorroboration: false,
    acceptanceCriteria: ["tests pass"],
    reviewAuthority: "ci",
    validityRule,
    stalenessTriggers: [],
    conflictRules: [],
    impactLevel: "high",
  };
}

function claim(id: string, policyId: string, extra: Partial<Claim> = {}): Claim {
  return {
    id,
    subjectType: "repository",
    subjectId: "surface",
    facet: "surface.freshness",
    claimType: "software-evidence",
    fieldOrBehavior: `${id} holds`,
    value: true,
    createdAt: verifiedAt,
    updatedAt: verifiedAt,
    verificationPolicyId: policyId,
    ...extra,
  };
}

function evidence(claimId: string, integrityRef = "commit:old"): Evidence {
  return {
    id: `evidence.${claimId}`,
    claimId,
    evidenceType: "test_output",
    method: "validation",
    sourceRef: "npm test",
    excerptOrSummary: "Tests passed.",
    observedAt: verifiedAt,
    collectedBy: "ci",
    integrityRef,
    passing: true,
  };
}

function verified(claimId: string, at = verifiedAt): VerificationEvent {
  return {
    id: `event.${claimId}.verified`,
    claimId,
    status: "verified",
    actor: "ci",
    method: "validation",
    evidenceIds: [`evidence.${claimId}`],
    createdAt: at,
    verifiedAt: at,
  };
}

/** One claim per reason, plus a fresh control claim. */
function bundle(): TrustBundle {
  const ids = ["commit", "duration", "ttl", "window", "unevaluable", "external", "unspecified", "derived", "fresh"];
  return {
    schemaVersion: 3,
    source: "stale-reason-test",
    policies: [
      policy("policy.commit", { kind: "commit" }),
      policy("policy.duration", { kind: "duration", durationDays: 7 }),
      policy("policy.manual", { kind: "manual" }),
    ],
    claims: [
      // The verified evidence carries commit:old; the claim is now at commit:new.
      claim("commit", "policy.commit", { currentIntegrityRef: "commit:new" }),
      // Verified 30 days before `now`, against a 7-day window.
      claim("duration", "policy.duration"),
      // The claim's own one-hour time to live.
      claim("ttl", "policy.manual", { ttlSeconds: 3600 }),
      // The claim's own absolute expiry.
      claim("window", "policy.manual", { expiresAt: "2026-09-15T00:00:00.000Z" }),
      // A commit rule with no current integrity reference cannot be evaluated.
      claim("unevaluable", "policy.commit"),
      claim("external", "policy.manual"),
      claim("unspecified", "policy.manual"),
      // Its own status is verified; the claim it is derived from is stale.
      claim("derived", "policy.manual", { derivedFrom: ["commit"] }),
      claim("fresh", "policy.manual"),
    ],
    evidence: ids.map((id) => evidence(id)),
    events: [
      ...ids.map((id) => verified(id)),
      {
        id: "event.external.invalidated",
        claimId: "external",
        type: "invalidation",
        status: "stale",
        actor: "docs-review",
        method: "review-coverage",
        evidenceIds: [],
        createdAt: "2026-09-20T00:00:00.000Z",
      },
      {
        id: "event.unspecified.revoked",
        claimId: "unspecified",
        status: "revoked",
        actor: "operator",
        method: " ",
        evidenceIds: [],
        createdAt: "2026-09-20T00:00:00.000Z",
      },
    ],
  };
}

const expected: Record<string, StaleReason> = {
  commit: "commit",
  duration: "duration",
  ttl: "ttl",
  window: "intrinsic-window",
  unevaluable: "unevaluable",
  external: "external:review-coverage",
  unspecified: "external:unspecified",
  derived: "derived-input",
};

const STALE_REASON_SCHEMA = join("schemas", "surface", "trust-report-stale-reason.schema.json");

/**
 * Compile `root` (a path) with every vendored Hachure schema available by id.
 * A Surface report carries waiver validity, so the plain check uses the
 * waivers profile; the stale-reason extension builds on it.
 */
function compileReportSchema(root = join("schemas", "trust-report-waivers.schema.json")) {
  const AjvCtor = Ajv2020 as new (opts: Record<string, unknown>) => {
    addSchema: (s: unknown, k: string) => void;
    compile: (s: unknown) => ((data: unknown) => boolean) & { errors?: unknown };
  };
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  for (const f of readdirSync("schemas").sort()) {
    if (!f.endsWith(".schema.json") || join("schemas", f) === root) continue;
    ajv.addSchema(JSON.parse(readFileSync(join("schemas", f), "utf8")), f);
  }
  return ajv.compile(JSON.parse(readFileSync(root, "utf8")));
}

test("the report summary names why each stale claim is stale, and only stale claims", () => {
  const report = buildTrustReport(bundle(), { now });

  assert.deepEqual(
    Object.fromEntries(report.claims.map((item) => [item.id, item.status])),
    { ...Object.fromEntries(Object.keys(expected).map((id) => [id, "stale"])), fresh: "verified" },
  );
  assert.deepEqual(report.summary.staleReasonByClaimId, expected);
  assert.deepEqual([...report.summary.staleClaims].sort(), Object.keys(expected).sort());
});

test("every status function version labels the stale claims it derives", () => {
  // Version "2" reads an unevaluable commit rule as not stale, so that claim
  // (and nothing else) drops out.
  const { unevaluable: _dropped, ...v2 } = expected;
  assert.deepEqual(buildTrustReport(bundle(), { now, statusFunctionVersion: "3" }).summary.staleReasonByClaimId, expected);
  assert.deepEqual(buildTrustReport(bundle(), { now, statusFunctionVersion: "2" }).summary.staleReasonByClaimId, v2);
});

test("the freshness-breach gap of a claim stale on its own carries the reason", () => {
  const report = buildTrustReport(bundle(), { now });
  const breaches = Object.fromEntries(report.transparencyGaps
    .filter((gap) => gap.type === "freshness_breach")
    .map((gap) => [gap.claimId, gap.metadata?.staleReason]));

  // `derived` is capped by its input; it has no freshness breach of its own.
  const { derived: _capped, ...own } = expected;
  assert.deepEqual(breaches, own);
});

test("a report carrying stale reasons still validates against the vendored Hachure report schema", () => {
  const validate = compileReportSchema();
  const report = JSON.parse(JSON.stringify(buildTrustReport(bundle(), { now })));
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

test("a checkpointed derivation labels a claim that went stale since the checkpoint", () => {
  const source = bundle();
  // At the moment of verification the ttl claim is fresh; time is re-applied
  // to its checkpointed status later, without replaying its events.
  const early = buildTrustReport(source, { now: new Date(verifiedAt) });
  assert.equal(early.claims.find((item) => item.id === "ttl")?.status, "verified");

  const probes: Record<string, boolean> = {};
  const later = buildTrustReport(source, {
    now,
    since: checkpointFromReport(early),
    instrument: (probe) => { probes[probe.claimId] = probe.fromCheckpoint; },
  });
  assert.equal(probes.ttl, true, "the ttl claim is served from the checkpoint");
  assert.deepEqual(later.summary.staleReasonByClaimId, expected);
});

test("the stale query lists each stale claim with its reason", () => {
  const projection = buildTrustAnalyticsProjection(buildTrustReport(bundle(), { now }));
  assert.deepEqual(
    Object.fromEntries(projection.staleClaims.map((item) => [item.claimId, item.staleReason])),
    expected,
  );
});

test("console guidance explains a stale claim by its reason, not always as a commit mismatch", () => {
  const readModel = projectBundleToConsoleReadModel(bundle(), {}, [], { now });
  assert.deepEqual(
    Object.fromEntries(readModel.claims.filter((item) => item.staleReason !== undefined).map((item) => [item.id, item.staleReason])),
    expected,
  );

  const details = buildSurfaceConsoleProjection(readModel as unknown as Record<string, unknown>).claimDetails;
  const guidance = (id: string): string => details[id]?.guidance ?? "";
  assert.match(guidance("commit"), /different version than the claim's current integrity reference/);
  assert.match(guidance("duration"), /older than its policy's validity window/);
  assert.match(guidance("ttl"), /time to live \(ttlSeconds\)/);
  assert.match(guidance("window"), /past its own expiry time \(expiresAt\)/);
  assert.match(guidance("unevaluable"), /could not be evaluated/);
  assert.match(guidance("external"), /A recorded event \(review-coverage\) marked this claim/);
  assert.match(guidance("unspecified"), /^A recorded event marked this claim/);
  assert.match(guidance("derived"), /derived from is stale/);
  // Only the commit reason is described as a version mismatch.
  for (const id of Object.keys(expected).filter((item) => item !== "commit")) {
    assert.doesNotMatch(guidance(id), /different version/, id);
  }
});

test("console guidance reads the reason from the freshness-breach gap when the claim does not carry it", () => {
  const detail = buildSurfaceConsoleProjection({
    claims: [{ id: "c", status: "stale", transparencyGapIds: ["c.gap.freshness-breach"] }],
    transparencyGaps: [{ id: "c.gap.freshness-breach", claimId: "c", type: "freshness_breach", metadata: { staleReason: "duration" } }],
  }).claimDetails.c;
  assert.match(detail?.guidance ?? "", /older than its policy's validity window/);

  const unlabelled = buildSurfaceConsoleProjection({ claims: [{ id: "c", status: "stale" }] }).claimDetails.c;
  assert.match(unlabelled?.guidance ?? "", /no longer current/);
  assert.doesNotMatch(unlabelled?.guidance ?? "", /different version/);
});

test("the stale-reason extension schema declares the reasons a report carries, and refuses a report without them", () => {
  const validate = compileReportSchema(STALE_REASON_SCHEMA);
  const valid = (): Record<string, any> => JSON.parse(JSON.stringify(buildTrustReport(bundle(), { now })));
  assert.equal(validate(valid()), true, JSON.stringify(validate.errors));

  const withoutGapReason = valid();
  const breach = withoutGapReason.transparencyGaps.find((gap: { id: string }) => gap.id === "commit.gap.freshness-breach");
  delete breach.metadata.staleReason;
  assert.equal(validate(withoutGapReason), false, "a derived breach gap without its reason is refused");

  const withoutSummary = valid();
  delete withoutSummary.summary.staleReasonByClaimId;
  assert.equal(validate(withoutSummary), false, "a summary without the reason map is refused");

  for (const reason of ["stale", "external:", "external: padded", "Commit"]) {
    const bad = valid();
    bad.summary.staleReasonByClaimId.commit = reason;
    assert.equal(validate(bad), false, `${JSON.stringify(reason)} is not a stale reason`);
  }

  // A producer-supplied freshness hint is another gap and needs no reason.
  const hinted = valid();
  hinted.transparencyGaps.push({ id: "fresh.gap.hint-1", claimId: "fresh", type: "freshness_breach", severity: "low", message: "hint", createdAt: verifiedAt });
  assert.equal(validate(hinted), true, JSON.stringify(validate.errors));
});

test("summarizeClaims refuses a stale claim with no reason when given reasons, and omits the map when not", () => {
  const report = buildTrustReport(bundle(), { now });
  const { commit: _missing, ...incomplete } = expected;
  assert.throws(
    () => summarizeClaims(report.claims, report.transparencyGaps, [], incomplete),
    { name: "RangeError", message: "no stale reason for stale claim commit" },
  );
  // An inherited key is not a reason: `toString` resolves on a plain object.
  const inherited = [{ ...report.claims[0], id: "toString", status: "stale" as const }];
  assert.throws(() => summarizeClaims(inherited, [], [], {}), { name: "RangeError", message: "no stale reason for stale claim toString" });

  const without = summarizeClaims(report.claims, report.transparencyGaps);
  assert.equal(Object.hasOwn(without, "staleReasonByClaimId"), false);
  assert.deepEqual(summarizeClaims(report.claims, report.transparencyGaps, [], expected).staleReasonByClaimId, expected);
});

test("a checkpoint whose stale status the claim's own events do not explain replays that claim in full", () => {
  const source = bundle();
  // Off the verified-event branch: the latest event records `disputed`.
  source.claims.push(claim("contested", "policy.manual"));
  source.evidence.push(evidence("contested"));
  source.events.push(verified("contested"), {
    ...verified("contested", "2026-09-10T00:00:00.000Z"),
    id: "event.contested.disputed",
    status: "disputed",
  });
  const full = buildTrustReport(source, { now });
  assert.equal(full.claims.find((item) => item.id === "contested")?.status, "disputed");
  const checkpoint = checkpointFromReport(buildTrustReport(source, { now: new Date(verifiedAt) }));
  // `fresh` is verified on its events and `contested` disputed; this
  // checkpoint says both are stale.
  assert.equal(checkpoint.untimedOwnStatusByClaimId?.fresh, "verified");
  checkpoint.untimedOwnStatusByClaimId!.fresh = "stale";
  checkpoint.untimedOwnStatusByClaimId!.contested = "stale";

  const probes: Record<string, boolean> = {};
  const report = buildTrustReport(source, {
    now,
    since: checkpoint,
    instrument: (probe) => { probes[probe.claimId] = probe.fromCheckpoint; },
  });
  assert.equal(probes.fresh, false, "the disagreeing verified claim is replayed");
  assert.equal(probes.contested, false, "the disagreeing disputed claim is replayed");
  assert.equal(probes.ttl, true, "other claims still come from the checkpoint");
  assert.deepEqual(report.claims.map((item) => [item.id, item.status]), full.claims.map((item) => [item.id, item.status]));
  assert.deepEqual(report.summary.staleReasonByClaimId, expected);
});

test("the version 4 freshness-breach message says why; versions 3 and 2 keep their message", () => {
  const messages = (statusFunctionVersion?: "2" | "3") => Object.fromEntries(
    buildTrustReport(bundle(), { now, statusFunctionVersion }).transparencyGaps
      .filter((gap) => gap.type === "freshness_breach")
      .map((gap) => [gap.claimId, gap.message]),
  );
  const v4 = messages();
  assert.match(v4.commit, /current integrity reference/);
  assert.match(v4.duration, /validity window has elapsed/);
  assert.match(v4.ttl, /time to live \(ttlSeconds\)/);
  assert.match(v4.window, /expiry time \(expiresAt\)/);
  assert.match(v4.unevaluable, /could not be evaluated/);
  assert.match(v4.external, /a recorded event \(review-coverage\)/);
  assert.equal(v4.unspecified, "Claim verification is stale: a recorded event marked it as no longer current.");
  for (const version of ["3", "2"] as const) {
    for (const message of Object.values(messages(version))) {
      assert.equal(message, "Claim verification is stale under its verification policy.", version);
    }
  }
});

test("unevaluable guidance points at the gap below only when that gap is there", () => {
  const guidance = (gaps: Array<Record<string, unknown>>) => buildSurfaceConsoleProjection({
    claims: [{ id: "c", status: "stale", staleReason: "unevaluable" }],
    transparencyGaps: gaps,
  }).claimDetails.c?.guidance ?? "";
  assert.doesNotMatch(guidance([]), /gap below/);
  assert.match(guidance([]), /could not be evaluated/);
  assert.match(guidance([{ id: "c.gap.unevaluable-validity-rule", claimId: "c", type: "policy_violation" }]), /See the gap below/);
});

test("the stale reason derivation is not public API", async () => {
  const surface = await import("../src/index.js");
  assert.equal("deriveOwnStaleReason" in surface, false);
  for (const name of ["claimIntrinsicExpiry", "sortEventsMostRecentFirstV4", "verifiedBranchEvent", "deriveTrustStatus"]) {
    assert.equal(typeof (surface as Record<string, unknown>)[name], "function", `${name} stays exported`);
  }
});
