import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import "./adapters/builtin.js";
import { getAdapter, listAdapters } from "./adapter.js";
import { buildTrustReport, formatTrustReportSummary } from "./report.js";
import { validateTrustInput } from "./validate.js";
import { toLinkedReport } from "./linked.js";
import { buildTrustAnalyticsProjection } from "./analytics.js";
import {
  addAuthoredClaim,
  parseImpactLevel,
  removeAuthoredClaim,
  updateAuthoredClaim,
  type ClaimDefinitionUpdateDraft,
} from "./claim-authoring.js";
import {
  loadClaimStore,
  saveClaimStore,
  validateClaimStore,
} from "./store.js";
import type { ImpactLevel, TrustReport } from "./types.js";
import type { SurfaceConsoleConfig } from "./console/types.js";

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "report") {
    await runReport(rest);
  } else if (command === "console") {
    await runConsole(rest);
  } else if (command === "stale") {
    const report = await loadReport(parseQueryArgs(rest));
    console.log(JSON.stringify(buildTrustAnalyticsProjection(report).staleClaims, null, 2));
  } else if (command === "missing") {
    const report = await loadReport(parseQueryArgs(rest));
    console.log(JSON.stringify(buildTrustAnalyticsProjection(report).evidenceRequirementGaps, null, 2));
  } else if (command === "policy") {
    const options = parseQueryArgs(rest);
    const report = await loadReport(options);
    console.log(JSON.stringify(projectPolicyQuery(report, options), null, 2));
  } else if (command === "claim") {
    await runClaimCommand(rest);
  } else if (command === "get") {
    const options = parseQueryArgs(rest);
    if (!options.claimId) throw new Error("surface get requires --claim-id");
    const report = await loadReport(options);
    console.log(JSON.stringify(projectClaimQuery(report, options.claimId), null, 2));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

async function runConsole(args: string[]): Promise<void> {
  let configPath: string | undefined;
  let port: number | undefined;
  let readModelPath: string | undefined;
  let storePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--config") {
      configPath = requireValue(args, ++index, "--config");
    } else if (arg === "--port") {
      const rawPort = requireValue(args, ++index, "--port");
      port = Number.parseInt(rawPort, 10);
      if (!Number.isInteger(port)) throw new Error("--port must be an integer");
    } else if (arg === "--read-model") {
      readModelPath = requireValue(args, ++index, "--read-model");
    } else if (arg === "--store") {
      storePath = requireValue(args, ++index, "--store");
    } else {
      throw new Error(`Unknown console argument: ${arg}`);
    }
  }

  let config: SurfaceConsoleConfig = {};
  if (configPath) {
    config = JSON.parse(await readFile(resolve(configPath), "utf8")) as SurfaceConsoleConfig;
  }
  if (port !== undefined) config = { ...config, port };
  if (readModelPath) config = { ...config, readModelPath };
  if (storePath) config = { ...config, storePath };

  const { startConsoleServer } = await import("./console/server.js");
  await startConsoleServer(config);
  await new Promise(() => {});
}

async function runClaimCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "list") return runClaimList(rest);
  if (subcommand === "add") return runClaimAdd(rest);
  if (subcommand === "edit") return runClaimEdit(rest);
  if (subcommand === "remove") return runClaimRemove(rest);
  if (subcommand === "validate") return runClaimValidate(rest);
  throw new Error(`Unknown claim subcommand: ${String(subcommand)}. Use list, add, edit, remove, or validate.`);
}

function runClaimList(args: string[]): void {
  const options = parseClaimArgs(args);
  const store = loadClaimStore(resolve(options.store));
  if (store.claims.length === 0) {
    console.log("No claims defined.");
    return;
  }
  for (const claim of store.claims) {
    console.log(`${claim.id}\t${claim.claimType}\t${claim.surface}\t${claim.fieldOrBehavior}`);
  }
}

