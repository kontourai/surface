# ADR 0003: Inquiry and Resolution

Status: accepted

Date: 2026-06-10

## Context

Kontour's original premise is that an agent says things, and a user needs evidence to trust what it said. The system as built answers two of the three questions a trust consumer asks:

- *What is claimed?* — Surface claims, registered by producers.
- *What supports it?* — evidence, verification events, and provenance from Survey, Veritas, and Flow.

It cannot answer the third: *is this statement — which nobody pre-registered — trustworthy?* Evidence attaches to claims by explicit `claimId`, so only claims someone deliberately authored are covered. Agent output is free-form; most statements a user wants checked will be similar to, composed from, or absent from the registered claims. That pre-registration gap, not the claim-first orientation, is the missing piece. (Survey is already evidence-first: source → extraction → candidate → review → claim.)

This ADR records the design for closing the gap. The recurring finding: nearly every piece already exists and is re-aimed rather than invented.

## Decision

### 1. Three verbs over one ledger

Kontour's problem space is defined by three verbs:

- **Assert** — say what you believe, on the record (claims).
- **Observe** — attach what actually happened, append-only (evidence, verification events, testimony).
- **Resolve** — ask anything; every answer comes with receipts or admits it has none (inquiries).

Assert and observe are built. Resolve is the new primitive.

### 2. The Inquiry primitive lives in Surface

An **Inquiry** is a consumer-side question posed against the ledger: a question or candidate claim, the asker, and optional context. Surface owns it — it is a query over claims, evidence, and verification events, all Surface-owned record types. No new product is created for it.

An Inquiry resolves to exactly one of three outcomes:

- **Matched** — an existing claim answers it; the live status of that claim is the answer.
- **Derived** — a named derivation rule over existing claims answers it (see 5).
- **Unsupported gap** — nothing answers it. This is reported honestly, and the gap itself is a product signal (it can propose a new mapping or rule for review).

A Trust Bundle (ADR 0002) is how supply arrives at the ledger; an Inquiry is how demand arrives. Deposit and withdrawal.

### 3. Canonical claim grammar

Matching requires a canonical claim form. The existing shape — subject, `fieldOrBehavior`, value — is tightened into a canonical grammar (subject, predicate, value, qualifiers) rather than replaced. Full logical decomposition of claims into a general ontology is explicitly rejected (the semantic-web tarpit); the grammar is a bounded canonicalization layer that makes equivalence checkable, nothing more. Pre-stability, this is a breaking schema change, not an additive compromise.

### 4. Deterministic core, model as proposer

Exact canonical-form matching is the only thing that resolves silently. A model (LLM or embedding) may **propose** that an incoming question matches a registered claim, or propose a new canonical claim derived from evidence — but a proposal lands as a reviewable record with provenance (excerpt, rationale, confidence) before it counts.

Proposal review reuses Survey's machinery verbatim: candidate → candidate set → review outcome, as a new review-item type in the same workbench. Policy may auto-accept high-confidence matches within a declared comfort zone, mirroring `withinComfortZone` in Survey reviews. The accepted artifact — "this natural-language question ⇒ this canonical claim/rule" — is the durable, reusable **mapping**.

The rule this protects: **nothing inside the trust layer silently decides; it proposes, and proposals are records.** A matcher that silently equates two statements is an unverified claim-maker inside the trust layer — the exact failure mode Kontour exists to prevent.

### 5. Derivation: value predicates plus authored rules

When no registered claim matches, derivation is allowed at two levels of expressiveness and no further:

- **Value predicates** — deterministic comparisons over structured values (`coverage >= 90`, `status in {verified, assumed}`, freshness windows).
- **Authored derivation rules** — named, versioned, reviewable artifacts composing claims (`release-ready := tests-pass AND coverage >= 90 AND no-open-exceptions`). Rules are promoted from Flow's gate-expectation language, which already encodes "this claim must hold with these accepted statuses."

