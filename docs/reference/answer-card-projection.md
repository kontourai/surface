# Answer Card Projection

`buildAnswerCardProjection(report, claimId)` is the compact, report-only read
model for a product answer card. It accepts an already-derived `TrustReport`;
it does not validate untyped input, rerun status derivation, calculate freshness,
or infer support.

```typescript
import { buildAnswerCardProjection } from "@kontourai/surface";

const card = buildAnswerCardProjection(report, claimId);
```

The result is discriminated by `found`.

- A found card preserves the exact claim subject, unknown claim value, derived
  status, copied freshness facts, materiality, claim-scoped transparency gaps,
  and evidence associated with that claim.
- A missing card is stable: `claim` is `null`, both evidence buckets and direct
  inputs are empty, derivation is unavailable, and gaps are empty.

Evidence is partitioned with `partitionEvidenceBySupport`: `entailing` evidence
first retains its original relative order, then `cited` evidence retains its
original relative order. Legacy evidence that omits `supportStrength` belongs in
the `entailing` bucket but exposes `supportStrength: null`, making that missing
producer fact visible. `result` reads only `Evidence.passing`: `true` is
`"passed"`, `false` is `"failed"`, and an omitted value is
`"not-evaluated"`. A failed entailing record blocks only when
`blocking !== false`; cited evidence never blocks the claim regardless of its
`blocking` field.

Derivation is one level deep. Direct inputs use `derivationInputsForClaim`, so
edge declarations precede legacy `derivedFrom` declarations and duplicate input
IDs keep the helper's declared-order behavior. Missing input claims remain in
the card with `status: null`. If an unexpected direct-input projection fault
occurs, the card reports `derivation.available: false` and empty direct inputs
without discarding the claim, evidence, or transparency gaps.

The projection has no JSON Schema. It is a TypeScript read model over the
existing `TrustReport`, just like other report projections; portable format
schemas remain the Hachure-derived files under `schemas/`.
