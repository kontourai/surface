# Integration Plan: Surface + Veritas in Real Applications

This plan defines the generic integration path. Surface should stay product-neutral: it owns portable trust primitives and report generation, while downstream product repos own real adapters and product-specific docs.

## Boundary

Surface owns:

- `TrustInput` and report schemas.
- Claims, evidence, policies, events, freshness, status, identity links, and fault lines.
- The Veritas evidence adapter.
- Generic examples that are grounded in real planned usage but named by pattern.

Downstream repos own:

- Product-specific extraction from their database or services.
- Product adapters that emit Surface input.
- Product UI and runtime query wiring.
- Product docs explaining how their users should interpret trust state.

Veritas owns:

- Repo/code trust.
- Proof lanes, policy packs, proof-family inventories, and evidence artifacts.
- Projection into `surface.input` when a repo wants Surface reports.

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

### Repo Governance Evidence

Use this pattern when a repo verifies code or workflow integrity through Veritas.

Surface adapter: `src/adapters/veritas.ts`

Required primitives:

- Affected surface claims.
- Proof-lane claims.
- Policy-result claims.
- Verification events grounded in artifact timestamps and source references.

## Phased Delivery

### Phase 1: Keep Surface Generic

**Status:** Shipped. Surface is generic; Veritas adapter is stable; generic examples are grounded in patterns.

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

### Phase 3: Downstream Product Adapters

**Status:** Planned. Veritas adapter is shipped; other product adapters are in progress.

Each downstream product repo can add its own adapter package or module that emits Surface input from real storage. Those adapters should not move back into Surface.

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
4. Veritas remains the only real repo-specific adapter in Surface.
5. Tests prove field attestation, fact resolution, and Veritas evidence all map into the same trust report contract.
