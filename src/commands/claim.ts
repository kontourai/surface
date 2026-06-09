import { resolve } from "node:path";
import {
  addAuthoredClaim,
  parseImpactLevel,
  removeAuthoredClaim,
  updateAuthoredClaim,
  type ClaimDefinitionUpdateDraft,
} from "../claim-authoring.js";
import {
  loadClaimStore,
  saveClaimStore,
  validateClaimStore,
} from "../store.js";
import type { ImpactLevel } from "../types.js";
import { requireValue } from "./shared.js";

export async function runClaimCommand(args: string[]): Promise<void> {
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
