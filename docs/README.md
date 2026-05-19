# Surface Documentation

Start here when you are working on the Surface repo or building against `@kontourai/surface`.

## Understanding Surface

- [Concepts](concepts.md) — the trust model: surfaces, claims, evidence, policies, events, status, and fault lines
- [Architecture](architecture.md) — how the kernel, adapters, and product packages fit together
- [Surface Foundation Boundary](architecture/surface-foundation.md) — one-way dependency rule for product layers
- [What builds on Surface](built-on-surface.md) — when to reach for Surface and what consumes it
- [Use Cases](use-cases.md) — repo governance, public data trust, fact resolution, dependency audit

## Building With Surface

- [Consumer SDK](guides/consumer-sdk.md) — fluent helpers for emitting valid `TrustInput`
- [Claim Authoring](claim-authoring.md) — authored claim stores and `surface claim` write commands
- [Extension API](extension-api.md) — producer branding, vocabulary, claim types, and policy templates
- [Producers and the Surface Boundary](integration-plan.md) — adapter and claim store patterns, boundary rules
- [External Adapter Example](../examples/external-adapter/README.md) — minimal package-shaped producer

## Reference

- [CLI](cli.md) — `surface report`, `surface claim`, and output formats
- [Schemas](schemas.md) — JSON contracts for adapter authors and downstream consumers
- [Fixtures](fixtures.md) — examples used by tests and docs
- [Schema Versioning](schema-versioning.md) — compatibility rules for contract changes
- [Trust Analytics Projection](analytics.md) — evidence intelligence derived from `TrustReport`
- [Surface Dashboard](dashboards.md) — local dashboard server over producer read models
- [Walkthrough](guides/walkthrough.md) — real session walkthrough with native Surface input

## Direction

- [Vision](vision.md) — product thesis
- [Roadmap](roadmap.md) — what ships today and what comes next
- [Linked Data Roadmap](linked-data-roadmap.md) — JSON-LD, SHACL, and ontology work
