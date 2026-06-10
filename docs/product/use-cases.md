# Use Cases

Surface is useful when a product needs to turn domain-specific evidence into a portable Trust Snapshot without moving product workflow language into the kernel. Every scenario below follows the same pattern: the producer owns the domain — its sources, its review workflow, its policies — and emits claims, Evidence, and verification events. Surface validates the input, derives status, and makes the result inspectable by a reviewer, an operator, or an agent.

## When to reach for Surface

You are building a product (Kontour or otherwise) that has any of these jobs:

- "Show that the data we are advertising is verified and valid."
- "Show provenance: where did this claim come from, when was it last checked, who attested to it?"
- "Reconcile multiple sources that may disagree about the same subject."
- "Express that a fact is verified *but stale* — or verified by a weak source — without collapsing everything into a single confidence score."

If you are doing any of that and you do not yet have a vocabulary for claims, evidence, freshness, and conflict, you want Surface as your product transparency layer.

The scenarios are not hypothetical shapes. Each one is grounded in a fixture that ships in [`examples/`](../reference/fixtures.md) and runs through the same kernel as production input. They are also not the only places Surface fits: anything that needs to express claims, Evidence Trace, Freshness, and Conflict — marketplace listings, certifications, regulatory disclosures, agent output validation — can build on the same foundation.

## AI Code Governance — built and shipping

**The situation.** An engineering team has AI agents opening dozens of pull requests a day. Every PR description says the tests passed and the standards were followed. The reviewers' real question is no longer "does this look right?" but "what actually supports this claim, and is that support current?"

**Built with Surface.** [Veritas](https://github.com/kontourai/veritas) authors claims about repo areas in a committed claim store, collects evidence per run (test output, lint results, human attestations), and emits `TrustInput` through the public Surface SDK. Repo standards map into Surface claim groups, so a reviewer starts from a framework/requirement view and drills into the exact claim, the evidence command that supports it, and the integrity ref it was verified against.

**What Surface derives.** A claim is `verified` only when a verification event and its policy-required evidence support it. When the verified commit changes, the claim surfaces as Changed Since Verified instead of silently staying green. The reviewer — human or agent — reads the same Trust Snapshot.

## Field-Attested Public Records

**The situation.** A public-data directory lists community organizations: registration status, locations, pricing, contacts. Some fields come from crawls, some from human attestations, some from the organizations themselves. Users act on this data, so "where did this field come from and how current is it?" is the product.

**The mapping.** The product's adapter (owned by the product, not by Surface) maps each sourced field to a claim, each crawl excerpt and approved attestation to Evidence with a source URL and timestamps, and each editorial approval to a verification event. The [field-attested records fixture](https://github.com/kontourai/surface/blob/main/examples/field-attested-records-export.json) shows the shape: an attested `city` field stays `verified`, while a pricing value observed months ago and never re-approved derives as `stale` under its freshness policy.

**Why it matters.** The directory can show a Trust Panel per record — claim by claim, source by source — instead of a single "verified" badge that hides which fields are actually supported.

## Fact Resolution

**The situation.** A financial workflow extracts facts from documents, reconciles them against manual entries and prior-period values, and selects one value per fact. The selected number drives downstream calculations. When an imported figure conflicts with a worksheet value, that conflict must slow someone down — especially when the "someone" is an agent.

**The mapping.** Each resolved fact becomes a claim; extraction candidates, confidence context, and review rationale become Evidence and metadata; explicit human verification becomes a verification event. The [fact resolution fixture](https://github.com/kontourai/surface/blob/main/examples/fact-resolution-export.json) shows a user-verified filing status deriving as `verified` while a document-imported capital gain that conflicts with a worksheet derives with the conflict visible and `needsVerification` preserved — not averaged away into a confidence score.

**Why it matters.** Status is derived by construction. The workflow can let an agent proceed on verified facts and route disputed ones to a human, using the same report.

## Dependency Audit

**The situation.** A platform team asserts "our published packages are safe to install" in release notes. That claim is only as good as the latest audit run, and audit results age fast.

**The mapping.** A producer maps `npm audit --json` output into Evidence supporting (or challenging) authored package-safety claims. The [npm audit fixture](https://github.com/kontourai/surface/blob/main/examples/npm-audit-export.json) shows a high-severity finding becoming evidence that challenges the claim instead of a buried CI log line. A freshness policy keeps the claim from staying `verified` on the strength of last month's scan.

**Why it matters.** "Safe to install" stops being a static sentence and becomes a claim with a current status, a trace to the exact audit run, and a visible gap when the audit is stale or missing.

## Reputation Integrity

**The situation.** A team evaluating open-source dependencies looks at stars, contributor counts, and adoption signals — all of which can be inflated. The honest position is rarely "this repo is fraudulent"; it is "this signal is observed, and this anomaly is proposed but unconfirmed."

**The mapping.** The [reputation integrity fixture](https://github.com/kontourai/surface/blob/main/examples/reputation-integrity-trust-export.json) models exactly that: a raw star count as an observed claim, and a suspicious growth pattern as a high-impact `proposed` claim under an anomaly policy that requires corroboration before it hardens into anything stronger.

**Why it matters.** Unverified is not denied. Surface keeps the suspicion visible without letting a heuristic masquerade as a finding — the difference between a useful signal and a false accusation.

## Agent Guardrails — every use case above, read by a machine

Each scenario doubles as an agent integration. An agent calls `surface stale`, `surface missing`, or reads the JSON report, and applies the same discipline a careful human would: act on `verified` claims, reverify `stale` ones, escalate `disputed` ones, and treat Transparency Gaps as a reason to ask before acting. The kernel does not ask the agent to be careful — it returns a status, the evidence behind it, and the gaps that make a claim unsafe to rely on.

## What Surface deliberately does not do

- Surface does not gather evidence. You bring the input.
- Surface does not run policies against external systems. Policies declare what makes a claim valid; events record what was observed.
- Surface does not write back. Trust Snapshots and current `TrustReport` API outputs are the output; viewers, operators, agents, and downstream systems decide what to do with them.
- Surface does not own product workflow vocabulary. Each product built with Surface keeps its own terms (Veritas calls them "rules" and "evidence checks"; another product might call them "records" and "supporting documents"). Those project *into* Surface claims and evidence at the boundary.

## Where the adapters live

Surface ships only the native `surface` passthrough adapter. Domain mappings like the ones above belong with the products that own the data — see [Adapters and the Producer Boundary](../reference/adapters.md) and the [external adapter example](https://github.com/kontourai/surface/blob/main/examples/external-adapter/README.md) for the canonical package shape. If you are building with Surface, start with the [Consumer SDK guide](../guides/consumer-sdk.md).
