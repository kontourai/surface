# Idea To Backlog: Portable Trust Analytics And Dashboard Layer

- **Artifact:** `trust-analytics-dashboard--idea-to-backlog.md`
- **Requested artifact path:** `.agents/kagents/trust-analytics-dashboard/trust-analytics-dashboard--idea-to-backlog.md`
- **Actual artifact path:** `agents/kagents/trust-analytics-dashboard/trust-analytics-dashboard--idea-to-backlog.md`
- **Date:** 2026-05-11
- **Phase:** shape
- **Decision state:** shaped, not implemented

## source_ideas

Raw input:

> Surface should add a mature dashboard / analytics layer that makes the trust substrate more valuable as more systems integrate. Shape this into executable backlog slices. Keep Surface product-neutral: downstream products own product-specific adapters and workflow vocabulary, while Surface owns portable trust primitives, reports, query surfaces, and derived trust analytics. Push back on accidental bundling; identify the thinnest meaningful slice; map dependencies; relate it to the current roadmap phases for agent query surface, human console, and hosted sink. Produce the expected .agents/kagents artifact and stop before implementation.

Related repo context:

- `docs/roadmap.md`: Phase 5 is agent query surface; Phase 6 is human console; Phase 7 is hosted sink.
- `docs/integration-plan.md`: Surface owns portable trust primitives and report generation; product repos own product-specific adapters, UI, runtime query wiring, and workflow language.
- `docs/concepts.md`: trust reports currently expose claims, evidence, freshness, status, fault lines, subject groups, coverage, confidence basis, and summary.
- `src/report.ts`: current `TrustReportSummary` is useful but not yet a dashboard-grade analytics/query contract.

Dedupe decision:

- This is not a new product adapter request.
- This is not a request to implement a hosted product console now.
- This is a shaping request for a portable analytics/query layer that later enables console and hosted trend surfaces.

## idea_inventory

| ID | Idea | Classification | Outcome | Reason |
| --- | --- | --- | --- | --- |
| I1 | Portable trust analytics projection over one `TrustReport` | feature | commit | Smallest independently valuable layer: transforms existing report data into dashboard/query-ready, product-neutral views. |
| I2 | Agent query surface for stale, missing, policy-bound, unsupported, disputed, and fault-line queries | feature | commit | Already roadmap Phase 5; analytics projection should expose stable query surfaces before human console work. |
| I3 | Human console dashboard for coverage map, stale zones, fault lines, evidence drilldowns, unsupported queue | feature / prototype | shape | Roadmap Phase 6; should consume I1/I2 rather than define product vocabulary itself. |
| I4 | Hosted sink for longitudinal reports, adapter runs, organization-wide trend analysis | feature / spike | research | Roadmap Phase 7; depends on local analytics/query contract and storage model. |
| I5 | Product-specific workflow dashboards, adapters, labels, and operational queues | parked / downstream-owned | park | Surface must remain product-neutral. Downstream products can build adapters and workflow vocabulary on top of Surface outputs. |
| I6 | Derived trust trend analytics across multiple report runs | feature | shape | Valuable but should not be bundled with first local slice; depends on a stable per-report analytics projection and hosted/local run history. |

## slice_candidates

### S1: Portable Report Analytics Projection V0

- **Idea:** I1
- **Thinnest meaningful slice:** Add a product-neutral analytics projection derived from a single trust report, available as a library API and CLI JSON output.
- **Why this is the thinnest slice:** It makes the substrate more valuable immediately without requiring a console, hosted sink, product adapter, or longitudinal storage.
- **Success signal:** Given existing example reports, Surface can emit stable analytics JSON containing coverage, stale zones, fault-line hotspots, high-impact unsupported claims, evidence depth, confidence distribution, and drilldown references back to claim/evidence/policy ids.
- **Non-goals:**
  - No React app or hosted UI.
  - No product-specific nouns such as case, facility, tax return, PR, customer, or workflow stage.
  - No database or historical trend store.
  - No adapter-specific parsing.
  - No score that obscures evidence, freshness, or conflict state.
- **Recommended priority:** P0.

### S2: Phase 5 Agent Query Commands On Top Of Analytics

