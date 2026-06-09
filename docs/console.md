# Surface Console

Surface ships a local Surface Console server for any producer that emits a Surface-format run snapshot. The current CLI, routes, and generated assets still use `console`; treat that as an implementation name, not product language.

## Quick start

From a Builder or producer project directory:

```sh
npx surface console
```

The Surface Console reads `.surface/runs/latest.json` by default. The server reads the file fresh on every request, so no restart is needed when the producer writes a new run.

Pass a custom path or port explicitly:

```sh
surface console --read-model .surface/runs/latest.json --port 4242
```

Or use a config file:

```json
{
  "port": 4242,
  "readModelPath": ".surface/runs/latest.json",
  "vocab": {
    "projectName": "My project",
    "projectKind": "repo governance"
  },
  "theme": {
    "brandName": "Veritas"
  }
}
```

```sh
surface console --config surface.config.json
```

Implementation note: `surface console`, `*.console.json`, `/console.js`, and `/console.css` are current implementation names. Product-facing language should describe the Operator experience as the Surface Console.

## Developer map

Surface keeps its own standalone Surface Console. Keep product-specific trust behavior in this repo, and use Console Kit only as the shared UI system for presentation consistency across Kontour products.

| Area | Location | Purpose |
|------|----------|---------|
| CLI command | `src/cli.ts`, `src/commands/console.ts` | Parses `surface console` flags and starts the local server. |
| Local server and API routes | `src/console/server.ts` | Serves the HTML shell, static assets, read model, projection, run list, and claim authoring endpoints. |
| Projection contract | `src/console/projection.ts`, `src/console/types.ts` | Converts producer read models into the UI shape consumed by the Console. |
| Standalone UI shell | `src/console/shell.ts` | Owns the dependency-free HTML shell served by `/`. |
| Standalone UI asset sources | `src/console/client/parts/`, `src/console/styles/parts/` | Owns the editable browser behavior and Console Kit-compatible token aliases for the standalone Surface Console. |
| Generated UI asset constants | `scripts/build-console-assets.mjs`, `src/console/client/index.js`, `src/console/styles/index.css`, `src/console/assets.generated.ts`, `src/console/script.ts`, `src/console/styles.ts` | Concatenates ordered client and CSS parts, then converts JS/CSS assets into TypeScript constants consumed by `/console.js` and `/console.css`; regenerate with `npm run build:console-assets`. |
| Browser coverage | `tests/browser/console.spec.ts` | Starts `bin/surface.mjs console` and verifies the real standalone page on desktop and mobile. |
| Docs-site Console Kit assets | `scripts/sync-console-kit-assets.mjs`, `docs-site/vendor/console-kit/` | Copies token CSS from the installed public `@kontourai/console-kit` package for generated docs pages. |
| Package boundary guard | `tests/package-files.test.ts`, `scripts/check-package-contents.mjs` | Keeps Console Kit dev-only, prevents React/runtime leakage, and verifies published package contents. |

## Run directory convention

Producers write one file per run:

```
.surface/runs/
  <run-id>.console.json   # full read model for that run
  latest.json               # index → { latestRunId, readModelPath }
```

`latest.json` is either a full read model or an index pointer. If it contains `kind: "surface-console-index"` and a `readModelPath`, the server resolves the model from that path relative to the repo root. Otherwise it uses the file directly.

## Run history

When multiple `*.console.json` files exist in the run directory, the Surface Console toolbar shows a run picker that lets you compare runs without restarting the server.

The `/api/runs` endpoint returns a sorted list of available runs:

```
GET /api/runs
→ [{ runId, generatedAt, claimCount, verifiedCount, attentionCount, fileName }, ...]
```

Select a specific run by appending `?run=<runId>` to the `/api/read-model` endpoint, or by using the run picker in the UI.

## Surface Console features

### Metric chips

The header row shows summary chips for total claims, verified count, and attention count. Each chip is clickable and filters the claim list to matching claims. The active filter is highlighted with a raised border; clicking again clears it.

### Claim feed

Each claim card shows:

- Claim ID and surface path
- Human-readable status label: **Verified**, **Needs refresh**, **Disputed**, **Rejected**, **No evidence**, **Pending**
- Impact level badge
- Policy ID when present

### Master-detail layout (desktop)

On viewports wider than 900 px the Surface Console uses a sticky side panel instead of a modal overlay. Clicking a claim slides the detail panel in from the right without covering the claim list. The list and panel are visible simultaneously.

### Claim detail

The detail panel shows evidence, events, policy context, and integrity scope for the selected claim. The integrity scope is where producers can expose what a verified claim is anchored to: a source revision, working-tree digest, file fingerprints, or producer configuration hashes. For claims that are not yet verified, the panel shows contextual guidance describing what is needed to reach the verified state.

`Evidence summary` is the human-readable producer summary. `Observed result` is reserved for structured runtime output such as a pass/fail result, command, exit code, stdout, or stderr. If a producer only supplies a summary, the Surface Console does not duplicate it as an observed result.

## Eval summary

When a producer runs an eval cycle (e.g., via `veritas eval record`), it can write a generic `EvalSummary` into the run snapshot. The Surface Console uses this to show post-hoc review context alongside the live trust state.

`EvalSummary` shape (see `src/types.ts`):

```typescript
interface EvalSummary {
  reviewed: boolean;
  reviewedAt?: string;
  confidence?: "low" | "medium" | "high";
  outcome?: "accepted" | "accepted-with-changes" | "rejected";
  falsePositiveCount?: number;
  missedIssueCount?: number;
  timeToResolutionMinutes?: number;
  notes?: string[];
  metadata?: Record<string, unknown>;
}
```

This is a producer-agnostic shape. Producers may put domain-specific fields under `metadata`.

## API reference

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Surface Console HTML shell |
| `/api/read-model` | GET | Current (or `?run=<id>`) read model JSON |
| `/api/console-model` | GET | Current (or `?run=<id>`) Surface Console projection |
| `/api/runs` | GET | Sorted list of available run snapshots |
| `/api/claims` | POST | Add a claim to the local claim store |
| `/api/claims/:id` | PUT | Update a claim in the local claim store |
| `/api/claims/:id` | DELETE | Remove a claim from the local claim store |
| `/console.js` | GET | Compiled Surface Console script; current route name |
| `/console.css` | GET | Surface Console styles; current route name |

Surface owns the Surface Console shell, status model, claim browser, and metadata drilldown. Producers own the read model and vocabulary that make the Console meaningful for their domain.
