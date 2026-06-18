# ADR 0002: Trust Bundle

Status: accepted

Date: 2026-06-10

## Context

`TrustInput` (`src/types.ts`) is a self-contained package of trust state: `schemaVersion`, `source`, `claims[]`, `evidence[]`, `policies[]`, `events[]`, plus optional `identityLinks`, `claimGroups`, and `authorityTrace`. One type currently plays three roles:

1. **Function parameter.** It is the input to `buildTrustReport()` and `deriveTrustSnapshot()` — the origin of the name.
2. **Producer projection.** Survey's `buildSurveyTrustInput()` walks the source → extraction → candidate → review chain and packs it into one. From Survey's perspective the same type is an output.
3. **Cross-product interchange.** Veritas embeds a `surface.input` block inside its evidence artifacts, and Flow integrates by querying `surface.input.claims[]` rather than parsing Veritas internals.

The name describes only the first role, from the callee's perspective. A concept named by its position in someone else's function call cannot be first-class: the name stops making sense the moment you step outside that function. Veritas's product-language rule already forbids leading with `TrustInput` in first-contact docs for this reason.

ADR 0001 separately introduced the product term "Claim Package" for "portable package of claims, evidence, policies, traces, and related context" — the same concept under a second name, with the code name as a third. The contents are also broader than claims: a package carries evidence, policies, and verification events.

Finally, nothing specifies what happens when packages from multiple producers describe the same subject. One package is a wire format; a primitive needs merge semantics.

The product line is pre-stability. Hard renames with migration documentation are preferred over compatibility aliases.

## Decision

### One name: Trust Bundle

Adopt **Trust Bundle** as both the product term and the code name (`TrustBundle`). This supersedes the "Claim Package" entry in ADR 0001's vocabulary. The name works from every perspective: Survey *emits* a bundle, Surface *evaluates* one, Veritas *embeds* one, Flow *queries* one. It also joins the established `Trust*` family (Trust Snapshot, Trust Report, Trust Panel).

Plain-language definition:

> A Trust Bundle is a portable, point-in-time package of trust state from a single producer — claims, the evidence and verification events behind them, and the policies the producer played by — packed so it can cross a product boundary without the receiver needing access to the producer's internals.

The `source` field identifies the producer. A bundle is the supply side of the ledger; an Inquiry (ADR 0003) is the demand side.

### Resource envelope

Trust Bundles adopt the Kontour Resource Shape (`apiVersion`, `kind`, `metadata`, `spec`, optional `proof`) with `kind: TrustBundle` and `apiVersion: hachure.org/v1`. The current interface contents become `spec`; integrity anchors belong in `proof`. This makes the bundle a peer of other trust-bearing Kontour records instead of a loose TypeScript interface.

### Merge semantics

Bundles from multiple producers fold into one ledger:

- `identityLinks` declare co-referent subjects across bundles (existing `buildIdentityIndex` machinery).
- When bundles assert conflicting **values** for the same subject and field (under a policy with `incompatibleValues`), the conflict is surfaced as a `contradiction` **transparency gap**; **both claims are retained** — merging is never last-write-wins and never silently smooths a disagreement. Conflicting **statuses** (policy `incompatibleStatuses`) or an authority-weighted resolution event derive a `disputed` **status**. (Implementation: value-conflicts emit the contradiction gap via `deriveIncompatibilityTransparencyGaps`; `disputed` is reserved for status/event conflicts in `status.ts`. The gap is the value-conflict signal — a stronger property than overwriting status.)
- Losing evidence is never deleted. Dispute resolution is an authority-weighted, append-only decision event, per ADR 0003.
- **API.** `mergeBundles(bundles: TrustBundle[]): TrustBundle` folds bundles into one ledger: union by `id` (first-wins; **throws** on a claim-id collision with differing content — never corrupts a claim), `source` becomes `merged:<a>+<b>`, identity union-find dedupes links. `mergeBundlesDetailed` returns the same plus a `collisions[]` report. The merged bundle is fed to `buildTrustReport`; `surface report --input` is repeatable and merges before reporting (single-input path is byte-identical).

### Hard migration

Rename `TrustInput` → `TrustBundle` everywhere, with no deprecated alias. Companion renames follow the same rule (for example `buildSurveyTrustInput` → `buildSurveyTrustBundle`, Veritas's `surface.input` block → `trust.bundle`). Ship a migration document instead of a compatibility shim.

## Migration Map

| Earlier name | New name | Note |
| --- | --- | --- |
| `TrustInput` | `TrustBundle` | Hard rename, no alias. |
| Claim Package (ADR 0001 vocabulary) | Trust Bundle | Superseded; "Claim Package" should not appear in new docs. |
| `buildSurveyTrustInput` | `buildSurveyTrustBundle` | Survey projection entry point. |
| `surface.input` (Veritas artifact block) | `trust.bundle` | Downstream consumers query `trust.bundle.claims[]`. |
| `validateTrustInput` | `validateTrustBundle` | Validation entry point. |
| `Adapter.adapt(record): TrustInput` | `Adapter.adapt(record): TrustBundle` | Adapter contract. |

## Consequences

- One concept, one name, in product language and code. ADR 0001's vocabulary table is amended by this ADR.
- Veritas may drop its dual-emission fallback (`metadata.authorityTrace` for older Surface runtimes) in the same migration; pre-stability, the fallback is maintenance without benefit.
- Bundles already carry `events[]`, so they are forward-compatible with the event-stream-plus-projection model (Console's contract and ADR 0003's status function): a bundle is exactly the input to the status fold, handed across a boundary when no shared stream exists.
- Cross-producer conflict handling now has a specified behavior — value-conflicts surface a `contradiction` gap (both claims retained), status/event conflicts derive `disputed`; never last-write-wins — that implementations and tests can be held to (see `src/merge.ts`, `tests/merge.test.ts`).
