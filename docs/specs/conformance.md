# Conformance

The [Open Trust Format](open-trust-format.md) is only portable if two implementations derive the same trust state from the same input. The conformance suite makes that testable: a set of fixed inputs with the statuses and transparency gaps a conforming implementation must produce.

## What conformance means

An implementation of the Open Trust Format conforms when, for every case in the suite, it:

1. **Accepts** the valid inputs and **rejects** the invalid ones, with an error that identifies the violated constraint.
2. **Derives the same claim status** (`unknown`, `proposed`, `assumed`, `verified`, `stale`, `disputed`, `superseded`, `rejected`) for every claim.
3. **Surfaces the same transparency gap types** (`provenance_gap`, `policy_violation`, `freshness_breach`, …) for every claim.

Conformance covers derivation semantics, not presentation. A conforming implementation may render, store, or transport reports differently; it must not disagree about what is verified, stale, or unsupported.

## The suite

The suite lives in [`conformance/`](https://github.com/kontourai/surface/tree/main/conformance) in the Surface repo:

- `manifest.json` — the case list with expected outcomes.
- `cases/*.json` — one `TrustBundle` per case.

Current cases cover the core derivation contract:

| Case | Exercises | Expected |
|---|---|---|
| `verified-commit-evidence` | Policy-required evidence plus a verification event at the current integrity ref | `verified`, no gaps |
| `unknown-no-evidence` | A claim with a policy but no evidence or events | `unknown`, with `provenance_gap` and `policy_violation` |
| `stale-expired-window` | A duration validity rule whose verification aged out | `stale`, with `freshness_breach` |
| `invalid-missing-subject` | A claim missing `subjectId` | Validation rejection naming the missing field |

## Running the suite

The reference implementation runs the suite as part of its own test gate:

```bash
npm test   # includes tests/conformance.test.ts
```

An external implementation conforms by loading `manifest.json`, running each case input through its own validation and derivation, and comparing against the expectations — the manifest is plain JSON precisely so this does not require Surface's TypeScript.

## Learning consumption

The suite above governs **derivation** conformance: what an implementation must derive from a bundle. One **consumer** expectation sits alongside it, because it protects the contract rather than the presentation.

A conforming **learning consumer** — anything that turns claims into durable signal that shapes future behavior (confidence calibration, a correction-to-rule flywheel, a model or ruleset trained on outcomes) — **MUST** filter the claims it learns from to `status = verified`. Treating a `proposed`, `assumed`, `stale`, `disputed`, `unknown`, or otherwise non-`verified` claim as learning signal is **non-conforming**.

This expectation is judged at the consumer, not in the derivation suite: a learner conforms when it can show that only `verified`-status claims entered its training or calibration path. It exists so that `verified` — the one status the kernel stands behind — is the only status a learner stands on, and unreviewed output cannot compound into a learner's ground truth. It does not constrain in-the-moment consumers (a Viewer or agent may read any status with its gaps), the claim-status vocabulary, or how a learner is built. See the [Learn only from verified claims](../product/principles.md#learn-only-from-verified-claims) principle.

## Versioning

The suite carries a `version` and grows additively. Cases change only when the spec changes, alongside a schema version bump and a note in [Schema Versioning](../reference/schema-versioning.md). New kernel semantics are expected to land with new conformance cases; a derivation behavior the suite cannot observe is not yet part of the portable contract.
