# Architecture

Kontour Surface separates stable claim authorship from dynamic evidence collection.

```text
Application  ->  veritas.claims.json  -> authored claims committed to git
Veritas      ->  evidence collection   -> per-run observations against claim IDs
Surface      ->  trust derivation      -> status, conflicts, transparency gaps, reports, analytics
```

Product systems sit above these layers and keep their own workflow language. Producers such as Veritas collect evidence against authored claims. Surface remains the product-neutral shared foundation and trust derivation.

Surface has four internal layers.

## 1. Kernel

The kernel owns portable semantics:

- claims
- evidence
- verification policies
- verification events
- Trust Snapshots and current `TrustReport` API outputs
- status derivation

It should not know about domain schedules, form systems, or repo paths.

## 2. Adapters

Adapters translate producer-owned trust signals into the kernel model when that producer owns claim generation. Surface keeps the public adapter registry and the `surface` passthrough adapter, but no longer ships domain adapters.

Domain-specific adapters belong in their product repos or packages. Producers that use authored claim stores should load claim definitions from their store and emit only per-run evidence, events, and runtime context. Tool-specific evidence import belongs in producer/plugin packages rather than the Surface kernel.

## 3. Trust Snapshots and Agent API

Trust Snapshots summarize trust state for Viewers and agents. The first interface is a local CLI with native Surface input and explicitly registered adapters. MCP and runtime integrations can follow after the contract stabilizes.

Trust analytics projections sit on top of snapshots and current `TrustReport` objects. They derive coverage, claims that need refresh, disputed claims, high-impact unsupported claims, Evidence gaps, action queues, confidence rollups, Transparency Gap or Conflict rollups, and attestation validity signals from `TrustReport` without adding product-specific workflow logic.

## 4. Surface Console

The Surface Console is a local human console for Operators. It shows coverage, claims that need refresh, Transparency Gaps or Conflicts, high-impact unsupported claims, and Evidence drilldowns. Registered Producer Extensions can brand the Console and provide claim type definitions for local claim authoring.

The current CLI and routes still use `console`, including `surface console` and console asset paths. Product-facing documentation should call this experience the Surface Console and mention the current implementation names only when documenting commands or routes.

## Local-first first

The first milestone should run locally with examples and static docs. Hosted sinks and hosted Console experiences come after the schema and report contract prove useful.
