# System Card Demo — `examples/system-card`

The flagship demo for `@kontourai/surface`. A fictional model/system card
decomposed into evidenced claims with living statuses, designed to make all
three primitives visible in under 30 seconds.

---

## 30-second summary

| Step | Verb | What it shows |
|---|---|---|
| `buildTrustReport` | **Observe** | Per-claim statuses (verified / disputed / unknown) + transparency gaps |
| Advance `now` | **Observe** | Eval-score claim flips stale — no records changed, status is a pure function of time |
| `resolveInquiry` — exact | **Resolve** | Matched claim answers "what is the training-data cutoff?" with a receipt |
| `resolveInquiry` — derived | **Resolve** | Named rule "production-ready := evals-pass AND red-team AND pii-filtering" fails because pii is disputed |
| `resolveInquiry` — unsupported | **Resolve** | Honest "unsupported" gap for "bias audit completed?" — no claim, no rule |
| `buildDisputeResolutionEvent` | **Resolve** | Authority-gated decision flips pii-filtering to verified |
| New blocking evidence | **Observe** | Second incident re-disputes — ledger never deletes, status refolds |
| `toInTotoStatement` + `toDsseEnvelope` | **Assert** | Bundle wrapped as in-toto Statement v1 and DSSE-signed with an injected signer |

The three verbs from ADR 0003:

- **Assert** — `bundle.json` declares five claims about `acme-support-agent-v2`.
- **Observe** — evidence, verification events, and authority traces attach to them.
- **Resolve** — `buildTrustReport`, `resolveInquiry`, and `buildDisputeResolutionEvent` answer every question with a status and a receipt, or admit a gap.

---

## The model card

`acme-support-agent-v2` is a fictional customer-support LLM. The card asserts:

| Claim | Type | Intended status |
|---|---|---|
| `training-data-cutoff = 2024-09-30` | model-property | **verified** (doc + attestation) |
| `intent-classification-accuracy = 0.934` | eval-score | **verified** at T0, **stale** at T+35d |
| `red-team-review-completed = true` | review-completion | **verified** (corroborated) |
| `pii-filtering-enabled = true` | capability | **disputed** (incident evidence conflicts) |
| `human-oversight-policy = active` | policy-compliance | **unknown/proposed** (no evidence) |

---

## Files

| File | Purpose |
|---|---|
| `bundle.json` | TrustBundle — the wire record; all claims, evidence, policies, events, authority traces |
| `run-demo.ts` | Demo script — compiled and run via `node dist/examples/system-card/run-demo.js` |
| `README.md` | This file |

The test that guards these files:
`tests/example-system-card.test.ts`

---

## How to run

```sh
# From the repo root:
npm run build
node dist/examples/system-card/run-demo.js
```

The demo does not write any files. All output is to stdout. It is safe to
run repeatedly.

---

## What each section demonstrates

### Section 1 — `buildTrustReport` at T0

Reads the bundle as-is. Shows the five per-claim statuses and the
transparency gap list. The unsupported `human-oversight-policy` claim appears
in `transparencyGaps` with type `provenance_gap` or `policy_violation`.
`pii-filtering` appears with a `contradiction` gap.

### Section 2 — Staleness

Advances `now` to 35 days after the eval run. The eval-score policy has
`validityRule: { kind: "duration", durationDays: 30 }`. With no record
changes, the claim moves from `verified` → `stale`. This is status as a pure
function of `(claim, events, policy, now)`.

### Section 3 — `resolveInquiry`

Three outcomes:

1. **Exact match** — a canonical target hits an existing claim directly.
2. **Derived** — no single claim answers "production-ready?"; a named
   `DerivationRule` composes three input claims with `combinator: "all"`.
   Because `pii-filtering` is `disputed`, the rule fails.
3. **Unsupported** — "bias audit completed?" has no claim, no rule. The
   honest gap is the correct answer and a demand signal for new coverage.

### Section 4 — Dispute resolution

1. `buildDisputeResolutionEvent` constructs a `VerificationEvent` with
   `resolvesDispute: true`. The event's actor (`acme-ai/incident-review-board`)
   must have an active `AuthorityTrace` in the bundle (it does). Status flips
   to `verified`.
2. A second incident (blocking evidence) is added. No records are deleted.
   The status refolds to `disputed`. The resolution event remains in the
   ledger as a historical fact.

### Section 5 — in-toto / DSSE

The same bundle is wrapped as an in-toto Statement v1 (`toInTotoStatement`)
and signed into a DSSE envelope (`toDsseEnvelope`). The signer is a simple
injected interface — Surface never holds key material. The envelope prints
its head (payload type, truncated payload, key ID, and signature).

---

## Design notes

- `bundle.json` is a plain `TrustBundle` (schema version 3). It passes
  `validateTrustBundle` and can be consumed by any Surface-conformant tool.
- The disputed `pii-filtering` claim is intentional: real model cards carry
  conflicts, and hiding them would defeat the purpose.
- The `human-oversight-policy` claim has no evidence. Gaps are first-class
  outputs, not errors.
- The demo never mutates `rawBundle`; it composes new bundle objects by
  spreading and extending the `events` / `evidence` arrays.