- **Idea:** I2
- **Thinnest meaningful slice:** Implement `surface stale`, `surface missing`, and `surface policy` as stable query commands that consume the report/analytics projection and return machine-readable JSON plus concise summaries.
- **Success signal:** Agents can ask targeted questions without parsing the whole report: stale claims, unsupported high-impact claims, policy requirements, and evidence trails are returned with ids and source references.
- **Non-goals:**
  - No MCP resources until CLI behavior is stable.
  - No product-specific workflow routing.
  - No hosted auth or persistence.
- **Recommended priority:** P1 after S1 or in the same Phase 5 wave if S1 is scoped tightly.

### S3: Missing/Unsupported Claim Queue

- **Idea:** I2 / I3 bridge
- **Thinnest meaningful slice:** Define a portable queue projection for high-impact unsupported claims and missing proof requirements.
- **Success signal:** Both CLI and future console can show what needs review without inventing product workflow language.
- **Non-goals:**
  - No assignment system.
  - No product-specific review states.
  - No write-back mutations.
- **Recommended priority:** P1.

### S4: Static Local Human Console Prototype

- **Idea:** I3
- **Thinnest meaningful slice:** A local/static console that reads exported analytics JSON and renders coverage map, stale zones, fault lines, evidence drilldowns, and unsupported queue.
- **Success signal:** A human can inspect one report artifact faster than reading raw JSON, while every visual links back to claim/evidence/policy ids.
- **Non-goals:**
  - No hosted sink.
  - No live adapter runs.
  - No product-specific terms.
  - No account model.
- **Recommended priority:** P2, Phase 6 only after S1/S2 are stable.

### S5: Longitudinal Run Summary Contract

- **Idea:** I6
- **Thinnest meaningful slice:** Define a product-neutral per-run summary envelope that can be stored over time: report id, source, generatedAt, analytics version, aggregate metrics, and changed hotspots.
- **Success signal:** Multiple local report runs can be compared without a hosted service.
- **Non-goals:**
  - No hosted database.
  - No organization model.
  - No adapter-run scheduler.
- **Recommended priority:** P2/P3, before hosted sink.

### S6: Hosted Sink Trend Analytics Spike

- **Idea:** I4
- **Thinnest meaningful slice:** A research spike that evaluates storage shape, retention, privacy, tenancy, and query needs for longitudinal reports and adapter runs.
- **Success signal:** Written architecture recommendation with schema outline, privacy constraints, migration strategy, and a go/no-go for Phase 7.
- **Non-goals:**
  - No production hosted service.
  - No UI beyond diagrams/mock data.
  - No downstream product integrations.
- **Recommended priority:** P3, Phase 7.

## bundle_justification

Decision: split the work into separate slices.

Rationale:

- A mature dashboard is an outcome, not a single implementation slice.
- Agent queries, human console, and hosted sink have different delivery risks and roadmap phases.
- Product-specific adapters and workflow vocabulary are explicitly downstream-owned and must not be bundled into Surface.
- The first slice must strengthen the portable trust substrate; UI and hosted features should consume that substrate rather than define it.

Permitted bundle:

- S1 and a narrow part of S2 may be planned together if the same analytics projection directly powers `surface stale`, `surface missing`, and `surface policy`.

Rejected bundle:

- Do not bundle S1/S2 with S4/S6. A console or hosted sink would turn a portable analytics contract into app infrastructure before the local contract proves useful.

## dependency_map

| Slice | Blocks | Blocked by | Relationship |
| --- | --- | --- | --- |
| S1 Portable Report Analytics Projection V0 | S2, S3, S4, S5, S6 | Existing `TrustReport` contract | Hard dependency for dashboard-grade analytics. |
| S2 Agent Query Commands | MCP resources, agent integrations | S1 recommended; existing report contract minimally sufficient | Roadmap Phase 5. |
| S3 Missing/Unsupported Claim Queue | Human console unsupported queue | S1, part of S2 | Bridge between query surface and console. |
| S4 Static Local Human Console | Hosted console UX, product-specific downstream consoles | S1, S2, S3 | Roadmap Phase 6. |
| S5 Longitudinal Run Summary Contract | S6 hosted sink trend analytics | S1; maybe `surface diff` | Pre-Phase 7 contract hardening. |
| S6 Hosted Sink Trend Analytics Spike | Hosted sink implementation | S1, S5, local contract adoption evidence | Roadmap Phase 7 research. |
| I5 Product-specific workflow dashboards/adapters | none in Surface | Downstream product repos | Related-only; not Surface backlog. |

