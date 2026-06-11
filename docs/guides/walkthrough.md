# Walkthrough

This is a real session against the shipped fixtures. Every command below runs against the repo fixtures. The output matches what `node bin/surface.mjs` produces (timestamps vary between runs).

## 1. Install and report against the default fixture

```bash
npm install -D @kontourai/surface
npx surface report --format summary
```

The default fixture is a small set of mixed-quality claims. Running the command emits a one-screen summary derived from `claims`, `evidence`, `policies`, and `events`:

```text
Kontour Surface report surface-1778389263721
Source: kontour-surface-validation-fixtures
Claims: 4 (unknown: 1, verified: 2, stale: 1)
Surfaces: repo-governance.developer-evidence: 1, field-attested-records.public-data: 1, fact-resolution.financial-facts: 1, surface.roadmap: 1
High-impact unsupported: none
Stale: claim.field-attested-records.registration-status
Recompute needed: none
Disputed: none
Claim groups: 0
Transparency gaps: 3
```

Each line answers a different question:

- **Claims** — total count and the derived status breakdown.
- **Surfaces** — where claims live (e.g. `field-attested-records.public-data`). This is a producer-defined namespace for grouping related claims — not the Surface product name. Useful when you have many claim types and want to see the spread.
- **High-impact unsupported** — claims where impact is high but evidence is missing or weak. The first thing to look at.
- **Stale** — claims whose verification has expired against their policy. Need re-verification before acting on them.
- **Disputed** — claims contradicted by an event or another claim.
- **Transparency gaps** — discoverable conflicts, missing support, and supersede chains across the input. The current API field is `transparencyGaps`.

## 2. Run against native Surface input

Surface ships the `surface` passthrough adapter for already formatted `TrustBundle` JSON. It is the default for `surface report`.

```bash
npx surface report --adapter surface --input examples/surface-fixtures.json --format summary
```

Custom producers can register their own adapters, but Surface no longer ships domain adapters for npm audit, field-attested records, or fact resolution. Producers that use authored claim stores should emit evidence per run or use a Veritas plugin.

## 3. Switch to JSON when piping to another system

```bash
npx surface report --input examples/surface-fixtures.json --format json
```

The JSON output is the full `TrustReport`: per-claim derived status, per-claim `confidenceBasis`, current `transparencyGaps` annotations, summary, and `evidenceRequirementsByClaimId`. Consume this when you need the structured shape; consume `summary` when a human is reading.

## 4. Build your own input

The `--input` flag accepts any file matching the `TrustBundle` schema:

```bash
npx surface report --input my-claims.json --format summary
```

For the schema, see [Schemas](../reference/schemas.md). For the minimal adapter shape, see the [external adapter example](../../examples/external-adapter/README.md).

## What you do not get from Surface

Surface does not gather evidence, run policies against external systems, or write back into product systems. For the full list, see [What Surface is not](../../README.md#what-surface-is-not) in the README.

If you want to *produce* `surface.input` from AI-assisted code-change runs, see [Veritas](https://github.com/kontourai/veritas).
