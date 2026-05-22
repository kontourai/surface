# Kontour Surface

Surface is a product transparency standard and foundation product for the AI era.

**Show your work. Earn trust.** Surface connects evidence provenance to the claims products ask users and agents to trust. It gives products a portable way to expose material claims, evidence traces, freshness, conflicts, and transparency gaps without collapsing them into a trust score.

Surface is not a promise of perfect truth, a certification business, or a hosted-only evidence collector. Producers collect domain evidence and make domain decisions. Surface defines the open trust format, derives portable trust state, and makes that state inspectable through reports, a Trust Panel, the Surface Console, APIs, and agent-readable resources.

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

The default report reads [examples/surface-fixtures.json](examples/surface-fixtures.json), derives claim statuses, and emits a local trust report. In product language, this report is the basis for a point-in-time **Trust Snapshot**:

```text
Kontour Surface report surface-1779196544815
Source: kontour-surface-validation-fixtures
Claims: 4 (unknown: 1, verified: 2, stale: 1)
Surfaces: repo-governance.developer-evidence: 1, field-attested-records.public-data: 1, fact-resolution.financial-facts: 1, surface.roadmap: 1
High-impact unsupported: none
```

For a step-by-step tour of the output, see the [Walkthrough](docs/guides/walkthrough.md).

## Why this exists

AI makes plausible output cheap and lets polished product claims move faster than human review. Decisions still need traceable evidence, freshness, authority, integrity, and visible conflict state. Surface keeps that structure inspectable instead of burying it inside a prompt, a generic console, or a single confidence score. See [Concepts](docs/concepts.md) for the full vocabulary.

## What sits on top

Surface is a foundation product. Anything that needs to answer "what claims are visible, what supports them, and what gaps remain?" can build with it.

**Veritas** — a repo-local governance product built with Surface for AI-assisted code changes. Veritas authors and projects claims, collects evidence per run, and maps repo standardss into Surface claim groups so a reviewer can start from a framework/requirement view and drill into the exact claim and evidence. See [What builds on Surface](docs/built-on-surface.md).

**Custom producers** — any system that emits `TrustInput` can use Surface for report generation, status derivation, and the Surface Console. Product artifacts may embed `surface.input` directly; Surface remains responsible for generated report fields. Start with the [external adapter example](examples/external-adapter/README.md).

The dependency direction is one-way: producers depend on Surface; Surface does not depend on any producer's runtime.

## Repository layout

- `src/` — TypeScript trust kernel, CLI, and local Console server.
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
- [Concepts](docs/concepts.md) — trust vocabulary, claim groups, transparency gaps, and status model
- [Claim Authoring](docs/claim-authoring.md) — authored claim stores and `surface claim` write commands
- [Extension API](docs/extension-api.md) — producer branding, vocabulary, and claim type definitions
- [CLI](docs/cli.md) — shipped report and claim commands
- [Schemas](docs/schemas.md) — claim, evidence, policy, event, and report contracts
- [Use Cases](docs/use-cases.md) — where Surface fits
- [Architecture](docs/architecture.md) — kernel, adapters, and product boundaries
- [External Adapter Example](examples/external-adapter/README.md) — minimal package-shaped producer
