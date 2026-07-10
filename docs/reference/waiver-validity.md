# Waiver Validity

`WaiverValidity` is a Surface-side derived projection that gives Flow (and any
other Hachure-consuming client) a stable, versioned answer to "is this
`assumed` claim's accepted-gap waiver valid" — without re-parsing the
free-form `claim.metadata.waiver` object itself.

`WaiverValidity` is additive and *sibling* to `TrustStatus`. It never changes
core status derivation: `deriveTrustStatus`/`deriveClaimStatus` and
`statusFunctionVersion` are untouched by this projection. An `assumed` claim
stays `assumed` whether or not a waiver is attached — waiver validity is a
downstream consumer concern, not a status-derivation input.

## Origin

Surface's own schemas (`schemas/claim.schema.json`,
`schemas/verification-event.schema.json`) carry no waiver vocabulary. The
shape documented here is the *de facto* convention already stamped by
`kontourai/flow-agents`: ADR 0020 §3 has flow-agents' `record-evidence`/
`record-gate-claim` write `claim.metadata.waiver = {reason, approved_by,
approved_at}` onto the existing, untyped `claim.metadata` object, force the
claim's status to the existing `assumed` value, and print a loud `WAIVED:`
line. Prior to this projection, `trust-reconcile.js` only checked *presence*
of those three keys — it never validated them — which is why
`kontourai/flow-agents#511` narrowed Builder gates to verified-only: Flow had
no canonical, versioned predicate to trust instead of re-parsing free-form
metadata itself. `deriveWaiverValidity` is that predicate.

## The `claim.metadata.waiver` wire shape

No schema change was required to read this: `Claim.metadata` is already
`{"type":"object"}`, unconstrained, in the vendored `schemas/claim.schema.json`.
The wire field names are exactly the ones ADR 0020 §3 already produces —
Surface reads them verbatim and does not rename them on the way in:

```jsonc
// claim.metadata.waiver
{
  "reason": "string, non-empty",
  "approved_by": "string, non-empty",
  "approved_at": "string, RFC3339 date-time"
}
```

