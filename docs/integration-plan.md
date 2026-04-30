# Integration Plan: Surface + Veritas in Real Applications

This plan defines how Surface and Veritas integrate into real applications — using `briananderson1222/campfit` and `briananderson1222/taxes` as the two reference integrations. It is grounded in a code-level audit of both apps, captured in [grounding-audit.md](./grounding-audit.md). Where this plan and the audit disagree, the audit wins.

This plan complements [roadmap.md](./roadmap.md) (kernel evolution) and [linked-data-roadmap.md](./linked-data-roadmap.md) (W3C track). Both of those tracks pause at their next milestone until this plan delivers Phase 2, because real-app integration drives the abstractions both other tracks depend on.

## Why this plan exists

Two findings from the grounding audit forced a re-plan:

1. **Real applications spend most of their trust work in *decision-making*, not *verification*.** Campfit's core trust artifact is the `CampChangeProposal` (a candidate value awaiting review). Taxes' core trust artifact is the `ResolvedFact` (a value chosen from candidates). Surface today models verification of already-decided claims. The decision phase is exactly where the synthetic adapters lose load-bearing structure.

2. **The cross-domain adapters in `src/adapters/` adapt fictional exports.** Neither real app currently emits anything resembling those shapes. The adapters exist to demonstrate cross-domain portability, but they prove a weaker claim than they appear to: that the kernel ingests two different JSON shapes, not that Surface speaks the domains.

This plan addresses both: extend Surface to model the decision phase honestly, and integrate into both real apps so the abstractions are pressure-tested.

## The dual-layer model

Every real application has two distinct trust questions:

- **Code/repo trust** — *Did the team build this correctly?* Tests pass, governance blocks present, type-checks green, dependencies safe, AI-agent changes proven. **Veritas owns this.**
- **Data/domain trust** — *Is what we're saying about the world true?* This camp's registration is open. This taxpayer's wage was $95,000. **Surface owns this.**

These are independent: a perfectly-tested codebase can produce wrong claims about the world, and a chaotic codebase can occasionally produce right claims. Both should be verified, separately.

The clean boundary: **Veritas verifies the code that produces Surface claims; Surface verifies the claims themselves.** They share a data shape (`surface.input`) at exactly one seam:

- A Veritas evidence artifact for a code change includes `surface.input` proving the *test* extraction produced expected claims — not the production claims.
- Production Surface reports are generated separately by the running app and stored alongside production data, not in `.veritas/`.

Both real apps benefit from both layers. This plan delivers both.

## Pilot strategy

**Taxes is the pilot.** Reasons:

- Already has Veritas as a devDependency (minimal expansion needed).
- Trust model exercises Surface harder than Campfit (candidates, assumptions, comparisons, traces).
- Existing MCP server and web app benefit immediately from Surface as a runtime API.
- Failure modes surface fast: if Surface can't model a `ResolvedFact` cleanly, that's a kernel gap to fix.

**Campfit is the confirmation pass.** After Taxes integration stabilizes, Campfit integrates to prove the abstractions are not Taxes-specific. New gaps Campfit reveals drive Surface v4.

## Surface-side work

The audit identified primitive and API gaps. These resolve into three tracks.

### Track A — Decision-phase primitives

Surface today represents already-decided claims. Real apps need to represent *the decision itself*. Add:

#### A1. Candidate primitive

A new claim shape representing an alternative value awaiting decision.

```ts
export interface CandidateClaim extends Claim {
  claimType: "candidate";
  parentClaimId: string;          // the decision-claim this is a candidate for
  candidateSource: string;         // "document", "extraction", "user_override", "prior_year_carry_forward", etc.
  confidence: number;              // 0-1
  selectedReason?: string;         // populated when selected
  rejectedReason?: string;         // populated when rejected or superseded
}
```

A decision-claim references its candidates via a new field on `Claim`:

```ts
export interface Claim {
  // existing fields...
  candidateClaimIds?: string[];   // candidates considered for this decision
  selectedCandidateId?: string;   // which candidate's value was chosen
}
```

**Drives:** Taxes `ResolvedFact.candidates`, Campfit `CampChangeProposal`, future apps with extraction pipelines.

**Doesn't break simple case:** claims without candidates omit these fields entirely.

#### A2. Assumption primitive

A claim status and accompanying claim shape for non-grounded but load-bearing values.

