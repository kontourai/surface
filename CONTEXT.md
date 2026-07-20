# Kontour Surface

Kontour Surface is the product-facing integration layer that turns
Hachure-compatible claims and evidence into deterministic trust reports and
inspectable product surfaces. Hachure owns the product-neutral format and its
normative semantics; this glossary defines the language users and agents should
share when discussing Surface's integration behavior.

## Language

**Surface**:
The Kontour integration surface for making product claims, evidence, policies,
freshness, and conflicts inspectable by humans and agents. Surface constructs,
validates, derives, and projects Hachure-compatible records for Kontour products;
it does not redefine the upstream format. Surface is primarily proven through
products that use it, rather than through direct end-user workflow adoption. As
a legacy data field, `surface` is a producer-defined grouping or namespace for
related claims, not the primary thing users evaluate.
_Avoid_: Treating "surface" as the canonical noun for a page, dataset, workflow, repository area, or evaluated object.

**Product Transparency**:
The user-facing promise of Surface: a product should expose what it claims, why those claims are supported, what is stale or disputed, and how those claims are managed.
_Avoid_: Truth guarantee, certification business, black-box confidence

**Transparent Product**:
A product built with Surface that shows its work by exposing material claims, evidence, traces, freshness, conflicts, and transparency gaps.
_Avoid_: Certified product, trusted product

**Inspect Before You Act**:
The end-user behavior Surface supports: inspect the trust state behind product information before relying on it.
_Avoid_: Trust but verify

**Verify Before You Rely**:
The agent behavior Surface supports: check portable trust state before using a claim as a basis for action.
_Avoid_: Blindly trust, prompt-based confidence

**Marketing Hierarchy**:
Lead with product transparency, describe trust as the outcome, and explain claims as the mechanism.
_Avoid_: Trust platform, truth layer, claims infrastructure

**Marketing Site Story**:
Lead with the user problem, then show the technology. The story should start from polished product and AI claims that lack visible support, then introduce Surface as the way products show their claims, evidence, traces, and gaps.
_Avoid_: Schema-first, SDK-first, architecture-first

**Primary Tagline**:
Show your work. Earn trust.
_Avoid_: Trust made visible as the primary tagline

**Secondary Brand Line**:
Bring trust to the surface.
_Avoid_: Truth guaranteed

**AI Urgency**:
The reason product transparency matters more now: AI increases the volume, speed, and polish of product claims and can act on unsupported claims faster than humans can review them. AI amplifies the need for Surface, but Surface's category is product transparency.
_Avoid_: AI-only trust, agent-only product

**Transparency Gap**:
A missing, weak, stale, disputed, private, unavailable, unverifiable, or unmapped trust element that may affect whether a product output or claim is transparent enough to inspect.
_Avoid_: Policy violation only, failure, hidden issue

**Unsupported Inference**:
A transparency gap where a material claim goes beyond its evidence or supporting claim dependencies. Producers and policies supply this signal; candidate claim discovery may suggest it for review, but Surface should not make broad reasoning judgments by itself.
_Avoid_: Dispute, conclusion as separate core concept

**Portable Trust State**:
The mechanism Surface provides for product transparency: a shared shape for claims, evidence, policies, events, statuses, freshness, and conflicts that different products and agents can inspect consistently.
_Avoid_: Product transparency, trust score

**Trust Bundle**:
A portable, point-in-time package of trust state from one producer, including claims, evidence, verification events, policies, authority trace, and related context. A Trust Bundle is the supply side of the trust ledger; an Inquiry is the demand side.
_Avoid_: Claim Package, Trust Input, monolithic trust object, console state

**Open Trust Format**:
The product-neutral Hachure format: normative schemas, derivation and merge
semantics, assurance, and conformance vectors in the `hachure.org/v1` namespace.
Surface consumes and re-exports compatible contracts so Kontour products do not
need to integrate with Hachure independently. Hosted Surface services may add
storage, monitoring, discovery, and Console features, but are not required to
understand the portable records.
_Avoid_: Proprietary handshake, hosted-only trust

**Kontour Resource Shape**:
The shared convention for new portable Kontour records. Surface uses the resource shape additively for portable records such as integrity anchors, trust snapshots, and exported history; a Surface proof or integrity anchor proves provenance and tamper evidence, not that the underlying domain claim is true.
_Avoid_: Breaking all Surface inputs into a new envelope, storing trust semantics in metadata, treating `proof` as a truth guarantee

