# Surface Dashboard

Surface ships a local dashboard server for any producer that emits a Surface-compatible run snapshot.

## Quick start

From a consumer project directory:

```sh
npx surface dashboard
```

The dashboard reads `.surface/runs/latest.json` by default. If that path does not exist it falls back to the legacy `.veritas/surface-dashboard/latest.json` path automatically. The server reads the file fresh on every request, so no restart is needed when the producer writes a new run.

Pass a custom path or port explicitly:

```sh
surface dashboard --read-model .surface/runs/latest.json --port 4242
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
surface dashboard --config surface.config.json
```

## Run directory convention

Producers write one file per run:

```
.surface/runs/
  <run-id>.dashboard.json   # full read model for that run
  latest.json               # index → { latestRunId, readModelPath }
```

`latest.json` is either a full read model or an index pointer. If it contains `kind: "surface-dashboard-index"` and a `readModelPath`, the server resolves the model from that path relative to the repo root. Otherwise it uses the file directly.

## Run history

When multiple `*.dashboard.json` files exist in the run directory, the dashboard toolbar shows a run picker that lets you compare runs without restarting the server.

The `/api/runs` endpoint returns a sorted list of available runs:

```
GET /api/runs
→ [{ runId, generatedAt, claimCount, verifiedCount, attentionCount, fileName }, ...]
```

Select a specific run by appending `?run=<runId>` to the `/api/read-model` endpoint, or by using the run picker in the UI.

## Dashboard features

### Metric chips

The header row shows summary chips for total claims, verified count, and attention count. Each chip is clickable and filters the claim list to matching claims. The active filter is highlighted with a raised border; clicking again clears it.

### Claim feed

Each claim card shows:

- Claim ID and surface path
- Human-readable status label: **Verified**, **Needs refresh**, **Disputed**, **Rejected**, **No evidence**, **Pending**
- Impact level badge
- Policy ID when present

### Master-detail layout (desktop)

On viewports wider than 900 px the dashboard uses a sticky side panel instead of a modal overlay. Clicking a claim slides the detail panel in from the right without covering the claim list. The list and panel are visible simultaneously.

### Claim detail

The detail panel shows full evidence, events, and policy context for the selected claim. For claims that are not yet verified, the panel shows contextual guidance describing what is needed to reach the verified state.

## Eval summary

When a producer runs an eval cycle (e.g., via `veritas eval record`), it can write a generic `EvalSummary` into the run snapshot. The dashboard uses this to show post-hoc review context alongside the live trust state.

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
| `/` | GET | Dashboard HTML shell |
| `/api/read-model` | GET | Current (or `?run=<id>`) read model JSON |
| `/api/runs` | GET | Sorted list of available run snapshots |
| `/api/claims` | POST | Add a claim to the local claim store |
| `/api/claims/:id` | PUT | Update a claim in the local claim store |
| `/api/claims/:id` | DELETE | Remove a claim from the local claim store |
| `/dashboard.js` | GET | Compiled dashboard script |
| `/dashboard.css` | GET | Dashboard styles |

Surface owns the dashboard shell, status model, claim browser, and metadata drilldown. Producers own the read model and vocabulary that make the dashboard meaningful for their domain.