function runClaimAdd(args: string[]): void {
  const options = parseClaimArgs(args);
  requireClaimCreateOptions(options);
  const storePath = resolve(options.store);
  const { store, claim } = addAuthoredClaim(loadClaimStore(storePath), {
    id: options.id,
    surface: options.surface,
    claimType: options.type,
    fieldOrBehavior: options.field,
    subjectType: options.subjectType,
    subjectId: options.subjectId,
    impactLevel: options.impact,
    verificationPolicyId: options.policyId,
    metadata: options.metadata,
  });
  saveClaimStore(store, storePath);
  console.log(`Added claim: ${claim.id}`);
}

function runClaimEdit(args: string[]): void {
  const options = parseClaimArgs(args);
  if (!options.claimId) throw new Error("surface claim edit requires --claim-id");
  const updates: ClaimDefinitionUpdateDraft = {};
  if (options.type) updates.claimType = options.type;
  if (options.surface) updates.surface = options.surface;
  if (options.subjectType) updates.subjectType = options.subjectType;
  if (options.subjectId) updates.subjectId = options.subjectId;
  if (options.field) updates.fieldOrBehavior = options.field;
  if (options.impact) updates.impactLevel = options.impact;
  if (options.policyId) updates.verificationPolicyId = options.policyId;
  if (options.metadata) updates.metadata = options.metadata;
  const storePath = resolve(options.store);
  const { store } = updateAuthoredClaim(loadClaimStore(storePath), options.claimId, updates);
  saveClaimStore(store, storePath);
  console.log(`Updated claim: ${options.claimId}`);
}

function runClaimRemove(args: string[]): void {
  const options = parseClaimArgs(args);
  if (!options.claimId) throw new Error("surface claim remove requires --claim-id");
  const storePath = resolve(options.store);
  const updated = removeAuthoredClaim(loadClaimStore(storePath), options.claimId);
  saveClaimStore(updated, storePath);
  console.log(`Removed claim: ${options.claimId}`);
}

function runClaimValidate(args: string[]): void {
  const options = parseClaimArgs(args);
  const store = validateClaimStore(loadClaimStore(resolve(options.store)));
  const policyIds = new Set(store.policies.map((policy) => policy.id));
  const issues = store.claims
    .filter((claim) => claim.verificationPolicyId && !policyIds.has(claim.verificationPolicyId))
    .map((claim) => `Claim "${claim.id}" references unknown policy "${claim.verificationPolicyId}"`);
  console.log(`${store.claims.length} claims, ${store.policies.length} policies`);
  if (issues.length > 0) {
    for (const issue of issues) console.log(`- ${issue}`);
    throw new Error(`${issues.length} claim store issue${issues.length === 1 ? "" : "s"} found`);
  }
  console.log("Claim store is valid.");
}

