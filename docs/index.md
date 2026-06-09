# Kontour Surface

Every product makes claims. AI makes those claims faster, more polished, and harder to review. Surface gives a product one shape for the claim, the evidence behind it, how fresh that evidence is, and the gaps that should slow anyone down before they rely on it.

Veritas uses Surface underneath. So can your product.

## The problem

AI makes plausible, polished product output cheap. But when agents route records, select facts, merge changes, or draft responses at scale, the informal trust layer disappears. There is no one to notice a stale number, a quiet contradiction, unsupported evidence, or a verification that was valid last month but not today.

Trust state has to be derivable from the product contract itself: readable, deterministic, and the same answer for every Viewer, Operator, Builder, or agent that asks.

## How Surface works

Surface connects evidence provenance to product claims through a portable trust format:

- **Subject** — what the claim is about, including when the same entity appears under different keys across systems
- **Evidence Trace** — what supports the claim, who or what produced it, and how to trace it back to a source
- **Freshness** — how long the verification is valid and what has changed since verification
- **Transparency Gaps** — what is missing, stale, private, disputed, unavailable, or unsupported
- **Trust Snapshot** — a point-in-time report that can drive a Trust Panel, Console, API, or agent resource

Status is derived by construction — not summarized by a model, not hidden behind a confidence score. If a claim is weak, stale, or disputed, the system makes that visible.

## What you can build on it

**Veritas** — a repo and AI-agent governance product built with Surface. Veritas authors claims in a committed file, collects evidence per run, and projects trust state into Surface for derivation, Console display, and agent inspection.

**Custom producers** — any product that needs to express claims, evidence, freshness, and conflict can build with Surface. Fitness tracking, financial records, marketplace listings, regulatory disclosures, agent output validation — same open trust format, same report shape.

## Role paths

- **Viewers** — Inspect the trust state behind a product answer, report, recommendation, or agent output before you rely on it. Surface shows you the claim, the evidence behind it, how current that evidence is, and what's still uncertain.
- **Builders** — Emit claims, evidence, and policies from your product. Surface gives you a shared shape so the same trust state can be read by people, agents, and other systems downstream.
- **Operators** — Manage the claims your product makes — ownership, evidence review, policies, transparency gaps, conflicts — from one workspace. Surface Console runs locally. No cloud, no login.

## Published Pages

- [Vision](product/vision.md) — why product transparency matters now and what Surface is designed to answer
- [Concepts](product/concepts.md) — the full vocabulary: claims, evidence traces, policies, claim groups, transparency gaps, status
- [Use Cases](product/use-cases.md) — repo governance, field-attested records, fact resolution, dependency audit
- [What builds on Surface](product/built-on-surface.md) — when to reach for Surface as your foundation
- [Walkthrough](guides/walkthrough.md) — a real session with native Surface input

## Repo References

- [Getting Started](guides/getting-started.md) — install Surface, run a fixture report, and emit your first trust input
- [Docs Index](README.md) — folder layout and full maintainer index

## Docs Site Scope

`docs-site/` is generated from selected source docs for the public Pages site. It is curated, not a mirror of every repo document, and includes selected specs, audits, planning, and reference docs. Remaining maintainer, release, and hook docs are browsable from [docs/README.md](README.md).
