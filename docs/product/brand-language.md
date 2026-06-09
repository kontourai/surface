# Brand Language

## Product name

Use `Kontour Surface` for the foundation product.

Use `Surface` for the command and product shorthand when context is clear.

## Positioning

Preferred:

> Kontour Surface is the shared foundation under Kontour's products. It gives products one shape for claims, evidence, freshness, and gaps so the same trust state can be read by a person, an agent, or another system.

Avoid:

- "We solve truth."
- "AI truth engine."
- "Guaranteed correctness."
- "Substrate" metaphors.
- "Standard" claims (we are not yet).

## Vocabulary

- Surface: shared foundation. As a data field, `surface` is a producer-defined namespace for related claims.
- Claim: trust-bearing assertion.
- Evidence: observation, citation, attestation, test result, or traceable artifact that supports or challenges a claim.
- Evidence Trace: inspectable path showing how evidence was produced.
- Requirement: policy requirement for evidence, method, authority, or freshness.
- Freshness: whether a claim remains current under its policy.
- Changed Since Verified: claim or evidence state changed after verification.
- Expired Verification: verification is outside the allowed freshness window.
- Transparency Gap: missing, weak, stale, disputed, private, unavailable, unverifiable, or unmapped trust element.
- Conflict: competing claims or evidence that cannot both be accepted as current.
- Claim Group: producer-defined grouping of related claims.
- Surface Console: Operator experience for managing claims, policies, evidence, owners, materiality, gaps, and review queues.
- Trust Panel: Viewer experience for inspecting claims, Evidence, Freshness, Conflicts, and Transparency Gaps.
- Trust Snapshot: portable trust state emitted by Surface. Current APIs may still use `TrustReport`.

## Role-action vocabulary scope

The View/Shape/Build/Verify pattern is developer/operator vocabulary, not marketing copy. Public marketing should speak in terms of your customers, your product, and your team.

## Tone

Be concrete, evidence-first, and careful. Lead with product transparency, describe trust as the outcome, and explain claims as the mechanism.
