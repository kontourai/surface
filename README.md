# Kontour Surface

Kontour Surface is the foundation trust substrate for Kontour AI products. It maps what a product claims, what proves it, where trust is missing or stale, and what humans or AI agents need to verify next.

It is not a promise of perfect truth. It is infrastructure for evidence-backed systems: claims, evidence, verification policies, freshness, conflict state, and inspectable reports.

## Why this exists

AI makes plausible output cheap. Before a human or an agent acts on a claim, four things have to hold:

- **Subject** — we know what or who the claim is about, even when the same real subject appears under different keys in different systems.
- **Evidence** — there is a traceable record of what supports the claim, who collected it, and how it was verified.
- **Freshness** — the verification is still valid for this decision and we know what changed since it was made.
- **Consistency** — no other claim about the same subject contradicts, supersedes, or disputes it.

Surface keeps that structure inspectable instead of burying it inside a prompt, a dashboard, or a single confidence score.

## Product Layers

**Product adapters** — downstream products can depend on Surface, register adapters, and emit portable `TrustInput`. Surface owns the report contract; product packages own product-specific parsing and workflow language. The `confidenceBasis` summary in Surface reports is computed from per-claim `confidenceBasis` and `derivedFrom` ceilings.

**Field-Attested Records** — public-data verification through crawl evidence, field attestations, review flags, and freshness.

**Fact Resolution** — high-stakes fact verification through extraction, resolution, verified facts, citations, and review signals.

These are generic trust patterns, grounded in fixtures and local report generation. Each product keeps its own workflow language and adapter code, while portable truth flows through Surface claims, evidence, policies, events, and reports. Dependencies point upward: product layers can depend on Surface, but Surface should not depend on product-layer runtimes.

## Quickstart

```bash
npm install
npm run verify
npm run surface:report
npm run docs:build
```

The first prototype reads [examples/surface-fixtures.json](examples/surface-fixtures.json), derives claim statuses, and emits a local trust report.

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
```

## Repository layout

- `src/`: TypeScript trust kernel and CLI helpers.
- `src/adapters/`: generic built-in examples and registry wiring.
- `schemas/`: JSON schema contracts for Surface records.
- `examples/`: validation fixtures and generic trust-pattern examples.
- `tests/`: unit and fixture coverage.
- `docs/`: narrative docs used by the static Pages build.
- `scripts/build-pages-site.mjs`: dependency-free GitHub Pages builder.

## Current scope

This repo is intentionally local-first. Hosted dashboards, accounts, storage, and full production adapters are later stages. The first milestone is proving that different product types can share one inspectable trust report without losing evidence detail.