**Interoperability Target**:
An external standard or ecosystem Surface may map to or integrate with, such as C2PA/Content Credentials for content provenance, W3C Verifiable Credentials for signed attestations, OpenLineage for data/process lineage, SLSA/in-toto for software supply-chain provenance, and MCP for agent access. Interoperability targets should inform Surface without replacing its product-transparency model.
_Avoid_: Core model replacement, standards cargo cult

**Claim Transparency Layer**:
Surface's stance relative to provenance, credential, lineage, and supply-chain standards: provenance tells you where something came from; Surface connects evidence provenance to the claims products ask users and agents to trust.
_Avoid_: Reinventing provenance, generic standards unifier

**MCP Integration**:
A first-class integration channel for agents to query trust snapshots, material claims, stale or disputed claims, missing evidence, transparency gaps, evidence trace, authority trace, and reverification capabilities. MCP should expose the open trust format rather than replace it.
_Avoid_: Foundation format, UI-only integration

**Spec Governance**:
Hachure governs the normative format, schemas, algorithms, assurance, and
conformance vectors. Surface governs its compatibility boundary, product-facing
extensions, builders, validators, projections, deprecations, and ADRs. A Surface
document must not silently compete with the upstream specification.
_Avoid_: Heavy standards body before adoption

**Product Vocabulary**:
The target product-language terms Surface adopts in human-facing docs and specs, distinct from implementation and schema names that may still appear in exact technical references. Decided by ADR and migrated deliberately (see the Migration Map pattern) rather than renamed ad hoc.
_Avoid_: Renaming code identifiers to match product terms, treating implementation names as product language

**End User**:
Descriptive language for a person using a product built with Surface. Use **Viewer** as the Surface role for someone inspecting trust state.
_Avoid_: Role name, operator, consumer

**Viewer**:
The primary role for a person inspecting a Surface Trust Panel to decide whether to rely on product information, recommendations, reports, or agent output.
_Avoid_: Operator, Builder, generic consumer

**View the Surface**:
The end-user documentation and interface path for understanding how to read a Surface Trust Panel and decide what trust state is visible.
_Avoid_: Developer guide, Console guide

**Role Action Vocabulary**:
Use clear action phrases tied to Surface roles: **View the Surface** for Viewers, **Shape the Surface** for Operators, **Build with Surface** for Builders, and **Verify with Surface** for Verifiers. Use explanatory copy so the metaphor supports clarity instead of replacing it.
_Avoid_: Clever labels without explanation

**Shape the Surface**:
The Operator action phrase for managing product transparency in the Surface Console, including claims, policies, evidence, ownership, gaps, materiality, and review queues.
_Avoid_: Operate Surface, passive console

**Operator**:
A person responsible for managing the claims a product makes, including claim ownership, claim changes, verification policies, review workflows, and unresolved trust gaps.
_Avoid_: End user, reviewer, administrator

**Operate Surface**:
The operator documentation and Console path for managing product transparency, claim lifecycle, policies, evidence review, and transparency gaps.
_Avoid_: End-user trust panel, SDK guide

**Agent Consumer**:
An AI system that reads portable trust state to decide whether to act, ask for verification, or surface uncertainty. Agent consumers use the same trust state as humans, but through machine-readable reports or APIs.
_Avoid_: Separate audience, producer

**Builder**:
A developer or product team responsible for building with Surface by emitting claims, evidence, policies, traces, materiality mappings, Producer Extensions, and integrations.
_Avoid_: Operator, Viewer

**Verifier**:
A person, system, or external authority that checks evidence, authority, or claim validity under policy.
_Avoid_: Claim owner, Viewer

**Agent Mode**:
A cross-cutting programmatic mode where an AI system performs Viewer, Operator, Builder, or Verifier tasks through tools, APIs, reports, or MCP. Agent Mode is not a separate human product role.
_Avoid_: Separate top-level audience, agent-only product

**Product Leader**:
A buyer or sponsor evaluating whether Surface makes a product more transparent, trusted, and governable.
_Avoid_: Operator, Builder

