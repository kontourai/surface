# Adapters and the Producer Boundary

Surface owns portable trust primitives and report generation. Producers own the domain knowledge, extraction logic, and adapter code for their own systems.

## Boundary

Surface owns:

- `TrustInput` and report schemas.
- Claims, evidence, policies, events, freshness, status, identity links, and transparency gaps through the current `transparencyGaps` field.
- The adapter registry for producers that emit `TrustInput`.
- Claim store read/write for producers that use authored claim definitions.
- Extension registration for producer branding and vocabulary.

Producers own:

- Domain-specific extraction from their databases, services, or tool output.
- Adapter or evidence collection code that emits `TrustInput`.
- Product UI and runtime query wiring.
- Documentation explaining how their users should interpret trust state.

The dependency direction is one-way. Producers may depend on Surface; Surface must not import producer runtime code.

## Trust input patterns

### Authored claim store

The recommended pattern for ongoing trust tracking. The producer authors claim definitions in a committed file (`veritas.claims.json` or equivalent). Evidence is collected per run against those stable claim IDs.

Claims are stable across runs. A claim with no evidence collected in the current run retains its previous status through the existing staleness model rather than disappearing. See [Claim Authoring](claim-authoring.md).

### Adapter

The appropriate pattern for one-shot analysis or for producers that own their own claim generation. The adapter receives raw product output and returns a complete `TrustInput` — claims, evidence, policies, and events — in one pass.

The only built-in adapter is `surface`, a passthrough for already formatted Surface input:

```bash
surface report --input examples/surface-fixtures.json
surface report --adapter surface --input path/to/trust-input.json
```

Custom adapters are registered explicitly through the public registry:

```ts
import { registerAdapter, type Adapter, type TrustInput } from "@kontourai/surface";

const adapter: Adapter<MyExport> = {
  name: "my-product",
  adapt(record): TrustInput {
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
