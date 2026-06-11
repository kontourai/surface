# ADR 0001: Product Vocabulary Migration

Status: accepted

Date: 2026-05-22

## Context

Surface is now framed as a product transparency standard and foundation product. The product promise is: Show your work. Earn trust. Surface connects evidence provenance to the claims products ask users and agents to trust.

Some existing implementation and documentation terms came from earlier phases where Surface was described as a TypeScript library, console, trust substrate, or generic evidence system. This ADR defines the target product vocabulary. Current code and schema names may appear only where exact technical reference requires them; they are not product terms to preserve.

## Decision

Adopt the following product vocabulary in human-facing docs and specs:

- Surface: product transparency standard and foundation product
- Trust Panel: Viewer-facing inspection surface
- Surface Console: Operator-facing management workspace
- Trust Snapshot: product-language projection of current trust state
- Claim Package: portable package of claims, evidence, policies, traces, and related context (superseded by Trust Bundle, see ADR 0002)
- Transparency Gap: missing, weak, stale, disputed, private, unavailable, unverifiable, or unmapped trust element
- Conflict: contradictory or disputed trust state
- Claim Group: related claims grouped by producer or framework
- Requirement: policy expectation; use requirement only when a producer domain naturally uses requirements
- Viewer, Operator, Builder, Verifier, Agent Mode: audience and role vocabulary

Current implementation names that may still appear in technical references:

- `TrustInput`
- `TrustReport`
- `transparencyGaps`
- `claimGroups`
- `surface`
- `surface console`
- Console read models and routes
- schema versions 2 and 3

Product docs should avoid these names except when documenting exact commands, fields, routes, or schemas. New docs should use the target vocabulary by default.

## Migration Map

| Earlier term | Product term | Technical note |
| --- | --- | --- |
| console | Surface Console | Use `surface console` only when documenting the current CLI command or route names. |
| transparency gap | Transparency Gap or Conflict | Use `transparencyGaps` only when documenting the current report field. |
| drift | Freshness, Changed Since Verified, or Expired Verification | Pick the label that matches the state. |
| claimGroup | Claim Group | Use `claimGroups` only when documenting the current schema field. |
| requirement | Requirement | Keep requirement only for producer domains that use that word. |
| consumer | Viewer, Operator, Builder, Verifier, or Agent Mode | Use the specific role. |
| proof | Evidence or Evidence Trace | Veritas uses evidence checks and repo standards as product-local vocabulary. |
| trust score | status, gaps, and evidence basis | Do not add a single score. |

## Consequences

Docs should adopt the target product language now. Builders may still encounter API names in exact technical references, but those names are not product vocabulary.

This decision also preserves product boundaries:

- Surface owns transparency primitives, open trust format, Trust Panel, Console baseline, lifecycle, disclosure requirements, traces, gaps, and guidance tools.
- Vertical products own evidence collection, domain policy, source integrations, producer claim types, materiality mapping, and action decisions.
- Producer Extensions customize product fit but cannot redefine core trust semantics.
