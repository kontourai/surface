# Roadmap

## What ships today

Surface ships the trust kernel, CLI, local dashboard, and claim authoring.

**Kernel** — claims, evidence, verification policies, verification events, status derivation, staleness, fault lines, proof requirements, identity links, incompatibility rules, derived claims, and linked-data export.

**CLI** — `surface report`, `surface get`, `surface stale`, `surface missing`, `surface policy`, and `surface claim` (add, edit, remove, list, validate).

**Dashboard** — local server over a producer read model. Coverage, fault lines, evidence drilldowns, claim authoring modal, and producer-branded vocabulary via the extension API.

**Extension API** — producers register vocabulary, theme, and claim type definitions. The dashboard adapts to the producer's language without changes to Surface.

**Consumer SDK** — fluent helpers for emitting valid `TrustInput`.

**Analytics projection** — evidence intelligence derived from `TrustReport`: coverage by surface, stale zones, disputed claims, high-impact unsupported claims, fault-line rollups, attestation validity, and action queues.

## What comes next

**MCP resources** — `surface stale`, `surface missing`, and `surface policy` as MCP-queryable resources so agents can inspect trust state without shell access.

**Hosted sink** — durable storage for longitudinal reports and organization-wide trend analysis, after the local report contract proves stable.

**Linked data** — a resolvable vocabulary, SHACL shapes for validation without running Surface TypeScript, optional Turtle/N-Quads output, and eventual Verifiable Credentials alignment. See [linked-data-roadmap.md](./linked-data-roadmap.md) for the full sequence.