- `reason` — free-text justification for the waiver.
- `approved_by` — free-text identifier of the approver. This is **not**
  authenticated (see [Residual](#residual-approverauthenticated-is-always-false)
  below).
- `approved_at` — an ISO 8601 / RFC3339 timestamp for when the waiver was
  granted.

Source: `kontourai/flow-agents` ADR 0020 §3, `parseWaiver` in
`workflow-sidecar.ts`; the gap this projection closes is described in
`kontourai/flow-agents#511`.

## `WaiverFacts`

`WaiverValidity.waiver`, when present, echoes the raw snake_case wire values
Surface read plus camelCase aliases for TS-idiomatic consumption. Surface does
not invent new field names for the wire values — `reason` stays `reason`;
only the approver/timestamp fields get a camelCase echo:

```ts
export interface WaiverFacts {
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
}
```

## `WaiverVerdict`

```ts
export type WaiverVerdict =
  | "not-applicable"
  | "bare-assumed"
  | "complete-waiver"
  | "incomplete-waiver"
  | "stale-or-revoked-waiver"
  | "command-backed-waiver-rejection";
```

| Verdict | Meaning |
| --- | --- |
| `not-applicable` | The claim's derived status is neither `assumed` nor a waiver-bearing `stale`/`revoked`. There is nothing for waiver validity to say about this claim. |
| `bare-assumed` | The claim's derived status is `assumed` and `claim.metadata.waiver` is absent. A bare `assumed` claim is **never** acceptable by default — this verdict exists so a consumer cannot mistake "no waiver" for "waived." |
| `complete-waiver` | The claim's derived status is `assumed`, `claim.metadata.waiver` is present, and `reason`/`approved_by`/`approved_at` all pass shape validation (non-empty strings, parseable date-time). Note: `approverAuthenticated` is still `false` on this verdict — "complete" describes shape completeness, not identity trust. |
| `incomplete-waiver` | The claim's derived status is `assumed`, `claim.metadata.waiver` is present, but one or more of `reason`/`approved_by`/`approved_at` fails shape validation (missing, empty, or unparseable). `incompleteFields` names exactly which wire key(s) failed. A non-object `waiver` value lists all three fields as incomplete. |
| `stale-or-revoked-waiver` | The claim's derived status is `stale` or `revoked` and `claim.metadata.waiver` is still present on it — a waiver that was stamped for a status that has since moved past `assumed`. This is inferred from whatever `metadata.waiver` happens to still be attached; if a producer strips `metadata.waiver` when a claim goes stale/revoked, that history is invisible to Surface. |
| `command-backed-waiver-rejection` | The claim's derived status is `assumed`, evidence for the claim includes command-backed evidence (`isCommandBackedEvidence`), and `claim.metadata.waiver` is present. Per ADR 0020 §3, "a command-backed check cannot be waived" — this verdict makes that divergence rule natively derivable in Surface instead of requiring flow-agents to re-implement it. |

## Precedence

`deriveWaiverValidity` evaluates in this order; the first match wins:

1. Status is `assumed`, evidence includes command-backed evidence, and a
   waiver is present → **`command-backed-waiver-rejection`**. This wins even
   over an otherwise-complete waiver — a command-backed check cannot be waived
   regardless of how complete the waiver's shape is.
2. Status is `stale` or `revoked` and a waiver is present →
   **`stale-or-revoked-waiver`**.
3. Status is anything else not covered by step 2 → **`not-applicable`**.
4. Status is `assumed`, no waiver present → **`bare-assumed`**. A bare
   `assumed` claim is never acceptable by default; there is no verdict that
   implicitly treats "no waiver" as passing.
5. Status is `assumed`, a waiver is present, but shape validation fails on
   one or more fields → **`incomplete-waiver`**.
6. Otherwise → **`complete-waiver`**.

`isCommandBackedEvidence` infers "command-backed" from
`evidenceType === "test_output"` or the presence of `evidence.execution`. A
producer can evade this heuristic the same way ADR 0020's own
"evidenceType-laundering route" residual describes (omitting `execution`,
mislabeling `evidenceType`). This projection inherits that upstream residual;
it does not solve it.

## Residual: `approverAuthenticated` is always `false`

```ts
export interface WaiverValidity {
  verdict: WaiverVerdict;
  approverAuthenticated: false;
  waiver?: WaiverFacts;
  incompleteFields?: Array<"reason" | "approved_by" | "approved_at">;
}
```

`approverAuthenticated` is the literal `false` on **every** verdict branch,
including `complete-waiver` — never omitted, never computed as `true`. This is
by design, not a TODO: `approved_by` is free text, never cryptographically
bound to an identity. ADR 0020 discloses this as its own residual
("Authority-binding residual" / a careless or hostile producer can stamp any
string as approver). `deriveWaiverValidity` validates the *shape* of the
waiver only — never the approver's identity — so a `complete-waiver` verdict
means "the three fields are present and well-formed," not "this waiver was
granted by someone we verified."

This field exists precisely so that residual can never be silently folded
into "complete-waiver ⇒ trusted." A consumer that wants stronger identity
binding needs the Assurance profile (L1/L2 identity binding) or an equivalent
authentication mechanism layered on top — `deriveWaiverValidity` does not
provide one.

## Versioning

```ts
export const waiverValidityFunctionVersion = "1";
```

Mirrors the existing `statusFunctionVersion` convention (`src/status.ts`,
ADR 0003 step 2): increment this when the derivation algorithm changes so
that stored results can be identified and re-evaluated if needed.

## Consumption paths

There are two supported ways to consume `WaiverValidity`. Per
`flow-agents/scripts/ci/derive-claim-status.mjs` (which already imports
`@kontourai/surface`'s `deriveClaimStatus` directly, not a JSON-schema report
field), the direct function import is the proven path for how Flow consumes
Surface today.

### 1. Direct function import (primary)

```ts
import { deriveWaiverValidity } from "@kontourai/surface";

const result = deriveWaiverValidity({ claim, status, evidence });
```

### 2. `report.waiverValidityByClaimId`

`buildTrustReport` attaches a per-claim map to `TrustReport`, mirroring the
existing `evidenceRequirementsByClaimId` sibling-map pattern. This also
round-trips through the `surface report` CLI's JSON output:

```bash
surface report --input examples/surface-example-bundle.json
```

```ts
interface TrustReport {
  // ...
  waiverValidityByClaimId: Record<string, WaiverValidity>;
  waiverValidityFunctionVersion: string;
}
```

See [Schemas](schemas.md#trust-report) for the note on why
`waiverValidityByClaimId` is not yet declared in the vendored
`trust-report.schema.json`.

## Non-goals

- **Does not widen Builder gates.** Landing `WaiverValidity` in Surface does
  not by itself change Builder gate behavior. Per the issue this projection
  responds to, "Builder may widen beyond verified-only only after this
  contract and Flow matching land" — that is a hard non-goal boundary for
  this projection.
- **Flow-side matching lands separately.** Wiring `deriveWaiverValidity` into
  `trust-reconcile.js` (flow-agents) is explicitly out of scope here and is a
  follow-up change in the `kontourai/flow-agents` repo, not this one.
- **Does not authenticate approvers.** See
  [Residual](#residual-approverauthenticated-is-always-false) above —
  `approved_by` stays free-text and unauthenticated by design.
