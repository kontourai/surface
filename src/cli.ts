import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adaptVeritasEvidenceToTrustInput } from "./adapters/veritas.js";
import { adaptFactResolutionExportToTrustInput } from "../examples/adapters/fact-resolution.js";
import { adaptFieldAttestedRecordsExportToTrustInput } from "../examples/adapters/field-attested-records.js";
import { buildTrustReport, formatTrustReportSummary } from "./report.js";
import { validateTrustInput } from "./validate.js";
import { toLinkedReport } from "./linked.js";

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
  } else if (options.format === "linked") {
    console.log(JSON.stringify(toLinkedReport(report), null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

type AdapterName = "surface" | "veritas" | "field-attested-records" | "fact-resolution";

function adaptInput(adapter: AdapterName, parsed: unknown): unknown {
  if (adapter === "veritas") return adaptVeritasEvidenceToTrustInput(parsed);
  if (adapter === "field-attested-records") return adaptFieldAttestedRecordsExportToTrustInput(parsed);
  if (adapter === "fact-resolution") return adaptFactResolutionExportToTrustInput(parsed);
  return parsed;
}

function defaultInputForAdapter(adapter: AdapterName): string {
  if (adapter === "veritas") return "examples/veritas-evidence.json";
  if (adapter === "field-attested-records") return "examples/field-attested-records-export.json";
  if (adapter === "fact-resolution") return "examples/fact-resolution-export.json";
  return "examples/surface-fixtures.json";
}

function parseReportArgs(args: string[]): { input: string; format: "json" | "summary" | "linked"; runId?: string; adapter: AdapterName } {
  let input = resolve("examples/surface-fixtures.json");
  let format: "json" | "summary" | "linked" = "json";
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
      if (value !== "json" && value !== "summary" && value !== "linked") {
        throw new Error("--format must be json, summary, or linked");
      }
      format = value;
    } else if (arg === "--run-id") runId = requireValue(args, ++index, "--run-id");
    else if (arg === "--adapter") {
      const value = requireValue(args, ++index, "--adapter");
      if (value !== "surface" && value !== "veritas" && value !== "field-attested-records" && value !== "fact-resolution") {
        throw new Error("--adapter must be surface, veritas, field-attested-records, or fact-resolution");
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
  surface report [--input examples/surface-fixtures.json] [--format json|summary|linked]
  surface report --adapter veritas [--input examples/veritas-evidence.json] [--format json|summary|linked]
  surface report --adapter field-attested-records [--input examples/field-attested-records-export.json] [--format json|summary|linked]
  surface report --adapter fact-resolution [--input examples/fact-resolution-export.json] [--format json|summary|linked]

Surface reports map product claims to evidence, freshness, and trust status.
`);
}
