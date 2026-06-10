# Surface Documentation

Start here when you are working on the Surface repo or building against `@kontourai/surface`.

The generated `docs-site/` output is a curated public site built from selected source docs. This index includes both published pages and repo-only references for maintainers and contributors.

## Folder Layout

- `product/` — product thesis, vocabulary, positioning, use cases, and what builds on Surface.
- `guides/` — task-oriented walkthroughs for builders and consumers.
- `reference/` — CLI, schemas, adapters, Console, extension API, analytics, fixtures, and versioning reference.
- `architecture/` — current system architecture and foundation boundaries.
- `specs/` — portable trust format and product capability specs.
- `audits/` — point-in-time audits and migration maps.
- `roadmap/` — forward-looking plans and integration direction.
- `adr/` — durable architecture decisions.
- `maintenance/` — release and contributor workflow docs.

Keep new docs in the folder that matches the reader's intent. If a page is a durable contract, prefer `reference/` or `specs/`; if it records a point-in-time assessment, prefer `audits/`; if it is contributor workflow, prefer `maintenance/`.

## Published Site Pages

The public site is built from the grouped page list in `scripts/pages-site/pages.mjs`. Keep the index below aligned with that registry when adding, moving, or removing public pages; `tests/docs-site-pages.test.ts` verifies every published source page is linked here.

Maintainer-only material stays repo-only: this index, brand language, ADRs, audits, and the `maintenance/` docs.

## Product Model

- [Overview](index.md) — public homepage source for the generated docs site
- [Concepts](product/concepts.md) — the trust model: claims, evidence traces, policies, Trust Snapshots, claim groups, status, and transparency gaps
- [Use Cases](product/use-cases.md) — repo governance, public data trust, fact resolution, dependency audit
- [Vision](product/vision.md) — product transparency thesis
- [Principles](product/principles.md) — kernel and adapter rules
- [Brand Language](product/brand-language.md) — product language and positioning

## Building With Surface

- [Getting Started](guides/getting-started.md) — install Surface, run a fixture report, and build a first producer
- [Consumer SDK](guides/consumer-sdk.md) — fluent helpers for emitting valid `TrustInput`
- [Walkthrough](guides/walkthrough.md) — real session walkthrough with native Surface input
- [External Adapter Example](../examples/external-adapter/README.md) — minimal package-shaped producer

## Reference

- [CLI](reference/cli.md) — `surface report`, `surface claim`, and output formats
- [Claim Authoring](reference/claim-authoring.md) — authored claim stores and `surface claim` write commands
- [Extension API](reference/extension-api.md) — producer branding, vocabulary, claim types, and policy templates
- [Adapters](reference/adapters.md) — adapter registry and producer-owned input mapping
- [Schemas](reference/schemas.md) — JSON contracts for adapter authors and downstream systems
- [Fixtures](reference/fixtures.md) — examples used by tests and docs
- [Schema Versioning](reference/schema-versioning.md) — versioning rules for contract changes
- [Trust Analytics Projection](reference/analytics.md) — evidence intelligence derived from `TrustReport`
- [Surface Console](reference/console.md) — local Console server over producer read models
- [Agents and MCP](reference/mcp.md) — `surface mcp` trust-state tools over the Model Context Protocol
- [Trust Panel Embed](reference/trust-panel.md) — the dependency-free `surface-trust-panel` web component

## Architecture And Specs

- [Architecture](architecture/index.md) — how the kernel, adapters, and product packages fit together
- [Developer Architecture](architecture/developer-architecture.md) — Surface trust/evidence flow and cross-product boundaries
- [Surface Foundation Boundary](architecture/surface-foundation.md) — one-way dependency rule for product layers
- [Minimum Trust Panel Spec](specs/minimum-trust-panel.md) — Viewer-facing inspection requirements
- [Minimum Surface Console Spec](specs/minimum-surface-console.md) — Operator-facing workspace requirements
- [Open Trust Format and Claim Package Shape](specs/open-trust-format.md) — portable trust state shape
- [Disclosure Requirements](specs/disclosure-requirements.md) — required claim, evidence, visibility, and gap disclosure
- [Transparency Capabilities](specs/transparency-capabilities.md) — producer-owned reverification, access, and dispute affordances
- [Producer Extension Limits](specs/producer-extension-limits.md) — customization boundaries that preserve core semantics
- [Conformance](specs/conformance.md) — the derivation conformance suite for alternate implementations
- [Built with Surface Badge](specs/built-with-surface-badge.md) — the inspectability signal and its usage requirements

## Audits And Direction

- [Source Module Audit](audits/source-module-audit.md) — public entrypoint, internal modules, and future split candidates
- [Roadmap](roadmap/index.md) — what ships today and what comes next
- [Adapters and the Producer Boundary](reference/adapters.md) — adapter and claim store patterns, boundary rules
- [ADR 0001: Product Vocabulary Migration](adr/0001-vocabulary-migration.md) — target product language for Surface

## Maintenance

- [Releasing](maintenance/RELEASING.md) — npm publish checklist and trusted publishing setup
- [Repo Hooks](maintenance/repo-hooks.md) — local contributor hook setup and validation
- [Generated And Runtime Artifacts](maintenance/generated-artifacts.md) — what to edit, what is generated, and what stays local

## Package Boundary

The public npm package exposes `@kontourai/surface` as its only module entrypoint, plus the `surface` CLI. TypeScript declarations are published through `dist/src/index.d.ts`, and package metadata points both `types` and `exports["."].types` at that file. Consumers should not import deep `dist/` paths directly.

The package intentionally includes docs, schemas, examples, and built runtime files. It intentionally excludes source files, tests, scripts, generated docs-site output, Playwright artifacts, and local workflow artifacts. `npm run check:package-contents` is the release guard for that boundary.
