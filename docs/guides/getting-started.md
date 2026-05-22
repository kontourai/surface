# Getting Started

Surface is a product transparency standard and foundation product. Use it when a product needs to show:

- what is being claimed
- what evidence supports the claim
- what policy decides whether the claim is verified
- whether the claim is current, stale, disputed, or unsupported

Surface does not collect domain evidence by itself. Your producer, such as Veritas or a custom adapter, emits a `TrustInput`. Surface validates that input and derives a portable `TrustReport`, which product docs may describe as a Trust Snapshot.

## 1. Install

```bash
npm install -D @kontourai/surface
```

For local development in this repo:

```bash
npm install
npm test
```

## 2. Run The Fixture Report

```bash
npx surface report --input examples/surface-fixtures.json --format summary
```

That command validates the fixture input, derives trust status for each claim, and prints a human-readable summary.

## 3. Build Your First Producer

A producer is any system that can emit a `TrustInput`.

Start with the fluent SDK when writing TypeScript:

```ts
import { TrustInputBuilder } from "@kontourai/surface";

const input = new TrustInputBuilder({ source: "my-producer:local" })
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

The important part is the shape, not this exact domain. Claims, evidence, policies, and events should be concrete enough that a reviewer can see why a status was derived.

## 4. Open The Surface Console

If a producer writes a Console read model under `.surface/runs/latest.json`, run the current CLI command:

```bash
npx surface console
```

Use the detail panel to inspect evidence, policy gaps, files in scope, and integrity scope. The integrity scope shows what a verified claim is anchored to, such as a source ref, file hash, or configuration hash.

## 5. Read Next

- [Concepts](../concepts.md) for the vocabulary.
- [Consumer SDK](consumer-sdk.md) for builder APIs.
- [Surface Console](../consoles.md) for local review.
- [External Adapter Example](../../examples/external-adapter/README.md) for a minimal producer.
