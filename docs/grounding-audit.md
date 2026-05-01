# Grounding Audit: Real-App Trust Models vs Surface Today

**Audit date:** 2026-04-27

This audit records the real downstream trust shapes that informed Surface's generic examples. It intentionally avoids naming product repos because Surface should not look like it owns product-specific adapters.

## Headline Findings

1. Downstream products do not depend on `@kontourai/surface` today.
2. They already have Surface-shaped concepts: evidence, field attestations, confidence, source references, recheck timestamps, selected candidates, assumptions, comparisons, and review state.
3. Most real trust work happens before final verification. The hard part is often choosing or reviewing a value, not only proving a finished claim.
4. Surface examples should model those shapes generically. Real adapter code belongs in the downstream product repos.

## Field-Attested Records Pattern

This pattern is for public or operational records where each field may have its own source, freshness window, reviewer, and dispute state.

Trust-bearing concepts:

- `Record`: the subject whose fields are being trusted.
- `FieldAttestation`: per-field evidence with status such as active, stale, or invalidated.
- `DataSource` / `CrawlRun`: batch evidence for observed records.
- `ReviewFlag`: human dispute or correction signal.
- `ChangeProposal`: extracted or suggested values awaiting review.
- `ChangeLog`: accepted history with actor and source.

Surface needs:

- Field-level claims keyed by `(subject, field)`.
- Per-claim evidence with source URL, observed timestamp, raw payload, and optional batch reference.
- Time-based recheck staleness.
- Pending or under-review candidate state.
- Review signals as first-class data.

## Fact Resolution Pattern

This pattern is for high-stakes workflows that extract facts, compare candidates, verify selected values, and package derived outputs with citations.

Trust-bearing concepts:

- `ExtractedFact`: raw extraction from a source document or user input.
- `ResolvedFact`: logical fact with candidates and a selected value.
- `VerifiedFact`: reviewed and accepted fact.
- `ReturnPackageField`: derived output field with trace and citations.
- `Assumption`: explicit value used because complete evidence is unavailable.
- `Comparison`: generated value compared with a reference value.
- `ReviewSignal`: actionable reason a human should inspect a field.

Surface needs:

- Candidate values with source, confidence, and chosen/unchosen state.
- Assumption claims with explicit review status.
- Comparison claims with delta, severity, and missing information.
- Review signals as first-class claims or evidence-linked records.
- Package-level policy binding in addition to per-claim policy.
- Runtime trace queries for "show me everything supporting this field."

## Adapter Boundary

Surface keeps:

- Generic trust primitives.
- JSON schemas and report derivation.
- A real Veritas evidence adapter.
- Generic examples under `examples/adapters/`.

Downstream repos keep:

- Real product adapters.
- Product-specific docs and UI language.
- Product storage, access control, and runtime query wiring.

## Decisions

1. Example adapters stay generic: `field-attested-records` and `fact-resolution`.
2. The only real adapter in Surface is the Veritas evidence adapter.
3. Surface primitives should be driven by these real-use-case patterns without importing downstream product names or logic.
4. Linked-data and runtime APIs should wait until candidate, assumption, comparison, review-signal, and freshness semantics are stable.