**Agent Guidance**:
Machine-readable guidance derived from trust state that helps an agent decide whether to act, reverify, ask for evidence, ask a human, or surface uncertainty. Surface provides guidance; vertical products or agent runtimes own execution policy.
_Avoid_: Agent runtime policy, autonomous action engine

**Producer**:
A product or workflow that emits claims, evidence, policies, and events for Surface to evaluate. Use "producer" in technical contexts; use "product built with Surface" in human-facing copy.
_Avoid_: Adapter, consumer, source system

**Survey**:
The upstream Kontour product for producer-side raw source -> extraction -> candidate -> review -> claim shaping. Survey helps producers emit disciplined Surface-ready inputs, but Surface remains the downstream transparency/evaluation layer. Survey is not a Surface module and Surface should not own crawling, parsing, candidate ranking, or domain review policy.
_Avoid_: Surface extractor, Surface crawler, Surface-owned verification

**Producer Observation**:
A producer-shaped bundle of raw source, extraction, candidate, review outcome, and target claim that can be projected into Surface claims, evidence, and events. Survey provides generic producer-observation helpers; Surface evaluates the resulting trust state and keeps the provenance visible.
_Avoid_: Surface-generated truth, untraceable adapter mapping

**Source Authority**:
A producer-declared statement about why a source should be treated as authoritative for a Survey-produced observation. In Surface packages, this belongs under `Evidence.metadata.sourceAuthority` unless the producer can emit a producer-neutral actor or system authority record.
_Avoid_: Authority trace, reviewer authority, portable permission record

**Build with Surface**:
The developer documentation path for integrating a product with Surface by emitting claims, evidence, policies, traces, and trust snapshots.
_Avoid_: End-user guide, operator guide

**Vertical Product**:
A domain-specific product built with Surface that owns its own workflow, evidence collection, domain policies, and user jobs. Veritas is a vertical product for repo and AI-agent governance, not a module inside Surface.
_Avoid_: Surface module, producer extension only

**Producer Extension**:
A producer-supplied customization layer that makes Surface interfaces feel native through vocabulary, branding, claim types, required fields, policy templates, evidence labels, and suggested actions. Producer extensions must not redefine core statuses, evidence semantics, freshness, conflicts, or trust derivation.
_Avoid_: Plugin that changes trust semantics, custom Surface fork

**Producer Discipline**:
The integration obligation that producers must supply the properties needed for trustworthy claims: subject, field or behavior, value, source, extraction trace, candidate/review state, status, impact, timestamps, and relevant metadata. Surface and Survey can make this structure easier to emit and inspect, but producers still own domain correctness and source interpretation.
_Avoid_: Surface fills in missing truth, schema-only integration

**Producer Reverification**:
A producer-owned recheck of the evidence, authority, freshness, or integrity behind claims it emitted. Surface represents the reverification result and trace, but the producer performs the domain or identity checks.
_Avoid_: Independent verification, Surface certification

**Reverification Capability**:
A producer-advertised capability to recheck evidence, authority, freshness, integrity, source state, or materiality for one or more claims. Surface can expose the capability through the Trust Panel, Console, MCP, or APIs without performing the domain check itself.
_Avoid_: Guaranteed refresh, Surface-owned verification

**Claim**:
Something a producer says is true enough to inspect, verify, refresh, dispute, or reject. A claim has a subject, asserted field or behavior, value, impact, and optional policy.
_Avoid_: Assertion, check, rule

**Repeated Field Claim**:
A claim whose value is a list or repeated entity set, such as schedules, aliases, line items, officers, or public-record rows. Surface can represent aggregate repeated-field provenance like any other claim value; independent row-level provenance requires durable row identifiers or separate row claims supplied by the producer.
_Avoid_: Implicit per-row verification, hidden array semantics

**Claim Subject Matching**:
A producer-side reconciliation helper (`matchClaimSubjects`/`deriveOrphanedSubjectDisposition`) for a Repeated Field Claim's child rows: matching a freshly re-extracted row list against previously known rows by a producer-chosen natural key, then disposing of the claims belonging to a row that no longer appears using Surface's own `TrustStatus`/`VerificationEvent` vocabulary. Distinct from Identity Link, which resolves cross-producer subject coreference rather than one producer's own row-to-row reconciliation between syncs. New and minimal; the shape may evolve with real usage.
_Avoid_: Identity Link, cross-producer coreference, a producer-invented disposition vocabulary

