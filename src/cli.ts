import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  const input = validateTrustInput(JSON.parse(raw));
  const report = buildTrustReport(input, { id: options.runId });

  if (options.format === "summary") {
    console.log(formatTrustReportSummary(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

function parseReportArgs(args: string[]): { input: string; format: "json" | "summary"; runId?: string } {
  let input = resolve("examples/surface-fixtures.json");
  let format: "json" | "summary" = "json";
  let runId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") input = resolve(requireValue(args, ++index, "--input"));
    else if (arg === "--format") {
      const value = requireValue(args, ++index, "--format");
      if (value !== "json" && value !== "summary") throw new Error("--format must be json or summary");
      format = value;
    } else if (arg === "--run-id") runId = requireValue(args, ++index, "--run-id");
    else throw new Error(`Unknown report argument: ${arg}`);
  }

  return { input, format, runId };
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

Surface reports map product claims to evidence, freshness, and trust status.
`);
}

