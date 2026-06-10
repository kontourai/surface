# Roadmap

## What ships today

Surface ships the Surface library, CLI, local Surface Console, and claim authoring.

**Kernel** — claims, evidence, verification policies, verification events, status derivation, freshness, transparency gaps through the current `transparencyGaps` field, evidence requirements, identity links, incompatibility rules, derived claims, and linked-data export.

**CLI** — `surface report`, `surface get`, `surface stale`, `surface missing`, `surface policy`, and `surface claim` (add, edit, remove, list, validate).

**Surface Console** — local server over a producer read model. Coverage, transparency gaps, evidence drilldowns, claim authoring modal, and producer-branded vocabulary via the extension API.

**Extension API** — producers register vocabulary, theme, and claim type definitions. The Console adapts to the producer's language without changes to Surface.

**Consumer SDK** — fluent helpers for producers and builders emitting valid `TrustInput`.

**Analytics projection** — evidence intelligence derived from `TrustReport`: coverage by producer namespace, stale areas, disputed claims, high-impact unsupported claims, transparency gap rollups, attestation validity, and action queues.

## What comes next

**MCP resources** — `surface stale`, `surface missing`, and `surface policy` as MCP-queryable resources so agents can inspect trust state without shell access.

**Hosted sink** — durable storage for longitudinal reports and organization-wide trend analysis, after the local report contract proves stable.

**Linked data** — a resolvable vocabulary, SHACL shapes for validation without running Surface TypeScript, optional Turtle/N-Quads output, and eventual Verifiable Credentials alignment.

**Resource Contract alignment** — wrapping durable Surface records such as integrity anchors, trust snapshots, and exported history in the shared Kontour resource shape (`apiVersion`, `kind`, `metadata`, `spec`, `status`, `proof`) without breaking existing `TrustInput` and `TrustReport` contracts.
