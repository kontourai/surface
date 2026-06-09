import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SurfaceConsoleConfig } from "../console/types.js";
import { requireValue } from "./shared.js";

export async function runConsole(args: string[]): Promise<void> {
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

  const { startConsoleServer } = await import("../console/server.js");
  await startConsoleServer(config);
  await new Promise(() => {});
}
