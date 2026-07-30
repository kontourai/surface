import { build } from "esbuild";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outfile = "dist/src/commands/mcp.js";
const result = await build({
  entryPoints: ["src/commands/mcp.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  metafile: true,
});

const packageRoots = new Set(
  Object.keys(result.metafile.inputs)
    .filter((input) => input.includes("node_modules/"))
    .map(packageRootForInput),
);
const notices = [];

for (const packageRoot of [...packageRoots].sort()) {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  const licenseFiles = (await readdir(packageRoot))
    .filter((name) => /^(license|notice|copying)(?:[.-].*)?$/i.test(name))
    .sort();
  if (licenseFiles.length === 0) {
    throw new Error(
      `Bundled dependency ${manifest.name ?? packageRoot} has no license or notice file`,
    );
  }

  notices.push(
    `===== ${manifest.name}@${manifest.version} (${manifest.license ?? "license not declared"}) =====`,
  );
  for (const licenseFile of licenseFiles) {
    notices.push(
      await readFile(path.join(packageRoot, licenseFile), "utf8").then((text) =>
        text.trim(),
      ),
    );
  }
}

await writeFile(`${outfile}.LEGAL.txt`, `${notices.join("\n\n")}\n`);

function packageRootForInput(input) {
  const parts = input.split("/");
  const nodeModulesIndex = parts.lastIndexOf("node_modules");
  const packageEnd =
    parts[nodeModulesIndex + 1]?.startsWith("@")
      ? nodeModulesIndex + 3
      : nodeModulesIndex + 2;
  return parts.slice(0, packageEnd).join("/");
}
