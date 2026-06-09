# Vision

Kontour Surface is the shared foundation under Kontour's products and any product that needs to show its work.

**Show your work. Earn trust.** The premise is simple: every product makes claims. A record directory claims registration is open. A fact-resolution workflow claims a number came from a verified source. A developer tool claims a code change passed the required checks for the product area it touched.

AI increases the volume, speed, and polish of those claims. Kontour Surface makes the support for those claims inspectable by connecting evidence provenance to what products ask users and agents to trust.

## What Surface should answer

Before a human or an agent acts on a claim, Surface should make four things visible:

1. **Subject** — what or who the claim is about, including when the same real subject appears under different keys in different product systems.
2. **Evidence Trace** — what supports the claim, who or what produced it, how it was verified, and how to trace it back to a source.
3. **Freshness** — how long the verification is valid, what changed since verification, and what is now stale, unsupported, disputed, or superseded.
4. **Transparency Gaps** — what is missing, weak, private, unavailable, unverifiable, unmapped, or in conflict.

If any of those is missing, weak, or stale, Surface should make that obvious instead of papering it over with a single confidence score.

## Product shape

Surface should be useful as an open format and as a product experience:

- **Trust Panel** for Viewers who need to inspect before relying.
- **Surface Console** for Operators who shape claims, policies, evidence, ownership, materiality, review queues, and gaps.
- **Builder path** for products that emit claim packages, Producer Extensions, evidence traces, integrity references, and Trust Snapshots.
- **Verifier capability** for systems and authorities that recheck evidence, authority, freshness, integrity, and signatures.

The inspectability signal is **Built with Surface**. It means a product exposes inspectable trust state in the Surface format. It does not mean Surface certified the product or guaranteed that every claim is true.

## What Surface should not claim

Surface should not market itself as objective truth. It should show the evidence chain, the verification method, and the current trust state. If a claim is weak, stale, or disputed, the system should make that obvious.

The product promise is product transparency, not certainty theater.

Surface should not collect evidence directly, make domain action decisions, assign universal trust scores, or let producer extensions redefine core status semantics. Producers and vertical products own evidence collection, domain policy, source integrations, materiality mapping, and product-specific actions.

## Why this is harder now

A human reviewing a few decisions a day can hold the missing context in their head. They notice when a number looks wrong, when a record is from a different system, when a stale value should be re-verified. That review is the actual trust layer.

When the same workflow is delegated to an agent making thousands of decisions, that informal layer disappears. There is no reviewer to catch a misread subject, a stale verification, or a quiet contradiction between two systems. The trust state has to be derivable from the contract itself — readable, deterministic, and the same answer for every Viewer, Operator, Builder, Verifier, or agent that asks.

Surface is built for that shift. The kernel does not ask the agent to be careful. It returns a status, the evidence behind it, the freshness window, and the transparency gaps that make a claim unsafe to rely on. The agent's job is to read; the kernel's job is to be right by construction.
