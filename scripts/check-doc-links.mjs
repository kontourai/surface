import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const files = [
  "README.md",
  "AGENTS.md",
  ...(await findMarkdownFiles("docs")),
].sort();

const failures = [];

for (const file of files) {
  const content = await readFile(path.join(root, file), "utf8");
  for (const link of extractLinks(content)) {
    const target = resolveLocalTarget(file, link.href);
    if (!target) continue;

    try {
      await access(path.join(root, target));
    } catch {
      failures.push(`${file}:${link.line}: missing ${link.href} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Broken local Markdown links:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Markdown link check passed: ${files.length} files.`);
}

async function findMarkdownFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }
  return files;
}

function extractLinks(markdown) {
  const links = [];
  const lines = markdown.split(/\r?\n/);
  let inCodeFence = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    links.push(...extractInlineLinks(line, lineIndex + 1));
    links.push(...extractReferenceDefinitions(line, lineIndex + 1));
  }
  return links;
}

function extractInlineLinks(line, lineNumber) {
  const links = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "[") continue;
    const labelEnd = line.indexOf("]", index + 1);
    if (labelEnd === -1 || line[labelEnd + 1] !== "(") continue;

    const hrefStart = labelEnd + 2;
    const hrefEnd = findLinkEnd(line, hrefStart);
    if (hrefEnd === -1) continue;

    const rawHref = line.slice(hrefStart, hrefEnd).trim();
    const href = trimOptionalTitle(rawHref);
    if (href) links.push({ href, line: lineNumber });
    index = hrefEnd;
  }
  return links;
}

function extractReferenceDefinitions(line, lineNumber) {
  const match = line.match(/^\s{0,3}\[[^\]]+\]:\s+(\S+)/);
  if (!match) return [];
  return [{ href: match[1], line: lineNumber }];
}

function findLinkEnd(line, start) {
  let depth = 0;
  let inAngle = false;
  for (let index = start; index < line.length; index += 1) {
    const char = line[index];
    if (char === "<") inAngle = true;
    else if (char === ">") inAngle = false;
    else if (char === "(" && !inAngle) depth += 1;
    else if (char === ")" && !inAngle) {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function trimOptionalTitle(rawHref) {
  const unwrapped = rawHref.startsWith("<") && rawHref.includes(">")
    ? rawHref.slice(1, rawHref.indexOf(">"))
    : rawHref.split(/\s+(?=["'])/)[0];
  return unwrapped.trim();
}

function resolveLocalTarget(sourceFile, href) {
  if (!href || href.startsWith("#")) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return undefined;

  const [pathPart] = href.split("#", 1);
  if (!pathPart || pathPart.startsWith("/")) return undefined;

  const decoded = safeDecode(pathPart);
  if (!decoded || decoded.includes("\0")) return undefined;

  const normalized = path.normalize(path.join(path.dirname(sourceFile), decoded));
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return undefined;

  return normalized;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