**Current Claim Status**:
The current derived trust state of a claim across available evidence, events, freshness, and conflicts. Current claim status is the primary way to inspect a claim without starting from a producer run; runs remain provenance for how the status was observed or changed.
_Avoid_: Run-only status, workflow status, final truth

**Subject**:
The thing a claim is about, such as a product output, report, profile, field, repo change, policy run, entity, document, or API response. Use "subject" in technical contexts and plain language such as "about" in user interfaces.
_Avoid_: Object, target, resource

**Identity Link**:
An optional advanced link showing that subject references from different systems describe the same real-world or product thing. Identity links help detect conflicts, duplicates, stale evidence, and cross-system materiality without requiring every producer to share one identifier scheme.
_Avoid_: Global identity provider, forced canonical ID

**Claim Type**:
A producer-defined category of claim with a label, description, expected subject, required or optional fields, default policy template, evidence expectations, materiality behavior, and visibility rules.
_Avoid_: Core status, raw field name

**Claim Dependency**:
An advanced relationship where one claim depends on one or more supporting claims. Dependencies help Surface explain higher-level claims, propagate stale or disputed upstream state, and prevent downstream claims from appearing stronger than their support.
_Avoid_: Evidence, claim group, unrelated reference

**Derivation**:
The disciplined use of supporting claims or named rules to answer or explain another claim without inventing unsupported truth. Derivation carries confidence ceilings and review obligations so downstream claims cannot appear stronger than their support.
_Avoid_: General inference, hidden reasoning, unreviewed logic

**Candidate Claim**:
A suggested claim discovered from product output, UI text, reports, API responses, agent transcripts, docs, or workflows. Candidate claims are not trusted claims until an operator or producer-owned rule promotes them into the managed claim lifecycle.
_Avoid_: Verified claim, automatic truth, generated claim

**Inquiry**:
A question posed against the trust ledger, including statements nobody pre-registered as claims. An Inquiry resolves as matched, derived, or an unsupported gap, and the resolution is recorded as append-only testimony.
_Avoid_: Search query, prompt answer, silent semantic match

**Domain Validity Claim**:
An advanced producer-authored claim that something is valid, ready, eligible, compliant, or acceptable according to the producer's own domain policy. Surface evaluates a domain validity claim like any other claim; it is not a universal action guarantee.
_Avoid_: Safe to act, Surface approval, product verdict

**Evidence**:
An observation, citation, attestation, test result, or traceable artifact that supports or challenges a claim.
_Avoid_: Evidence-only wording, source, signal

**Evidence Type**:
A category of evidence, such as citation, attestation, test output, observation, calculation trace, or custom producer-defined type. Evidence types may be extended through Producer Extensions when they define labels, descriptions, visibility behavior, trace requirements, result interpretation, and optional mappings to common categories.
_Avoid_: Custom status, untyped artifact

**Source Quality**:
Producer- or policy-supplied context about the role and reliability of an evidence source, such as primary source, secondary source, corroborating source, system of record, archived source, official registry, or user feedback. Surface represents source quality for transparency and display, but does not act as a universal credibility judge.
_Avoid_: Universal source score, global credibility ranking

**Confidence Basis**:
The visible basis for how much verification depth supports a claim, including source quality, reviewer authority, and evidence strength. Confidence basis is explanatory context, not a trust score.
_Avoid_: Confidence score, model confidence, universal credibility grade

**Attestation**:
A specific evidence type where an actor or authority asserts, reviews, approves, or accepts something. An attestation should be paired with authority trace when the actor's authority matters.
_Avoid_: Evidence in general, signature, approval without authority

**Attestation Validity**:
Whether an attestation has enough visible identity, authority, freshness, and integrity context to satisfy a policy. Attestation validity is separate from the truth of the attested claim.
_Avoid_: Actor legitimacy guarantee, authorization system, automatic proof

**Testimony**:
A `ReviewOutcome`'s `authorizing` block: a self-contained, admissible record of how a human was asked and what authorized their answer, collected via one of three kinds (`explicit-statement`, `exchange`, `authorized-action`) matched to the collection channel (cli-interactive, delegated, ui). Testimony is distinct from Attestation: Testimony is Surface's admissibility taxonomy for reviewer decisions specifically, not a general evidence type.
_Avoid_: Attestation (general evidence type), raw click/consent logging, silent hard-blocking on missing testimony

