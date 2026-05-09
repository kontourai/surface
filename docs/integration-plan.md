# Integration Plan: Surface Adapters in Real Applications

This plan defines the generic integration path. Surface should stay product-neutral: it owns portable trust primitives and report generation, while product repos own real adapters and product-specific docs. Products can build on Surface; Surface must not depend on product-layer runtimes.

## Boundary

Surface owns:

- `TrustInput` and report schemas.
- Claims, evidence, policies, events, freshness, status, identity links, and fault lines.
- Adapter registration boundaries for product outputs.
- Generic examples that are grounded in real planned usage but named by pattern.

Downstream repos own:

- Product-specific extraction from their database or services.
- Product adapters that emit Surface input.
- Product UI and runtime query wiring.
- Product docs explaining how their users should interpret trust state.

Product repos own their own adapter code and may either emit native `TrustInput` or register an adapter that maps product artifacts to `TrustInput`.

## Generic Patterns

### Field-Attested Records

Use this pattern when a product tracks records whose individual fields are sourced, attested, refreshed, disputed, or proposed.

Surface example: `examples/adapters/field-attested-records.ts`

Required primitives:

- Field-level claim identity.
- Evidence batch references for crawls or imports.
- Time-based staleness.
- Proposed values and review decisions.
- Review flags as explicit disputed signals.

### Fact Resolution

Use this pattern when a product extracts facts, chooses among candidates, verifies selected values, and emits a package with citations and review signals.

Surface example: `examples/adapters/fact-resolution.ts`

Required primitives:

- Candidate values.
- Selected and verified fact state.
- Assumption claims.
- Comparison claims.
- Review signals.
- Package-level policy context.

## Phased Delivery

### Phase 1: Keep Surface Generic

**Status:** Shipped. Surface is generic; built-in examples are grounded in reusable trust patterns.

- Remove product-named adapters from `src/`.
- Rename fixtures and CLI adapters by generic pattern.
- Keep downstream product names out of Surface-facing docs.
- Keep tests proving the same statuses and fault lines.

### Phase 2: Strengthen Primitives

**Status:** Partially shipped. Confidence basis and derivation ceilings are shipped. Candidate-value support, assumptions, comparisons, and review signals are planned.

- Add candidate-value support.
- Add assumption and comparison shapes.
- Add first-class review signals.
- Add evidence batch references.
- Add explicit freshness/recheck rules.
- Add confidence basis per claim and ceiling through derivedFrom chains.

### Phase 3: Building An Adapter

**Status:** Shipped.

Adapters are plain modules that call `registerAdapter(adapter)`.

```ts
import { registerAdapter, type Adapter, type TrustInput } from "@kontourai/surface";

const adapter: Adapter<MyExport> = {
  name: "my-product",
  defaultFixture: "examples/my-export.json",
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

Adapter rules:

- Keep product-native parsing in the product repo or package.
- Emit valid `TrustInput`; call `validateTrustInput` before reporting.
- Use stable claim ids and policy ids so reports can diff over time.
- Register explicitly; Surface does not discover adapters from `node_modules` or user config.
- Add adapter tests that build a report and assert status, fault-line, and proof-requirement behavior.

The worked examples are `examples/adapters/field-attested-records.ts`, `examples/adapters/fact-resolution.ts`, and the package-shaped example in `examples/external-adapter/`.

### Phase 4: Runtime Query API

**Status:** Planned.

Add a generic store/query boundary for:

- `getTrustReport(subject)`
- `getEvidenceTrail(claimId)`
- `getClaimsNeedingReview()`
- `getStaleClaims()`
- `getUnsupportedClaims()`

## Completion Criteria

Surface is correctly generic when:

1. No downstream product name appears in executable Surface adapters or fixtures.
2. Example names describe trust patterns, not products.
3. Real product repos can emit Surface input without Surface importing their types.
4. Tests prove field attestation, fact resolution, and an out-of-tree adapter all map into the same trust report contract.
