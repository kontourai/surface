# Surface Documentation

Start here when you are working on the Surface repo or building against `@kontourai/surface`.

## Understanding Surface

- [Concepts](concepts.md) — the trust model: claims, evidence traces, policies, Trust Snapshots, claim groups, status, and transparency gaps
- [Architecture](architecture.md) — how the kernel, adapters, and product packages fit together
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
- [Surface Console](consoles.md) — local Console server over producer read models
- [Walkthrough](guides/walkthrough.md) — real session walkthrough with native Surface input
- [Releasing](RELEASING.md) — npm publish checklist and trusted publishing setup
- [Repo Hooks](repo-hooks.md) — local contributor hook setup and validation

## Direction

- [Vision](vision.md) — product transparency thesis
- [Roadmap](roadmap.md) — what ships today and what comes next
- [Linked Data Roadmap](linked-data-roadmap.md) — JSON-LD, SHACL, and ontology work
- [ADR 0001: Product Vocabulary Migration](adr/0001-vocabulary-migration.md) — target product language for Surface
