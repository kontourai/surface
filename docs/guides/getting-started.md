# Getting Started

This guide takes you from install to your first derived trust report: what is claimed, what evidence supports it, what policy decides verification, and whether the claim is current, stale, disputed, or unsupported.

Surface does not collect domain evidence by itself. Your producer, such as Veritas or a custom adapter, emits a `TrustBundle`. Surface validates that input and derives a portable `TrustReport`, which product docs may describe as a Trust Snapshot.

## 1. Install

```bash
npm install -D @kontourai/surface
```

For local development in this repo:

```bash
npm install
npm test
```

## 2. Run The Example Report

```bash
npx surface report --input examples/surface-example-bundle.json --format summary
```

That command validates the example input, derives trust status for each claim, and prints a human-readable summary:

```text
Kontour Surface report surface-1779196544815
Source: kontour-surface-validation-examples
Claims: 4 (unknown: 1, verified: 2, stale: 1)
Surfaces: repo-governance.developer-evidence: 1, field-attested-records.public-data: 1, fact-resolution.financial-facts: 1, surface.roadmap: 1
High-impact unsupported: none
Stale: claim.field-attested-records.registration-status
Recompute needed: none
Disputed: none
Claim groups: 0
Transparency gaps: 3
```

The example bundle includes four claims with mixed evidence quality. Two are verified (supported by evidence and a verification event), one is stale (its 14-day freshness window expired), and one is unknown (no evidence supplied). The three transparency gaps show missing attestations, a freshness breach, and missing evidence for an unverified claim.

## 3. Build Your First Producer

A producer is any system that can emit a `TrustBundle`.

Start with the fluent SDK when writing TypeScript:

```ts
import { TrustBundleBuilder } from "@kontourai/surface";

const input = new TrustBundleBuilder({ source: "my-producer:local" })
  .addClaim({
    id: "claim.api.rate-limit",
    subjectType: "api",
    subjectId: "public-api",
    claimType: "software-evidence",
    surface: "api",
    fieldOrBehavior: "rate limit is enforced",
    value: "100 requests/minute",
    currentIntegrityRef: "commit:abc123",
  })
  .addEvidence({
    id: "evidence.api.rate-limit.test",
    claimId: "claim.api.rate-limit",
    evidenceType: "test_output",
    method: "validation",
    sourceRef: "ci:1847",
    excerptOrSummary: "Rate-limit tests passed.",
    integrityRef: "commit:abc123",
  })
  .addEvent({
    id: "event.api.rate-limit.verified",
    claimId: "claim.api.rate-limit",
    status: "verified",
    actor: "ci",
    method: "npm test",
    evidenceIds: ["evidence.api.rate-limit.test"],
  })
  .build();
```

The important part is the shape, not this exact domain. Claims, evidence, policies, and events should be concrete enough that a reviewer can see why a status was derived. Note: the `surface` field on each claim (e.g. `"api"`) is a producer-defined namespace for grouping related claims — it is not the same as the Surface product name.

## 4. Open The Surface Console

If a producer writes a Console read model under `.surface/runs/latest.json`, run the current CLI command:

```bash
npx surface console
```

Use the detail panel to inspect evidence, policy gaps, files in scope, and integrity scope. The integrity scope shows what a verified claim is anchored to, such as a source ref, file hash, or configuration hash.

## 5. Read Next

- [Concepts](../product/concepts.md) for the vocabulary.
- [Consumer SDK](consumer-sdk.md) for builder APIs.
- [Surface Console](../reference/console.md) for local review.
- [External Adapter Example](../../examples/external-adapter/README.md) for a minimal producer.
