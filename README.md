# Kontour Surface

Surface is the shared foundation under Kontour's products — and any product that needs to show its work.

Surface connects evidence provenance to the claims products ask users and agents to trust. It gives products a portable way to expose material claims, evidence traces, freshness, conflicts, and transparency gaps without collapsing them into a trust score.

Surface is not a promise of perfect truth, a certification business, or a hosted-only evidence collector. Producers collect domain evidence and make domain decisions. Surface defines the open trust format, derives portable trust state, and makes that state inspectable through reports, a Trust Panel, the Surface Console, APIs, and agent-readable resources.

## Quickstart

```bash
npm install -D @kontourai/surface
npx surface report --format summary
```

For local development in this repo:

```bash
npm install
npm run setup:repo-hooks
npm run validate:repo-hooks
npm run verify
npm run surface:summary
```

`npm run setup:repo-hooks` configures this clone's local Git config with `core.hooksPath=.githooks`. The repo-owned pre-push hook is contributor tooling: it runs local verification before push, can be repaired by rerunning setup, and does not define Surface Console, projection, Trust Snapshot, runtime adapter, producer, or product behavior. See [Repo Hooks](docs/repo-hooks.md).

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

**Veritas** — a repo-local governance product built with Surface for AI-assisted code changes. Veritas authors and projects claims, collects evidence per run, and maps repo standards into Surface claim groups so a reviewer can start from a framework/requirement view and drill into the exact claim and evidence. See [What builds on Surface](docs/built-on-surface.md).

**Custom producers** — any system that emits `TrustInput` can use Surface for report generation, status derivation, and the Surface Console. Product artifacts may embed `surface.input` directly; Surface remains responsible for generated report fields. Start with the [external adapter example](examples/external-adapter/README.md).

The dependency direction is one-way: producers depend on Surface; Surface does not depend on any producer's runtime.

## Public package surface

The npm package exposes one stable module entrypoint:

```ts
import {
  TrustInputBuilder,
  buildTrustReport,
  validateTrustInput,
} from "@kontourai/surface";
```

The package also ships the `surface` CLI, JSON schemas under `schemas/`, examples, docs, and TypeScript declarations. Internal files under `dist/src/` are included so the exported module graph can run, but consumers should import from `@kontourai/surface` rather than deep `dist/` paths. The package contents guard in `scripts/check-package-contents.mjs` keeps generated test output, local docs-site output, scripts, and source files out of the published tarball.

## Repository layout

- `bin/` — package CLI launcher; `surface` resolves here before loading built code from `dist/`.
- `src/` — TypeScript Surface library, CLI implementation, derivation kernel, reporting, adapters, and Console runtime.
- `src/adapters/` — built-in adapter registry and native `surface` passthrough adapter.
- `src/console/` — local Surface Console server, read-model projection, editable dependency-free UI assets, and generated asset constants.
- `schemas/` — JSON schema contracts for Surface inputs, reports, policies, evidence, and events.
- `examples/` — sample Surface inputs and package-shaped producer examples.
- `examples/external-adapter/` — canonical external adapter example for product-owned producer logic.
- `tests/` — Node test coverage for library, CLI, adapter, Console, and docs behavior.
- `tests/browser/` — Playwright coverage for the generated docs site and the standalone Surface Console.
- `docs/` — source documentation. Some pages publish to the generated site; repo-only references stay here.
- `scripts/` — repo maintenance, docs build, package-boundary, content-boundary, and hook setup scripts.
- `.github/workflows/` — CI and GitHub Pages publishing workflow definitions.
- `.githooks/` — repo-owned local Git hooks installed by `npm run setup:repo-hooks`.
- `agents/` — tracked agent/runtime resources that are part of the repo.
- `.agents/` — ignored local workflow artifacts from agent runs; useful for coordination, not product source.
- `dist/` — generated TypeScript build output from `npm run build`; do not edit directly.
- `docs-site/` — generated GitHub Pages output from `npm run docs:build`; curated public subset, not source.
- `test-results/` — local Playwright/test artifacts; ignored and safe to regenerate.

Ignored local/generated directories such as `node_modules/`, `.surface/`, `.agents/`, `dist/`, `docs-site/`, `test-results/`, and `playwright-report/` should be regenerated from source commands rather than reviewed as product source.

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
- [Developer Architecture](docs/architecture/developer-architecture.md) — trust/evidence flow and cross-product boundaries
- [Repo Hooks](docs/repo-hooks.md) — local contributor hook setup and validation
- [External Adapter Example](examples/external-adapter/README.md) — minimal package-shaped producer