```ts
export type TrustStatus =
  | "unknown" | "proposed" | "verified" | "stale"
  | "disputed" | "superseded" | "rejected"
  | "assumed"                    // NEW: deliberately non-grounded but load-bearing
  | "awaiting_decision";          // NEW: candidate exists, pending review

export interface AssumptionClaim extends Claim {
  claimType: "assumption";
  assumptionKind: string;         // "zero_basis_missing", "default_open", etc.
  assumptionReason: string;       // why this assumption is necessary
  forcingEvidence?: string[];     // evidence that *forced* the assumption (e.g., "basis: not provided")
  impactValue?: number;           // magnitude of impact if known
  blocksFinality?: boolean;       // true if downstream artifact (return, listing) cannot finalize
}
```

**Drives:** Taxes `ReturnPackageAssumption`. Likely useful for Campfit too ("assumed registration open because it was last week").

#### A3. Comparison primitive

A first-class relationship between two claims with structured delta analysis.

```ts
export interface ComparisonClaim extends Claim {
  claimType: "comparison";
  sourceClaimId: string;
  referenceClaimId: string;
  delta?: number;
  severity: "match" | "small" | "medium" | "large" | "informational";
  likelyCauses?: Array<{
    category: string;             // domain-defined
    summary: string;
    citations?: string[];
  }>;
  missingInformation?: string[];
}
```

**Drives:** Taxes `ReturnPackageComparisonField` (generated vs prepared). Likely useful for Campfit (operator-entered vs crawl-extracted reconciliation).

#### A4. Review signal primitive

Distinct from `FaultLine`. A review signal flags a claim as needing human attention without claiming contradiction.

```ts
export interface ReviewSignal {
  id: string;
  claimId: string;
  driver: "assumption" | "gap" | "proxy_model" | "low_confidence" | "policy_threshold";
  severity: "info" | "review_required";
  reason: string;
  createdAt: string;
}
```

`ReviewSignal[]` becomes a top-level `TrustInput` and `TrustReport` field.

**Drives:** Taxes `ReturnPackageReviewSignal`, Campfit field-level review state.

#### A5. Recheck-driven staleness

Expand `ConfidenceBasis` so freshness can distinguish age from recheck failure.

```ts
export interface ConfidenceBasis {
  // existing fields...
  lastRecheckAt?: string;          // when the claim was last revalidated
  recheckOutcome?: "confirmed" | "drifted" | "failed" | "unattempted";
  recheckFailureReason?: string;
}
```

**Drives:** Campfit `FieldAttestation.lastRecheckedAt` + `INVALIDATED` status.

#### A6. Batch evidence reference

Evidence gains an optional batch grouping.

```ts
export interface Evidence {
  // existing fields...
  batchRef?: string;               // identifier for the batch (crawl run, extraction run, document parse)
  batchStatus?: "running" | "completed" | "failed" | "partial";
  batchMetrics?: Record<string, number>;  // domain-defined: errorCount, processedCount, etc.
}
```

**Drives:** Campfit `CrawlRun` evidence linkage, Taxes document-parse runs, future ingest pipelines.

### Track B — Runtime API

Surface today is batch-only: hand it a complete `TrustInput`, get a `TrustReport`. Real apps don't work that way. Claims arrive continuously; reports are persistent state, not ephemeral output.

#### B1. Incremental ingest API

```ts
export interface TrustReportSession {
  applyClaim(claim: Claim): void;
  applyEvidence(evidence: Evidence): void;
  applyEvent(event: VerificationEvent): void;
  applyIdentityLink(link: IdentityLink): void;
  applyReviewSignal(signal: ReviewSignal): void;
  retractClaim(claimId: string, reason: string): void;
  build(options: BuildReportOptions): TrustReport;
}

export function openTrustReportSession(initial?: TrustInput): TrustReportSession;
```

The session validates each addition, maintains internal indexes, and computes the report on demand. No file I/O.

#### B2. Store contract

A pluggable interface for persistent storage. Surface ships an in-memory implementation; consumers implement against Postgres, SQLite, etc.

```ts
export interface TrustReportStore {
  putClaim(claim: Claim): Promise<void>;
  putEvidence(evidence: Evidence): Promise<void>;
  putEvent(event: VerificationEvent): Promise<void>;
  putIdentityLink(link: IdentityLink): Promise<void>;
  putReviewSignal(signal: ReviewSignal): Promise<void>;
  getClaim(id: string): Promise<Claim | null>;
  getClaimsBySubject(ref: SubjectRef): Promise<Claim[]>;
  getEvidenceForClaim(claimId: string): Promise<Evidence[]>;
  getStaleClaims(asOf: Date): Promise<Claim[]>;
  getDisputedClaims(): Promise<Claim[]>;
  getClaimsByStatus(status: TrustStatus): Promise<Claim[]>;
  getCandidates(parentClaimId: string): Promise<CandidateClaim[]>;
  // ...query surface stays small and stable
}
```

