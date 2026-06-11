# Migrating to Trust Bundle (Surface 0.6.0)

Surface 0.6.0 hard-renames `TrustInput` to `TrustBundle` per
[ADR 0002](../adr/0002-trust-bundle.md). There is no compatibility alias:
0.5.x consumers must rename when they upgrade. This guide is the complete
checklist.

## Why

One concept had three names: `TrustInput` (code, named from the perspective of
`buildTrustReport`), "Claim Package" (ADR 0001 product vocabulary), and
`surface.input` (Veritas artifact block). A Trust Bundle is the single name for
all of them: a portable, point-in-time package of trust state from a single
producer. See the [Trust Bundle concept](../product/concepts.md#trust-bundle).

## Rename map

| 0.5.x | 0.6.0 |
| --- | --- |
| `TrustInput` | `TrustBundle` |
| `validateTrustInput(...)` | `validateTrustBundle(...)` |
| `TrustInputBuilder` | `TrustBundleBuilder` |
| `TrustInputBuilderArgs` | `TrustBundleBuilderArgs` |
| `Adapter.adapt(record): TrustInput` | `Adapter.adapt(record): TrustBundle` |
| `schemas/trust-input.schema.json` | `schemas/trust-bundle.schema.json` |
| "Claim Package" (product term) | Trust Bundle |

Downstream renames shipped alongside this release:

| Product | 0.5.x-era name | New name |
| --- | --- | --- |
| Survey | `buildSurveyTrustInput` | `buildSurveyTrustBundle` |
| Survey | `BuildSurveyTrustInputOptions` | `BuildSurveyTrustBundleOptions` |
| Veritas | `surface.input` artifact block | `trust.bundle` |
| Veritas | query `surface.input.claims[]` | query `trust.bundle.claims[]` |

## Upgrade steps

1. Bump `@kontourai/surface` to `^0.6.0`.
2. Mechanical rename: any identifier containing `TrustInput`/`trustInput`
   becomes `TrustBundle`/`trustBundle`. `TrustReport` is unchanged (it now
   extends `TrustBundle`).
3. If you persist or parse Veritas evidence artifacts, read the Surface
   projection from `trust.bundle` instead of `surface.input`. Stored
   artifacts written before this release keep the old key; re-generate them or
   handle the old key in your own migration — Surface and Veritas do not dual-emit.
4. If you validated payloads against `trust-input.schema.json`, point at
   `trust-bundle.schema.json`.
5. Behavior is unchanged. This release is rename-only; no field semantics,
   statuses, or report outputs changed.

## Also removed in this migration

Veritas no longer dual-emits portable actor/system authority under claim and
evidence `metadata.authorityTrace` for pre-0.5 Surface runtimes. First-class
top-level `authorityTrace` on the Trust Bundle is the only emission path.
`Evidence.metadata.sourceAuthority` (producer-declared source authority) is a
different field and is unaffected.
