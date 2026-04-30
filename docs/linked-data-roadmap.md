# Linked-Data Roadmap

A staged plan from "JSON-LD wrapper" (where Surface is today) to "shared semantic substrate with optional reasoning" (long-term). Each phase is self-contained and shippable; later phases are only justified by demand from earlier ones.

This roadmap extends [roadmap.md](./roadmap.md) with the linked-data and ontology track. The two run in parallel — neither blocks the other.

## Phase 0 — Foundations (done)

What is already in place:

- `toLinkedReport()` wraps reports with a `@context` declaring `@version: 1.1`, `@vocab`, datatype coercion for ISO-8601 timestamps, and `prov:wasDerivedFrom` alignment for `derivedFrom`.
- `identityLinks` and `subjectAliases` on Surface inputs map cleanly to `owl:sameAs`.
- `derivedFrom` chains map cleanly to PROV-O activity provenance.
- Veritas commits, by boundary doc, to projecting into `surface.input` — so Veritas inherits whatever Surface declares.

Implication: every later phase builds on existing data shapes. No schema breaks required.

## Phase 1 — Publish a resolvable vocabulary (Surface)

Goal: make `https://kontour.ai/surface/v1#` a real, dereferenceable vocabulary, not just a string.

Deliverables in `kontourai/surface`:

- `vocab/surface.ttl` — Turtle declarations for every Surface term:
  - Classes: `surface:TrustReport`, `surface:Claim`, `surface:Evidence`, `surface:VerificationPolicy`, `surface:VerificationEvent`, `surface:FaultLine`, `surface:SubjectGroup`.
  - Object properties: `surface:claimId`, `surface:policyId`, `surface:evidenceIds`, `surface:verificationPolicyId`, `surface:subjectGroup`.
  - Datatype properties: `surface:status`, `surface:claimType`, `surface:fieldOrBehavior`, `surface:value`, timestamps.
  - `rdfs:label`, `rdfs:comment`, `rdfs:domain`, `rdfs:range` on each.
  - `owl:imports <http://www.w3.org/ns/prov>`.
- `vocab/surface.context.jsonld` — the same `@context` as `src/linked.ts`, served as a static file. Single source of truth for both the runtime export and the published context.
- `scripts/sync-context.mjs` — generates `src/linked.ts` constants from `vocab/surface.context.jsonld` so they cannot drift.
- `docs/linked-data.md` — short usage guide: how to consume a Surface report from rdflib (Python), N3.js (Node), and Apache Jena.

Hosting:

- Serve `https://kontour.ai/surface/v1` with content negotiation:
  - `application/ld+json` → `surface.context.jsonld`
  - `text/turtle` → `surface.ttl`
  - `text/html` → human-readable docs page
- This is `kontour.ai` infra, not a Surface code change. Mirror in the GitHub Pages site as a fallback.

Cost: ~250 lines of Turtle, ~80 lines of script, infra config.

Test of success: `curl -H "Accept: text/turtle" https://kontour.ai/surface/v1` returns the vocab; `rapper -i jsonld` parses a Surface report into triples without errors.

## Phase 2 — Machine-checkable shapes (Surface SHACL)

Goal: the rules in `validate.ts` exist a second time as W3C SHACL, so non-TypeScript consumers can validate a Surface report independently.

Deliverables in `kontourai/surface`:

- `vocab/surface.shacl.ttl` mirroring `validate.ts`:
  - `ClaimShape`: required properties, ID format, `sh:in` for status enum, `sh:datatype xsd:dateTime` for timestamps, `sh:node` for reference integrity (claimId → ClaimShape, etc.).
  - `EvidenceShape`, `PolicyShape`, `EventShape`, `FaultLineShape`, `IdentityLinkShape`.
  - Cross-shape constraints: claim references must resolve, evidence methods must be valid, derivedFrom must not self-reference.
- `tests/shacl-parity.test.ts` — for each fixture in `examples/*.json`:
  - Run `validateTrustInput(fixture)` and SHACL validation in parallel.
  - Assert agreement (both pass, or both fail).
  - Negative fixtures: deliberate breakage in each field, both validators must reject.
- Optional dev dep: `rdf-validate-shacl` (Node) for the parity test only — not a runtime dep.

xsd:dateTime upgrade decision: during this phase, switch `xsd:dateTime` → `xsd:dateTimeStamp` in both context and shapes. `xsd:dateTimeStamp` requires the timezone, which `validateIsoDateTime` already enforces. This catches naive-datetime bugs at the SHACL layer.

Cost: ~400 lines of SHACL plus ~150 lines of test infrastructure. Real ontology work.

Test of success: running pySHACL or `rdf-validate-shacl` against any Surface report produces the same accept/reject decision as `validateTrustInput`.

## Phase 3 — Veritas inherits the substrate (Veritas, no code change)

Goal: prove the boundary doc by making it externally checkable.

Deliverables in `kontourai/veritas`:

