# Architecture

Kontour Surface separates stable claim authorship from dynamic evidence collection.

```text
Application  ->  veritas.claims.json  -> authored claims committed to git
Veritas      ->  evidence collection   -> per-run observations against claim IDs
Surface      ->  trust derivation      -> status, fault lines, reports, analytics
```

Product systems sit above these layers and keep their own workflow language. Producers such as Veritas collect evidence against authored claims. Surface remains the product-neutral protocol and trust kernel.

Surface has four internal layers.

## 1. Kernel

The kernel owns portable semantics:

- claims
- evidence
- verification policies
- verification events
- trust reports
- status derivation

It should not know about domain schedules, form systems, or repo paths.

## 2. Adapters

Adapters translate producer-owned trust signals into the kernel model when that producer owns claim generation. Surface keeps the public adapter registry and the `surface` passthrough adapter, but no longer ships domain adapters.

Domain-specific adapters belong in their product repos or packages. Producers that use authored claim stores should load claim definitions from their store and emit only per-run evidence, events, and runtime context. Tool-specific evidence import belongs in producer/plugin packages rather than the Surface kernel.

## 3. Reports and Agent API

Reports summarize trust state for humans and agents. The first interface is a local CLI with native Surface input and explicitly registered adapters. MCP and runtime integrations can follow after the contract stabilizes.

Trust analytics projections sit on top of reports. They derive coverage, stale zones, disputed claims, high-impact unsupported claims, proof gaps, action queues, confidence rollups, fault-line rollups, and attestation validity signals from `TrustReport` without adding product-specific workflow logic.

## 4. Human Console

The dashboard is a local human console. It shows coverage, stale zones, fault lines, high-impact unsupported claims, and evidence drilldowns. Registered extensions can brand the dashboard and provide claim type definitions for local claim authoring.

## Local-first first

The first milestone should run locally with fixtures and static docs. Hosted sinks and dashboards come after the schema and report contract prove useful.
