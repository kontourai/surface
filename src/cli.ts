import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adaptCampfitTrustExportToTrustInput } from "./adapters/campfit.js";
import { adaptTaxesTrustExportToTrustInput } from "./adapters/taxes.js";
import { adaptVeritasEvidenceToTrustInput } from "./adapters/veritas.js";
import { buildTrustReport, formatTrustReportSummary } from "./report.js";
import { validateTrustInput } from "./validate.js";

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command !== "report") {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = parseReportArgs(rest);
  const raw = await readFile(options.input, "utf8");
  const parsed = JSON.parse(raw);
  const input = validateTrustInput(adaptInput(options.adapter, parsed));
  const report = buildTrustReport(input, { id: options.runId });

  if (options.format === "summary") {
    console.log(formatTrustReportSummary(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

type AdapterName = "surface" | "veritas" | "campfit" | "taxes";

function adaptInput(adapter: AdapterName, parsed: unknown): unknown {
  if (adapter === "veritas") return adaptVeritasEvidenceToTrustInput(parsed);
  if (adapter === "campfit") return adaptCampfitTrustExportToTrustInput(parsed);
  if (adapter === "taxes") return adaptTaxesTrustExportToTrustInput(parsed);
  return parsed;
}

function defaultInputForAdapter(adapter: AdapterName): string {
  if (adapter === "veritas") return "examples/veritas-evidence.json";
  if (adapter === "campfit") return "examples/campfit-trust-export.json";
  if (adapter === "taxes") return "examples/taxes-trust-export.json";
  return "examples/surface-fixtures.json";
}

function parseReportArgs(args: string[]): { input: string; format: "json" | "summary"; runId?: string; adapter: AdapterName } {
  let input = resolve("examples/surface-fixtures.json");
  let format: "json" | "summary" = "json";
  let runId: string | undefined;
  let adapter: AdapterName = "surface";
  let inputExplicit = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      input = resolve(requireValue(args, ++index, "--input"));
      inputExplicit = true;
    }
    else if (arg === "--format") {
      const value = requireValue(args, ++index, "--format");
      if (value !== "json" && value !== "summary") throw new Error("--format must be json or summary");
      format = value;
    } else if (arg === "--run-id") runId = requireValue(args, ++index, "--run-id");
    else if (arg === "--adapter") {
      const value = requireValue(args, ++index, "--adapter");
      if (value !== "surface" && value !== "veritas" && value !== "campfit" && value !== "taxes") {
        throw new Error("--adapter must be surface, veritas, campfit, or taxes");
      }
      adapter = value;
      if (!inputExplicit) {
        input = resolve(defaultInputForAdapter(adapter));
      }
    }
    else throw new Error(`Unknown report argument: ${arg}`);
  }

  return { input, format, runId, adapter };
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp(): void {
  console.log(`Kontour Surface

Usage:
  surface report [--input examples/surface-fixtures.json] [--format json|summary]
  surface report --adapter veritas [--input examples/veritas-evidence.json] [--format json|summary]
  surface report --adapter campfit [--input examples/campfit-trust-export.json] [--format json|summary]
  surface report --adapter taxes [--input examples/taxes-trust-export.json] [--format json|summary]

Surface reports map product claims to evidence, freshness, and trust status.
`);
}
