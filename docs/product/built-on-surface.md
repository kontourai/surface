# What builds with Surface

Surface is the shared foundation under Kontour's products. It does not solve a vertical problem on its own; it gives products a portable shape for **claims**, the **evidence** behind them, the **policies** that decide what counts as verified, the **events** that change a claim's status over time, and the **Trust Snapshot** a customer, agent, or downstream system can inspect before relying.

Anything that needs to answer "is this information verified, fresh, and uncontested?" can be built with Surface.

## When to reach for Surface

You are building a product (Kontour or otherwise) that has any of these jobs:

- "Show that the data we are advertising is verified and valid."
- "Show provenance: where did this claim come from, when was it last checked, who attested to it?"
- "Reconcile multiple sources that may disagree about the same subject."
- "Express that a fact is verified *but stale* — or verified by a weak source — without collapsing everything into a single confidence score."

If you are doing any of that and you do not yet have a vocabulary for claims, evidence, freshness, and conflict, you want Surface as your product transparency layer.

## Reference Inputs

Surface ships fixtures that demonstrate the Trust Snapshot shape. Domain adapters live with the producers or plugins that own their source artifacts. A Builder path emits the claim package your product owns, then Surface derives the trust state your customers, team, agents, or downstream systems inspect.

## Products built with Surface

These projects use Surface as their product transparency layer. They each own their own product workflow and adapter code; Surface owns the portable trust state and report shape underneath.

- **[Veritas](https://github.com/kontourai/veritas)** — repo-local governance for AI-assisted code changes. Projects each code-change run into Surface trust state and uses derived `stale` and `disputed` statuses as repo-governance feedback.

If you are building with Surface, start with the [consumer SDK guide](../guides/consumer-sdk.md). Product-facing docs should describe the result as a Trust Snapshot with derived status, summary, Requirement, Evidence Trace, Freshness, and Conflict or Transparency Gap fields.

## What Surface deliberately does not do

- Surface does not gather evidence. You bring the input.
- Surface does not run policies against external systems. Policies declare what makes a claim valid; events record what was observed.
- Surface does not write back. Trust Snapshots and current `TrustReport` API outputs are the output; Viewers, Operators, agents, and downstream systems decide what to do with them.
- Surface does not own product workflow vocabulary. Each product built with Surface keeps its own terms (Veritas calls them "rules" and "evidence checks"; another product might call them "records" and "supporting documents"). Those project *into* Surface claims and evidence at the boundary.

## Current implementation names

The [external adapter example](../../examples/external-adapter/README.md) is the minimum shape: define your input, map it to claims and evidence with `TrustInputBuilder`, emit valid `TrustInput`, then call `buildTrustReport`. `TrustInput`, `TrustReport`, and `buildTrustReport` are current API names.
