import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { buildDashboardHtml } from "./shell.js";
import { DASHBOARD_SCRIPT } from "./script.js";
import { DASHBOARD_CSS } from "./styles.js";
import { addClaimToStore, loadClaimStore, removeClaimFromStore, saveClaimStore, updateClaimInStore } from "../store.js";
import { listExtensions } from "../extension.js";
import type { SurfaceDashboardConfig } from "./types.js";
import type { ClaimDefinition, ImpactLevel } from "../types.js";

const SURFACE_RUNS_DEFAULT = ".surface/runs/latest.json";
const LEGACY_RUNS_PATH = ".veritas/surface-dashboard/latest.json";

async function loadReadModel(indexPath: string): Promise<unknown> {
  const absoluteIndexPath = resolve(indexPath);
  const raw = await readFile(absoluteIndexPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed["kind"] === "surface-dashboard-index" && typeof parsed["readModelPath"] === "string") {
    // readModelPath is relative to the repo root; index lives 2 levels deep
    // (.surface/runs/latest.json or .veritas/surface-dashboard/latest.json → repo root)
    const repoRoot = dirname(dirname(dirname(absoluteIndexPath)));
    const modelPath = resolve(repoRoot, parsed["readModelPath"]);
    const modelRaw = await readFile(modelPath, "utf8");
    return JSON.parse(modelRaw);
  }
  return parsed;
}

async function resolveReadModelPath(configuredPath: string): Promise<string> {
  if (configuredPath !== SURFACE_RUNS_DEFAULT) return configuredPath;
  try { await readFile(resolve(configuredPath), "utf8"); return configuredPath; } catch { /* fall through */ }
  return LEGACY_RUNS_PATH;
}

export async function startDashboardServer(config: SurfaceDashboardConfig = {}): Promise<void> {
  const port = config.port ?? 4242;
  const readModelPath = config.readModelPath ?? SURFACE_RUNS_DEFAULT;
  const storePath = config.storePath ?? "veritas.claims.json";

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const url = requestUrl.pathname;

    if (url === "/dashboard.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(DASHBOARD_SCRIPT);
      return;
    }

    if (url === "/dashboard.css") {
      res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      res.end(DASHBOARD_CSS);
      return;
    }

    if (url === "/api/runs") {
      try {
        const dashDir = resolve(dirname(await resolveReadModelPath(readModelPath)));
        const files = await readdir(dashDir).catch(() => [] as string[]);
        const runFiles = files.filter(f => f.endsWith(".dashboard.json") && f !== "latest.json");
        const runs = await Promise.all(runFiles.map(async (f) => {
          try {
            const data = JSON.parse(await readFile(resolve(dashDir, f), "utf8")) as Record<string, unknown>;
            const producer = data["producer"] as Record<string, unknown> | undefined;
            const summary = data["summary"] as Record<string, unknown> | undefined;
            const attentionIds = (summary?.["attentionClaimIds"] as unknown[] | undefined) ?? [];
            return {
              runId: producer?.["runId"] ?? basename(f, ".dashboard.json"),
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
      const resolvedBase = await resolveReadModelPath(readModelPath);
      const effectivePath = runParam && runParam !== "latest"
        ? resolve(dirname(resolvedBase), `${runParam}.dashboard.json`)
        : resolvedBase;
      try {
        const readModel = await loadReadModel(effectivePath);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(readModel));
      } catch {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "read model not found", path: effectivePath }));
      }
      return;
    }

    if (url === "/api/claims" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const now = new Date().toISOString();
        const claim = claimFromBody(body, now);
        const updated = addClaimToStore(loadClaimStore(resolve(storePath)), claim);
        saveClaimStore(updated, resolve(storePath));
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
        const updated = updateClaimInStore(loadClaimStore(resolve(storePath)), claimId, claimUpdatesFromBody(body));
        saveClaimStore(updated, resolve(storePath));
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
        const updated = removeClaimFromStore(loadClaimStore(resolve(storePath)), claimId);
        saveClaimStore(updated, resolve(storePath));
        res.writeHead(204);
        res.end();
      } catch (error) {
        respondBadRequest(res, error);
      }
      return;
    }

    try {
      const resolvedPath = await resolveReadModelPath(readModelPath);
      const readModel = await loadReadModel(resolvedPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildDashboardHtml({ ...config, storePath, claimTypes: registeredClaimTypes(), readModel }));
    } catch {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildDashboardHtml({ ...config, storePath, claimTypes: registeredClaimTypes(), readModel: null }));
    }
  });

  await new Promise<void>((resolveListen) => server.listen(port, resolveListen));
  console.log(`Surface dashboard running at http://localhost:${port}`);
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

function claimFromBody(body: Record<string, unknown>, now: string): ClaimDefinition {
  const subjectId = requireString(body, "subjectId");
  const surface = requireString(body, "surface");
  const fieldOrBehavior = requireString(body, "fieldOrBehavior");
  return {
    id: typeof body.id === "string" && body.id.length > 0 ? body.id : generateClaimId(subjectId, surface, fieldOrBehavior),
    surface,
    claimType: requireString(body, "claimType"),
    fieldOrBehavior,
    subjectType: requireString(body, "subjectType"),
    subjectId,
    impactLevel: parseImpact(body.impactLevel),
    verificationPolicyId: optionalString(body.verificationPolicyId),
    metadata: optionalObject(body.metadata),
    createdAt: now,
    updatedAt: now,
  };
}

function claimUpdatesFromBody(body: Record<string, unknown>): Partial<Omit<ClaimDefinition, "id" | "createdAt">> {
  const updates: Partial<Omit<ClaimDefinition, "id" | "createdAt">> = {};
  if (body.surface !== undefined) updates.surface = requireString(body, "surface");
  if (body.claimType !== undefined) updates.claimType = requireString(body, "claimType");
  if (body.fieldOrBehavior !== undefined) updates.fieldOrBehavior = requireString(body, "fieldOrBehavior");
  if (body.subjectType !== undefined) updates.subjectType = requireString(body, "subjectType");
  if (body.subjectId !== undefined) updates.subjectId = requireString(body, "subjectId");
  if (body.impactLevel !== undefined) updates.impactLevel = parseImpact(body.impactLevel);
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

function parseImpact(value: unknown): ImpactLevel | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "low" || value === "medium" || value === "high" || value === "critical") return value;
  throw new Error("impactLevel must be low, medium, high, or critical");
}

function generateClaimId(subjectId: string, surface: string, fieldOrBehavior: string): string {
  return `${slugify(subjectId)}.${slugify(surface)}.${slugify(fieldOrBehavior)}`;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "claim";
}

function respondBadRequest(res: ServerResponse, error: unknown): void {
  res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
}
