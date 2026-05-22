# Walkthrough

This is a real session against the shipped fixtures. Every command and every output below is paste from `node bin/surface.mjs`.

## 1. Install and report against the default fixture

```bash
npm install -D @kontourai/surface
npx surface report --format summary
```

The default fixture is a small set of mixed-quality claims. Running the command emits a one-screen summary derived from `claims`, `evidence`, `policies`, and `events`:

```text
Kontour Surface report surface-1778389263721
Source: surface-fixtures
Claims: ... (proposed: ..., verified: ..., stale: ...)
Surfaces: ...
High-impact unsupported: ...
Stale: ...
Disputed: ...
Transparency gaps: ...
```

Each line answers a different question:

- **Claims** — total count and the derived status breakdown.
- **Surfaces** — where claims live (e.g. `field-attested-records.public-data`). Useful when you have many claim types and want to see the spread.
- **High-impact unsupported** — claims where impact is high but evidence is missing or weak. The first thing to look at.
- **Stale** — claims whose verification has expired against their policy. Need re-verification before acting on them.
- **Disputed** — claims contradicted by an event or another claim.
- **Transparency gaps** — discoverable conflicts, missing support, and supersede chains across the input. The current API field is `transparencyGaps`.

## 2. Run against native Surface input

Surface ships the `surface` passthrough adapter for already formatted `TrustInput` JSON. It is the default for `surface report`.

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

The `--input` flag accepts any file matching the `TrustInput` schema:

```bash
npx surface report --input my-claims.json --format summary
```

For the schema, see [Schemas](../schemas.md). For the minimal adapter shape, see the [external adapter example](../../examples/external-adapter/README.md).

## What you do not get from Surface

- Surface does not gather evidence. You bring the input.
- Surface does not run policies against external systems. Policies declare what makes a claim valid; events record what was observed.
- Surface does not write back. Reports are the output; producers, products, and downstream systems decide what to do with them.

If you want to *produce* `surface.input` from AI-assisted code-change runs, see [Veritas](https://github.com/kontourai/veritas).