Roadmap mapping:

- **Phase 5: Agent query surface** should include S1 and S2. S1 is the substrate; S2 is the user-facing CLI/query surface.
- **Phase 6: Human console** should start with S3 and S4 only after S1/S2 are stable.
- **Phase 7: Hosted sink** should wait for S5 and S6, plus evidence that local reports and query surfaces are useful across multiple systems.

## decisions

| Decision | Rationale | Decision maker | Date |
| --- | --- | --- | --- |
| Split analytics substrate, query commands, console, and hosted sink into separate backlog slices. | They have different risk profiles and roadmap phases; bundling would obscure the thinnest valuable Surface-owned work. | Codex shaping recommendation for Brian review | 2026-05-11 |
| Keep product-specific adapters and workflow vocabulary out of Surface scope. | Existing integration plan says downstream products own product extraction, product docs, runtime query wiring, and product UI. | Codex applying repo boundary | 2026-05-11 |
| Recommend S1 as the thinnest meaningful slice. | It creates portable value for agents and future dashboards without requiring UI or hosting. | Codex shaping recommendation for Brian review | 2026-05-11 |
| Do not create GitHub issues yet. | The user asked for `.agents/kagents` artifact and to stop before implementation; issue creation needs explicit commitment/priority decision. | Codex | 2026-05-11 |

## opportunity_briefs

### O1: Portable Trust Analytics

- **Problem:** Raw trust reports are inspectable but not yet organized into dashboard-grade views that help humans or agents identify coverage gaps, stale zones, fault lines, and unsupported high-impact claims quickly.
- **Stakeholder:** Surface consumers, agent integrations, future console users, downstream products that need product-neutral trust telemetry.
- **Outcome:** A stable analytics projection makes each new adapter/system integration increase Surface value without adding product-specific code to Surface.
- **Confidence:** high.
- **Size:** medium.
- **Tradeoff:** Displaces premature UI/hosting work; requires discipline around neutral naming and stable JSON shape.

### O2: Agent Query Surface

- **Problem:** Agents should not need to parse full reports to answer operational trust questions.
- **Stakeholder:** Agent runtimes, CI workflows, downstream products.
- **Outcome:** CLI queries return narrow, stable slices for stale, missing, unsupported, policy-bound, and evidence-trail questions.
- **Confidence:** high.
- **Size:** medium.
- **Tradeoff:** Requires S1 shape discipline so CLI commands are not ad hoc filters.

### O3: Human Console

- **Problem:** Humans need fast visual inspection of report health and drilldowns.
- **Stakeholder:** Operators, reviewers, product teams adopting Surface.
- **Outcome:** Console consumes exported analytics/query artifacts rather than embedding product workflow semantics.
- **Confidence:** medium.
- **Size:** large.
- **Tradeoff:** UI work before S1/S2 would freeze immature data contracts.

### O4: Hosted Sink And Trends

- **Problem:** Longitudinal trust trends require durable report history and adapter-run metadata.
- **Stakeholder:** Organizations integrating multiple systems, governance teams.
- **Outcome:** Hosted storage can show whether trust coverage improves or degrades as systems integrate.
- **Confidence:** medium-low until local usage validates the contract.
- **Size:** large.
- **Tradeoff:** Hosting introduces privacy, retention, tenancy, migration, and operational burden.

## shaped_work

### Backlog Slice 1: Portable Report Analytics Projection V0

- **Status:** ready for planning after human approval.
- **Scope:**
  - Define a product-neutral analytics output derived from `TrustReport`.
  - Include coverage by surface and status, stale zones, fault-line hotspots, high-impact unsupported claims, confidence/evidence depth distribution, subject-group conflict indicators, and drilldown ids.
  - Expose through public API and a CLI command or `surface report --format analytics` decision.
  - Document the analytics vocabulary as portable Surface terms.
- **Non-goals:**
  - No UI.
  - No hosted persistence.
  - No longitudinal trend calculations beyond fields needed for future trend summaries.
  - No product-specific adapters or workflow names.
- **Requirements:**
  - Output must be deterministic for a fixed report.
  - Every aggregate must link back to claim, evidence, policy, fault-line, or subject-group ids.
  - Analytics must preserve the difference between stale, disputed, unsupported, missing proof, provenance gaps, policy violations, and contradictions.
  - The contract must be stable enough for agents and future console code to consume.
  - Existing report JSON and summary behavior must remain compatible.
