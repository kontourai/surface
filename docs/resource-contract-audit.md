# Resource Contract Audit

Issue: [kontourai/surface#7](https://github.com/kontourai/surface/issues/7)

This audit inventories Surface contracts against the Kontour Resource Contract direction. It is docs-only: it does not change runtime behavior, schemas, generated files, package metadata, dependencies, claim evaluation internals, or Kubernetes runtime behavior.

## Sources

- Resource Contract decision: [ADR 0005: Kubernetes-Inspired Kontour Resource Contracts](https://github.com/kontourai/flow-agents/blob/main/docs/adr/0005-kubernetes-inspired-resource-contracts.md) in `kontourai/flow-agents`.
- Local ADR source checked during implementation: `/Users/brian/dev/github/kontourai/flow-agents/docs/adr/0005-kubernetes-inspired-resource-contracts.md`.
- Required idea-to-backlog source artifact: `/Users/brian/dev/github/kontourai/flow-agents/.flow-agents/kagents/kontour-resource-contract-audits/kontour-resource-contract-audits--idea-to-backlog.md`.
  - Re-check result on 2026-06-08: `NOT_VERIFIED`; the file was not present locally.
- Surface source references: [Schemas](schemas.md), [Open Trust Format and Claim Package Shape](specs/open-trust-format.md), [CLI](cli.md), [Trust Analytics Projection](analytics.md), [Surface Console](console.md), [Producer Extension API](extension-api.md), [Adapters](adapters.md), [Consumer SDK](guides/consumer-sdk.md), [Fixtures](fixtures.md), [src/types.ts](../src/types.ts), [src/index.ts](../src/index.ts), [schemas/](../schemas/), and [examples/](../examples/).

## Resource Contract Default

ADR 0005 says new durable, agent-facing, provider-facing, CLI-facing, cross-product, or user-authored Kontour contracts default to a Kubernetes-inspired Resource Contract shape:

- `apiVersion` and `kind` identify the product namespace and resource type.
- `metadata` carries identity, labels, annotations, ownership, timestamps, source references, and integrity anchors.
- `spec` carries desired intent, such as a claim package target, claim bundle, policy, adapter input, console configuration, or requested output.
- `status` carries observed facts, such as generated trust state, evidence coverage, projection results, query results, active authority state, or validation outcomes.
- `status.conditions[]` summarizes important observed states with stable type, status, reason, message, severity, timestamps, and observed generation where useful.

For Surface, the intent/status split must not hide evidence. Claims, evidence, policies, events, Authority Trace, and trust reports remain separately inspectable. A Resource Contract wrapper is useful when it gives durable product state stable identity, ownership, lifecycle, status conditions, or CLI/provider readability. A wrapper is harmful when it obscures the native Open Trust Format graph or turns compact read-only projections into fake control-plane resources.

## Classification Vocabulary

| Recommendation | Meaning |
| --- | --- |
| `migrate` | Adopt a `surface.kontourai.io/v1alpha1` Resource Contract or compatibility wrapper in a future slice while preserving current readers until a versioned break is accepted. |
| `map` | Keep the current contract as the public shape, but document or test how it maps into Resource-shaped records used by other Kontour products. |
| `exception` | Keep the product-native shape because a Resource envelope would make the contract less clear, less portable, noisier, or less faithful to the Open Trust Format. |
| `internal` | Treat as implementation-only or ephemeral helper shape; do not publish as a durable Resource Contract. |

Audience and durability:

- `durable/exported`: source-controlled, generated, or API-facing records that humans, agents, CLIs, providers, or products can inspect.
- `user-authored`: records written or reviewed by a human or producer author.
- `CLI-facing`: JSON or stable stdout consumed by automation.
- `provider-facing`: records that bind Surface to producer packages, runtime adapters, external tools, or downstream products.
- `cross-product`: records consumed by Veritas, Flow Agents, Builder Kit, or other Kontour products.
- `internal`: transient helper types, projections, or function arguments without durable identity.

## Inventory

| Contract family | Owner | Current shape and source refs | Durability / audience | Recommendation | Rationale |
| --- | --- | --- | --- | --- | --- |
| Claim Package / `TrustInput` | Surface kernel and producer boundary | `schemaVersion`, `source`, `claims[]`, `evidence[]`, `policies[]`, `events[]`, optional `identityLinks`, `claimGroups`, and `authorityTrace`. See [Open Trust Format](specs/open-trust-format.md), [Schemas](schemas.md#trust-input), [src/types.ts](../src/types.ts), and [schemas/trust-input.schema.json](../schemas/trust-input.schema.json). | `durable/exported`, `provider-facing`, `cross-product`; producer-emitted input contract. | `migrate` | A Resource wrapper such as `TrustInputPackage` can give the package stable identity, producer metadata, integrity anchors, desired evaluation target in `spec`, and validation/projection state in `status` while preserving the native arrays as inspectable trust graph content. |
| Trust Report / Trust Snapshot output | Surface kernel | `TrustReport extends TrustInput` with generated `id`, `generatedAt`, normalized claim statuses, evidence requirements, transparency gaps, derivation change records, subject groups, claim group rollups, and summary. See [Schemas](schemas.md#trust-report), [src/types.ts](../src/types.ts), [src/report.ts](../src/report.ts), and [schemas/trust-report.schema.json](../schemas/trust-report.schema.json). | `durable/exported`, `CLI-facing`, `cross-product`; primary generated report. | `migrate` | A Resource-shaped `TrustReport` or `TrustSnapshot` can separate requested report generation from observed trust status and conditions such as `Generated`, `EvidenceComplete`, `ConflictsPresent`, and `DerivationBlocked`, without hiding the underlying claims and evidence. |
| Core Claim records | Surface Open Trust Format | `Claim` contains subject, surface, claim type, field or behavior, value, timestamps, status, policy link, confidence basis, materiality, integrity, aliases, derivation links, and metadata. See [Schemas](schemas.md#claim), [Open Trust Format](specs/open-trust-format.md#core-records), [src/types.ts](../src/types.ts), and [schemas/claim.schema.json](../schemas/claim.schema.json). | `durable/exported`, `provider-facing`, `cross-product`; native graph primitive. | `exception` | A Resource envelope around every claim would make portable claim packages much noisier and obscure the graph-native relationship between claims, evidence, policies, and events. Claims are clearer as compact Open Trust Format primitives inside a package or report. |
| Evidence records | Surface Open Trust Format | `Evidence` links to `claimId`, source refs, summary/excerpt, method, collection metadata, integrity, support strength, optional execution trace, and metadata. See [Schemas](schemas.md#evidence), [Open Trust Format](specs/open-trust-format.md#core-records), [src/types.ts](../src/types.ts), and [schemas/evidence.schema.json](../schemas/evidence.schema.json). | `durable/exported`, `provider-facing`, `cross-product`; native graph primitive. | `exception` | Evidence must stay close to claims and policies for traceability. Wrapping every evidence item as a top-level Resource would make evidence packages harder to inspect and could hide support-strength semantics behind boilerplate. |
| Verification Policy records | Surface Open Trust Format | `VerificationPolicy` defines required evidence, methods, corroboration, acceptance criteria, review authority, validity, staleness triggers, conflict rules, impact, and `collectWhen`. See [Schemas](schemas.md#verification-policy), [src/types.ts](../src/types.ts), and [schemas/verification-policy.schema.json](../schemas/verification-policy.schema.json). | `durable/exported`, `user-authored` in claim stores or producer packages, `provider-facing`. | `map` | Policies are native trust graph records. Resource shape helps when a producer manages a durable policy bundle, but the policy item itself is clearer as Open Trust Format content referenced by claims and evidence. |
| Verification Event records | Surface Open Trust Format | Append-only claim status transitions with claim id, status, actor, method, evidence ids, timestamps, and notes. See [Schemas](schemas.md#verification-event), [src/types.ts](../src/types.ts), and [schemas/verification-event.schema.json](../schemas/verification-event.schema.json). | `durable/exported`, `provider-facing`; native lifecycle trace. | `exception` | Events are compact history entries in the trust graph. A Resource per event would add identity and status wrappers to records whose entire purpose is already to be append-only observed status. |
| Authority Trace records | Surface kernel and producer boundary | `AuthorityTrace` records actor/system authority, subject, authority type/ref, source, observed time, linked evidence/claims, validity, revocation, integrity, and metadata. See [Schemas](schemas.md#authority-trace), [Open Trust Format](specs/open-trust-format.md#authority-trace), and [src/types.ts](../src/types.ts). | `durable/exported`, `provider-facing`, `cross-product`; authority context. | `migrate` | Authority Trace has enough lifecycle and status to benefit from Resource conditions such as `Active`, `Expired`, `Revoked`, `IntegrityVerified`, and `EvidenceLinked`, while keeping the native `authorityTrace[]` package field for compatibility. |
| Claim Groups, requirements, and rollups | Surface kernel | Input `claimGroups[]` and nested `requirements[]`; report-derived `claimGroupRollups[]`. See [Schemas](schemas.md#claim-groups), [src/types.ts](../src/types.ts), and [src/claim-groups.ts](../src/claim-groups.ts). | `durable/exported`, `provider-facing`; grouping and requirement-set model. | `map` | Claim groups are framework or requirement-set views over claim ids. A Resource mapping can clarify desired group definitions versus observed rollup status, but the current group records should remain native package content. |
| Claim Store / Claim Definitions | Surface claim authoring | `veritas.claims.json` with `schemaVersion: 1`, `producer`, `claims[]`, and `policies[]`; claim commands read/write it. See [CLI](cli.md#claim-store-flags), [Claim Authoring](claim-authoring.md), [src/types.ts](../src/types.ts), [src/store.ts](../src/store.ts), and [src/claim-authoring.ts](../src/claim-authoring.ts). | `durable/user-authored`, `CLI-facing`, `provider-facing`; local authoring store. | `migrate` | A Resource-shaped `ClaimStore` or `ClaimBundle` can separate desired authored claims and policies from validation status, generated ids, authoring diagnostics, and producer metadata. |
| Open Trust Format / Claim Package commitment | Surface product contract | Product-level portability commitment: schema-first, exportable, embeddable, locally inspectable, no hosted dependency. See [Open Trust Format](specs/open-trust-format.md). | `cross-product`, `provider-facing`; product contract, not one JSON file. | `map` | This is the umbrella contract that Resource-shaped records should map to, not replace. The native Open Trust Format remains the clearer public model for claims, evidence, policies, events, and trace records. |
| Trust Analytics Projection | Surface analytics | `TrustAnalyticsProjection` derived from a `TrustReport`: coverage by surface, stale/disputed queues, gaps, confidence basis, authority trace projection, action queues, and attestation validity. See [Trust Analytics Projection](analytics.md), [CLI](cli.md#commands), [src/types.ts](../src/types.ts), and [src/analytics.ts](../src/analytics.ts). | `CLI-facing`, `cross-product`, read-model; derived JSON projection. | `map` | The projection is derived evidence intelligence, not desired state. A mapping to Resource `status` can feed consoles and agents, but the native projection is clearer for local query and queue consumers. |
| Derivation drilldown / query read models | Surface query layer | `surface get` returns claim, evidence, authority trace, events, policy, evidence requirement, transparency gaps, and `derivation`; implementation uses `DerivedClaimDrilldown`. See [CLI](cli.md#contract), [src/derivation-drilldown.ts](../src/derivation-drilldown.ts), and [src/types.ts](../src/types.ts). | `CLI-facing`, read-model; ephemeral query output. | `map` | Query output should map to report status and evidence refs but not become durable resources by default. The drilldown is clearest as a focused read model over existing report fields. |
| Surface Console run read model | Producer-owned read model consumed by Surface Console | Producers write `.surface/runs/<run-id>.console.json` and `latest.json`; console serves `/api/read-model`, `/api/console-model`, and run lists. See [Surface Console](console.md#run-directory-convention), [src/console/server.ts](../src/console/server.ts), and [src/console/types.ts](../src/console/types.ts). | `durable/generated`, `provider-facing`, `cross-product`; local console input. | `migrate` | A Resource-shaped `SurfaceRun` can distinguish producer-owned read-model intent and observed console availability, selected run, generated paths, and conditions such as `ReadModelLoaded` and `ProjectionBuilt`. |
| Surface Console projection | Surface Console | `SurfaceConsoleProjection` with project, run, narrative, metrics, claims, surface counts, and read model. See [Surface Console](console.md), [src/console/projection.ts](../src/console/projection.ts), and [src/console/types.ts](../src/console/types.ts). | read-model, UI-facing; derived from run model. | `map` | The projection is a UI/read-model contract over existing trust state. Resource wrapping would make it less useful for the UI; map it to `SurfaceRun.status.consoleProjection` if a durable run resource is added. |
| CLI report JSON and query outputs | Surface CLI | `surface report --format json|summary|linked|analytics`, plus `surface stale`, `missing`, `get`, `policy`, and `claim`. See [CLI](cli.md). | `CLI-facing`, agent-facing, sometimes durable when redirected to files. | `migrate` | CLI JSON that creates or returns durable records should include Resource summary wrappers or resource refs so agents can locate `kind`, identity, status, and artifacts consistently. |
| Linked output / JSON-LD-style report | Surface linked data export | `LinkedTrustReport extends TrustReport` with `@context`; stable Surface vocab URL. See [src/linked.ts](../src/linked.ts), [CLI](cli.md#commands), and [Linked Data Roadmap](linked-data-roadmap.md). | `CLI-facing`, `provider-facing`, graph-oriented export. | `map` | Linked output already has graph identity and vocabulary semantics. Resource wrapping every linked report would duplicate identity; map Resource metadata into linked context fields where useful. |
| Adapter registry and adapter inputs | Surface producer extension boundary | `Adapter<Input>` has `name`, optional `defaultFixture`, and `adapt(record): TrustInput`; docs keep adapter inputs separate from core schema. See [Adapters](adapters.md), [Schemas](schemas.md#adapter-inputs), [src/adapter.ts](../src/adapter.ts), and [examples/external-adapter/README.md](../examples/external-adapter/README.md). | `provider-facing`, extension API; producer-owned input shapes. | `map` | Adapter inputs remain producer-owned. Surface should document mapping from adapter output to Resource-shaped `TrustInputPackage`, but forcing all adapter inputs into Surface resources would break the boundary. |
| Producer Extension API / branding | Surface Console and producer extension boundary | `SurfaceExtension` includes producer name, display name, vocab, theme, claim types, and policy templates. See [Producer Extension API](extension-api.md), [src/types.ts](../src/types.ts), and [src/extension.ts](../src/extension.ts). | `provider-facing`, extension API, UI authoring input. | `migrate` | Durable producer extensions can benefit from `metadata` identity, desired vocabulary/theme in `spec`, and validation/registration state in `status`, while runtime in-process registry helpers stay implementation details. |
| Consumer SDK builder drafts | Surface producer authoring helper | `TrustInputBuilderArgs`, claim/evidence/policy/event drafts, and fluent helpers emit `TrustInput`. See [Consumer SDK](guides/consumer-sdk.md) and [src/consumer-sdk.ts](../src/consumer-sdk.ts). | exported API, not durable by itself. | `internal` | Builder drafts are convenience inputs for constructing native TrustInput packages. Giving them Resource identity would confuse transient authoring state with durable product contracts. |
| Examples and fixtures | Surface docs/tests | JSON examples under [examples/](../examples/) and fixture docs. See [Fixtures](fixtures.md). | test/docs fixtures; some provider-facing examples. | `exception` | Fixtures should remain compact examples of the native Open Trust Format. Resource envelopes around every example would make examples harder to read and weaken their role as minimal schema fixtures. |
| JSON Schema files | Surface schema package | `schemas/claim.schema.json`, `evidence.schema.json`, `verification-policy.schema.json`, `verification-event.schema.json`, `trust-input.schema.json`, and `trust-report.schema.json`. See [Schemas](schemas.md) and [schemas/](../schemas/). | `durable/exported`, `provider-facing`; validation contracts. | `map` | Schemas validate native trust records and reports. Resource wrappers need their own schemas in future slices, but current Open Trust Format schemas should not be renamed or removed. |
| Eval Summary | Producer run review summary | Optional producer-agnostic review summary embedded in a run snapshot. See [Schemas](schemas.md#eval-summary), [Surface Console](console.md#eval-summary), and [src/types.ts](../src/types.ts). | generated/read-model, provider-facing when present. | `map` | Eval Summary is observed review status and maps naturally into Resource `status`, but it is not a standalone desired-state contract. Keep it embedded unless a future eval resource needs lifecycle tracking. |
| Internal implementation helper types | Surface implementation modules | Examples include `DerivationOutcome`, `TrustSnapshotDerivation`, `TrustTraceAnalysis`, `IdentityIndex`, queue item helpers, runtime config internals, and validation helper objects. See [src/derivation.ts](../src/derivation.ts), [src/trust-snapshot.ts](../src/trust-snapshot.ts), [src/trace-analysis.ts](../src/trace-analysis.ts), [src/identity.ts](../src/identity.ts), and [src/console/types.ts](../src/console/types.ts). | `internal`; transient computation or UI implementation. | `internal` | These types have no durable identity or provider contract. Resource wrapping them would imply compatibility and lifecycle guarantees the implementation does not promise. |

## Where Resource Contracts Help

Resource shape improves Surface where a record needs identity, lifecycle, status conditions, provider readability, or cross-product routing:

- Trust inputs: `metadata` can identify producer, source, integrity scope, ownership, and package name while `spec` carries the native Claim Package and `status` records validation and projection results.
- Trust reports and snapshots: `status.conditions[]` can summarize generated state without requiring agents to infer everything from summary counters.
- Claim bundles and claim stores: `spec` can hold authored desired claims and policies; `status` can hold validation errors, generated ids, and authoring diagnostics.
- Authority Trace: `status.conditions[]` can make active, expired, revoked, integrity-verified, and evidence-linked states easy for agents and providers to inspect.
- CLI durable outputs: resource refs can let automation locate artifacts and status without bespoke parsing for every command.
- Surface Console run models: a run resource can separate producer-owned run metadata from Surface's derived console projection.

Resource shape should not replace the Open Trust Format graph. The native arrays of claims, evidence, policies, events, and trace records remain the portable truth content. Resource Contracts should wrap packages, bundles, runs, or generated outputs where lifecycle and ownership matter.

## Exception Rationales

- Core Claim records: exception because they are graph nodes inside a portable package. A Resource per claim would add repetitive metadata and make relationships harder to scan.
- Evidence records: exception because evidence support, source refs, and `supportStrength` are clearest next to the claim graph they support. A Resource per evidence item would obscure simple claim-to-evidence traversal.
- Verification Event records: exception because events are already append-only observed transitions. Resource status around each event would duplicate the event's own purpose.
- Examples and fixtures: exception because their value is compact readability and schema coverage. Wrapping every fixture would make examples noisier and less useful as minimal input/output artifacts.

## Migration Slices

Every `migrate` recommendation above needs its own implementation slice. Suggested order:

1. Trust Input Package resource slice
   - Add `surface.kontourai.io/v1alpha1`, `kind: TrustInputPackage` schema or compatibility wrapper.
   - Preserve current `TrustInput` arrays and schema validation.
   - Verify with `schemas/trust-input.schema.json` fixtures, `examples/surface-fixtures.json`, `npm run typecheck`, `npm test`, `npm run docs:build`, and backward-compatibility checks for `surface report --input`.

2. Trust Report / Trust Snapshot resource slice
   - Add `kind: TrustReport` or `kind: TrustSnapshot` wrapper for generated output, with generation request in `spec` and observed trust summary/conditions in `status`.
   - Verify with report fixtures, CLI `surface report --format json`, `surface:summary`, schema validation, `npm test`, and docs examples.

3. Authority Trace resource/status slice
   - Add a first-class Resource mapping for Authority Trace records or embed Authority Trace conditions in TrustInput/TrustReport status.
   - Verify active/expired/revoked/integrity cases with analytics tests, Authority Trace examples, and `npm run verify`.

4. Claim Store / Claim Bundle resource slice
   - Wrap `veritas.claims.json` as `kind: ClaimBundle` or `kind: ClaimStore`, preserving existing `schemaVersion: 1` compatibility.
   - Verify `surface claim list/add/edit/remove/validate`, store migration fixtures, policy reference validation, and `npm test`.

5. CLI resource summary slice
   - Add Resource-shaped summaries or refs for durable CLI outputs from `surface report`, `surface claim`, and query commands where they return persisted artifacts.
   - Verify CLI JSON snapshots, query command behavior, `npm run typecheck`, and `npm test`.

6. Surface Console run resource slice
   - Represent `.surface/runs/<run-id>.console.json` and `latest.json` as `kind: SurfaceRun` or a compatible wrapper with `status.consoleProjection`.
   - Verify console server run selection, `/api/read-model`, `/api/console-model`, `/api/runs`, docs build, and console-kit asset checks.

7. Producer Extension resource slice
   - Add a durable `kind: SurfaceExtension` resource for producer vocab/theme/claim types/policy templates while keeping `registerExtension()` as the runtime registration API.
   - Verify extension registry behavior, Console config projection, claim authoring UI metadata, and `npm test`.

## Mapping And Deferred Slices

- Verification Policy records: map policy bundles into `spec.policies` for package/bundle resources, but keep individual policies as native Open Trust Format records.
- Claim Groups: map group definitions to `spec.claimGroups` and rollups to `status.claimGroupRollups` when package/report resources exist.
- Open Trust Format: keep as the product-level portability commitment and document how each Resource wrapper preserves native graph fields.
- Trust Analytics Projection: map into TrustReport or SurfaceRun status after the report/run resource shapes stabilize.
- Derivation drilldown and query read models: keep as read-only projections over a report; add resource refs only if query outputs become durable artifacts.
- Linked output: map Resource metadata to JSON-LD context only after linked-data roadmap work defines stable vocabulary terms.
- Adapter inputs: keep producer-owned and map only adapter output to TrustInputPackage.
- JSON Schemas: keep current schemas for native records; add wrapper schemas alongside them rather than changing native schemas in-place.
- Eval Summary: map to report/run status only if eval lifecycle becomes a durable Surface-owned record.

## Internal Types Scoped Out

Internal implementation types are intentionally not migrated:

- derivation helpers such as `DerivationOutcome`
- trust snapshot derivation return objects such as `TrustSnapshotDerivation`
- trace-analysis summaries used to build analytics
- identity indexes and canonicalization helpers
- Console runtime config internals and UI projection helper objects
- consumer SDK draft types before they are built into `TrustInput`

These objects are useful control-flow and computation shapes. They do not have stable file paths, user authorship, provider identity, or lifecycle status. Publishing them as Resource Contracts would create false stability and make the implementation harder to evolve.

## Open Questions And Risks

- Backward compatibility: existing producers consume `TrustInput`, `TrustReport`, and schema files directly. Resource wrappers need compatibility readers or explicit versioning.
- Namespace discipline: Resource kinds should use `surface.kontourai.io/v1alpha1` and should not claim ownership of Veritas, Flow, Flow Agents, Builder Kit, or other product semantics.
- Evidence preservation: wrappers must link or embed native evidence records without hiding them in generic metadata.
- Linked data: JSON-LD output already has graph identity; Resource metadata should not fork or conflict with linked-data vocabulary decisions.
- Console read models: producer run files are practical local artifacts. A Resource wrapper must improve discoverability and status without making the local Console harder to use.

## Publish And Verification Notes

- This audit is docs-only. It does not change schemas, runtime behavior, generated files, package manifests, dependencies, claim evaluation internals, or Kubernetes runtime behavior.
- The required idea-to-backlog source artifact is `NOT_VERIFIED` because `/Users/brian/dev/github/kontourai/flow-agents/.flow-agents/kagents/kontour-resource-contract-audits/kontour-resource-contract-audits--idea-to-backlog.md` was not present locally on 2026-06-08.
- Future migration PRs should cite this audit, ADR 0005, and the exact migrated contract family. Each should include schema fixture validation, CLI compatibility evidence, report/query behavior evidence, and backward-compatibility notes.
