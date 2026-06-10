import "./adapters/builtin.js";
import { runClaimCommand } from "./commands/claim.js";
import { runConsole } from "./commands/console.js";
import { printHelp } from "./commands/help.js";
import {
  runGetQuery,
  runMissingQuery,
  runPolicyQuery,
  runStaleQuery,
} from "./commands/query.js";
import { runMcp } from "./commands/mcp.js";
import { runReport } from "./commands/report.js";

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
    await runStaleQuery(rest);
  } else if (command === "missing") {
    await runMissingQuery(rest);
  } else if (command === "policy") {
    await runPolicyQuery(rest);
  } else if (command === "claim") {
    await runClaimCommand(rest);
  } else if (command === "get") {
    await runGetQuery(rest);
  } else if (command === "mcp") {
    await runMcp(rest);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}