- **Acceptance criteria:**
  - Example fixtures produce analytics JSON snapshots in tests.
  - Tests cover at least one stale zone, one high-impact unsupported claim, one fault-line hotspot, and one evidence-depth/confidence aggregate.
  - Documentation explains the analytics terms without product-specific nouns.
  - CLI output can be consumed by scripts without scraping human text.
- **Verification expectation:** unit tests for analytics derivation, CLI tests for output format, docs test if existing docs test pattern applies.
- **Release/evidence expectation:** changelog/docs note that analytics is a portable projection, not a scoring system.

### Backlog Slice 2: Phase 5 Agent Query Commands

- **Status:** ready after Slice 1 shape is accepted.
- **Scope:**
  - Add `surface stale`, `surface missing`, and `surface policy` commands or equivalent query subcommands.
  - Return JSON by default or via `--format json`, with concise summary output available.
  - Reuse analytics/report derivation instead of reimplementing filters per command.
- **Non-goals:**
  - No MCP resources yet.
  - No write operations.
  - No hosted lookup.
- **Requirements:**
  - Commands accept native Surface input and registered adapters consistently with `surface report`.
  - Query results include ids and source references needed for agent follow-up.
  - Missing/unsupported query distinguishes no evidence, missing required evidence, missing method, and missing policy.
- **Acceptance criteria:**
  - CLI tests cover native input and at least one adapter fixture.
  - Query outputs are documented with examples.
  - Agents can retrieve stale and missing claims without parsing the full report.

### Backlog Slice 3: Portable Unsupported Review Queue

- **Status:** shaped, not first.
- **Scope:**
  - Define queue entries for high-impact unsupported claims and missing proof requirements.
  - Include severity, surface, subject, claim id, policy id, required proof, current evidence, and reason codes.
  - Expose as analytics section and query output.
- **Non-goals:**
  - No assignment, comments, review workflow, or downstream status vocabulary.
  - No mutation API.
- **Requirements:**
  - Queue entries are portable across repo governance, field-attested records, fact resolution, dependency audit, and future adapters.
  - Queue sort order is deterministic and based on severity, impact, and recency fields that already exist in the trust contract.
- **Acceptance criteria:**
  - Fixture tests prove queue entries for multiple generic adapter patterns.
  - Docs call this an unsupported-claim queue, not a product task queue.

### Backlog Slice 4: Static Local Human Console

- **Status:** defer until Phase 6.
- **Scope:**
  - Render exported analytics JSON as coverage map, stale zones, fault-line list, evidence drilldowns, and unsupported queue.
  - Keep console local/static first.
- **Non-goals:**
  - No hosted login, database, organization settings, or product adapters.
  - No product-specific labels.
- **Requirements:**
  - Console consumes exported JSON artifacts; it does not become the source of analytics truth.
  - Every visual element has a drilldown path to report ids.
- **Acceptance criteria:**
  - Static demo works with checked-in examples.
  - Accessibility and responsive layout checks pass.
  - No product-specific vocabulary appears in console chrome.

### Backlog Slice 5: Longitudinal Run Summary Contract

- **Status:** defer until after local analytics/query adoption.
- **Scope:**
  - Define a compact trend-ready run summary derived from analytics output.
  - Include report id, source, generatedAt, schema/analytics version, key aggregate counts, and changed hotspot references.
- **Non-goals:**
  - No hosted persistence.
  - No adapter run scheduling.
- **Requirements:**
  - Multiple summaries can be diffed locally.
  - The summary does not duplicate full evidence payloads unless explicitly linked.
- **Acceptance criteria:**
  - Two example report runs can produce comparable summaries.
  - Docs explain what is safe to store long-term and what may contain sensitive evidence.

### Backlog Slice 6: Hosted Sink Trend Analytics Spike

- **Status:** research only, Phase 7.
- **Scope:**
  - Investigate storage, retention, privacy, tenancy, query, and migration concerns for hosted report/run history.
  - Produce architecture recommendation and issue decomposition.
- **Non-goals:**
  - No production hosted implementation.
  - No UI implementation.
- **Requirements:**
  - Explicitly evaluate evidence payload sensitivity and whether hosted sink stores full reports, summaries, or references.
  - Define rollback/export/delete posture.
- **Acceptance criteria:**
  - Spike report recommends proceed/defer/reject.
  - Follow-up slices are small enough for planning and evidence gates.

