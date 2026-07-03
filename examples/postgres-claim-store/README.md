# Postgres Claim Store Example

This package-shaped example implements `@kontourai/surface`'s `ClaimStoreAdapter` seam (see [`docs/reference/adapters.md`](../../docs/reference/adapters.md)) against a real Postgres connection. It is a reference to copy and adapt into your own product's schema, not an importable subpackage of `@kontourai/surface` — Surface ships zero runtime dependencies and does not bundle `pg`.

## What it demonstrates

- `createPostgresClaimStoreAdapter({ pool, subjectType, subjectId })` — the **subject-scoped construction** pattern: every adapter instance is built for exactly one subject, so `load()`/`save()` only ever touch that subject's rows, not the whole claim catalog.
- A normalized table shape (`schema.sql`): claims live in `claim_store_claims`, indexed on `(subject_type, subject_id)`; policies live in a separate, non-subject-scoped `claim_store_policies` table because a policy can be referenced by claims across many subjects.
- Whole-store `save()` semantics implemented as row-level upserts: the port-level contract is still "save the whole store," but the adapter translates that into a cheap, idempotent `INSERT ... ON CONFLICT (id) DO UPDATE` per claim/policy plus a scoped delete for rows no longer present, rather than deleting and reinserting everything.
- `load()`/`save()` both run the store through `validateClaimStore` before returning/persisting, proving the adapter does not bypass validation — the same guarantee the built-in file adapter (`createFileClaimStoreAdapter`) gives you.

A product consuming this pattern (for example, a product directory application's own claim-store module) implements `ClaimStoreAdapter` against its **own** schema by following this reference — the interface and the row-shape approach are what is reused; the SQL itself is necessarily product-specific.

## Files

- `schema.sql` — the reference table shape.
- `src/postgres-claim-store-adapter.ts` — the adapter implementation. This is the file to copy into your own product and adapt to your own table names/columns.
- `src/index.ts` — a runnable demo that applies the schema, saves a small scoped store, and loads it back.

## Running the demo

Requires a local (or reachable) Postgres instance.

```bash
createdb surface_demo
cd examples/postgres-claim-store
npm install
DATABASE_URL=postgres://localhost:5432/surface_demo npm run demo
```

Expected output is a single JSON line summarizing the round-tripped store, e.g.:

```json
{"producer":"postgres-claim-store-demo","claims":1,"policies":1,"firstClaimId":"repo.proof.npm-test"}
```

## Why this isn't part of Surface's own test suite

Surface's CI has no Postgres service, and this package is intentionally a reference example, not a first-class covered subpackage — the same positioning as [`examples/external-adapter/`](../external-adapter/README.md) for ingestion adapters. Its correctness is proven by real Postgres-backed consumers, one step removed from Surface's own `npm run verify`. If `ClaimStoreAdapter`'s interface changes in a way that breaks this reference, that regression surfaces in a consuming product's build, not here — a known, accepted limitation of "reference example, not first-class package."