**Evidence Trace**:
The inspectable path showing how evidence was produced, including source, method, actor or system, timestamp, tool or run context, logs when relevant, and integrity scope. Surface standardizes evidence traceability without owning evidence collection.
_Avoid_: Evidence-only workflow, collection workflow, raw logs

**Reviewed Extraction Evidence**:
A reversible Surface projection of a Survey extraction import, ReviewItem, and ReviewDecision into ordinary Hachure-compatible Evidence. Generic anchors remain in `sourceRef`, `sourceLocator`, and `integrityRef`; exact extraction, type-origin, attempt, review, collector, artifact-state, and format details stay in a digest-bound evidence-metadata profile. Confidence, review disposition, and structural trust remain separate. Unsafe or non-accepted evidence is cited rather than entailing, and provenance failures remain typed in-band gaps.
_Avoid_: Parallel evidence schema, treating review as structural validation, treating extraction confidence as trust

**Evidence Result**:
The outcome of evaluating one evidence item, such as passed, failed, warned, inconclusive, or not captured. Evidence results explain whether the evidence supports or challenges a claim, but they are not themselves broad product validity claims.
_Avoid_: Claim status, domain validity, action decision

**Evidence Visibility**:
The disclosure state of evidence for a viewer, such as public, redacted, private, permissioned, unavailable, or missing. Surface represents visibility and redaction metadata; producers enforce access control.
_Avoid_: Access control system, no evidence

**Evidence Access Request**:
An optional producer-owned workflow for requesting access to permissioned or private evidence. Surface represents request availability, method, status, approver context, and audit trace without requiring a specific auth mechanism such as OAuth.
_Avoid_: Surface-owned access control, OAuth-only flow

**Missing Evidence**:
Evidence that has not been supplied for a claim or policy requirement. Missing evidence is different from private, permissioned, redacted, or temporarily unavailable evidence and should be visible as a distinct trust gap.
_Avoid_: Private evidence, unavailable evidence

**Redacted Evidence**:
Evidence shown with sensitive, private, proprietary, or personally identifiable details removed or masked while preserving enough summary, trace, and integrity context to support transparency.
_Avoid_: Raw evidence, hidden evidence

**Redaction Category**:
A standard top-level reason evidence was redacted, such as personally identifiable information, security-sensitive content, proprietary content, customer confidential data, legal restriction, source license, internal-only material, least-privilege policy, or other. Producers may add policy references, jurisdictions, data categories, authorities, and details under the category.
_Avoid_: Free-form-only reason, redaction quality score

**Integrity Reference**:
A stable fingerprint, hash, commit, version, signature, or content address that anchors a claim, evidence item, policy, authority record, trace, product output, or report to an exact artifact.
_Avoid_: Raw artifact, secret, evidence result

**Signature**:
An optional cryptographic assertion that an actor or system signed a claim, evidence item, policy, authority record, trace, product output, or report. Signatures strengthen integrity and authority, but Surface should not require signatures for every claim.
_Avoid_: Required baseline, certification, trust score

**Claim Owner**:
The person, team, system, or external authority responsible for the lifecycle of a claim, including review, updates, policy changes, stale state, disputes, and candidate-claim promotion.
_Avoid_: Attester, end user, viewer

**Claim History**:
The lifecycle history of a claim, including creation, edits, policy changes, evidence changes, owner changes, candidate promotion, retirement, and relevant reasons or actors. Claim history is primarily an operator transparency feature; end-user views may show summarized dates and freshness changes.
_Avoid_: Full raw audit log in every Trust Panel

**Claim Retirement**:
The normal lifecycle state for a claim that no longer applies but should remain available for history, auditability, and explanation. Hard deletion should be reserved for mistakes, sensitive data handling, or producer retention policy.
_Avoid_: Silent deletion, active claim

**Claim Store Adapter**:
The pluggable storage seam (`ClaimStoreAdapter`) behind the authored claim store: `load()`/`save()` over a `ClaimStore`, implemented by the built-in file adapter (`createFileClaimStoreAdapter`) or by a producer-owned backend such as a database. Subject-scoped persistence is a property of how a specific adapter instance is constructed, not a second interface method.
_Avoid_: New required interface method per backend, a database dependency inside Surface's core package

