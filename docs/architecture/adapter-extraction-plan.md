# Adapter Ownership Plan

Surface owns the trust kernel, validation, report generation, and the adapter SDK. Product repos own product-specific adapters.

## Current State

- Surface exports `Adapter`, `registerAdapter`, `getAdapter`, and `listAdapters`.
- The CLI resolves `--adapter <name>` through the explicit registry.
- Built-in adapters are limited to generic examples: `surface`, `field-attested-records`, and `fact-resolution`.
- The package-shaped example in `examples/external-adapter/` proves adapter code can live outside `src/` and use the public SDK.

## Ownership Rule

Adapters that mention a product, repo workflow, database schema, or vendor API belong outside the Surface kernel package. They should import `@kontourai/surface`, register explicitly, validate their emitted `TrustInput`, and call `buildTrustReport`.

## Migration Rule

Do not add product-specific fallback mappers to Surface. If a product artifact can already embed `surface.input`, Surface can report on that input directly with `--adapter surface --input <trust-input.json>`. If the artifact needs product-native parsing, the product package should ship the adapter.