General query-time inference is rejected. An inquiry is never answered by combining claims through logic no human reviewed. A model may propose a new rule; the proposal goes through the same review path as mappings. Every derived answer traces to a named rule plus the claims it consumed, and the existing weakest-link confidence ceiling composes through rules unchanged.

### 6. Inquiry records are append-only testimony

A resolved inquiry leaves an **Inquiry record**: the question as asked, the resolution path (matched claim or rule plus input claims with their statuses at that moment), the answer, the timestamp, and the asker. It is append-only and never updated — structurally a verification event whose trigger was a question instead of a gate.

Records never go stale, because they never assert present-tense truth; they assert what was knowable at a moment. **Memoize the mapping, never the answer.** Answers always recompute from live claim status. The "true then, differs now" affordance is a join of the frozen record against the live claim — not a second status machine. Layer-2 records snapshot the status they saw, so policy changes cannot silently rewrite history.

### 7. Claim status is a pure function

Claim status is computed, never stored as authority:

```
status = f(claim, events, policy, now)
```

`f` is versioned and deterministic. Anyone holding the events and policy can recompute — and therefore verify — any status, including Kontour's own. Time-based staleness falls out naturally because `now` is an input; no synthetic clock-tick events. `claim.status.changed` events remain as derived notifications for consumers, demoted from source of truth. If two consumers disagree about a status, the fold is the arbiter.

Consequences for identity: claims are durable, run-independent identities; **runs do not own claims — runs contribute events to claims.** Run-scoped views are filters over the event stream; point-in-time views are the records; the realtime view is the fold. One model covers all three.

### 8. Disputes need no new layer

A `disputed` status is what `f` outputs when evidence conflicts (including cross-producer Trust Bundle conflicts, ADR 0002). Resolution is a decision, and decisions already have a shape:

1. The conflict surfaces in the attention queue (Console).
2. A reviewer with named authority decides — Survey's conflict → review outcome → escalation pattern, widened from within-one-producer candidate sets to cross-producer disputes.
3. The decision lands as an append-only verification event (actor, authority, rationale, evidence IDs). Nothing is deleted; `f` folds the new event, weighted by `reviewerAuthority` and `authorityTrace`, and status flips.

The regress ("who evaluates the evaluation?") terminates at recorded authority: a resolution is itself a record, challengeable through the same front door as any claim — one more attributed event per round, never a privileged meta-layer whose judgments are not in the ledger.

### 9. Agent-utterance extraction is a Survey producer profile

The original premise — checking agent output — is built last, as a Survey producer profile pointed at agent utterances instead of web sources, feeding flow-agents hooks as the enforcement point. Each factual statement in agent prose is extracted as a candidate claim and run through the Inquiry pipeline. It depends on everything above and ships only when resolution is real.

## Sequencing

Each step ships value alone; nothing depends on a later step.

1. Tighten the canonical claim grammar in Surface schemas (breaking change).
2. Make status a versioned pure function `f(claim, events, policy, now)`.
3. Inquiry record + exact-match resolution only.
4. Named derivation rules, promoted from Flow gate-expectation language.
5. Probabilistic proposer + review queue (Survey machinery, new item type).
6. Agent-utterance extractor (Survey producer profile + flow-agents hooks).

## Consequences

- Surface gains one new record type (Inquiry) and one tightening (canonical grammar); no rewrite, no new product.
- Survey's candidate → review pattern becomes a shared contract consumed for mapping review and cross-producer dispute review.
- Flow's gate-expectation language gains a second life as the derivation-rule syntax; gates and rules stay one language.
- Early operation will surface many "unsupported gap" outcomes. This is correct behavior and a demand signal, not a defect; the proposed-mapping and proposed-rule queues show what consumers actually ask.
- Every future shortcut temptation — silent semantic matching, memoized answers, unreviewed inference, a privileged dispute layer — is a violation of decision 4's rule and should be rejected by reference to this ADR.
