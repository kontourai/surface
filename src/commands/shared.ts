import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAdapter, listAdapters } from "../adapter.js";
import { buildTrustReport } from "../report.js";
import { validateTrustBundle } from "../validate.js";
import type { TrustReport } from "../types.js";

export interface CommonReportOptions {
  input: string;
  runId?: string;
  adapter: string;
}

export interface QueryOptions extends CommonReportOptions {
  claimId?: string;
  policyId?: string;
}

export function parseReportArgs(args: string[]): {
  input: string;
  format: "json" | "summary" | "linked" | "analytics";
  runId?: string;
  adapter: string;
} {
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

export function parseQueryArgs(args: string[]): QueryOptions {
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

export async function loadReport(options: CommonReportOptions): Promise<TrustReport> {
  const raw = await readFile(options.input, "utf8");
  const parsed = JSON.parse(raw);
  const adapter = getAdapter(options.adapter);
  if (!adapter) {
    throw new Error(`Unknown adapter: ${options.adapter}. Registered adapters: ${registeredAdapterNames()}`);
  }
  const input = validateTrustBundle(adapter.adapt(parsed));
  return buildTrustReport(input, { id: options.runId });
}

export function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function defaultInputForAdapter(adapterName: string): string {
  const adapter = getAdapter(adapterName);
  if (!adapter) {
    throw new Error(`Unknown adapter: ${adapterName}. Registered adapters: ${registeredAdapterNames()}`);
  }
  return adapter.defaultFixture ?? "examples/surface-fixtures.json";
}

function registeredAdapterNames(): string {
  return listAdapters().map((adapter) => adapter.name).sort().join(", ");
}
