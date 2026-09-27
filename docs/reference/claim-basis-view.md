# Claim Basis View

`claimBasisView(claim, evidence)` answers "how was this claim's status
established?" as a short line a renderer shows after the status chip, for
example:

```text
Verified   Extracted from a source · 2 entail the claim · 1 cited only
Pending review   Model-derived · 1 not evaluated
No evidence   Basis not recorded
```

It does not restate or upgrade the status and never collapses the basis into a
single confidence value. Surface owns the summary rules so every renderer shows
the same line; renderers (for example the `@kontourai/ui` trust basis
primitive, kontourai/ui#87) take the view as-is.

```ts
import { claimBasisView, missingClaimBasisView } from "@kontourai/surface/display";

const view = claimBasisView(claim, bundle.evidence); // only evidence with claimId === claim.id is used
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

`field` is one of `derivationMethod`, `execution`, `result`, `supportStrength`,
`counterevidence`, `method` or `reviewerAuthority`. `code` is the wire enum or
derived state (`model`, `could-not-run`, `not-evaluated`, `cited`,
`counterevidence`, `extraction`, `entails`, `operator`, …). A renderer can put
`field`, `code` and `caveat` on data attributes.

## Rules

1. **Never blank.** A claim with no evidence, no derivation edges and no
   reviewer (other than `none`) is `not-recorded`. A missing claim is
   `not-available`. `restricted` and `unavailable` come from the host, which
   knows about permission denials and failed reads: use
   `missingClaimBasisView(state)` for the canonical label.
2. **At most 3 facets**, except that caveats are never dropped: when there are
   more than 3 caveats the line holds every caveat and nothing else.
3. **Caveats first**, in this order: Model-derived (a `model` derivation edge),
   N check(s) could not run (`execution.isError`), N not evaluated (absent
   `passing`), N cited only, N counterevidence (entailing evidence that failed
   and is not marked non-blocking, the same predicate as Basis
   counterevidence). A check that could not run has no result of its own: it
   is never counted as failed, not evaluated, or counterevidence, whatever its
   `passing` says.
4. **Then method, support, review.** Method is the evidence `method`s in
   Surface enum order (no depth ranking exists); more than one becomes
   `Extracted from a source + 2 more methods`. With no evidence, the non-model
   derivation methods are used instead, or `Derived from N inputs` when edges
   state no method. Support is `N entail(s) the claim`, then
   `N support not stated`. Review is the `confidenceBasis.reviewerAuthority`
   label when it is not `none`.
5. **Absent `passing` is never a pass.** It is counted as not evaluated.
   Absent `supportStrength` is shown as "support not stated", as in the trust
   panel's evidence rows, even though status derivation treats it as entailing.
6. **Producer-supplied values stay in the inspector.**
   `confidenceBasis.evidenceStrength` appears only as a `Producer rating`
   detail row ("Strong support (producer-rated)"), and `conclusionConfidence`
   only as a `Calibrated confidence (producer-supplied)` row, worded as the
   probability that the conclusion is correct (its interval bounds that
   probability, not the claim's value). Neither is ever a facet.

Detail rows, when there is data for them: How, Support, Results, Derived,
Review, Producer rating, Calibrated confidence (producer-supplied), Sources.

## Label tables

All in `src/display-names.ts`, as `*_DISPLAY_NAMES` (label and one-line gloss)
with `*_LABELS` label-only projections:

| Table | Values |
| --- | --- |
| `DERIVATION_METHOD_DISPLAY_NAMES` | `sum` Calculated (sum), `max` Calculated (maximum), `min` Calculated (minimum), `model` Model-derived, `rule-application` Rule applied, `copy` Copied from an input, `normalization` Normalized from an input, `manual` Entered by a person |
| `EVIDENCE_SUPPORT_DISPLAY_NAMES` | `entails` Entails the claim, `cited` Cited only, `unstated` Support strength not stated |
| `EVIDENCE_RESULT_DISPLAY_NAMES` | `passed` Passed, `failed` Failed, `failed-blocking` Failed — blocking, `not-evaluated` Not evaluated |
| `REVIEWER_AUTHORITY_DISPLAY_NAMES` | `domain_expert` Domain expert reviewed, `operator` Operator reviewed, `system` System reviewed, `none` Not reviewed |
| `EVIDENCE_STRENGTH_DISPLAY_NAMES` | `strong` / `moderate` / `weak` Strong / Moderate / Weak support (producer-rated), `none` No support (producer-rated) |
| `CLAIM_BASIS_MISSING_DISPLAY_NAMES` | the four missing-state labels above |

The trust panel keeps inline copies of the support and result labels (it ships
as one bundle under a size budget); `tests/display-names.test.ts` fails if they
drift from these tables.
