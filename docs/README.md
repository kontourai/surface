# Surface Documentation

Start here when you are working on the Surface repo or building against `@kontourai/surface`.

The generated `docs-site/` output is a curated public site built from selected source docs. This index includes both published pages and repo-only references for maintainers and contributors.

## Published Site Pages

The public site is built from the page list in `scripts/build-pages-site.mjs`. Current published source docs include:

- [Concepts](concepts.md) — the trust model: claims, evidence traces, policies, Trust Snapshots, claim groups, status, and transparency gaps
- [What builds on Surface](built-on-surface.md) — when to build with Surface and what uses it
- [Walkthrough](guides/walkthrough.md) — real session walkthrough with native Surface input
- [Use Cases](use-cases.md) — repo governance, public data trust, fact resolution, dependency audit
- [Vision](vision.md) — product transparency thesis
- [Principles](principles.md) — kernel and adapter rules
- [Brand Language](brand-language.md) — product language and positioning
- [Architecture](architecture.md) — how the kernel, adapters, and product packages fit together
- [CLI](cli.md), [Schemas](schemas.md), [Adapters](adapters.md), specs, roadmap, audits, and ADR references listed below

## Repo Reference Docs

The remaining docs are source references for local development, package consumers, release work, and contributor workflow. They may link from the public site as GitHub source docs when they are not part of the generated Pages subset.

## Understanding Surface

- [Concepts](concepts.md) — the trust model: claims, evidence traces, policies, Trust Snapshots, claim groups, status, and transparency gaps
- [Architecture](architecture.md) — how the kernel, adapters, and product packages fit together
- [Developer Architecture](architecture/developer-architecture.md) — Surface trust/evidence flow and cross-product boundaries
- [Source Module Audit](architecture/source-module-audit.md) — public entrypoint, internal modules, and future split candidates
- [Surface Foundation Boundary](architecture/surface-foundation.md) — one-way dependency rule for product layers
- [What builds on Surface](built-on-surface.md) — when to build with Surface and what uses it
- [Use Cases](use-cases.md) — repo governance, public data trust, fact resolution, dependency audit

## Building With Surface

- [Getting Started](guides/getting-started.md) — install Surface, run a fixture report, and build a first producer
- [Consumer SDK](guides/consumer-sdk.md) — fluent helpers for emitting valid `TrustInput`
- [Claim Authoring](claim-authoring.md) — authored claim stores and `surface claim` write commands
- [Extension API](extension-api.md) — producer branding, vocabulary, claim types, and policy templates
- [Producers and the Surface Boundary](integration-plan.md) — adapter and claim store patterns, boundary rules
- [External Adapter Example](../examples/external-adapter/README.md) — minimal package-shaped producer

## Package Boundary

The public npm package exposes `@kontourai/surface` as its only module entrypoint, plus the `surface` CLI. TypeScript declarations are published through `dist/src/index.d.ts`, and package metadata points both `types` and `exports["."].types` at that file. Consumers should not import deep `dist/` paths directly.

The package intentionally includes docs, schemas, examples, and built runtime files. It intentionally excludes source files, tests, scripts, generated docs-site output, Playwright artifacts, and local workflow artifacts. `npm run check:package-contents` is the release guard for that boundary.

## Reference

- [CLI](cli.md) — `surface report`, `surface claim`, and output formats
- [Schemas](schemas.md) — JSON contracts for adapter authors and downstream systems
- [Minimum Trust Panel Spec](specs/minimum-trust-panel.md) — Viewer-facing inspection requirements
- [Minimum Surface Console Spec](specs/minimum-surface-console.md) — Operator-facing workspace requirements
- [Open Trust Format and Claim Package Shape](specs/open-trust-format.md) — portable trust state shape
- [Disclosure Requirements](specs/disclosure-requirements.md) — required claim, evidence, visibility, and gap disclosure
- [Transparency Capabilities](specs/transparency-capabilities.md) — producer-owned reverification, access, and dispute affordances
- [Producer Extension Limits](specs/producer-extension-limits.md) — customization boundaries that preserve core semantics
- [Fixtures](fixtures.md) — examples used by tests and docs
- [Schema Versioning](schema-versioning.md) — versioning rules for contract changes
- [Resource Contract Audit](resource-contract-audit.md) — migration map for durable Surface contracts
- [Trust Analytics Projection](analytics.md) — evidence intelligence derived from `TrustReport`
- [Surface Console](console.md) — local Console server over producer read models
- [Walkthrough](guides/walkthrough.md) — real session walkthrough with native Surface input
- [Releasing](RELEASING.md) — npm publish checklist and trusted publishing setup
- [Repo Hooks](repo-hooks.md) — local contributor hook setup and validation

## Direction

- [Vision](vision.md) — product transparency thesis
- [Roadmap](roadmap.md) — what ships today and what comes next
- [Linked Data Roadmap](linked-data-roadmap.md) — JSON-LD, SHACL, and ontology work
- [ADR 0001: Product Vocabulary Migration](adr/0001-vocabulary-migration.md) — target product language for Surface