Surface ships:

- `InMemoryTrustReportStore` — for tests and small apps.
- `JsonFileTrustReportStore` — append-only JSONL, for local CLI use.

Real apps (Taxes, Campfit) implement against their own DBs.

#### B3. Query primitives

The CLI already has `report`, `stale`, `missing`. Promote those to runtime API and add a few more:

```ts
buildTrustReport(input: TrustInput, options): TrustReport;       // existing
queryStale(store: TrustReportStore, asOf: Date): Promise<Claim[]>;
queryDisputed(store: TrustReportStore): Promise<Claim[]>;
queryAwaitingDecision(store: TrustReportStore): Promise<Claim[]>;
queryClaimChain(store: TrustReportStore, claimId: string): Promise<ClaimChain>;
queryReviewQueue(store: TrustReportStore): Promise<ReviewSignal[]>;
```

#### B4. Subject-scoped views

Real consumers (Campfit's admin UI, Taxes' MCP server) want "everything Surface knows about subject X." Add:

```ts
buildSubjectView(store: TrustReportStore, ref: SubjectRef, options): Promise<SubjectView>;
```

A `SubjectView` is a focused trust report scoped to one subject (and its identity-linked aliases), with all claims, candidates, evidence, comparisons, signals, and fault lines that mention it.

### Track C — Adapter retirement and example reorganization

The current `src/adapters/` confuses synthetic illustration with production integration. Resolve:

#### C1. Move synthetic adapters out of `src/`

- `src/adapters/campfit.ts` → `examples/adapters/field-attested-records.ts`
- `src/adapters/taxes.ts` → `examples/adapters/fact-resolution.ts`
- Rename exported symbols to describe input shape, not product (`adaptFieldAttestedRecordsToTrustInput`, `adaptFactResolutionToTrustInput`).
- Update fixture filenames: `campfit-trust-export.json` → `field-attested-records-export.json`, etc.

#### C2. Keep Veritas adapter in `src/adapters/`

The Veritas adapter is real (Veritas is a real consumer). Mark it as the canonical Surface-facing adapter for Veritas evidence. Once Phase 2 of [linked-data-roadmap.md](./linked-data-roadmap.md) ships SHACL, this adapter becomes optional — but until then it's load-bearing.

#### C3. Add `examples/adapters/README.md`

Explicitly labels the moved adapters as illustrative templates for the adapter pattern, not integrations with named products. Points to Taxes and Campfit's own repos for real integration code.

#### C4. Update CLI

`--adapter campfit` → `--adapter field-attested-records`. Same for taxes. CLI stays useful for demos; nobody mistakes demos for product integration.

## Phased delivery

### Phase S1 — Decision primitives (Track A)

Order matters within the phase: A4 (review signal) and A6 (batch evidence) are pure additions and ship first to unblock Veritas-side work. A1 (candidate) and A2 (assumption) follow because they introduce new claim types and statuses that need fixture coverage. A3 (comparison) and A5 (recheck staleness) finish the phase.

**Schema bump:** `schemaVersion: 4`. Strict superset of v3. Migration path documented in `docs/schema-versioning.md`.

**Tests:** for each primitive, fixture-driven tests against synthesized minimal cases. Real-data tests follow in S3.

### Phase S2 — Runtime API (Track B)

Ship `openTrustReportSession`, `TrustReportStore` interface, `InMemoryTrustReportStore`, `JsonFileTrustReportStore`. Promote query primitives. Add `buildSubjectView`.

**Backward compatibility:** existing `validateTrustInput` + `buildTrustReport` paths unchanged. Session API is additive.

**No new schema version.** This is API surface only.

### Phase S3 — Taxes integration (pilot)

Cross-repo work. See "Pilot: Taxes" below for details. Drives any necessary primitive adjustments back into Phase S1 before it locks.

### Phase S4 — Adapter cleanup (Track C)

C1–C4. Done after S3 because S3 may reveal that the moved adapters need shape changes; better to refactor once.

### Phase S5 — Campfit integration (confirmation)

Cross-repo work. See "Confirmation: Campfit" below. Any new gaps drive Surface v5 planning, not v4 patches.

### Phase S6 — Resume linked-data and roadmap tracks

Once primitives and runtime API are pressure-tested by both apps, the linked-data SHACL shapes (Phase 2 of [linked-data-roadmap.md](./linked-data-roadmap.md)) lock in stable terms. Roadmap Phase 5 (agent query surface) becomes thin wrappers over Track B's runtime API.

## Pilot: Taxes

Taxes is the deeper integration because Taxes' trust model exercises every Surface gap.

### T1 — Add Surface as a runtime dependency

