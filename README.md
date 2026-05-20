# Kontour Surface

Surface is a TypeScript library for representing claims, the evidence behind them, and whether they are still trustworthy enough to act on. It is the foundation trust substrate for Kontour AI products.

It is not a promise of perfect truth. It is infrastructure for evidence-backed systems: claims, evidence, verification policies, collections, freshness, conflict state, and inspectable reports.

## Quickstart

```bash
npm install -D @kontourai/surface
npx surface report --format summary
```

For local development in this repo:

```bash
npm install
npm run verify
npm run surface:summary
```

The default report reads [examples/surface-fixtures.json](examples/surface-fixtures.json), derives claim statuses, and emits a local trust report:

```text
Kontour Surface report surface-1779196544815
Source: kontour-surface-validation-fixtures
Claims: 4 (unknown: 1, verified: 2, stale: 1)
Surfaces: repo-governance.developer-proof: 1, field-attested-records.public-data: 1, fact-resolution.financial-facts: 1, surface.roadmap: 1
High-impact unsupported: none
```

For a step-by-step tour of the output, see the [Walkthrough](docs/guides/walkthrough.md).

## Why this exists

AI makes plausible output cheap, but decisions still need traceable evidence, freshness, and conflict state. Surface keeps that structure inspectable instead of burying it inside a prompt, a dashboard, or a single confidence score. See [Concepts](docs/concepts.md) for the full vocabulary.

## What sits on top

Surface is a substrate. Anything that needs to answer "is this information verified, fresh, and uncontested?" can build on it.

**Veritas** — the primary consumer. A repo-local governance tool for AI-assisted code changes. Veritas authors and projects claims, collects evidence per run, and projects policy packs as Surface collections so a reviewer can start from a framework/control view and drill into the exact claim and evidence. See [What builds on Surface](docs/built-on-surface.md).

**Custom producers** — any system that emits `TrustInput` can use Surface for report generation, status derivation, and the dashboard. Product artifacts may embed `surface.input` directly; Surface remains responsible for generated report fields. Start with the [external adapter example](examples/external-adapter/README.md).

The dependency direction is one-way: producers depend on Surface; Surface does not depend on any producer's runtime.

## Repository layout

- `src/` — TypeScript trust kernel, CLI, and dashboard server.
- `src/adapters/` — adapter registry and the native `surface` passthrough.
- `schemas/` — JSON schema contracts for Surface records.
- `examples/` — validation fixtures, the external adapter example.
- `tests/` — unit and integration coverage.
- `docs/` — narrative docs used by the static Pages build.
- `scripts/build-pages-site.mjs` — dependency-free GitHub Pages builder.

## Documentation

- [Getting Started](docs/guides/getting-started.md) — install Surface, run a fixture report, and build a first producer
- [What builds on Surface](docs/built-on-surface.md) — when to reach for Surface and what consumes it
- [Walkthrough](docs/guides/walkthrough.md) — real session with native Surface input
- [Concepts](docs/concepts.md) — trust vocabulary, collections, and status model
- [Claim Authoring](docs/claim-authoring.md) — authored claim stores and `surface claim` write commands
- [Extension API](docs/extension-api.md) — producer branding, vocabulary, and claim type definitions
- [CLI](docs/cli.md) — shipped report and claim commands
- [Schemas](docs/schemas.md) — claim, evidence, policy, event, and report contracts
- [Use Cases](docs/use-cases.md) — where Surface fits
- [Architecture](docs/architecture.md) — kernel, adapters, and product boundaries
- [External Adapter Example](examples/external-adapter/README.md) — minimal package-shaped producer
