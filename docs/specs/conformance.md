# Surface Compatibility and Conformance

The [Hachure specification](https://github.com/hachure-org/spec) owns normative
format conformance and publishes the canonical schemas and vectors. Surface runs
those contracts through its integration layer and adds product-facing projection
checks for Surface reports and transparency gaps. The local suite therefore
proves **Surface compatibility**, not a competing definition of Hachure.

## What Surface compatibility means

Surface is compatible when, for every applicable Hachure vector and every local
integration case, it:

1. **Accepts** the valid inputs and **rejects** the invalid ones, with an error that identifies the violated constraint.
2. **Derives the same claim status** (`unknown`, `proposed`, `assumed`, `verified`, `stale`, `disputed`, `superseded`, `rejected`, `revoked`) for every claim.
3. **Surfaces the same transparency gap types** (`provenance_gap`, `policy_violation`, `freshness_breach`, …) for every claim.

The Hachure vectors cover normative validation, derivation, and merge semantics.
Surface's local cases cover the adapter, report, and transparency-gap behavior
that sits above that core. Presentation may vary, but Surface must not disagree
with Hachure about the underlying portable status.

`revoked` is the ninth status and the narrowest: a claim **derives** to `revoked` only through an authority-gated dispute resolution — an event with `resolvesDispute: true` and `status: "revoked"` whose actor holds an `AuthorityTrace` active at the decision time, with no newer blocking evidence re-opening the dispute (ADR 0003 §8). A bare `revoked` event, or an `invalidation`-type `revoked` event, folds to `stale` instead (matching the Hachure single-claim status function); `revoked` as a derived claim status is reachable only via that authorized path. The `revoked-authority-resolution` case below observes it.

## The suite

Surface-specific compatibility cases live in
[`conformance/`](https://github.com/kontourai/surface/tree/main/conformance):

- `manifest.json` — the case list with expected outcomes.
- `cases/*.json` — one `TrustBundle` per case.

Current cases cover the core derivation contract:

| Case | Exercises | Expected |
|---|---|---|
| `verified-commit-evidence` | Policy-required evidence plus a verification event at the current integrity ref | `verified`, no gaps |
| `unknown-no-evidence` | A claim with a policy but no evidence or events | `unknown`, with `provenance_gap` and `policy_violation` |
| `stale-expired-window` | A duration validity rule whose verification aged out | `stale`, with `freshness_breach` |
| `revoked-authority-resolution` | An authorized reviewer's dispute-resolution event revokes a prior verification | `revoked`, with `provenance_gap` |
| `invalid-missing-subject` | A claim missing `subjectId` | Validation rejection naming the missing field |

## Running the suite

The reference implementation runs the suite as part of its own test gate:

```bash
npm test   # includes tests/conformance.test.ts
```

An alternate Hachure implementation should use the canonical
[`hachure-org/spec` vectors](https://github.com/hachure-org/spec/tree/main/conformance)
to claim format conformance. An alternate Surface-compatible integration may
also load this repository's `manifest.json`, run each case through its own
adapter and report projection, and compare the Surface-specific expectations.

## Learning consumption

The suite above governs **derivation** conformance: what an implementation must derive from a bundle. One **consumer** expectation sits alongside it, because it protects the contract rather than the presentation.

A conforming **learning consumer** — anything that turns claims into durable signal that shapes future behavior (confidence calibration, a correction-to-rule flywheel, a model or ruleset trained on outcomes) — **MUST** filter the claims it learns from to `status = verified`. Treating a `proposed`, `assumed`, `stale`, `disputed`, `unknown`, or otherwise non-`verified` claim as learning signal is **non-conforming**.

This expectation is judged at the consumer, not in the derivation suite: a learner conforms when it can show that only `verified`-status claims entered its training or calibration path. It exists so that `verified` — the one status the kernel stands behind — is the only status a learner stands on, and unreviewed output cannot compound into a learner's ground truth. It does not constrain in-the-moment consumers (a Viewer or agent may read any status with its gaps), the claim-status vocabulary, or how a learner is built. See the [Learn only from verified claims](../product/principles.md#learn-only-from-verified-claims) principle.

## Versioning

The Surface suite carries a `version` and grows additively. Normative format
changes originate in Hachure and arrive here through an explicit compatibility
update. Surface-only integration or projection changes land with local cases and
a note in [Schema Versioning](../reference/schema-versioning.md). A local test
must not be presented as changing the upstream portable contract.
