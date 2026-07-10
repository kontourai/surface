/**
 * #128 acceptance — a real Surface TrustReport carrying waiver-validity fields
 * validates against the shipped Hachure `trust-report-waivers.schema.json`
 * extension (and is correctly rejected by the neutral core `trust-report.schema.json`).
 *
 * This is the strict-external-consumer proof the #123 stop-short risk asked for:
 * a byte-for-byte vendored schema (synced from the `hachure` npm package via
 * `npm run sync:schemas`, enforced identical by `schema-parity.test.ts`) is
 * loaded into ajv 2020-12 and run against the actual `buildTrustReport` output.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";

// ajv v8's ESM default-export interop resolves to a namespace under TS NodeNext;
// normalize to the constructable class.
const Ajv2020 = (Ajv2020Import as unknown as { default?: unknown }).default ?? Ajv2020Import;
import {
  buildTrustReport,
  validateTrustBundle,
  type Claim,
  type VerificationEvent,
} from "../src/index.js";

// Vendored schemas live at repo-root schemas/; tests run with cwd at the repo
// root (same convention as schema-parity.test.ts's relative "schemas" path).
const schemasDir = "schemas";

function compile(rootFile: string) {
  const AjvCtor = Ajv2020 as new (opts: Record<string, unknown>) => {
    addSchema: (s: unknown, k: string) => void;
    compile: (s: unknown) => ((data: unknown) => boolean) & { errors?: Array<{ keyword?: string }> | null };
  };
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  for (const f of readdirSync(schemasDir).sort()) {
    if (!f.endsWith(".schema.json") || f === rootFile) continue;
    ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, f), "utf8")), f);
  }
  return ajv.compile(JSON.parse(readFileSync(join(schemasDir, rootFile), "utf8")));
}

function assumedEvent(claimId: string): VerificationEvent {
  return {
    id: `event.${claimId}.assumed`,
    claimId,
    status: "assumed",
    actor: "planner",
    method: "planning-assumption",
    evidenceIds: [],
    createdAt: "2026-06-01T00:05:00.000Z",
  };
}

const baseClaim: Omit<Claim, "id" | "value" | "fieldOrBehavior"> = {
  subjectType: "repo-governance.repo",
  subjectId: "repo-A",
  facet: "repo-governance.developer-evidence",
  claimType: "software-evidence",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function buildWaiverReport() {
  const claims: Claim[] = [
    {
      ...baseClaim,
      id: "claim.complete-waiver",
      fieldOrBehavior: "assumed-complete-waiver",
      value: "OPEN",
      metadata: {
        waiver: {
          reason: "Deferred to next release cycle.",
          approved_by: "actor:eng-lead-1",
          approved_at: "2026-06-01T00:00:00.000Z",
        },
      },
    },
    { ...baseClaim, id: "claim.bare-assumed", fieldOrBehavior: "assumed-no-waiver", value: "OPEN" },
  ];
  const bundle = validateTrustBundle({
    schemaVersion: 6,
    source: "waiver-validity-schema-test",
    claims,
    evidence: [],
    policies: [],
    events: [assumedEvent("claim.complete-waiver"), assumedEvent("claim.bare-assumed")],
  });
  return buildTrustReport(bundle, { id: "report.waiver-schema", now: new Date("2026-06-02T00:00:00.000Z") });
}

test("#128: a real waiver-bearing TrustReport validates against the shipped trust-report-waivers.schema.json", () => {
  const report = buildWaiverReport();
  // Sanity: the report actually carries the waiver-validity projection.
  assert.ok(report.waiverValidityByClaimId, "report should carry waiverValidityByClaimId");
  assert.equal(report.waiverValidityByClaimId["claim.complete-waiver"]?.verdict, "complete-waiver");
  assert.equal(report.waiverValidityByClaimId["claim.bare-assumed"]?.verdict, "bare-assumed");

  const validateExt = compile("trust-report-waivers.schema.json");
  const okExt = validateExt(report);
  assert.equal(okExt, true, JSON.stringify(validateExt.errors));
});

test("#128: the same report is rejected by the neutral core trust-report.schema.json (why the extension is needed)", () => {
  const report = buildWaiverReport();
  const validateCore = compile("trust-report.schema.json");
  const okCore = validateCore(report);
  assert.equal(okCore, false);
  assert.ok(
    validateCore.errors?.some((e: { keyword?: string }) => e.keyword === "unevaluatedProperties"),
    JSON.stringify(validateCore.errors),
  );
});

test("#128: a report with the waiver fields stripped still validates against the core schema (core unchanged)", () => {
  const report = buildWaiverReport();
  const core = { ...report };
  delete (core as Record<string, unknown>).waiverValidityByClaimId;
  delete (core as Record<string, unknown>).waiverValidityFunctionVersion;
  const validateCore = compile("trust-report.schema.json");
  const okCore = validateCore(core);
  assert.equal(okCore, true, JSON.stringify(validateCore.errors));
});
