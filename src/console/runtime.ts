import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { cwd } from "node:process";
import { buildConsoleHtml } from "./shell.js";
import { buildSurfaceConsoleProjection, emptySurfaceConsoleProjection } from "./projection.js";
import { loadMergedConsoleReadModel } from "./merged-read-model.js";
import {
  parseImpactLevel,
  type ClaimAuthoringResult,
  type ClaimDefinitionDraft,
  type ClaimDefinitionUpdateDraft,
} from "../claim-authoring.js";
import {
  addClaimStoreClaim,
  removeClaimStoreClaim,
  updateClaimStoreClaim,
} from "../claim-store-transactions.js";
import { listExtensions } from "../extension.js";
import type { ClaimTypeDefinition } from "../types.js";
import type { SurfaceConsoleConfig } from "./types.js";

const SURFACE_RUNS_DEFAULT = ".surface/runs/latest.json";

/**
 * Thrown when a `?run=` query parameter fails run-id validation. The transport
 * layer maps this to a 400 (a plain not-found becomes a 404).
 */
export class InvalidRunParamError extends Error {}

// The `?run=` query param names a file within the runs archive directory
// (see effectiveReadModelPath) and must never be used to escape it. Constrained
// to the expected run-id shape: no path separators, no `..` traversal, no
// absolute paths (POSIX or Windows-drive) — those all fall outside this
// character class already; this is defense in depth.
const RUN_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export interface ConsoleRunSummary {
  runId: string;
  generatedAt: unknown;
  claimCount: unknown;
  verifiedCount: number;
  attentionCount: number;
  fileName: string;
}

export interface ConsoleHtmlModel {
  html: string;
  /** The read model the HTML was built from (null when none could be loaded). */
  readModel: unknown;
}

/**
 * The Surface Console runtime (issue #2).
 *
 * Owns the console's domain orchestration — read-model loading (artifact or
 * merged-bundle path), the run catalog, projection creation, HTML page assembly,
 * and Claim Package authoring — so `server.ts` is left with HTTP parsing and
 * response mechanics only. Every method is callable without starting an HTTP
 * server, which is what makes the console runtime directly unit-testable.
 */
export class SurfaceConsoleRuntime {
  readonly config: SurfaceConsoleConfig;
  readonly port: number;
  readonly readModelPath: string;
  readonly storePath: string;
  /** Producer bundle inputs, resolved to absolute paths (see SurfaceConsoleConfig.inputs). */
  readonly inputs: string[];
  /** True when any `--input` was supplied — switches onto the merge-and-project path. */
  readonly inputsMode: boolean;

  constructor(config: SurfaceConsoleConfig = {}) {
    this.config = config;
    this.port = config.port ?? 4242;
    this.readModelPath = config.readModelPath ?? SURFACE_RUNS_DEFAULT;
    this.storePath = config.storePath ?? "veritas.claims.json";
    this.inputs = (config.inputs ?? []).map((p) => resolve(p));
    this.inputsMode = this.inputs.length > 0;
  }

  /**
   * Files to watch for live refresh. In inputs mode the producer bundles are
   * watched (not a pre-built read-model file); the store is watched in both modes.
   */
  watchPaths(): string[] {
    return this.inputsMode
      ? [...this.inputs, resolve(this.storePath)]
      : [resolve(this.readModelPath), resolve(this.storePath)];
  }

  // ── read model ────────────────────────────────────────────────────────────

  /**
   * Load the read model for a request. In inputs mode this rebuilds the merged
   * read model from the producer bundles on every call (mirrors the file-watch
   * live-reload of the artifact path); otherwise it loads the read-model artifact
   * selected by the optional `?run=` param.
   */
  async loadReadModel(runParam: string | null = null): Promise<unknown> {
    if (this.inputsMode) return this.mergedReadModel();
    return loadReadModelArtifact(effectiveReadModelPath(this.readModelPath, runParam));
  }

  private async mergedReadModel(): Promise<unknown> {
    return loadMergedConsoleReadModel(this.inputs, { runId: "console-merge" });
  }

  // ── projection ────────────────────────────────────────────────────────────

  /** Project a read model into the console view model. */
  buildConsoleModel(readModel: unknown): unknown {
    return buildSurfaceConsoleProjection(readModel, {
      ...this.config,
      storePath: this.storePath,
      readModel,
      folderName: basename(cwd()),
    });
  }

  /** The renderable empty-state projection (no read model available). */
  emptyConsoleModel(): unknown {
    return emptySurfaceConsoleProjection({ ...this.config, storePath: this.storePath, folderName: basename(cwd()) });
  }

