import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { watch } from "node:fs";
import { CONSOLE_SCRIPT } from "./script.js";
import { CONSOLE_CSS } from "./styles.js";
import { InvalidRunParamError, SurfaceConsoleRuntime } from "./runtime.js";
import type { SurfaceConsoleConfig } from "./types.js";

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

export async function startConsoleServer(config: SurfaceConsoleConfig = {}): Promise<void> {
  const runtime = new SurfaceConsoleRuntime(config);

  const broadcaster = new SseBroadcaster(runtime.watchPaths());
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
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(await runtime.listRuns()));
      return;
    }

    if (url === "/api/read-model") {
      const runParam = requestUrl.searchParams.get("run");
      try {
        const readModel = await runtime.loadReadModel(runParam);
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
        const consoleModel = await runtime.loadConsoleModel(runParam);
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
        const { claim } = runtime.addClaim(body);
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
        runtime.updateClaim(claimId, body);
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
        runtime.removeClaim(claimId);
        res.writeHead(204);
        res.end();
      } catch (error) {
        respondBadRequest(res, error);
      }
      return;
    }

    const { html } = await runtime.htmlModel();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  await new Promise<void>((resolveListen) => server.listen(runtime.port, resolveListen));
  server.on("close", () => broadcaster.stop());
  console.log(`Surface console running at http://localhost:${runtime.port}`);
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

function respondBadRequest(res: ServerResponse, error: unknown): void {
  res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
}
