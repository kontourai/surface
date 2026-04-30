# Grounding Audit: Real-App Trust Models vs Surface Today

**Audit date:** 2026-04-27
**Apps audited:** `briananderson1222/campfit`, `briananderson1222/taxes`
**Method:** code-level read of data models, schemas, and trust-bearing service code in each repo.

This document captures what the two real applications *actually* do for trust, evidence, and verification — independent of the synthetic adapters in `src/adapters/`. The findings here drive [integration-plan.md](./integration-plan.md), [roadmap.md](./roadmap.md), and [linked-data-roadmap.md](./linked-data-roadmap.md). Where any of those plans disagree with this audit, the audit wins.

## Headline findings

1. **Neither app depends on `@kontourai/surface` today.**
   - `campfit/package.json` — zero `@kontourai/*` references.
   - `taxes/package.json` — `@kontourai/veritas` only, as a dev-time `file:` dependency for CI/CD lint.
2. **Both apps re-implement Surface-shaped concepts in their own data layer.** They have evidence, attestations, confidence, sources, recheck timestamps, and reviewer state — but none of it crosses the network in a Surface schema.
3. **Most real trust work is *decision-phase*, not *verification-phase*.** Surface today models a single chosen claim and asks whether it is verified. Both real apps spend most of their structure modelling *which value to choose* and *what assumptions a derived value rests on*.
4. **The cross-domain adapters in `src/adapters/` adapt fictional exports.** Neither real app emits anything resembling those shapes. The adapters demonstrate that the kernel can ingest two JSON shapes; they do not demonstrate that Surface models the domains.

## Repository state

### Campfit

- Stack: Next.js + Prisma + Postgres.
- Schema location: `prisma/schema.prisma` (single file).
- Surface dependency: **none**. No import of `@kontourai/surface` anywhere in the tree.
- Veritas dependency: **none** declared in `package.json`.

### Taxes

- Stack: pnpm monorepo. Apps: `apps/web` (Next.js), `apps/mcp-server`, `apps/cli`. Packages: `packages/shared-schemas`, `packages/tax-services`, `packages/tax-rules`, `packages/tax-engine`, `packages/tax-profile`, `packages/tax-docs`.
- Schema location: `packages/shared-schemas/src/index.ts` (Zod, not Prisma — taxes uses file-backed JSON state, not a relational DB).
- Surface dependency: **none**.
- Veritas dependency: `@kontourai/veritas` as `file:../../kontourai/veritas` in devDependencies. Used by CI lint workflow only.

## Campfit trust model

Campfit's job: maintain a per-camp dataset that an end user trusts enough to act on (saving, registering, contacting). Its trust model centers on **field-level attestation** of crawled or human-reported camp data, plus a structured proposal-and-review flow for changes.

### Trust-bearing models (from `prisma/schema.prisma`)

| Model | Role |
|---|---|
| `Camp` | The subject. Each scalar field is independently attested. |
| `FieldAttestation` | Per-field evidence record: `(campId, fieldName)` → status, source, timestamps, raw evidence. Status enum: `ACTIVE`, `STALE`, `INVALIDATED`. |
| `DataSource` / `DataSourceCamp` | Crawl source registry; each crawl run produces fresh attestations or marks old ones stale. |
| `CampReport` / `ReviewFlag` | User-submitted corrections; `ReviewFlagStatus` ∈ open/resolved/dismissed. |
| `CampChangeLog` / `ProviderChangeLog` / `PersonChangeLog` | Append-only history of every accepted change with actor and source. |
| `CampAccreditation` / `AccreditationBody` | External-attestor binding (e.g., ACA accreditation). |
| `AiActionLog` | Records AI-driven mutations with capability and status enums. |

There is also a proposal flow (sometimes called `CampChangeProposal` in the working notes — implemented as a pending state on the changelog plus `ReviewFlag`s) where automated extractors and AI actions submit candidate values that humans approve before they enter `Camp`.

### What Campfit needs from a trust substrate

- **Field-level claims** keyed by `(subject, field)` — already shaped like Surface claims.
- **Per-claim evidence** with crawl run reference, timestamp, raw payload — Surface's `Evidence` covers most of this; missing piece is a `batchRef` for the crawl run.
- **Recheck staleness**: an `ACTIVE` attestation becomes `STALE` after N days even with no contradicting evidence. Surface's `ConfidenceBasis` does not currently express *time-based* recheck.
- **Pending/under-review state**: a value extracted by a crawler that has not yet been promoted into the live `Camp` row. Surface today only models claims that are already canonical.
- **Reviewer signals**: open/dismissed flags on user reports. No first-class Surface concept.
- **Proposal → decision flow**: a candidate value, alternative, and the chosen replacement live as separate rows linked by changelog. Surface has no candidate primitive.

## Taxes trust model

Taxes' job: produce a defensible tax return. Trust is the entire product — every line on the return must trace back to a document or a justified assumption, and the user must see what's certain, what's assumed, what differs from prior years, and what needs human review.

### Trust-bearing types (from `packages/shared-schemas/src/index.ts` and `packages/tax-services/`)

| Type | Role |
|---|---|
| `ExtractedFact` | Raw extraction from a source document (W2, 1099, etc.). Many extracted facts may reference the same logical fact. |
| `ResolvedFact` | A logical fact with **candidates** (alternative values, each with source + confidence) and a chosen value. The decision artifact. |
| `VerifiedFact` | A `ResolvedFact` after a separate verification pass — adds verification status and re-derivation check. |
| `ReturnPackageField` | A scalar field on the return, with its evidence chain back to one or more `VerifiedFact`s. |
| `ReturnPackageAssumption` | An assumption baked into a derived field (e.g., "filing jointly", "no foreign income"). Has `status: "assumed" \| "awaiting_decision"`. |
| `ReturnPackageComparisonField` | Side-by-side comparison vs prior-year return; flags drift, expected vs unexpected. |
| `ReturnPackageReviewSignal` | Reviewer flag with severity, reason, suggested action. |
| `ReturnPackagePolicy` | Per-package policy: which assumptions are acceptable, what level of evidence is required for which fields. |