- `docs/architecture/linked-data.md`:
  - Veritas has no separate vocabulary. Portable concepts route through `surface.input`.
  - Worked example: extracting `surface.input` from `.veritas/evidence/*.json`, validating against Surface SHACL, querying with SPARQL.
  - Diagram: Veritas evidence artifact → `surface.input` projection → Surface vocab/SHACL → consumer.
- `tests/linked-data-parity.test.ts`:
  - For each `examples/*.json` in Veritas, extract `surface.input`, validate against Surface's SHACL.
  - Mirror of Surface's parity test from the consumer side.
- Update `surface-veritas-boundary.md` to add a "Linked-data surface area" subsection clarifying: Veritas does not publish a vocab; it publishes evidence artifacts whose Surface projection is governed by Surface's vocab and SHACL.

Cost: one doc plus one test. No source changes.

Test of success: any third party can validate any Veritas evidence artifact's `surface.input` block without running Veritas or Surface TypeScript.

## Phase 4 — Optional emit formats (Surface)

Goal: for non-JSON-LD pipelines, emit native RDF formats directly.

Deliverables in `kontourai/surface`:

- `src/rdf.ts`:
  - `toTurtle(report): string`
  - `toNQuads(report): string`
  - Hand-rolled, zero deps. Surface controls the data shape, escaping rules are well-defined, no blank nodes (every node has a stable IRI).
- CLI: `--format turtle`, `--format nquads`.
- `tests/rdf.test.ts` — round-trip: emit Turtle, parse with N3.js (test dep only), assert triples match expected shapes.

When to ship: only if a real consumer asks for it. JSON-LD already round-trips through every major RDF library. Skip until demand is concrete.

Cost: ~250 lines plus tests. Skippable.

## Phase 5 — Veritas-local namespace and boundary mapping (Veritas)

Goal: make the Surface-Veritas mapping table machine-readable so it cannot silently drift.

Deliverables in `kontourai/veritas`:

- `vocab/veritas.ttl`:
  - Classes for Veritas-local concepts: `veritas:ProofLane`, `veritas:PolicyPack`, `veritas:ProofFamily`, `veritas:ShadowRun`, `veritas:EvalRecord`, `veritas:VerificationBudget`.
  - `owl:imports <https://kontour.ai/surface/v1>`.
  - Boundary mapping as RDFS subclass / subproperty axioms:
    ```turtle
    veritas:ProofLane rdfs:subClassOf surface:VerificationPolicy .
    veritas:PolicyResult rdfs:subClassOf surface:Claim .
    veritas:ShadowRun rdfs:subClassOf prov:Activity .
    veritas:evidenceArtifact rdfs:subPropertyOf prov:generated .
    veritas:VerificationBudget rdfs:subClassOf surface:Claim .
    ```
- `vocab/veritas.shacl.ttl`:
  - Shapes for evidence artifacts, eval records, policy packs.
  - Critically: a shape requiring that any evidence artifact's `surface.input` conform to `surface:TrustInputShape`.
- Hosting: `https://kontour.ai/veritas/v1` with the same content negotiation pattern.
- `scripts/check-boundary-mapping.mjs`: parses `vocab/veritas.ttl`, asserts every `x_surface_mapping: mapped` field in `schemas/*.json` has a corresponding RDFS axiom. Replaces or augments the existing reference test.

Cost: ~200 lines of Turtle, ~150 lines of SHACL, one validation script.

Test of success: if someone adds a Veritas concept marked `mapped` without a Turtle axiom, CI fails. The boundary becomes externally enforceable.

## Phase 6 — Verifiable Credentials alignment (Surface, optional)

Goal: Surface trust reports can be packaged as W3C Verifiable Credentials when consumers expect that envelope.

Background: VC Data Model 2.0's `evidence` property and `credentialSubject` overlap conceptually with Surface's evidence and claims. Aligning means a Surface report can be embedded in a VC without restructuring.

Deliverables in `kontourai/surface`:

- `src/vc.ts`:
  - `toVerifiableCredentialPayload(report, issuer, subject)` — wraps a Surface report as a VC `credentialSubject`, with `evidence` array projected from `report.evidence`.
  - Does not sign. Signing is the consumer's choice (issuer keys, suite — Ed25519, ECDSA, BBS+).
- `docs/vc-alignment.md` — when to use this, mapping table (`surface:Claim` ↔ `cred:credentialSubject` claims, `surface:Evidence` ↔ `cred:evidence`).
- Expand `vocab/surface.context.jsonld` with an `@import` of the VC Data Model 2.0 context (JSON-LD 1.1 feature) so contexts compose.

When to ship: when there is a concrete consumer (regulator, identity provider, B2B audit consumer) requesting VCs.

Cost: ~150 lines plus docs. Optional.

## Phase 7 — OWL reasoning (Surface, on-demand)

Goal: encode operational constraints as machine-reasonable axioms so consumers can run a reasoner instead of writing graph-walking code.

Deliverables:

