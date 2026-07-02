import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { cwd } from "node:process";
import { buildConsoleHtml } from "./shell.js";
import { CONSOLE_SCRIPT } from "./script.js";
import { CONSOLE_CSS } from "./styles.js";
import { buildSurfaceConsoleProjection, emptySurfaceConsoleProjection } from "./projection.js";
import { loadMergedConsoleReadModel } from "./merged-read-model.js";
import {
  parseImpactLevel,
  type ClaimDefinitionDraft,
  type ClaimDefinitionUpdateDraft,
} from "../claim-authoring.js";
import {
  addClaimStoreClaim,
  removeClaimStoreClaim,
  updateClaimStoreClaim,
} from "../claim-store-transactions.js";
import { listExtensions } from "../extension.js";
import type { SurfaceConsoleConfig } from "./types.js";

const SURFACE_RUNS_DEFAULT = ".surface/runs/latest.json";

// ── SSE broadcaster — emits "model" events when watched files change ──────────
// Uses fs.watch + 250 ms debounce for fast notification; a 2 s polling interval
// acts as a fallback for environments where fs.watch is unreliable.
class SseBroadcaster {
  private clients: Set<ServerResponse> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastMtime: number = 0;

  constructor(private watchedPaths: string[]) {}

  start(): void {
    // fs.watch listeners — one per path, errors are silently ignored
    for (const p of this.watchedPaths) {
      try {
        const watcher = watch(p, () => this.scheduleEmit());
        watcher.on("error", () => { /* ignored */ });
      } catch {
        // Path may not exist yet; polling will catch it
      }
    }

    // 2 s polling fallback: check mtime and emit if changed
    this.pollTimer = setInterval(() => {
      void this.pollCheck();
    }, 2000);
    // Keep the interval unreffed so it does not prevent process exit
    this.pollTimer.unref?.();
  }

  private scheduleEmit(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.emit();
    }, 250);
  }

  private async pollCheck(): Promise<void> {
    try {
      const { stat } = await import("node:fs/promises");
      for (const p of this.watchedPaths) {
        try {
          const s = await stat(p);
          const mtime = s.mtimeMs;
          if (mtime !== this.lastMtime && this.lastMtime !== 0) {
            this.lastMtime = mtime;
            this.scheduleEmit();
            return;
          }
          if (this.lastMtime === 0) this.lastMtime = mtime;
        } catch { /* path missing */ }
      }
    } catch { /* ignore */ }
  }

  addClient(res: ServerResponse): void {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
    res.on("error", () => this.clients.delete(res));
  }

  emit(): void {
    const payload = `event: model\ndata: {}\n\n`;
    for (const client of this.clients) {
      try { client.write(payload); } catch { this.clients.delete(client); }
    }
  }

  stop(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }
}


async function loadReadModel(indexPath: string): Promise<unknown> {
  const absoluteIndexPath = resolve(indexPath);
  const raw = await readFile(absoluteIndexPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed["kind"] === "surface-console-index" && typeof parsed["readModelPath"] === "string") {
    // readModelPath is relative to the repo root; index lives under .surface/runs/.
    const repoRoot = dirname(dirname(dirname(absoluteIndexPath)));
    const modelPath = resolve(repoRoot, parsed["readModelPath"]);
    const modelRaw = await readFile(modelPath, "utf8");
    return JSON.parse(modelRaw);
  }
  return parsed;
}

async function resolveReadModelPath(configuredPath: string): Promise<string> {
  return configuredPath;
}

function projectionFromReadModel(readModel: unknown, config: SurfaceConsoleConfig, storePath: string): unknown {
  return buildSurfaceConsoleProjection(readModel, { ...config, storePath, readModel, folderName: basename(cwd()) });
}

async function loadConsoleProjection(indexPath: string, config: SurfaceConsoleConfig, storePath: string): Promise<unknown> {
  const readModel = await loadReadModel(indexPath);
  return projectionFromReadModel(readModel, config, storePath);
}