### What Taxes needs from a trust substrate

- **Candidates with source + confidence**: The core decision shape. Surface's `Claim` is single-valued; `ResolvedFact` requires N candidates per logical fact.
- **Assumption claims with explicit status**: `"assumed"` (silent default) vs `"awaiting_decision"` (must be resolved before package finalization). Surface has neither.
- **Comparison claims**: a value plus its prior-year analogue plus a delta classification. Surface has no built-in primitive.
- **Review signals as first-class data**, not just metadata. Severity + reason + suggested action.
- **Policy bound at the *package* level**, not per-claim: the policy says how strict to be about the whole return. Surface's `verificationPolicyId` is per-claim only.
- **Derivation chains**: every field on the return is derived from facts → extractions → documents. Surface's `derivedFrom` covers this in principle but the audit found no real app emits PROV-O-shaped chains today.
- **Trace queries at runtime**: "show me everything supporting line 22 of Form 1040" is a hot path. Surface today is build-time/CLI-time only — no query API.

## Surface gaps the audit identified

Distilled from both apps. These are kernel gaps, not adapter gaps. Each is addressed by a track in [integration-plan.md](./integration-plan.md).

| # | Gap | Surface today | Driven by | Plan ref |
|---|---|---|---|---|
| 1 | **Candidate primitive** | No alternative-values shape | Taxes `ResolvedFact`, Campfit proposal flow | A1 |
| 2 | **Assumption claim with `awaiting_decision`** | No assumption shape | Taxes `ReturnPackageAssumption` | A2 |
| 3 | **Comparison primitive** | None | Taxes `ReturnPackageComparisonField` | A3 |
| 4 | **Review signal as first-class** | Only metadata | Taxes `ReviewSignal`, Campfit `ReviewFlag` | A4 |
| 5 | **Time-based recheck staleness** | `ConfidenceBasis` has no recheck window | Campfit `STALE` transition | A5 |
| 6 | **Evidence batch reference** | `Evidence` has no `batchRef` | Campfit crawl runs | A6 |
| 7 | **Runtime query API** | Build-time only | Both apps need trace/lookup at request time | Track B |
| 8 | **Package-level policy binding** | Policy is per-claim | Taxes `ReturnPackagePolicy` | (open question — see plan) |

## Adapter status

The adapters in `src/adapters/` (`taxes.ts`, `campfit.ts`, `veritas.ts`) **adapt synthetic export shapes** that match neither real app:

- `adapters/campfit.ts` — adapts a hypothetical `CampfitDataSourceExport` shape. Real Campfit has no such export and no `@kontourai/surface` import.
- `adapters/taxes.ts` — adapts a hypothetical `TaxesReturnExport`. Real Taxes neither emits this shape nor depends on `@kontourai/surface`.
- `adapters/veritas.ts` — adapts a Veritas evidence artifact. Veritas does emit evidence; the boundary here is real but currently described as "Veritas projects into `surface.input`" rather than via this adapter pattern.

Recommendation in the integration plan: move these to `examples/adapters/` and rename to generic patterns (`field-attested-records-adapter`, `fact-resolution-adapter`) so the kernel does not appear to ship domain-specific code while still demonstrating cross-domain reach.

## Dual-layer integration thesis

Both real apps have two distinct trust questions, and both should answer both:

- **Code/repo trust** (Veritas) — Is the build healthy? Are governance blocks present? Are tests proving extractors correctly populate Surface inputs?
- **Data/domain trust** (Surface) — Are the claims about the world true?

Today: Campfit answers neither in a portable form. Taxes answers code/repo trust through Veritas (devDep) but answers data/domain trust through bespoke Zod types.

The integration plans in this repo and in `../veritas/docs/integration-plan.md` deliver both layers in both apps, with Taxes as the pilot.

## Decisions this audit forces

1. **Surface v4 is decision-phase-aware.** Candidate, Assumption, Comparison, ReviewSignal land before any other v4 work.
2. **Surface ships a runtime API**, not just a build-time CLI. Without it, neither app can use Surface for the request-path trace queries that justify integrating at all.
3. **The synthetic adapters move out of `src/`.** They are demonstrations, not kernel.
4. **Veritas's projection into `surface.input` becomes a documented, tested boundary** — not a synthetic adapter.
5. **The linked-data roadmap pauses at Phase 2 (SHACL)** until Surface v4 primitives stabilize, because shapes for primitives that don't exist yet would have to be rewritten.

## References

- [integration-plan.md](./integration-plan.md) — Surface tracks A/B/C and pilot/confirmation phasing
- [../../veritas/docs/integration-plan.md](../../veritas/docs/integration-plan.md) — Veritas-side companion plan
- [linked-data-roadmap.md](./linked-data-roadmap.md) — W3C/RDF/OWL track
- [roadmap.md](./roadmap.md) — kernel evolution
- Campfit schema: `briananderson1222/campfit/prisma/schema.prisma`
- Taxes schemas: `briananderson1222/taxes/packages/shared-schemas/src/index.ts`, `packages/tax-services/src/return-package.ts`, `packages/tax-services/src/fact-resolution.ts`
