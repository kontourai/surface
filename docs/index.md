# Kontour Surface

Kontour Surface maps what your product claims, what proves it, where trust is missing or stale, and what humans or AI agents need to verify next.

## The problem

AI makes plausible output cheap. But when agents route records, select facts, merge changes, or draft responses — at scale, without a human reviewer in the loop — the informal trust layer disappears. There is no one to notice a stale number, a quiet contradiction, or a verification that was valid last month but not today.

Trust state has to be derivable from the contract itself: readable, deterministic, and the same answer for every consumer that asks.

## How Surface works

Every claim gets a traceable structure:

- **Subject** — what the claim is about, including when the same entity appears under different keys across systems
- **Evidence** — what supports the claim, who collected it, and how to trace it back to a source
- **Freshness** — how long the verification is valid and what has since drifted
- **Consistency** — whether other claims about the same subject agree, contradict, or roll up

Status is derived by construction — not summarized by a model, not hidden behind a confidence score. If a claim is weak, stale, or disputed, the system makes that visible.

## What you can build on it

**Veritas** — a repo governance tool for AI-assisted code changes. Veritas authors claims in a committed file, collects evidence per run, and projects trust state into Surface for derivation, dashboard display, and agent inspection.

**Custom producers** — any system that needs to express claims, evidence, freshness, and conflict can build on Surface as its substrate. Fitness tracking, financial records, marketplace listings, regulatory disclosures, agent output validation — same contract, same report shape.

## Where to go next

- [Getting Started](getting-started.html) — install Surface, run a fixture report, and emit your first trust input
- [Vision](vision.html) — why trust infrastructure matters now and what Surface is designed to answer
- [Concepts](concepts.html) — the full vocabulary: surfaces, claims, evidence, policies, fault lines, status
- [Use Cases](use-cases.html) — repo governance, field-attested records, fact resolution, dependency audit
- [What builds on Surface](built-on-surface.html) — when to reach for Surface as your foundation
- [Walkthrough](walkthrough.html) — a real session with native Surface input