export async function startConsoleServer(config: SurfaceConsoleConfig = {}): Promise<void> {
  const port = config.port ?? 4242;
  const readModelPath = config.readModelPath ?? SURFACE_RUNS_DEFAULT;
  const storePath = config.storePath ?? "veritas.claims.json";
  // Producer bundle inputs (additive to --read-model). Any --input switches the
  // console onto the merge-and-project path: each request rebuilds the read model
  // by merging the bundles, so edits to any producer bundle refresh live.
  const inputs = (config.inputs ?? []).map((p) => resolve(p));
  const inputsMode = inputs.length > 0;

  // Rebuild the merged read model from the producer bundles. Kept as a closure so
  // request handlers can await a fresh merge on every fetch (mirrors the file-watch
  // live-reload behavior of the read-model-artifact path).
  async function mergedReadModel(): Promise<unknown> {
    return loadMergedConsoleReadModel(inputs, { runId: "console-merge" });
  }

  // In inputs mode watch the producer bundles (not a pre-built read-model file) so
  // any edit to a bundle triggers a live refresh; the store is watched in both modes.
  const watchPaths = inputsMode
    ? [...inputs, resolve(storePath)]
    : [resolve(readModelPath), resolve(storePath)];
  const broadcaster = new SseBroadcaster(watchPaths);
  broadcaster.start();

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const url = requestUrl.pathname;

    if (url === "/console.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(CONSOLE_SCRIPT);
      return;
    }

    if (url === "/console.css") {
      res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      res.end(CONSOLE_CSS);
      return;
    }

    if (url === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      // Send an initial ping so the client knows the connection is live
      res.write(": connected\n\n");
      broadcaster.addClient(res);
      req.on("close", () => res.end());
      return;
    }

    if (url === "/api/runs") {
      // The run picker only applies to the read-model-artifact path; merged bundle
      // inputs are a single synthesized view with no per-run archive to enumerate.
      if (inputsMode) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify([]));
        return;
      }
      try {
        const dashDir = resolve(dirname(await resolveReadModelPath(readModelPath)));
        const files = await readdir(dashDir).catch(() => [] as string[]);
        const runFiles = files.filter(f => f.endsWith(".console.json") && f !== "latest.json");
        const runs = await Promise.all(runFiles.map(async (f) => {
          try {
            const data = JSON.parse(await readFile(resolve(dashDir, f), "utf8")) as Record<string, unknown>;
            const producer = data["producer"] as Record<string, unknown> | undefined;
            const summary = data["summary"] as Record<string, unknown> | undefined;
            const attentionIds = (summary?.["attentionClaimIds"] as unknown[] | undefined) ?? [];
            return {
              runId: String(producer?.["runId"] ?? basename(f, ".console.json")),
              generatedAt: data["generatedAt"] ?? null,
              claimCount: summary?.["claimCount"] ?? 0,
              verifiedCount: (summary?.["statusCounts"] as Record<string,number> | undefined)?.["verified"] ?? 0,
              attentionCount: attentionIds.length,
              fileName: f,
            };
          } catch { return null; }
        }));
        const sorted = (runs.filter(Boolean) as NonNullable<typeof runs[0]>[])
          .sort((a, b) => new Date(String(b.generatedAt ?? 0)).getTime() - new Date(String(a.generatedAt ?? 0)).getTime());
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(sorted));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify([]));
      }
      return;
    }

    if (url === "/api/read-model") {
      const runParam = requestUrl.searchParams.get("run");
      try {
        const readModel = inputsMode
          ? await mergedReadModel()
          : await loadReadModel(effectiveReadModelPath(readModelPath, runParam));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(readModel));
      } catch (error) {
        if (error instanceof InvalidRunParamError) {
          respondBadRequest(res, error);
          return;
        }
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "read model not found" }));
      }
      return;
    }

    if (url === "/api/console-model") {
      const runParam = requestUrl.searchParams.get("run");
      try {
        const consoleModel = inputsMode
          ? projectionFromReadModel(await mergedReadModel(), config, storePath)
          : await loadConsoleProjection(effectiveReadModelPath(readModelPath, runParam), config, storePath);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(consoleModel));
      } catch (error) {
        if (error instanceof InvalidRunParamError) {
          respondBadRequest(res, error);
          return;
        }
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "console model not found" }));
      }
      return;
    }

    if (url === "/api/claims" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const resolvedStorePath = resolve(storePath);
        const { claim } = addClaimStoreClaim(resolvedStorePath, claimFromBody(body));
        res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, claim }));
      } catch (error) {
        respondBadRequest(res, error);
      }
      return;
    }

    if (url.startsWith("/api/claims/") && req.method === "PUT") {
      try {
        const claimId = decodeURIComponent(url.slice("/api/claims/".length));
        const body = await readJsonBody(req);
        const resolvedStorePath = resolve(storePath);
        updateClaimStoreClaim(resolvedStorePath, claimId, claimUpdatesFromBody(body));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        respondBadRequest(res, error);
      }
      return;
    }

    if (url.startsWith("/api/claims/") && req.method === "DELETE") {
      try {
        const claimId = decodeURIComponent(url.slice("/api/claims/".length));
        const resolvedStorePath = resolve(storePath);
        removeClaimStoreClaim(resolvedStorePath, claimId);
        res.writeHead(204);
        res.end();
      } catch (error) {
        respondBadRequest(res, error);
      }
      return;
    }

    try {
      const readModel = inputsMode
        ? await mergedReadModel()
        : await loadReadModel(await resolveReadModelPath(readModelPath));
      const folderName = basename(cwd());
      const consoleModel = buildSurfaceConsoleProjection(readModel, { ...config, storePath, readModel, folderName });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildConsoleHtml({
        ...config,
        storePath,
        claimTypes: registeredClaimTypes(),
        readModel,
        consoleModel,
        emptyConsoleModel: emptySurfaceConsoleProjection({ ...config, storePath, folderName }),
        folderName,
      }));
    } catch {
      const folderName = basename(cwd());
      const emptyConsoleModel = emptySurfaceConsoleProjection({ ...config, storePath, folderName });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildConsoleHtml({
        ...config,
        storePath,
        claimTypes: registeredClaimTypes(),
        readModel: null,
        consoleModel: emptyConsoleModel,
        emptyConsoleModel,
        folderName,
      }));
    }
  });

  await new Promise<void>((resolveListen) => server.listen(port, resolveListen));
  server.on("close", () => broadcaster.stop());
  console.log(`Surface console running at http://localhost:${port}`);
}