**Authority Trace**:
The inspectable path showing why an actor or system had authority to verify, attest, modify, approve, or own a claim. Authority trace may reference identity systems, role sources, licenses, CODEOWNERS, attestations, validity windows, revocation markers, and integrity references without requiring raw sensitive identity data.
_Avoid_: Account profile, permission graph, raw auth log, Survey source-authority metadata

**Authority Reverification**:
Producer-supplied evidence that an actor or system's authority was checked again after the original action. Authority reverification can show authority as still valid, expired, revoked, missing, drifted, or unverifiable.
_Avoid_: Identity provider, permission sync

**Policy**:
The verification contract that defines what evidence, method, authority, and freshness window a claim needs before it can be trusted.
_Avoid_: Rule, requirement, control

**Policy Reference**:
A structured pointer to an external standard, internal policy, producer repo standards, legal rule, authority source, or content policy that explains why something is required, redacted, verified, blocked, or allowed.
_Avoid_: Full policy engine, unstructured note

**Regulatory Context**:
Structured context about jurisdiction, legal regime, standard, or regulatory environment that may affect redaction, visibility, authority, validity, retention, or disclosure. Surface represents regulatory context; producers own legal and domain applicability decisions.
_Avoid_: Legal reasoning engine, compliance guarantee

**Retention State**:
The retention condition of claims, evidence, traces, or raw artifacts, including whether raw evidence is retained, summarized, hashed only, expired, deleted, or unavailable under a retention policy. Retention state can affect derived status, transparency gaps, freshness, evidence visibility, and verification portability according to policy.
_Avoid_: Passive metadata, storage ownership

**Policy Template**:
A reusable Surface-defined policy pattern, such as human attestation, source citation freshness, corroboration, command/test evidence, or identity authority evidence. Templates help producers avoid reinventing common trust policies without making Surface the owner of domain policy.
_Avoid_: Domain policy, universal rule, compliance framework

**Domain Policy**:
A producer-owned policy that defines what counts as valid, ready, eligible, compliant, or acceptable in that producer's domain.
_Avoid_: Surface policy, universal truth

**Trust Report**:
The derived output Surface produces from producer input. A trust report contains claim statuses, evidence, freshness outcomes, conflicts, policy gaps, and summaries that humans or agents can inspect before acting.
_Avoid_: Surface, console state, result

**Trust Snapshot**:
A point-in-time trust report for a product output, claim group, producer run, or product area. Surface is trust-snapshot first; longitudinal monitoring builds on snapshots.
_Avoid_: Live state, hosted requirement

**Trust View**:
A context-specific projection of portable trust state, such as a Trust Panel view, Console view, MCP resource, API response, or report export. Trust views should remain grounded in the open trust format rather than becoming separate trust models.
_Avoid_: Separate model, disconnected console data

**Trust Context**:
A context-specific view over shared trust state, such as public end-user output, operator review, compliance audit, internal agent workflow, partner/API sharing, or support investigation. Trust contexts may change visibility, redaction, materiality, and disclosure while preserving the underlying claim model where possible.
_Avoid_: Separate trust model, duplicate claim universe

**Trust Monitoring**:
Longitudinal tracking of trust state over time, such as recurring transparency gaps, stale claims, authority expirations, evidence reliability, producer quality, and claim history. Trust monitoring is a Console or hosted-service layer built on trust snapshots.
_Avoid_: Point-in-time trust report

**Trust Summary**:
A top-level summary of the trust state for an output, report, product area, or claim group. A trust summary orients users with counts and attention states, but should not collapse the whole object into a single verdict.
_Avoid_: Product verdict, trust score, approved status

**Coverage**:
How much of a product output, claim group, or transparency area is supported by current evidence and policy. Coverage is a rollup unless a producer deliberately promotes it into its own policy-governed claim.
_Avoid_: Trust score, product verdict, completeness guarantee

**Trust Analytics Projection**:
Evidence intelligence derived from a Trust Report for Console, query, or monitoring use. A trust analytics projection groups gaps, coverage, stale or disputed claims, authority trace state, and action queues without becoming a separate trust model.
_Avoid_: Arbitrary product analytics, score dashboard, separate report model