  /** Load the read model for `?run=` and project it in one step. */
  async loadConsoleModel(runParam: string | null = null): Promise<unknown> {
    return this.buildConsoleModel(await this.loadReadModel(runParam));
  }

  // ── run catalog ─────────────────────────────────────────────────────────────

  /**
   * Enumerate the archived runs alongside the configured read-model artifact.
   * Empty in inputs mode (a merged view has no per-run archive) and on any I/O
   * error. Sorted newest-first by `generatedAt`.
   */
  async listRuns(): Promise<ConsoleRunSummary[]> {
    if (this.inputsMode) return [];
    try {
      const dashDir = resolve(dirname(this.readModelPath));
      const files = await readdir(dashDir).catch(() => [] as string[]);
      const runFiles = files.filter((f) => f.endsWith(".console.json") && f !== "latest.json");
      const runs = await Promise.all(
        runFiles.map(async (f): Promise<ConsoleRunSummary | null> => {
          try {
            const data = JSON.parse(await readFile(resolve(dashDir, f), "utf8")) as Record<string, unknown>;
            const producer = data["producer"] as Record<string, unknown> | undefined;
            const summary = data["summary"] as Record<string, unknown> | undefined;
            const attentionIds = (summary?.["attentionClaimIds"] as unknown[] | undefined) ?? [];
            return {
              runId: String(producer?.["runId"] ?? basename(f, ".console.json")),
              generatedAt: data["generatedAt"] ?? null,
              claimCount: summary?.["claimCount"] ?? 0,
              verifiedCount: (summary?.["statusCounts"] as Record<string, number> | undefined)?.["verified"] ?? 0,
              attentionCount: attentionIds.length,
              fileName: f,
            };
          } catch {
            return null;
          }
        }),
      );
      return (runs.filter(Boolean) as ConsoleRunSummary[]).sort(
        (a, b) => new Date(String(b.generatedAt ?? 0)).getTime() - new Date(String(a.generatedAt ?? 0)).getTime(),
      );
    } catch {
      return [];
    }
  }

  // ── HTML page ─────────────────────────────────────────────────────────────

  /**
   * Assemble the console HTML page. Loads and projects the read model; on any
   * load/parse error falls back to the renderable empty state (never throws).
   */
  async htmlModel(): Promise<ConsoleHtmlModel> {
    const folderName = basename(cwd());
    const claimTypes = registeredClaimTypes();
    // The empty projection is built inside each branch (not hoisted) so the
    // whole page assembly stays within the try/catch, matching the original
    // route's fault tolerance.
    try {
      const readModel = await this.loadReadModel();
      const consoleModel = this.buildConsoleModel(readModel);
      return {
        readModel,
        html: buildConsoleHtml({
          ...this.config,
          storePath: this.storePath,
          claimTypes,
          readModel,
          consoleModel,
          emptyConsoleModel: this.emptyConsoleModel(),
          folderName,
        }),
      };
    } catch {
      const emptyConsoleModel = this.emptyConsoleModel();
      return {
        readModel: null,
        html: buildConsoleHtml({
          ...this.config,
          storePath: this.storePath,
          claimTypes,
          readModel: null,
          consoleModel: emptyConsoleModel,
          emptyConsoleModel,
          folderName,
        }),
      };
    }
  }

  // ── Claim Package authoring ─────────────────────────────────────────────────

  /** Author a new claim into the store from a console request body. */
  addClaim(body: Record<string, unknown>): ClaimAuthoringResult {
    return addClaimStoreClaim(resolve(this.storePath), claimFromBody(body));
  }

  /** Apply an update to an existing claim in the store. */
  updateClaim(claimId: string, body: Record<string, unknown>): void {
    updateClaimStoreClaim(resolve(this.storePath), claimId, claimUpdatesFromBody(body));
  }

  /** Remove a claim from the store. */
  removeClaim(claimId: string): void {
    removeClaimStoreClaim(resolve(this.storePath), claimId);
  }
}

async function loadReadModelArtifact(indexPath: string): Promise<unknown> {
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

function effectiveReadModelPath(readModelPath: string, runParam: string | null): string {
  const base = resolve(readModelPath);
  if (!runParam || runParam === "latest") return base;
  return resolve(dirname(base), `${sanitizeRunParam(runParam)}.console.json`);
}

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

function registeredClaimTypes(): ClaimTypeDefinition[] {
  return listExtensions().flatMap((extension) => extension.claimTypes ?? []);
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
