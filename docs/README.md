# Surface Documentation

Start here when you are working on the Surface repo or building an adapter against `@kontourai/surface`.

## Developer Paths

- [Concepts](concepts.md) — the trust model: surfaces, claims, evidence, policies, events, status, and fault lines
- [Consumer SDK](guides/consumer-sdk.md) — fluent helpers for emitting valid `TrustInput`
- [CLI](cli.md) — the shipped `surface report` command and output formats
- [Schemas](schemas.md) — JSON contracts for adapter authors and downstream consumers
- [Fixtures](fixtures.md) — examples used by tests and docs
- [Architecture](architecture.md) — how the kernel, adapters, and product packages fit together
- [Schema Versioning](schema-versioning.md) — compatibility rules for contract changes

## Adapter Work

- [Adapter Extraction Plan](architecture/adapter-extraction-plan.md) — what belongs in Surface versus product packages
- [Field-Attested Records](adapters/field-attested-records.md) — generic public-data adapter pattern
- [Fact Resolution](adapters/fact-resolution.md) — generic high-stakes fact adapter pattern
- [Surface Foundation Boundary](architecture/surface-foundation.md) — one-way dependency rule for product layers

## Where Surface Fits

- [What builds on Surface](built-on-surface.md) — when to reach for Surface and what consumes it
- [Walkthrough](guides/walkthrough.md) — real session walkthrough with shipped adapter output
- [Use Cases](use-cases.md) — repo governance, public data trust, fact resolution, dependency audit

## Product Direction
- [Vision](vision.md) — product thesis
- [Roadmap](roadmap.md) — shipped phases and planned next work
- [Implementation Backlog](implementation-backlog.md) — ordered execution backlog
- [Linked Data Roadmap](linked-data-roadmap.md) — JSON-LD, SHACL, and ontology work