**Verification Portability**:
The degree to which a Trust Bundle includes enough structure for producer reverification and, where possible, independent verification by another compatible app, agent, or producer. Surface should express verification portability as capabilities, not as a score.
_Avoid_: Trust score, certification, universal guarantee

**Independent Verification**:
A compatible app, agent, or producer rechecking all or part of a Trust Bundle it did not originally emit, using available traces, integrity references, signatures, source links, and authority references.
_Avoid_: Producer reverification, Surface approval

**Transparency Capabilities**:
Non-scored indicators describing what kind of transparency a Trust Bundle supports, such as inspectable, anchored, signed, producer-reverifiable, independently verifiable, or private-source.
_Avoid_: Transparency score, maturity level, certification level

**Surface Trust Panel**:
An embedded transparency interface that lets an end user inspect the claims behind a product output, recommendation, report, or agent response. The panel is platform-neutral; ChatGPT Apps, MCP UI, web components, and native product embeds are delivery channels.
_Avoid_: Standalone admin workspace, certification badge, MCP app

**Trust Feedback**:
Feedback from an end user, operator, or agent about a claim, evidence item, missing claim, materiality mapping, redaction, source, or transparency gap. Trust feedback can trigger review but should not change claim status unless producer policy treats it as evidence.
_Avoid_: Automatic evidence, status override

**Trust Guidance Tool**:
A reusable guidance capability that helps producers and operators discover claims, review completeness, suggest evidence requirements, inspect materiality, explain transparency gaps, review authority trace, and plan reverification. Guidance tools may be exposed through the Console, MCP, CLI, SDKs, or agents, but their suggestions do not become trusted claims or status changes without operator or producer-policy acceptance.
_Avoid_: Console-only helper, automatic trust decision

**Minimum Trust Panel Spec**:
The minimum disclosure expectation for a Surface Trust Panel, including material claims, status labels, evidence visibility, evidence summaries or traces, freshness, conflicts, transparency gaps, producer identity, timestamps, and redaction or access limits.
_Avoid_: Layout mandate, certification audit

**Disclosure Requirement**:
A standard requirement for what trust information must be exposed, independent of exact UI layout. Surface standardizes disclosure requirements and provides reference UI patterns rather than mandating a rigid visual skin.
_Avoid_: Design skin, layout mandate

**Material Claim**:
A claim that materially supports, qualifies, or challenges the product output, recommendation, report, or agent response currently being shown. A Surface Trust Panel should disclose material claims and relevant trust gaps rather than hiding stale, disputed, missing, private, or unavailable support.
_Avoid_: Unrelated internal claim, hidden support

**Materiality Mapping**:
The producer-owned mapping between a product output and the claims that support, qualify, contradict, or provide background for that output. Surface defines the obligation to disclose material claims and makes the mapping inspectable; producers define the domain-specific mapping.
_Avoid_: Surface-owned domain judgment, hidden relevance

**Surface Console**:
The operator workspace for managing product transparency. Operators use it to add, remove, modify, evaluate, and review claims, evidence, policies, stale trust state, disputes, and unresolved gaps.
_Avoid_: Passive analytics view, admin panel

**Minimum Console Spec**:
The baseline operator capabilities expected from a Surface Console, including claim inventory, create/edit/retire flows, claim ownership, policy attachment, evidence review, evidence trace inspection, stale/disputed/gap queues, candidate claim review, materiality mapping review, authority trace, transparency capabilities, and change or snapshot history.
_Avoid_: passive console, product-specific admin replacement

**Built with Surface**:
The inspectability signal showing that a product exposes Surface transparency. It means users can inspect product claims and trust state through Surface interfaces; it does not imply Kontour certification or audit.
_Avoid_: Surface certified, guaranteed by Surface

**Surface Badge**:
A product UI signal that a user can inspect Surface transparency. The badge is an entry point to the Surface Trust Panel; it is not itself a claim that the product is trustworthy.
_Avoid_: Trust badge, certification mark, approval seal

**View the Surface Action**:
The preferred end-user action label for opening a Surface Trust Panel.
_Avoid_: Surface explored, open console

**Surface Transparency**:
The preferred panel/header label for the end-user view of claims, evidence, freshness, and conflicts.
_Avoid_: Trust score, evidence view

