# Roadmap

## Phase 1: Narrative and static site

- README and docs narrative.
- GitHub Pages-capable static site.
- Light/dark styling.
- Use cases for `veritas`, `campfit`, and `taxes`.

## Phase 2: Schema-first kernel

- JSON schemas.
- TypeScript types.
- Status derivation helpers.
- Fixture tests.

## Phase 3: Read-only adapters

- Export trust reports from existing product data.
- Preserve domain evidence instead of flattening everything into generic pass/fail.

## Phase 4: Local report prototype

- `surface report`.
- JSON and summary output.
- Surface/status/freshness aggregation.

## Phase 4.5: Kernel reasoning

The first four phases let Surface record claims and report on them. Phase 4.5 lets the kernel reason about claims that span surfaces and product systems without leaving the contract.

- Subject aliases on claims and `identityLinks` on trust input, so the same real subject can be tracked across adapters and the kernel can group co-referent claims.
- Claim-type families on policies (`parentType`), so a policy can apply to a category of claims without enumerating every type.
- Incompatible-value and incompatible-status rules on policies, so contradictions across the same subject are detected by the kernel rather than declared by adapters.
- Derived claims (`derivedFrom`), so a claim can represent a roll-up over other claims with status and freshness inherited from its inputs.
- Linked-data export format, so trust reports can be consumed by external trust, graph, and reasoning stacks without a custom adapter.

These additions are deliberately small. They unlock cross-surface derivations the kernel could not previously express.

## Phase 5: Agent query surface

- `surface get`
- `surface stale`
- `surface missing`
- `surface policy`
- MCP resources after CLI stabilization.

## Phase 6: Human console

- Coverage map.
- Stale zones.
- Fault lines.
- Evidence drilldowns.
- High-impact unsupported claim queue.

## Phase 7: Hosted sink

Only after the local contract proves useful, add durable hosted storage for longitudinal reports, adapter runs, and organization-wide trend analysis.

## Parallel track: Linked-data and ontology

Surface's JSON-LD export is the seed of a longer-running track that hardens trust reports into a portable, W3C-compatible substrate. See [linked-data-roadmap.md](./linked-data-roadmap.md) for the full plan: publishing a resolvable vocabulary, SHACL shapes, Veritas inheritance, optional Turtle/N-Quads emit, Verifiable Credentials alignment, and on-demand OWL reasoning.