`@kontourai/surface` joins `package.json` as a regular dependency (not dev-only). New package: `packages/surface-projection/`.

### T2 — Author projection layer

`packages/surface-projection/src/`:

- `from-extracted-fact.ts` — `ExtractedFact` → `CandidateClaim`
- `from-resolved-fact.ts` — `ResolvedFact` → decision `Claim` + `candidateClaimIds`
- `from-verified-fact.ts` — `VerifiedFact` → `VerificationEvent`
- `from-assumption.ts` — `ReturnPackageAssumption` → `AssumptionClaim`
- `from-comparison.ts` — `ReturnPackageComparisonField` → `ComparisonClaim`
- `from-review-signal.ts` — `ReturnPackageReviewSignal` → `ReviewSignal`
- `from-return-package.ts` — orchestrates the above into a complete `TrustInput`
- `policies.ts` — Surface `VerificationPolicy` set for tax facts

Each projection is a pure function. Tests live in `tests/surface-projection/` with real anonymized fixtures from existing tax workflows.

### T3 — Author store implementation

`packages/surface-store-sqlite/src/index.ts` — implements `TrustReportStore` against the existing SQLite store. Adds `surface_*` tables (or projects existing tables on read). Migrations live in `packages/surface-store-sqlite/migrations/`.

### T4 — MCP server exposes Surface views

`apps/mcp-server/src/tools/`:

- `getTrustReport(householdId, taxYear)` — full report.
- `getSubjectView(subjectRef)` — focused view.
- `getCandidates(claimId)` — alternatives considered.
- `getReviewQueue()` — review signals.
- `getReconciliationGaps(householdId, taxYear)` — comparison claims with non-`match` severity.

The web app (`apps/web/`) consumes these tools or hits the projection layer directly.

### T5 — Integration tests

Real-data fixtures: pick three actual household tax-year combinations from `.taxes/`. For each:

- Project to Surface input.
- Validate against schema.
- Build trust report.
- Assert: every `VerifiedFact` produces a `verified` claim with a verification event; every `ResolvedFact` produces a decision claim with candidates; every assumption produces an `AssumptionClaim` with `blocksFinality` set correctly; every reconciliation gap produces a `ComparisonClaim`.

### T6 — Push gaps back to Surface

If the pilot reveals primitives that don't fit (e.g., assumption needs an additional kind, comparison needs a new severity), surface those as Surface-side issues and resolve in S1 before C1 ships. The pilot has authority to push back.

### T7 — Veritas expansion (parallel, not blocking)

Independently of Surface integration, Taxes expands its existing Veritas usage. See [Veritas integration plan](../../veritas/docs/integration-plan.md) for details.

## Confirmation: Campfit

Campfit confirms the primitives are not Taxes-specific. Lighter integration, same shape.

### C1 — Add both dependencies

`@kontourai/surface` as runtime dep, `@kontourai/veritas` as devDep. Run `npx veritas init` for repo governance baseline.

### C2 — Author projection layer

`lib/surface/`:

- `from-attestation.ts` — `FieldAttestation` → `Claim` + verification event + recheck staleness fields
- `from-camp.ts` — `Camp.fieldSources` → claims for the canonical-confirmed values
- `from-review-flag.ts` — `ReviewFlag` → `disputed` claim status + optional `ReviewSignal`
- `from-proposal.ts` — `CampChangeProposal` → decision claim with `awaiting_decision` status + candidate claims
- `from-crawl-run.ts` — `CrawlRun` → `Evidence.batchRef` and batch metrics
- `policies.ts` — Surface policies for camp public-data fields, attestations, proposals

### C3 — Store implementation

`lib/surface/store.ts` — implements `TrustReportStore` against Postgres via Prisma. Adds Surface tables; existing camp tables remain authoritative.

### C4 — Admin UI reads Surface

`app/admin/review/` switches from raw Prisma rows to Surface views. Stale-attestation lists, dispute queues, proposal review — all become Surface queries.

### C5 — External consumer surface

Public API endpoint exposes Surface trust reports (with appropriate access controls) for partner directories. JSON-LD output (Linked-Data Phase 1, already shipped) makes the data discoverable to RDF tools.

### C6 — Veritas governance

`.veritas/repo.adapter.json` for Next.js + Prisma. Policy pack: schema-change-requires-migration, route-requires-middleware, env-var-disclosure, llm-extractor-changes-require-fixture. See [Veritas integration plan](../../veritas/docs/integration-plan.md).

### C7 — Push gaps back

Same authority as the Taxes pilot: if primitives don't fit, push back. Specifically watch for:

