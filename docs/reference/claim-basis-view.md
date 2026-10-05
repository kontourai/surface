# Claim Basis View

`claimBasisView(claim, evidence)` answers "how was this claim's status
established?" as a short line a renderer shows after the status chip, for
example:

```text
Verified   Extracted from a source · 2 entail the claim · 1 cited only
Pending review   Model-derived · 1 not evaluated
Disputed   1 contradicts the claim · Checked against expectations
No evidence   Basis not recorded
```

It does not restate or upgrade the status and never collapses the basis into a
single confidence value. Surface owns the summary rules so every renderer shows
the same line; renderers (for example the `@kontourai/ui` trust basis
primitive, kontourai/ui#87) take the view as-is.

```ts
import { claimBasisView, missingClaimBasisView } from "@kontourai/surface/display";

const view = claimBasisView(claim, bundle.evidence); // only evidence linked to the claim (claimId === claim.id) is used
```

`@kontourai/surface/display` imports no Node-only modules, so it can be bundled
for the browser. The label tables below are also exported from the root entry;
`claimBasisView` is only on `./display`.

## Shape

```ts
type TrustBasisView =
  | {
      state: "recorded";
      facets: { field: TrustBasisFacetField; code: string; label: string; caveat: boolean }[];
      detail?: { label: string; value: string }[]; // inspector rows
    }
  | {
      state: "not-recorded" | "restricted" | "unavailable" | "not-available";
      label: string; // "Basis not recorded" / "Basis restricted" / "Basis unavailable" / "Basis not available"
      detail?: { label: string; value: string }[];
    };
```

`field` is one of `derivationMethod`, `result`, `supportStrength`,
`counterevidence`, `method` or `reviewerAuthority`. `code` is the wire enum or
derived state (`model`, `not-evaluated`, `cited`, `counterevidence`,
`failed-not-blocking`, `extraction`, `entails`, `operator`, …). A renderer can
put `field`, `code` and `caveat` on data attributes.

## Rules

1. **Only linked evidence bears on a claim.** Not every tool call is evidence.
   The view uses only evidence whose `claimId` equals `claim.id` (supporting,
   cited, or counterevidence). Execution-trail tool calls and other claims'
   evidence never reach the line or its counts, whether they succeeded,
   failed, or were retried; they stay inspectable at the raw-execution layer.
2. **Never blank.** A claim with no linked evidence, no derivation edges and no
   reviewer (other than `none`) is `not-recorded`. A missing claim is
   `not-available`. `restricted` and `unavailable` come from the host, which
   knows about permission denials and failed reads: use
   `missingClaimBasisView(state)` for the canonical label.
3. **At most 3 facets**, except that caveats are never dropped: when there are
   more than 3 caveats the line holds every caveat and nothing else.
4. **Caveats first**, in this order:
   - Model-derived (a `model` derivation edge)
   - N could not run (evidence carrying `inconclusive`, schemaVersion 9)
   - N not evaluated (absent `passing`, not inconclusive)
   - N cited only
   - N contradict(s) the claim: exactly Surface's `isStandingCounterevidence`
     (entailing evidence with `passing: false` and `blocking` not `false`)
   - N failed (reason): every other `passing: false` item, labelled by why it
     is not counterevidence. `supportStrength: "cited"` gives "cited only"
     (checked first, since cited evidence never counts whatever `blocking`
     says); otherwise `blocking: false` gives "not blocking". Both reasons
     share one slot: "2 failed (cited only)", "1 failed (not blocking)", or
     "3 failed (1 not blocking, 2 cited only)". A failure is never left off
     the line.
5. **Then method, support, review.** Method is the evidence `method`s in
   Surface enum order (no depth ranking exists); more than one becomes
   `Extracted from a source + 2 more methods`. With no evidence, the non-model
   derivation methods are used instead, or `Derived from N inputs` when edges
   state no method. Support is `N entail(s) the claim`, then
   `N with support not stated`, counting only evidence that did not fail and
   is not inconclusive, so one item never reads as both contradicting and
   supporting the claim, and an attempt that never ran is not counted as
   cited (the inspector's Support row keeps the full partition). Review is the
   `confidenceBasis.reviewerAuthority` label when it is not `none`. It is
   producer-asserted, like the rating below, but stays on the line because a
   recorded review is first-class provenance.
6. **Results come from `passing` / `blocking` only.** Absent `passing` is never
   a pass; it is counted as not evaluated. `execution.isError` and a non-zero
   `exitCode` mean the check ran and failed (producers set `isError` from the
   exit code or the MCP tool result), so they are classified like any other
   result, exactly as status derivation does. Only an explicit
   `evidence.inconclusive` record (schemaVersion 9) means the check could not
   run: its result is `could-not-run` whatever else the item records. A
   schema-valid inconclusive item is `cited` with no `passing`, so status
   derivation never sees it either.
7. **Absent `supportStrength`** is shown as "with support not stated", as in the
   trust panel's evidence rows, even though status derivation treats it as
   entailing (the gloss says so).
8. **Unrecognized wire values** are shown as `Unrecognized method (value)` /
   `Unrecognized reviewer (value)`, never as the bare string. A
   `confidenceBasis.reviewerAuthority` or `evidenceStrength` that is not a
   non-empty string (`null`, a number, an object, `""`) is treated as absent:
   no facet and no detail row. Every facet `code` is a string.
9. **Producer-supplied values stay in the inspector.**
   `confidenceBasis.evidenceStrength` appears only as a `Producer rating`
   detail row ("Strong support (producer-rated)"), and `conclusionConfidence`
   only as a `Calibrated confidence (producer-supplied)` row, worded as the
   probability that the conclusion is correct (its interval bounds that
   probability, not the claim's value). A value or interval bound that is not
   a finite number in [0, 1] is left out. Neither is ever a facet.

Detail rows, when there is data for them: How, Support, Results, Derived,
Review, Producer rating, Calibrated confidence (producer-supplied), Collected
by, Estimate, Sources. Collected by counts `collectedByKind` values and names
undeclared items as "Collector not stated"; it appears only when at least one
item declares a kind. Estimate reads the basis-annotations profile's
`claim.metadata.estimate`: "Estimated · low–high (basis)" for a well-formed
one, and "Estimate recorded but malformed; bounds not shown" otherwise.

## Label tables

All in `src/display-names.ts`, as `*_DISPLAY_NAMES` (label and one-line gloss)
with `*_LABELS` label-only projections:

| Table | Values |
| --- | --- |
| `DERIVATION_METHOD_DISPLAY_NAMES` | `sum` Calculated (sum), `max` Calculated (maximum), `min` Calculated (minimum), `model` Model-derived, `rule-application` Rule applied, `copy` Copied from an input, `normalization` Normalized from an input, `manual` Entered by a person |
| `EVIDENCE_SUPPORT_DISPLAY_NAMES` | `entails` Entails the claim, `cited` Cited only, `unstated` Support strength not stated |
| `EVIDENCE_RESULT_DISPLAY_NAMES` | `passed` Passed, `failed` Failed, `failed-blocking` Failed — blocking, `not-evaluated` Not evaluated, `could-not-run` Could not run |
| `EVIDENCE_INCONCLUSIVE_REASON_DISPLAY_NAMES` | `unreachable` Source unreachable, `tool_error` Tool error, `permission_denied` Permission denied, `timeout` Timed out, `other` Other reason |
| `EVIDENCE_COLLECTOR_KIND_DISPLAY_NAMES` | `human` Collected by a person, `deterministic` Collected by a program, `model` Collected by a model |
| `REVIEWER_AUTHORITY_DISPLAY_NAMES` | `domain_expert` Domain expert reviewed, `operator` Operator reviewed, `system` System reviewed, `none` Not reviewed |
| `EVIDENCE_STRENGTH_DISPLAY_NAMES` | `strong` / `moderate` / `weak` Strong / Moderate / Weak support (producer-rated), `none` No support (producer-rated) |
| `CLAIM_BASIS_MISSING_DISPLAY_NAMES` | the four missing-state labels above |

The trust panel keeps inline copies of the support, result, collector-kind and
could-not-run reason labels (it ships as one bundle under a size budget);
`tests/display-names.test.ts` fails if they drift from these tables.
