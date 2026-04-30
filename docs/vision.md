# Vision

Kontour Surface is the trust map for AI-era products.

The premise is simple: every product makes claims. A camp directory claims registration is open. A tax workflow claims a number came from a verified source. A developer tool claims a code change passed the proof required for the surface it touched.

AI increases the volume and polish of those claims. Kontour Surface makes the support for those claims inspectable.

## What Surface should answer

Before a human or an agent acts on a claim, Surface should make four things visible:

1. **Subject** — what or who the claim is about, including when the same real subject appears under different keys in different product systems.
2. **Evidence** — what supports the claim, who collected it, how it was verified, and how to trace it back to a source.
3. **Freshness** — how long the verification is valid, and what is now stale, unsupported, disputed, or superseded.
4. **Consistency** — whether other claims about the same subject agree, contradict, or roll up into it.

If any of those is missing, weak, or stale, Surface should make that obvious instead of papering it over with a single confidence score.

## What Surface should not claim

Surface should not market itself as objective truth. It should show the evidence chain, the verification method, and the current trust state. If a claim is weak, stale, or disputed, the system should make that obvious.

The product promise is evidence-backed confidence, not certainty theater.

## Why this is harder now

A human reviewing a few decisions a day can hold the missing context in their head. They notice when a number looks wrong, when a record is from a different system, when a stale value should be re-verified. That review is the actual trust layer.

When the same workflow is delegated to an agent making thousands of decisions, that informal layer disappears. There is no reviewer to catch a misread subject, a stale verification, or a quiet contradiction between two systems. The trust state has to be derivable from the contract itself — readable, deterministic, and the same answer for every consumer that asks.

Surface is built for that shift. The kernel does not ask the agent to be careful. It returns a status, the evidence behind it, the freshness window, and the fault lines that make a claim unsafe to act on. The agent's job is to read; the kernel's job is to be right by construction.