**Rollup**:
A derived summary across multiple claims, such as coverage by surface, collection status, or counts by status. A rollup is not a claim unless a producer deliberately promotes it into its own policy-governed claim with a subject and evidence.
_Avoid_: Claim, proof, metric

**Claim Group**:
A group of related claims that helps a human or agent understand a broader transparency area while preserving drilldown to individual claims.
_Avoid_: Collection, control set

**Framework**:
A specialized claim group organized around a named standard, policy, or review structure.
_Avoid_: Collection

**Requirement**:
An expected condition inside a claim group or framework. Use "requirement" for general Surface language and reserve "control" for producer domains that already use control terminology.
_Avoid_: Control, rule

**Status**:
The current derived trust state of a claim: unknown, proposed, assumed, verified, stale, disputed, superseded, rejected, or revoked.
_Avoid_: Score, verdict, confidence

**Core Status**:
A standardized Surface trust state whose semantics producers must not redefine. Producer extensions may add labels, explanations, workflow states, and suggested actions around core statuses, but not change their meaning.
_Avoid_: Custom status semantics, producer-defined trust state

**Status Label**:
The plain-language label shown to humans for a technical status, such as "No evidence" for unknown, "Pending review" for proposed, or "Needs refresh" for stale.
_Avoid_: Raw enum, score

**Trust Score**:
A single numeric or letter-grade reduction of trust state. Surface should avoid trust scores because they obscure the evidence, freshness, and conflicts that product transparency is meant to reveal.
_Avoid_: Confidence score, trust percentage, grade

**Conflict**:
A visible disagreement between claims, evidence, or policies that makes a claim unsafe or harder to trust.
_Avoid_: Discrepancy

**Freshness**:
Whether a claim's supporting verification still applies under its policy, validity window, and integrity scope. Freshness can fail because time expired, the verified artifact changed, the authority changed, the policy changed, or dependent evidence changed.
_Avoid_: Drift, recency

**Changed Since Verified**:
A freshness condition where the source, artifact, policy, authority, or integrity reference changed after verification.
_Avoid_: Drift

**Expired Verification**:
A freshness condition where a verification or authority check is no longer current under its validity window.
_Avoid_: Drift

## Flagged Ambiguities

**Surface as evaluated object**:
Earlier docs used "surface" both as the product name and as the product area being evaluated. Use **Surface** for the product/protocol. Use **Trust Report** for the evaluated output and use the `surface` field only as a producer-defined grouping.

**Evidence as Surface language**:
Vertical products may use "proof" when it fits their domain, such as Veritas evidence checks. Surface should use **Evidence** and **Evidence Trace** as canonical terms because "proof" overstates certainty across domains.

**Transparency gap as product language**:
Earlier docs grouped gaps, policy violations, freshness breaches, unsupported inferences, and contradictions too loosely. Use **Transparency Gap** for missing or weak trust elements and **Conflict** for disagreement.

**Drift as product language**:
Earlier docs used "drift" for stale or changed trust state. Use **Freshness**, **Changed Since Verified**, or **Expired Verification** in product surfaces because they are more concrete for end users and operators.

**Collection and control as product language**:
Earlier docs used "collection" and "control" for grouped claims and framework items. Use **Claim Group**, **Framework**, and **Requirement** in Surface product language; reserve "control" for producer domains that naturally use it.

**Conclusion as product language**:
Do not add "conclusion" as a core Surface concept yet. Important product conclusions should be represented as **Material Claims** or **Domain Validity Claims** so they can use the same evidence, policy, dependency, and transparency-gap model.

## Example Dialogue

Developer: "Our producer emits three claims about the repository release gate."

Domain expert: "What evidence supports them?"

Developer: "One claim has passing test output, one has a human attestation, and one has no evidence yet."

Domain expert: "Then Surface should derive a trust report showing the first claim as verified, the attested claim according to its policy, and the unsupported claim as unknown or proposed."

Developer: "The report also groups those claims under the producer's `surface` namespace, but reviewers act on the claim statuses and evidence, not on the namespace itself."

Domain expert: "Is console coverage itself a claim?"

Developer: "Usually no. Coverage in a trust report is a rollup over claim statuses. It becomes a claim only if a producer creates a separate claim about coverage or readiness and supplies evidence for that claim."
