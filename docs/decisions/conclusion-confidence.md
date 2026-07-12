---
status: current
subject: Conclusion Confidence
decided: 2026-07-12
evidence:
  - kind: issue
    ref: "25"
  - kind: url
    ref: https://github.com/kontourai/survey/issues/18
  - kind: doc
    ref: docs/reference/schemas.md
---
# Conclusion Confidence

**Ratified design** for issue #25 — a **calibrated confidence value on a
conclusion**, distinct from `ConfidenceBasis`, plus a structured **comfort-zone**
signal that Survey (#18) can populate. The *shape* below is the agreed answer;
the *implementation* is a tracked, owner-gated cross-repo change (the field is
producer-authored and lands on the Hachure claim schema — see the path below).
Scope is **carry, not produce** — how a calibrated value is computed (ensemble
disagreement, perturbation, reference comparison; #25 §9) is explicitly out of
scope.

## The problem this fixes

`ConfidenceBasis` (`src/types.ts`) is a bag of **ingredients** — `sourceQuality`,
`extractionConfidence`, `corroborationCount`, `reviewerAuthority`,
`freshnessRemainingDays`, `conflictCount`, `evidenceStrength`, `impactLevel`. None
of these is a calibrated probability *about the conclusion itself*. A reviewer who
asks "how sure is the system that this conclusion is right?" has no field to read.

## Proposed shape

A new **top-level, optional** claim field, sibling to `confidenceBasis` (not
nested inside it — the whole point is that it is separate from the ingredients):

```typescript
conclusionConfidence?: {
  /** Calibrated probability in [0,1] that the conclusion is correct. Carried, not derived by Surface. */
  value?: number;
  /** How the value was calibrated (provenance label, e.g. "ensemble-disagreement", "perturbation"). Free-form; Surface does not validate the method's semantics. */
  method?: string;
  /** Optional calibrated interval around `value`. */
  interval?: { low: number; high: number };
  /** Structured comfort-zone signal (R2) — the producer/Survey populates this. */
  comfortZone?: {
    /** Whether the conclusion falls within the calibrated comfort zone. */
    within: boolean;
    /** Structured reason when outside (e.g. "out-of-distribution", "low-corroboration"). */
    reason?: string;
  };
};
```

### Why a new field, not an extension of `ConfidenceBasis`

`ConfidenceBasis` answers "what raw signals fed the assessment"; `conclusionConfidence`
answers "how calibrated-sure are we of the conclusion". Folding a calibrated
probability into the ingredient bag would blur exactly the distinction #25 exists
to draw, and would invite consumers to treat an ingredient (say `extractionConfidence`)
as the calibrated answer. A sibling field keeps the two orthogonal and legible.

### R3 — relationship to `ConfidenceBasis.reviewerAuthority`

`reviewerAuthority` (`none | operator | domain_expert | system`) is an **input
ingredient**: *who* vouched for the claim. `conclusionConfidence.value` is a
**calibrated output**: *how likely the conclusion is correct*. They are
orthogonal, and deliberately so:

- A `domain_expert`-reviewed claim can still carry **low** `conclusionConfidence`
  (the expert reviewed it and remains genuinely unsure).
- A claim with `reviewerAuthority: none` can carry **high** `conclusionConfidence`
  (a well-calibrated automated method, no human in the loop).

So a consumer must not read `reviewerAuthority` as a proxy for calibrated
confidence, nor vice versa. Surface documents this separation and never derives
one from the other.

## Cross-repo path (owner-gated)

This is the #24 / #128 pattern:

1. Add `conclusionConfidence` to the Hachure `claim.schema.json` (the top-level
   claim is `additionalProperties: false`, so the field cannot be carried until
   the schema admits it).
2. Publish Hachure (owner-gated).
3. Surface `npm run sync:schemas` + add the `conclusionConfidence` TS type to
   `Claim`, thread it through validation and the report untouched (carry-only),
   and surface it in `docs/reference/schemas.md`.
4. Tests: a claim carrying `conclusionConfidence` (value + comfortZone) round-trips
   through `validateTrustBundle` → `buildTrustReport` unchanged; the field is
   optional and absent-safe.

## Survey #18 reconciliation

Survey #18 (comfort-zone projection) is the primary populator of `comfortZone`.
The shape above is intended to be the structured home Survey projects into: Survey
computes `{ within, reason }`; Surface carries and exposes it. Before the Hachure
schema change, confirm the `comfortZone.reason` vocabulary with Survey #18 so the
two sides agree on the reason codes rather than trading free-form strings.

## Status

The shape is **ratified** (2026-07-12). What remains is execution of the
owner-gated cross-repo path above: the Hachure schema change and publish stay
owner-gated, and `comfortZone.reason` vocabulary should be reconciled with Survey
#18 before the schema change lands. Until then, no `conclusionConfidence` field is
carried in Surface — this record holds the agreed target.