// The `?run=` query param names a file within the runs archive directory
// (see effectiveReadModelPath below) and must never be used to escape it.
// Constrained to the expected run-id shape: no path separators, no `..`
// traversal, no absolute paths (POSIX or Windows-drive) — those all fall
// outside this character class already, this is defense in depth.
const RUN_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

class InvalidRunParamError extends Error {}

function sanitizeRunParam(runParam: string): string {
  if (
    runParam.includes("/") ||
    runParam.includes("\\") ||
    runParam.includes("..") ||
    !RUN_ID_PATTERN.test(runParam)
  ) {
    throw new InvalidRunParamError(`Invalid run parameter: ${runParam}`);
  }
  return runParam;
}

function effectiveReadModelPath(readModelPath: string, runParam: string | null): string {
  const base = resolve(readModelPath);
  if (!runParam || runParam === "latest") return base;
  return resolve(dirname(base), `${sanitizeRunParam(runParam)}.console.json`);
}

function registeredClaimTypes() {
  return listExtensions().flatMap((extension) => extension.claimTypes ?? []);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function claimFromBody(body: Record<string, unknown>): ClaimDefinitionDraft {
  const subjectId = requireString(body, "subjectId");
  // Tolerant of the pre-rename `surface` key from an un-refreshed browser tab
  // (same one-release shim spirit as validate.ts's bundle-read shim).
  const facet = optionalString(body.facet) ?? optionalString(body.surface);
  const fieldOrBehavior = requireString(body, "fieldOrBehavior");
  return {
    id: optionalString(body.id),
    facet,
    claimType: requireString(body, "claimType"),
    fieldOrBehavior,
    subjectType: requireString(body, "subjectType"),
    subjectId,
    impactLevel: parseImpactLevel(body.impactLevel),
    verificationPolicyId: optionalString(body.verificationPolicyId),
    metadata: optionalObject(body.metadata),
  };
}

function claimUpdatesFromBody(body: Record<string, unknown>): ClaimDefinitionUpdateDraft {
  const updates: ClaimDefinitionUpdateDraft = {};
  if (body.facet !== undefined || body.surface !== undefined) {
    updates.facet = optionalString(body.facet) ?? optionalString(body.surface);
  }
  if (body.claimType !== undefined) updates.claimType = requireString(body, "claimType");
  if (body.fieldOrBehavior !== undefined) updates.fieldOrBehavior = requireString(body, "fieldOrBehavior");
  if (body.subjectType !== undefined) updates.subjectType = requireString(body, "subjectType");
  if (body.subjectId !== undefined) updates.subjectId = requireString(body, "subjectId");
  if (body.impactLevel !== undefined) updates.impactLevel = parseImpactLevel(body.impactLevel);
  if (body.verificationPolicyId !== undefined) updates.verificationPolicyId = optionalString(body.verificationPolicyId);
  if (body.metadata !== undefined) updates.metadata = optionalObject(body.metadata);
  return updates;
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Optional string field must be a string");
  return value;
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("metadata must be a JSON object");
  return value as Record<string, unknown>;
}

function respondBadRequest(res: ServerResponse, error: unknown): void {
  res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
}