- Multi-attestation per field (audit predicted this would force structure)
- Cascading staleness across related fields
- Cross-camp identity (same provider, multiple sites)

## Cross-cutting concerns

### Schema evolution discipline

This plan ships `schemaVersion: 4`. The audit may surface a need for v5 during the Campfit pass. Standard rules apply (see [schema-versioning.md](./schema-versioning.md)): strict superset, no removals, migration path documented.

### Versioning across products

Surface, Veritas, Campfit, and Taxes all version independently. Compatibility matrix lives in `docs/compatibility.md` (new file, ships with Phase S2). Format:

```
surface@0.4.x is compatible with veritas@0.3.x and surface-store-sqlite@0.2.x
```

### Living vs snapshot evidence

Veritas evidence is point-in-time (PR-scoped). Surface claims are continuously updated. Document the boundary explicitly:

- Veritas `surface.input` blocks: snapshots, immutable, scoped to a code change.
- Surface app-runtime claims: living, updated as evidence arrives, scoped to subject lifecycle.

Both validate against the same SHACL once linked-data Phase 2 ships, but they are *different graphs* — a Veritas evidence file's `surface.input` is not authoritative for production claims about the same subject.

### Privacy and PII

Taxes claims contain taxpayer financial data. Campfit claims contain camp/program contact info. Both apps are responsible for access control on their own Surface stores. Surface itself ships no auth model; the store contract takes a `viewer` parameter that consumers honor (or ignore at their own risk).

This is documented as a non-goal: Surface does not implement multi-tenant authn/authz. Apps that need it implement it in their store.

## What pauses while this plan runs

- **Linked-data roadmap Phase 2 (SHACL) pauses** until S1 stabilizes. Locking SHACL on schema v3 wastes work; v4 primitives are the right surface to constrain.
- **Roadmap Phase 5 (agent query surface) pauses** until S2 ships — that *is* the agent query surface, just with proper API design.
- **The cross-domain adapters in `src/adapters/{campfit,taxes}.ts` are frozen** until C1 retires them. No new features; only critical bug fixes.

## What proceeds in parallel

- **Linked-data Phase 1 (vocab publishing)** can ship anytime. Vocab is additive and term names are stable across schema versions.
- **Veritas-side work** in [veritas/docs/integration-plan.md](../../veritas/docs/integration-plan.md) runs concurrently. Track A items A4 and A6 are picked first specifically to unblock Veritas's expansion work.
- **Documentation work** (vision, principles, concepts) updates as primitives land — small, continuous, not phase-gated.

## Success criteria

This plan succeeds when:

1. Taxes' MCP server and web app read from Surface views, not raw fact tables.
2. Taxes' `ReturnPackage` generation produces a Surface trust report as a byproduct, not an after-the-fact projection.
3. Campfit's admin review UI reads from Surface views.
4. Campfit's public API exposes Surface trust reports as JSON-LD.
5. Both apps emit Veritas evidence for repo changes, with `surface.input` blocks that validate against Surface SHACL.
6. The audit's eight Surface gaps are either resolved (primitive added, integration uses it) or formally documented as out-of-scope (with rationale).
7. The `src/adapters/{campfit,taxes}.ts` files are gone, replaced by adapters in the actual app repos.
8. The cross-domain test (`tests/cross-domain-adapters.test.ts`) is rewritten against the moved-to-`examples/` adapters, with assertions about generic shapes rather than product names.

## Open questions

These need decisions before or during the relevant phase:

1. **Should `TrustReportStore` be sync or async?** The audit's real apps are all async (Postgres, SQLite via async drivers). Default to async; provide a sync wrapper for in-memory cases.
2. **Are candidate claims first-class or sub-claims?** First-class is simpler (one schema, one validator). Sub-claims are hierarchically cleaner. Audit recommendation: first-class with `parentClaimId`. Confirm during S1.
3. **Should `AssumptionClaim` carry the IRS-rule citation directly or via evidence?** Evidence is more general; direct citation is more ergonomic for tax-specific tooling. Recommendation: evidence for general schema, app-level helpers for ergonomic access.
4. **Does Campfit need its own primitives that Taxes doesn't?** Audit found Campfit's gaps were a strict subset of Taxes'. Confirm during S5.

---

## See also

- [grounding-audit.md](./grounding-audit.md) — full audit findings with code citations
- [roadmap.md](./roadmap.md) — overall Surface roadmap
- [linked-data-roadmap.md](./linked-data-roadmap.md) — W3C track
- [schema-versioning.md](./schema-versioning.md) — how schemas evolve
- [../../veritas/docs/integration-plan.md](../../veritas/docs/integration-plan.md) — corresponding Veritas plan
