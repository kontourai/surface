# Kontour Surface

Surface is a TypeScript library for representing claims, the evidence behind them, and whether they are still trustworthy enough to act on. It is the foundation trust substrate for Kontour AI products.

It is not a promise of perfect truth. It is infrastructure for evidence-backed systems: claims, evidence, verification policies, freshness, conflict state, and inspectable reports.

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

The default report reads [examples/surface-fixtures.json](examples/surface-fixtures.json), derives claim statuses, and emits a local trust report.

```text
$ npx surface report --adapter field-attested-records --format summary
Kontour Surface report surface-1778389304425
Source: field-attested-records:demo
Claims: 9 (proposed: 1, verified: 3, stale: 2, disputed: 1, rejected: 2)
Surfaces: field-attested-records.public-data: 2, field-attested-records.attestations: 2, field-attestation.review-flags: 1, field-attested-records.crawls: 2, field-attested-records.proposals: 2
High-impact unsupported: none
Stale: field-attested-records.attestation.record-denver-art-1.pricing.attest-stale-1, field-attested-records.crawl.crawl-good-1
Disputed: field-attested-records.flag.record-denver-art-1.flag-open-1
Fault lines: 4
```

For a step-by-step tour of the output, see the [Walkthrough](docs/guides/walkthrough.md).

## Why this exists

AI makes plausible output cheap, but decisions still need traceable evidence, freshness, and conflict state. Surface keeps that structure inspectable instead of burying it inside a prompt, a dashboard, or a single confidence score. See [Concepts](docs/concepts.md) for the full vocabulary.

## What sits on top

Surface is a substrate. Anything that needs to answer "is this information verified, fresh, and uncontested?" can build on it.

**Reference adapters** — shipped in this repo to demonstrate the shape:

- **Field-Attested Records** — public-data verification through crawl evidence, field attestations, review flags, and freshness.
- **Fact Resolution** — high-stakes fact verification through extraction, resolution, verified facts, citations, and review signals.
- **npm-audit** — dependency vulnerabilities as claims about package safety.

These are not products; they are how Surface explains itself.

**Real consumers** — projects that depend on Surface as their trust substrate:

- **[Veritas](https://github.com/kontourai/veritas)** — repo-local lint for AI-assisted code changes. Projects each code-change run into `surface.input`.

To build your own consumer, start with the [external adapter example](examples/external-adapter/README.md). Each consumer keeps its own workflow language and adapter code; portable truth flows through Surface claims, evidence, policies, events, and reports. Dependencies point upward — consumers can depend on Surface, but Surface does not depend on any consumer's runtime.

Adapters are explicit registry entries:

```bash
npm run build
node bin/surface.mjs report --adapter field-attested-records --format summary
```

Architecture note: [Surface Foundation Boundary](docs/architecture/surface-foundation.md) defines the rule that portable truth concepts belong in Surface while product workflow mechanics stay in product layers. Product artifacts may embed `surface.input`; Surface remains responsible for generated report fields such as summaries, fault lines, proof requirements, freshness, and status.

Generic example exports use the same report contract:

```bash
node bin/surface.mjs report --adapter field-attested-records --format summary
node bin/surface.mjs report --adapter fact-resolution --format summary
node bin/surface.mjs report --adapter npm-audit --format summary
```

## Building Your Own Adapter

Start with the standalone [external adapter example](examples/external-adapter/README.md). Every adapter defines a product input shape, maps it to Surface claims and evidence, and emits valid `TrustInput`.

## Repository layout

- `src/`: TypeScript trust kernel and CLI helpers.
- `src/adapters/`: generic built-in examples and registry wiring.
- `schemas/`: JSON schema contracts for Surface records.
- `examples/`: validation fixtures and generic trust-pattern examples.
- `tests/`: unit and fixture coverage.
- `docs/`: narrative docs used by the static Pages build.
- `scripts/build-pages-site.mjs`: dependency-free GitHub Pages builder.

## Current scope

This repo is intentionally local-first. It ships the trust kernel, schemas, CLI report generation, linked output, and generic adapters for field-attested records, fact resolution, and npm audit output. Hosted dashboards, accounts, durable storage, and product-specific adapters are later stages.

## Documentation

- [What builds on Surface](docs/built-on-surface.md) — when to reach for Surface and what consumes it
- [Walkthrough](docs/guides/walkthrough.md) — real session, paste output
- [Concepts](docs/concepts.md) — trust vocabulary and status model
- [CLI](docs/cli.md) — shipped report commands and output formats
- [Schemas](docs/schemas.md) — claim, evidence, policy, event, and report contracts
- [Use Cases](docs/use-cases.md) — where Surface fits
- [Architecture](docs/architecture.md) — kernel, adapters, and product boundaries
- [External Adapter Example](examples/external-adapter/README.md) — minimal package-shaped adapter
