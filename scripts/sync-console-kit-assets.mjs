import { cp, lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installedKitRoot = path.join(root, "node_modules", "@kontourai", "console-kit");
const siblingKitRoot = path.resolve(root, "..", "console-kit");
const target = path.join(root, "docs-site", "vendor", "console-kit", "tokens");
const checkOnly = process.argv.includes("--check");
const kitRoot = await resolveKitRoot();
const source = path.join(kitRoot, "tokens");

if (checkOnly) {
  await compareDirectories(source, target);
  console.log("Surface docs Console Kit vendor assets are synced.");
} else {
  await rm(path.dirname(target), { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  console.log("Synced Surface docs Console Kit vendor assets.");
}

async function resolveKitRoot() {
  for (const candidate of [installedKitRoot, siblingKitRoot]) {
    const stat = await lstat(candidate).catch(() => undefined);
    if (!stat?.isDirectory() && !stat?.isSymbolicLink()) continue;
    await assertPackageName(candidate);
    return candidate;
  }
  throw new Error("Missing @kontourai/console-kit. Install it or run from the kontourai workspace with ../console-kit present.");
}

async function assertPackageName(candidate) {
  const packageJsonPath = path.join(candidate, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (packageJson.name !== "@kontourai/console-kit") {
    throw new Error(`Expected @kontourai/console-kit at ${candidate}, found ${packageJson.name ?? "unnamed package"}.`);
  }
}

async function compareDirectories(sourceDir, targetDir) {
  const [sourceStat, targetStat] = await Promise.all([lstat(sourceDir), lstat(targetDir)]);
  if (targetStat.isSymbolicLink()) throw new Error(`Vendor asset must not be a symlink: ${targetDir}`);
  if (!sourceStat.isDirectory() || !targetStat.isDirectory()) throw new Error(`Expected directory: ${targetDir}`);

  const sourceEntries = await readdir(sourceDir, { withFileTypes: true });
  const targetEntries = await readdir(targetDir, { withFileTypes: true });
  const sourceNames = sourceEntries.map((entry) => entry.name).sort();
  const targetNames = targetEntries.map((entry) => entry.name).sort();
  const targetByName = new Map(targetEntries.map((entry) => [entry.name, entry]));

  if (sourceNames.join("\0") !== targetNames.join("\0")) {
    throw new Error(`Vendor directory drifted: ${targetDir}`);
  }

  for (const sourceEntry of sourceEntries) {
    const sourcePath = path.join(sourceDir, sourceEntry.name);
    const targetPath = path.join(targetDir, sourceEntry.name);
    const targetEntry = targetByName.get(sourceEntry.name);
    if (!targetEntry || targetEntry.isSymbolicLink()) {
      throw new Error(`Vendor asset must not be a symlink: ${targetPath}`);
    }
    if (sourceEntry.isDirectory()) {
      await compareDirectories(sourcePath, targetPath);
    } else if (sourceEntry.isFile()) {
      if (!targetEntry.isFile()) throw new Error(`Expected file: ${targetPath}`);
      await compareFiles(sourcePath, targetPath);
    }
  }
}

async function compareFiles(sourcePath, targetPath) {
  const [sourceContent, targetContent] = await Promise.all([readFile(sourcePath), readFile(targetPath)]);
  if (!sourceContent.equals(targetContent)) {
    throw new Error(`Vendor file drifted: ${targetPath}`);
  }
}
