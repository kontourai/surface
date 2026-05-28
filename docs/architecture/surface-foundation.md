# Surface Foundation Boundary

Surface is the portable product transparency foundation for Kontour AI products. Product-specific systems can use their own workflow language, but portable transparency concepts should map back to Surface primitives.

## Boundary Rule

Portable truth concepts go to Surface; product and workflow mechanics stay in the product layer.

Surface owns:

- subjects and claims
- evidence
- verification policies
- verification events
- freshness and status
- conflict and transparency gap generation
- evidence requirements
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
2. Product artifacts should expose portable truth through Surface `TrustInput` records or an adapter that produces them.
3. Surface generates report-only fields after validation.
4. Product-specific lifecycle language should stay outside Surface until it repeats across domains.

For a repo-governance product, evidence checks, proof families, readiness coverages, repo standards, and repo runs remain product-native. Their portable output is `surface.input`, which Surface turns into claims, evidence, policies, events, transparency gaps through the current `transparencyGaps` field, requirement fields, and summaries.
