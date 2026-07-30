import { build } from "esbuild";

await build({
  entryPoints: ["src/commands/mcp.ts"],
  outfile: "dist/src/commands/mcp.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});
