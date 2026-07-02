import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SurfaceConsoleConfig } from "../console/types.js";
import { requireValue } from "./shared.js";

export async function runConsole(args: string[]): Promise<void> {
  let configPath: string | undefined;
  let port: number | undefined;
  let readModelPath: string | undefined;
  let storePath: string | undefined;
  // Repeatable producer bundle inputs, mirroring `surface report --input`
  // semantics (src/commands/shared.ts). Additive to --read-model: any --input
  // switches the console onto the merge-and-project path.
  const inputs: string[] = [];

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
    } else if (arg === "--input") {
      inputs.push(resolve(requireValue(args, ++index, "--input")));
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
  if (inputs.length > 0) config = { ...config, inputs };

  // Documented behavior (README, docs/reference/console.md): any --input
  // switches the console onto the merge-and-project path, additive to (and
  // taking precedence over) the single --read-model/--store path. Surface a
  // one-line runtime notice so operators who pass both are not surprised by
  // which path actually served the view.
  if (inputs.length > 0 && (readModelPath !== undefined || storePath !== undefined)) {
    process.stderr.write(
      "[surface console] --input was provided together with --read-model/--store; " +
        "--input wins (the console serves the merged producer-bundle view). " +
        "See docs/reference/console.md.\n",
    );
  }

  const { startConsoleServer } = await import("../console/server.js");
  await startConsoleServer(config);
  await new Promise(() => {});
}
