# Producers and the Surface Boundary

Surface owns portable trust primitives and report generation. Producers own the domain knowledge, extraction logic, and adapter code for their own systems.

## Boundary

Surface owns:

- `TrustInput` and report schemas.
- Claims, evidence, policies, events, freshness, status, identity links, and fault lines.
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

Claims are stable across runs. A claim with no evidence collected in the current run retains its previous status through the existing staleness model rather than disappearing.

### Adapter

The appropriate pattern for one-shot analysis or for producers that own their own claim generation. The adapter receives raw product output and returns a complete `TrustInput` — claims, evidence, policies, and events — in one pass.

Adapters are registered explicitly:

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

See the [external adapter example](../examples/external-adapter/README.md) for a package-shaped reference implementation.

## Patterns by domain

### Field-attested records

Use when a product tracks records whose individual fields are sourced, attested, refreshed, disputed, or proposed. Key primitives: field-level claim identity, evidence batch references, time-based staleness, proposed values, review flags.

### Fact resolution

Use when a product extracts facts, chooses among candidates, verifies selected values, and emits a package with citations and review signals. Key primitives: candidate values, selected and verified fact state, assumption claims, comparison claims, review signals.

### Dependency audit

Use when tool output (npm audit, Snyk, etc.) should evidence security claims. Recommended via the Veritas plugin API rather than a Surface adapter — the tool vendor can ship the evidence importer and the application team authors the claims.
