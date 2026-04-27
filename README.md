# Kontour Surface

Kontour Surface maps what a product claims, what proves it, where trust is missing or stale, and what humans or AI agents need to verify next.

It is not a promise of perfect truth. It is infrastructure for evidence-backed systems: claims, evidence, verification policies, freshness, conflict state, and inspectable reports.

## Why this exists

AI makes plausible output cheap. Products now need a durable way to answer:

- What are we claiming?
- What evidence backs that claim?
- How was it verified?
- How long is that verification valid?
- What changed or conflicted since then?
- What should a human or agent prove before relying on it?

## Validation surfaces

- `veritas`: developer proof for repo surfaces, policy packs, proof lanes, and evidence artifacts.
- `campfit`: public-data verification through crawl evidence, field attestations, review flags, and freshness.
- `taxes`: high-stakes fact verification through extraction, resolution, verified facts, citations, and review signals.

These are proof customers for the trust layer, not the whole Kontour AI business.

## Quickstart

```bash
npm install
npm run verify
npm run surface:report
npm run docs:build
```

The first prototype reads [examples/surface-fixtures.json](examples/surface-fixtures.json), derives claim statuses, and emits a local trust report.

Veritas evidence can be imported directly:

```bash
npm run build
node bin/surface.mjs report --adapter veritas --input examples/veritas-evidence.json --format summary
```

Architecture note: [Surface Foundation Boundary](docs/architecture/surface-foundation.md) defines the rule that portable truth concepts belong in Surface while product workflow mechanics stay in product layers like Veritas.

Campfit and taxes trust exports use the same report contract:

```bash
node bin/surface.mjs report --adapter campfit --format summary
node bin/surface.mjs report --adapter taxes --format summary
```

## Repository layout

- `src/`: TypeScript trust kernel and CLI helpers.
- `src/adapters/`: importers that map product-specific proof artifacts into the Surface kernel.
- `schemas/`: JSON schema contracts for Surface records.
- `examples/`: validation fixtures from `veritas`, `campfit`, and `taxes`.
- `tests/`: unit and fixture coverage.
- `docs/`: narrative docs used by the static Pages build.
- `scripts/build-pages-site.mjs`: dependency-free GitHub Pages builder.

## Current scope

This repo is intentionally local-first. Hosted dashboards, accounts, storage, and full production adapters are later stages. The first milestone is proving that different product types can share one inspectable trust report without losing evidence detail.
