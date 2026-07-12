# Adapters and the Producer Boundary

Surface owns portable trust primitives and report generation. Producers own the domain knowledge, extraction logic, and adapter code for their own systems.

## Boundary

Surface owns:

- `TrustBundle` and report schemas.
- Claims, evidence, policies, events, freshness, status, identity links, and transparency gaps through the current `transparencyGaps` field.
- The adapter registry for producers that emit `TrustBundle`.
- Claim store read/write for producers that use authored claim definitions.
- Extension registration for producer branding and vocabulary.

Producers own:

- Domain-specific extraction from their databases, services, or tool output.
- Adapter or evidence collection code that emits `TrustBundle`.
- Product UI and runtime query wiring.
- Documentation explaining how their users should interpret trust state.

The dependency direction is one-way. Producers may depend on Surface; Surface must not import producer runtime code.

## Trust input patterns

### Authored claim store

The recommended pattern for ongoing trust tracking. The producer authors claim definitions in a committed file (`veritas.claims.json` or equivalent). Evidence is collected per run against those stable claim IDs.

Claims are stable across runs. A claim with no evidence collected in the current run retains its previous status through the existing staleness model rather than disappearing. See [Claim Authoring](claim-authoring.md).

### Adapter

The appropriate pattern for one-shot analysis or for producers that own their own claim generation. The adapter receives raw product output and returns a complete `TrustBundle` — claims, evidence, policies, and events — in one pass.

Two adapters are built in. `surface` is a passthrough for already formatted Surface input; `veritas` unwraps a Veritas evidence-record envelope, extracting the Trust Bundle it carries at `trust.bundle` (so a consumer no longer has to hand-extract it):

```bash
surface report --input examples/surface-example-bundle.json
surface report --adapter surface --input path/to/trust-bundle.json
surface report --adapter veritas --input path/to/veritas-evidence-record.json
```

`veritas` is a thin preset of a neutral envelope-unwrap primitive — Surface owns the generic unwrap (`createEnvelopeAdapter({ name, unwrapPath })`), not producer-specific parsing — so the "producers own their adapters" boundary holds. It also tolerates an already-unwrapped bundle, so either the wrapped or bare shape can be fed.

Custom adapters are registered explicitly through the public registry:

```ts
import { registerAdapter, type Adapter, type TrustBundle } from "@kontourai/surface";

const adapter: Adapter<MyExport> = {
  name: "my-product",
  adapt(record): TrustBundle {
    return {
      schemaVersion: 2,
      source: "my-product:demo",
      claims: [],
      evidence: [],
      policies: [],
      events: [],
    };
  },
};

registerAdapter(adapter);
```

Surface does not discover adapters from `node_modules` or config. Registration is always explicit.

Surface no longer ships `npm-audit`, `field-attested-records`, or `fact-resolution` as built-in adapters. For npm audit-style evidence collection, use a Veritas plugin so the tool owner can own the evidence mapping.

See the [external adapter example](../../examples/external-adapter/README.md) for a package-shaped reference implementation, and [Use Cases](../product/use-cases.md) for the domain scenarios these patterns serve.

### Storage adapters

A different concern from the ingestion adapter above: a storage adapter persists an authored claim store (the `ClaimStore` shape behind `veritas.claims.json` and the authored-claim-store pattern), not raw product output. Surface's built-in claim store is file-based (`loadClaimStore`/`saveClaimStore`), but a producer with a larger claim catalog may want a database-backed store instead — the `ClaimStoreAdapter` seam generalizes that without changing the file-based CLI path.

Status: new, minimal interface — the shape may evolve based on real consumer feedback.

```ts
export interface ClaimStoreAdapter {
  /** Adapter implementation name (e.g. "file", "postgres") — diagnostic only. */
  readonly name: string;
  load(): Promise<ClaimStore>;
  save(store: ClaimStore): Promise<void>;
}
```

`createFileClaimStoreAdapter(path)` wraps the existing synchronous `loadClaimStore`/`saveClaimStore` functions behind this async interface — same empty-store-on-missing-file behavior, same validation, same JSON formatting on write:

```ts
import { createFileClaimStoreAdapter } from "@kontourai/surface";

const adapter = createFileClaimStoreAdapter("veritas.claims.json");
const store = await adapter.load();
await adapter.save(store);
```

The interface is deliberately minimal — exactly `load()`/`save()`, nothing scoped. A backend that needs to scope queries to a subject (so it never loads or saves an entire claim catalog on every operation) does that through its own constructor parameters instead of a wider interface: for example, a Postgres-backed adapter can be built as `createPostgresClaimStoreAdapter({ pool, subjectType, subjectId })`, and from the caller's point of view `load()` still returns "the whole store" — for that adapter instance, that means the claims/policies in scope for the subject it was constructed for.

See [`examples/postgres-claim-store/`](../../examples/postgres-claim-store/README.md) for a runnable reference implementation against a real Postgres connection, following the same "copy and adapt, not import" shape as the external adapter example above. It is not compiled into `dist/` and does not add `pg` as a dependency of `@kontourai/surface` itself, which ships zero runtime dependencies.
