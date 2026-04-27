# Surface Foundation Boundary

Surface is the portable trust/evidence substrate for Kontour AI products. Product-specific systems can use their own workflow language, but portable truth concepts should map back to Surface primitives.

## Boundary Rule

Portable truth concepts go to Surface; product and workflow mechanics stay in the product layer.

Surface owns:

- subjects and claims
- evidence
- verification policies
- verification events
- freshness and status
- conflict and fault-line generation
- proof requirements
- owner and confidence basis
- generated trust reports

Product layers own:

- domain-specific adapters
- workflow-specific commands
- product-native operator feedback
- local lifecycle language that has not generalized across domains

## Veritas As A Product Layer

Veritas is the developer- and AI-agent-facing product built on top of Surface. It keeps repo-native terms such as proof lane, proof family, verification budget, shadow run, and policy pack because those terms are useful to coding agents.

Those terms become portable only through a Surface mapping:

| Veritas concept | Surface mapping |
| --- | --- |
| affected repo node | claim subject |
| selected proof lane | verification policy, evidence, and event |
| proof-family result | claim, evidence, event, and metadata |
| verification budget | budget claim/evidence and report-generating metadata |
| policy result | claim, evidence, event, and policy-violation hint |
| shadow run | evidence-producing evaluation run |

Surface remains responsible for generated report fields such as `id`, `generatedAt`, `summary`, `faultLines`, and `proofRequirementsByClaimId`. Veritas may embed `surface.input`, but it should not embed a generated Surface report.

## Promotion Rule

A concept should move into Surface only when it repeats across more than one product domain or is clearly independent of a single product's workflow. Until then, keep it product-local and map it through claim/evidence/policy/event metadata.

## Foundation Contract

Every product layer built on Surface should make the boundary explicit:

1. Product artifacts may include native workflow fields.
2. Product artifacts should expose portable truth through Surface `TrustInput` records or an adapter that produces them.
3. Surface generates report-only fields after validation.
4. Product-specific lifecycle language should stay outside Surface until it repeats across domains.

For Veritas, that means proof lanes, proof families, verification budgets, policy packs, and shadow runs remain Veritas-native. Their portable output is `surface.input`, which Surface turns into claims, evidence, policies, events, fault lines, proof requirements, and summaries.
