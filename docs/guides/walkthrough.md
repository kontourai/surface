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
Fault lines: ...
```

Each line answers a different question:

- **Claims** — total count and the derived status breakdown.
- **Surfaces** — where claims live (e.g. `field-attested-records.public-data`). Useful when you have many claim types and want to see the spread.
- **High-impact unsupported** — claims where impact is high but evidence is missing or weak. The first thing to look at.
- **Stale** — claims whose verification has expired against their policy. Need re-verification before acting on them.
- **Disputed** — claims contradicted by an event or another claim.
- **Fault lines** — discoverable conflicts and supersede chains across the input.

## 2. Run against a built-in adapter

Surface ships three reference adapters: `field-attested-records`, `fact-resolution`, and `npm-audit`. Each shows a different shape of input.

```bash
npx surface report --adapter field-attested-records --format summary
```

```text
Kontour Surface report surface-1778389304425
Source: field-attested-records:demo
Claims: 9 (proposed: 1, verified: 3, stale: 2, disputed: 1, rejected: 2)
Surfaces: field-attested-records.public-data: 2, field-attested-records.attestations: 2, field-attestation.review-flags: 1, field-attested-records.crawls: 2, field-attested-records.proposals: 2
High-impact unsupported: none
Stale: field-attested-records.attestation.record-denver-art-1.pricing.attest-stale-1, field-attested-records.crawl.crawl-good-1
Disputed: field-attested-records.flag.record-denver-art-1.flag-open-1
Fault lines: 4
```

Read the lines: of 9 claims, 3 are verified, 2 went stale, 1 is disputed, 2 are rejected. Two specific verifications need refresh, one specific claim is contested. That is the level of detail downstream consumers should be reading from a Surface report.

```bash
npx surface report --adapter npm-audit --format summary
```

```text
Source: npm-audit
Claims: 1 (rejected: 1)
Surfaces: npm-audit.dependencies: 1
Fault lines: 0
```

A clean audit run reports its single dependency-set claim as `rejected` (the policy treats any vulnerability as a rejection of the "all dependencies safe" claim). Different fixtures will show different statuses.

## 3. Switch to JSON when piping to another system

```bash
npx surface report --adapter field-attested-records --format json
```

The JSON output is the full `TrustReport`: per-claim derived status, per-claim `confidenceBasis`, fault lines, summary, and `proofRequirementsByClaimId`. Consume this when you need the structured shape; consume `summary` when a human is reading.

## 4. Build your own input

The `--input` flag accepts any file matching the `TrustInput` schema:

```bash
npx surface report --input my-claims.json --format summary
```

For the schema, see [Schemas](../schemas.md). For the minimal adapter shape, see the [external adapter example](../../examples/external-adapter/README.md).

## What you do not get from Surface

- Surface does not gather evidence. You bring the input.
- Surface does not run policies against external systems. Policies declare what makes a claim valid; events record what was observed.
- Surface does not write back. Reports are the output; consumers decide what to do with them.

If you want to *produce* `surface.input` from AI-assisted code-change runs, see [Veritas](https://github.com/kontourai/veritas).