## risk_release_notes

| Slice | Risk class | Rollout | Rollback | Observability / evidence |
| --- | --- | --- | --- | --- |
| S1 | Medium: public contract expansion | Add as additive API/CLI output; preserve existing report behavior | Remove experimental CLI/API export before stabilization if contract is wrong | Snapshot tests, fixture coverage, docs examples |
| S2 | Medium: CLI surface expansion | Add commands after S1 stabilizes | Keep `surface report` untouched; commands can be marked experimental initially | CLI tests, examples, agent-readable JSON |
| S3 | Medium: prioritization semantics | Add as analytics/query projection only | Remove or rename queue projection before UI depends on it | Cross-adapter fixture tests |
| S4 | Medium-high: UI scope and interpretation risk | Static/local console reading exported JSON | Console can be dropped without changing report contract | Playwright checks, accessibility checks, fixture demos |
| S5 | Medium: trend contract may imply persistence | Local summary contract first | Keep summaries opt-in and versioned | Diff tests, privacy docs |
| S6 | High if implemented, low as spike | Research artifact only | No production rollout | Architecture review, privacy review |

## backlog_links

No GitHub issues were created in this pass.

Reason:

- The user requested a `.agents/kagents` shaping artifact and to stop before implementation.
- The backlog slices above are executable issue drafts, but issue creation should wait for human approval of priority and bundle/split decisions.

Suggested issue drafts after approval:

1. `Phase 5: Add portable trust analytics projection v0`
2. `Phase 5: Add agent query commands for stale, missing, and policy-bound claims`
3. `Phase 5/6 bridge: Add portable unsupported-claim queue projection`
4. `Phase 6: Build static local human console over analytics JSON`
5. `Pre-Phase 7: Define longitudinal run summary contract`
6. `Phase 7 spike: Hosted sink trend analytics architecture`

## parked_or_rejected

| Item | Decision | Reason | Revisit trigger |
| --- | --- | --- | --- |
| Product-specific dashboard vocabulary | Park downstream | Surface must remain product-neutral; downstream products own adapters, workflow nouns, and product UI interpretation. | A downstream product defines its own adapter/console and needs a missing portable primitive. |
| Hosted sink implementation now | Park | Local analytics/query contract is not stable yet; hosting adds privacy and operational scope. | S1/S2 are stable and at least two systems produce useful report histories. |
| Full mature dashboard as first slice | Reject as bundle | Too broad; combines analytics contract, agent queries, UI, persistence, and product interpretation. | Only reconsider after Phase 5 primitives prove too fragmented to deliver the intended outcome. |
| Single trust score | Reject | Would hide evidence, freshness, and conflict state; conflicts with Surface vision. | Revisit only as a secondary sort/risk indicator with transparent components, not as the main trust state. |

## open_questions

| Question | Owner | Needed evidence |
| --- | --- | --- |
| Should S1 be exposed as `surface analytics`, `surface report --format analytics`, or both API-first plus CLI format? | Brian / implementation planner | CLI ergonomics review against existing `surface report` pattern. |
| What is the stable analytics schema versioning story? | Implementation planner | Review existing schema versioning docs and decide whether analytics has its own version. |
| Which analytics views are mandatory for V0 versus later? | Brian / product shaping | Agreement on V0 acceptance criteria and examples. |
| Should `surface missing` mean missing evidence, missing policy, unsupported high-impact claims, or all with reason codes? | Brian / implementation planner | CLI command naming decision and example outputs. |
| What privacy guarantees should trend-ready summaries make before Phase 7? | Brian / architecture reviewer | Review `SURFACE-PRIVACY.md` and expected hosted sink posture. |

## next_gate

- **Gate name:** Human backlog approval
- **Status:** blocked
- **Reason:** Shaping is complete, but implementation and GitHub issue creation should wait for explicit approval of the split, S1 priority, and query command shape.

Gate checklist:

- Idea Gate: pass. Every idea has an outcome and reason.
- Slice Gate: pass. Each candidate has a thinnest meaningful slice, non-goals, and dependency relationships.
- Shape Gate: pass for S1/S2/S3; partial for S4/S5/S6 because they intentionally defer until later phases.
- Priority Gate: pass as recommendation, pending human decision.
- Backlog Gate: blocked pending explicit approval to create GitHub issues.