async function runReport(args: string[]): Promise<void> {
  const options = parseReportArgs(args);
  const report = await loadReport(options);

  if (options.format === "summary") {
    console.log(formatTrustReportSummary(report));
  } else if (options.format === "linked") {
    console.log(JSON.stringify(toLinkedReport(report), null, 2));
  } else if (options.format === "analytics") {
    console.log(JSON.stringify(buildTrustAnalyticsProjection(report), null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

async function loadReport(options: CommonReportOptions): Promise<TrustReport> {
  const raw = await readFile(options.input, "utf8");
  const parsed = JSON.parse(raw);
  const adapter = getAdapter(options.adapter);
  if (!adapter) {
    throw new Error(`Unknown adapter: ${options.adapter}. Registered adapters: ${registeredAdapterNames()}`);
  }
  const input = validateTrustInput(adapter.adapt(parsed));
  return buildTrustReport(input, { id: options.runId });
}

interface CommonReportOptions {
  input: string;
  runId?: string;
  adapter: string;
}

interface QueryOptions extends CommonReportOptions {
  claimId?: string;
  policyId?: string;
}

function defaultInputForAdapter(adapterName: string): string {
  const adapter = getAdapter(adapterName);
  if (!adapter) {
    throw new Error(`Unknown adapter: ${adapterName}. Registered adapters: ${registeredAdapterNames()}`);
  }
  return adapter.defaultFixture ?? "examples/surface-fixtures.json";
}

function parseReportArgs(args: string[]): { input: string; format: "json" | "summary" | "linked" | "analytics"; runId?: string; adapter: string } {
  let input = resolve("examples/surface-fixtures.json");
  let format: "json" | "summary" | "linked" | "analytics" = "json";
  let runId: string | undefined;
  let adapter = "surface";
  let inputExplicit = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      input = resolve(requireValue(args, ++index, "--input"));
      inputExplicit = true;
    }
    else if (arg === "--format") {
      const value = requireValue(args, ++index, "--format");
      if (value !== "json" && value !== "summary" && value !== "linked" && value !== "analytics") {
        throw new Error("--format must be json, summary, linked, or analytics");
      }
      format = value;
    } else if (arg === "--run-id") runId = requireValue(args, ++index, "--run-id");
    else if (arg === "--adapter") {
      const value = requireValue(args, ++index, "--adapter");
      adapter = value;
      if (!inputExplicit) {
        input = resolve(defaultInputForAdapter(adapter));
      }
    }
    else throw new Error(`Unknown report argument: ${arg}`);
  }

  return { input, format, runId, adapter };
}

function parseQueryArgs(args: string[]): QueryOptions {
  let input = resolve("examples/surface-fixtures.json");
  let runId: string | undefined;
  let adapter = "surface";
  let inputExplicit = false;
  let claimId: string | undefined;
  let policyId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      input = resolve(requireValue(args, ++index, "--input"));
      inputExplicit = true;
    } else if (arg === "--run-id") {
      runId = requireValue(args, ++index, "--run-id");
    } else if (arg === "--adapter") {
      const value = requireValue(args, ++index, "--adapter");
      adapter = value;
      if (!inputExplicit) input = resolve(defaultInputForAdapter(adapter));
    } else if (arg === "--claim-id") {
      claimId = requireValue(args, ++index, "--claim-id");
    } else if (arg === "--policy-id") {
      policyId = requireValue(args, ++index, "--policy-id");
    } else {
      throw new Error(`Unknown query argument: ${arg}`);
    }
  }

  return { input, runId, adapter, claimId, policyId };
}

function projectClaimQuery(report: TrustReport, claimId: string): unknown {
  const claim = report.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Unknown claim: ${claimId}`);
  const policy = claim.verificationPolicyId
    ? report.policies.find((item) => item.id === claim.verificationPolicyId)
    : undefined;
  return {
    claim,
    evidence: report.evidence.filter((item) => item.claimId === claimId),
    authorityTrace: (report.authorityTrace ?? []).filter((item) => item.claimIds?.includes(claimId)),
    events: report.events.filter((item) => item.claimId === claimId),
    policy,
    evidenceRequirement: report.evidenceRequirementsByClaimId[claimId],
    transparencyGaps: report.transparencyGaps.filter((item) => item.claimId === claimId),
  };
}

function projectPolicyQuery(report: TrustReport, options: QueryOptions): unknown {
  const projection = buildTrustAnalyticsProjection(report);
  const policyId = options.policyId ?? policyIdForClaim(report, options.claimId);
  if (policyId) {
    const policy = report.policies.find((item) => item.id === policyId);
    if (!policy) throw new Error(`Unknown policy: ${policyId}`);
    const claims = report.claims.filter((item) => item.verificationPolicyId === policyId);
    return {
      policy,
      claims,
      gaps: projection.evidenceRequirementGaps.filter((item) => item.policyId === policyId),
      authorityTrace: projection.authorityTrace.records.filter((item) => {
        return claims.some((claim) => item.claimIds.includes(claim.id));
      }),
      transparencyGaps: report.transparencyGaps.filter((item) => item.policyId === policyId),
    };
  }

  return report.policies.map((policy) => ({
    policy,
    claimIds: report.claims.filter((claim) => claim.verificationPolicyId === policy.id).map((claim) => claim.id),
    gapCount: projection.evidenceRequirementGaps.filter((gap) => gap.policyId === policy.id).length,
    transparencyGapCount: report.transparencyGaps.filter((transparencyGap) => transparencyGap.policyId === policy.id).length,
  }));
}

function policyIdForClaim(report: TrustReport, claimId: string | undefined): string | undefined {
  if (!claimId) return undefined;
  const claim = report.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Unknown claim: ${claimId}`);
  return claim.verificationPolicyId;
}

