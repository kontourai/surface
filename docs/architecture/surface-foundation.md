# Surface Foundation Boundary

Surface is Kontour's product-facing integration layer for portable trust state.
Hachure owns the product-neutral schemas and derivation semantics; Surface keeps
Kontour products compatible with that format and exposes product-facing
builders, validators, reports, and inspection surfaces. Product-specific systems
can use their own workflow language, but their portable transparency concepts
should map through Surface rather than integrating independently with Hachure.

## Boundary Rule

Normative format concepts go to Hachure, Kontour integration concepts go to
Surface, and product or workflow mechanics stay in the owning product layer.

Surface owns the Kontour integration for:

- Hachure-compatible subjects, claims, evidence, policies, and events
- schema synchronization, validation, re-exports, and bundle construction
- freshness and status derivation through the compatible implementation
- conflict and transparency gap generation
- product-facing evidence requirements and extensions
- owner and confidence basis
- generated Trust Snapshots and current `TrustReport` outputs

Product layers own:

- domain-specific adapters
- workflow-specific commands
- product-native operator feedback
- local lifecycle language that has not generalized across domains

## Product Layers Built On Surface

Product layers can build on Surface without moving their workflow language into the kernel. A repo-governance product might keep native terms such as evidence check, evidence inventory, readiness coverage, repo run, and repo standards because those terms are useful to coding agents.

Those terms become portable only through a Surface mapping:

| Product-layer concept | Surface mapping |
| --- | --- |
| affected repo node | claim subject |
| selected evidence check | verification policy, evidence, and event |
| evidence-inventory result | claim, evidence, event, and metadata |
| readiness coverage | budget claim/evidence and report-generating metadata |
| policy result | claim, evidence, event, and policy-violation hint |
| repo run | evidence-producing evaluation run |

Surface remains responsible for generated report fields such as `id`, `generatedAt`, `summary`, `transparencyGaps`, and `evidenceRequirementsByClaimId`. Product artifacts may embed `surface.input`, but they should not embed a generated Surface report.

The dependency direction is one-way: product layers may depend on Surface contracts or tooling, but Surface must not depend on product-layer runtime code.

## Promotion Rule

A concept should move into Surface only when it repeats across more than one product domain or is clearly independent of a single product's workflow. Until then, keep it product-local and map it through claim/evidence/policy/event metadata.

## Foundation Contract

Every product layer built on Surface should make the boundary explicit:

1. Product artifacts may include native workflow fields.
2. Product artifacts should expose portable truth through Surface `TrustBundle` records or an adapter that produces them.
3. Surface generates report-only fields after validation.
4. Product-specific lifecycle language should stay outside Surface until it repeats across domains.

For a repo-governance product, evidence checks, proof families, readiness coverages, repo standards, and repo runs remain product-native. Their portable output is `surface.input`, which Surface turns into claims, evidence, policies, events, transparency gaps through the current `transparencyGaps` field, requirement fields, and summaries.