- `vocab/surface.owl.ttl` extending `surface.ttl`:
  - `prov:wasDerivedFrom a owl:TransitiveProperty .` (free, comes from PROV).
  - `surface:Status owl:oneOf (surface:verified surface:rejected surface:disputed surface:proposed surface:unknown surface:stale surface:superseded) .`
  - Disjoint pairs from `incompatibleStatuses` rule families: `surface:verified owl:differentFrom surface:rejected .` and so on.
  - `owl:sameAs` materialization rule: `identityLinks` entries become `owl:sameAs` triples in the emitted graph.
  - Class disjointness: `surface:Claim`, `surface:Evidence`, `surface:VerificationEvent` are pairwise disjoint.
- Choose an OWL profile (probably OWL 2 RL — supports rule-based reasoning, scales to large graphs, supported by GraphDB, Stardog, and Apache Jena's RL reasoner).
- `docs/reasoning.md`: example SPARQL queries that only work with reasoning enabled. For example:
  - "every claim transitively derived from a rejected claim" (transitivity over `prov:wasDerivedFrom`).
  - "every subject in the equivalence class of `repo:foo`" (`owl:sameAs` chain).

Hard limits — what will not be encoded in OWL:

- Status ranking (`weakerStatus`) — operational, not axiomatic. Stays in `derivation.ts`.
- Freshness windows and staleness — temporal, OWL is timeless. Stays in policy and report code.
- Conflict resolution policy — process, not logic.

This phase is justified only by demand. If no consumer wants reasoning, this is wasted ontology work. Defer until concrete ask.

Cost: real (multi-day) ontology work. Risk: OWL constraints get out of sync with TS code unless paired with a parity test (similar to SHACL parity from Phase 2).

## Phase 8 — SPARQL endpoint and federated queries (longer term, infra)

Goal: Surface reports become queryable from a stable endpoint, federatable across organizations.

Vision:

- A Surface report stored in `s3://…/reports/<id>.jsonld` is loadable into any triplestore.
- Hosted Surface endpoint at `https://query.kontour.ai/sparql` exposes reports the user has permissioned in.
- Federated query: a SPARQL `SERVICE <…>` clause lets one organization's queries pull claims from another's endpoint, governed by access policy.
- This is the existing roadmap's Phase 7 ("hosted sink") expressed in linked-data terms.

Deliverables when justified:

- Triplestore selection (Apache Jena Fuseki, GraphDB, Stardog, Oxigraph).
- Authn/authz layer for selective subgraph exposure.
- Per-organization graph naming (`<https://kontour.ai/org/{slug}/reports/{id}>`).
- Cross-organization federation contract: who can query what, audit trail.

This is product, not protocol. Comes after Surface has multi-tenant hosted storage. Not before.

## Long-term vision

The end state Surface is positioning toward:

1. **Surface vocab is a small, stable, public W3C-compatible ontology** for claim, evidence, and verification — comparable in scope to PROV-O. Other trust products (Veritas today; tomorrow, anything else built on Kontour) inherit it via subclass axioms rather than redefining.

2. **Trust reports are portable graphs.** A Surface report can be:
   - Read as JSON (today).
   - Validated by SHACL (Phase 2).
   - Loaded into a triplestore (Phase 4).
   - Reasoned over (Phase 7).
   - Federated across organizations (Phase 8).
   - Wrapped as a Verifiable Credential (Phase 6).

   Without ever leaving the `schemaVersion: N` contract.

3. **Boundary as ontology.** The Surface-Veritas boundary stops being a doc and becomes a vocabulary import graph. Adding a new product (say, `kontourai/clinical`) means adding `vocab/clinical.ttl` that imports Surface, with explicit subclass axioms. The boundary is enforceable in CI by graph operations.

4. **Surface as the trust layer for AI agent ecosystems.** The story is: AI agents produce work; producers attest with claims; verifiers attach evidence; everyone shares the vocabulary. Every consumer — IDE, regulator, downstream agent — speaks Surface terms because Surface terms are W3C-resolvable.

5. **Reasoning is opt-in.** Surface stays operationally simple (zero deps, fast local CLI). Anyone who wants reasoning brings their own reasoner; Surface just publishes the axioms that make reasoning meaningful. No OWL reasoner is ever embedded in the kernel.

## Sequencing recommendation

| Phase | Repo | When | Blocker for next |
|---|---|---|---|
| 1: Vocab + context publishing | Surface | Now (next cycle) | Required for 2, 3, 5 |
| 2: SHACL shapes | Surface | Right after 1 | Required for 3, 5 |
| 3: Veritas inheritance docs/test | Veritas | After 2 ships | None |
| 4: Turtle/N-Quads emit | Surface | On demand | None |
| 5: Veritas namespace + boundary axioms | Veritas | Optional, anytime after 2 | None |
| 6: VC Data Model 2.0 alignment | Surface | On demand | None |
| 7: OWL reasoning | Surface | On demand | None |
| 8: SPARQL endpoint / federation | Hosted | After existing roadmap Phase 7 (hosted sink) | — |

Critical path: Phase 1 → Phase 2 → Phase 3. That is the minimum to credibly say "Surface and Veritas support RDF, SHACL, and PROV-O." Everything after that is justified case-by-case.

Total scope of critical path: ~1000 lines of vocab/SHACL/tests plus infra config. No new runtime deps, no kernel changes, no schema breaks.
