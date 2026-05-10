# What builds on Surface

Surface is the foundation. It does not solve a vertical problem on its own — it gives you a portable shape for **claims**, the **evidence** behind them, the **policies** that decide what counts as verified, the **events** that change a claim's status over time, and the **trust report** a downstream system can act on.

Anything that needs to answer "is this information verified, fresh, and uncontested?" can sit on top of Surface.

## When to reach for Surface

You are building a product (Kontour or otherwise) that has any of these jobs:

- "Prove that the data we are advertising is verified and valid."
- "Show provenance: where did this claim come from, when was it last checked, who attested to it?"
- "Reconcile multiple sources that may disagree about the same subject."
- "Express that a fact is verified *but stale* — or verified by a weak source — without collapsing everything into a single confidence score."

If you are doing any of that and you do not yet have a vocabulary for claims, evidence, freshness, and conflict — you want Surface as your substrate.

## Reference consumers

Surface ships fixtures and adapters that demonstrate the shape:

- **Field-Attested Records** — public-data verification through crawl evidence, field attestations, review flags, and freshness.
- **Fact Resolution** — high-stakes fact verification through extraction, resolution, verified facts, citations, and review signals.
- **npm-audit** — a minimal example: dependency vulnerabilities as claims about package safety.

These are not products on their own; they are how Surface explains itself.

## Real consumers

These projects use Surface as their trust substrate. They each own their own product workflow and adapter code; Surface owns the schema and report shape underneath.

- **[Veritas](https://github.com/kontourai/veritas)** — repo-local lint for AI-assisted code changes. Projects each code-change run into `surface.input` so the run can become a portable trust report.

If you are building something on Surface, the [external adapter example](../examples/external-adapter/README.md) is the minimum shape: define your input, map it to claims and evidence, emit valid `TrustInput`. Surface handles the rest.

## What Surface deliberately does not do

- Surface does not gather evidence. You bring the input.
- Surface does not run policies against external systems. Policies declare what makes a claim valid; events record what was observed.
- Surface does not write back. Reports are the output; consumers decide what to do with them.
- Surface does not own product workflow vocabulary. Each consumer keeps its own terms (Veritas calls them "rules" and "proof lanes"; a tax product might call them "deductions" and "supporting documents"). Those project *into* Surface claims and evidence at the boundary.