function registeredAdapterNames(): string {
  return listAdapters().map((adapter) => adapter.name).sort().join(", ");
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

interface ClaimCommandOptions {
  store: string;
  id?: string;
  claimId?: string;
  type?: string;
  surface?: string;
  subjectType?: string;
  subjectId?: string;
  field?: string;
  impact?: ImpactLevel;
  policyId?: string;
  metadata?: Record<string, unknown>;
}

function parseClaimArgs(args: string[]): ClaimCommandOptions {
  const options: ClaimCommandOptions = { store: "veritas.claims.json" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--store") options.store = requireValue(args, ++index, "--store");
    else if (arg === "--id") options.id = requireValue(args, ++index, "--id");
    else if (arg === "--claim-id") options.claimId = requireValue(args, ++index, "--claim-id");
    else if (arg === "--type") options.type = requireValue(args, ++index, "--type");
    else if (arg === "--surface") options.surface = requireValue(args, ++index, "--surface");
    else if (arg === "--subject-type") options.subjectType = requireValue(args, ++index, "--subject-type");
    else if (arg === "--subject-id") options.subjectId = requireValue(args, ++index, "--subject-id");
    else if (arg === "--field") options.field = requireValue(args, ++index, "--field");
    else if (arg === "--impact") options.impact = parseImpactLevel(requireValue(args, ++index, "--impact"), "--impact");
    else if (arg === "--policy-id") options.policyId = requireValue(args, ++index, "--policy-id");
    else if (arg === "--metadata") options.metadata = parseMetadata(requireValue(args, ++index, "--metadata"));
    else throw new Error(`Unknown claim argument: ${arg}`);
  }
  return options;
}

function requireClaimCreateOptions(options: ClaimCommandOptions): asserts options is ClaimCommandOptions & {
  type: string;
  surface: string;
  subjectType: string;
  subjectId: string;
  field: string;
} {
  for (const [field, flag] of [
    ["type", "--type"],
    ["surface", "--surface"],
    ["subjectType", "--subject-type"],
    ["subjectId", "--subject-id"],
    ["field", "--field"],
  ] as const) {
    if (!options[field]) throw new Error(`surface claim add requires ${flag}`);
  }
}

function parseMetadata(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--metadata must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function printHelp(): void {
  console.log(`Kontour Surface

Usage:
  surface report [--input examples/surface-fixtures.json] [--format json|summary|linked|analytics]
  surface report --adapter <name> --input <file> [--format json|summary|linked|analytics]
  surface console [--read-model .surface/runs/latest.json] [--store veritas.claims.json] [--port 4242] [--config surface.config.json]
  surface claim list [--store veritas.claims.json]
  surface claim add --type <claim-type> --surface <surface> --subject-type <type> --subject-id <id> --field <field-or-behavior> [--id <id>] [--impact low|medium|high|critical] [--policy-id <policy-id>] [--metadata '{"key":"value"}'] [--store veritas.claims.json]
  surface claim edit --claim-id <id> [--type <claim-type>] [--surface <surface>] [--subject-type <type>] [--subject-id <id>] [--field <field-or-behavior>] [--impact low|medium|high|critical] [--policy-id <policy-id>] [--metadata '{"key":"value"}'] [--store veritas.claims.json]
  surface claim remove --claim-id <id> [--store veritas.claims.json]
  surface claim validate [--store veritas.claims.json]
  surface get --claim-id <claim-id> [--input path] [--adapter name]
  surface stale [--input path] [--adapter name]
  surface missing [--input path] [--adapter name]
  surface policy [--policy-id <policy-id> | --claim-id <claim-id>] [--input path] [--adapter name]

Surface reports map product claims to evidence, freshness, and trust status.
`);
}
