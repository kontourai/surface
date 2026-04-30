# Principles

Kontour Surface is small on purpose. The kernel only earns its place if it behaves the same way every time. These principles describe the rules the kernel and adapters follow. New features should fit them; if they cannot, the principle should change first.

## Unverified is not denied

A claim with no supporting evidence is `unknown`, not `false`. A claim whose policy required evidence that was not provided produces a `provenance_gap` fault line, not a silent exclusion. The contract separates three states that other systems often collapse into one:

- **Unknown** — we have no evidence.
- **Unsupported** — we have evidence, but not enough under the policy.
- **Refuted** — we have evidence that the claim does not hold.

Closing-world shortcuts (no row in a table → not a customer, null field → not high-gross) are the kind of silent failure Surface is built to prevent. Missing data should be visible as missing.

## Deterministic by default

Status, freshness, fault lines, and proof requirements are derived from the inputs by code. They are not produced by a model at query time, and they are not negotiated between the consumer and the producer. The same `TrustInput` produces the same `TrustReport` every time, on any machine, including in CI.

Models are welcome at the evidence edge — they can extract, summarize, observe, and attest. They are not welcome inside the trust derivation. Reasoning about what counts as verified happens once, in the kernel, and every consumer reads the same answer.

This is also a cost principle. An agent that reads a Surface report does not spend tokens to decide whether something is verified. The kernel already decided.

## Stable kernel, evolving policies, broad evidence

Surface is three layers with three different change cadences:

| Layer | What changes | Who owns it | Cadence |
|---|---|---|---|
| Kernel contract | Claim, evidence, policy, event, report types | Surface | Rarely — schema versions only |
| Policy library | Required evidence, validity windows, conflict rules | Product teams | Often — as the product learns |
| Evidence corpus | Adapter output, attestations, observations | Product systems | Constantly |

Forcing the kernel to move at the speed of policy is how trust contracts become unreadable. Forcing policy to move at the speed of the kernel is how product teams give up on the contract. Each layer changes on its own clock.

## Open contract, open exports

The schemas in `schemas/`, the TypeScript types in `src/types.ts`, and the report shapes are the product. They should be portable across runtimes, consoles, and product layers without a proprietary handshake. Reports can be exported in formats other systems already read, and adapter input formats are documented enough that a third party can build one.

Imports are read-only at the edge. Surface does not write back into product systems. That keeps the trust kernel honest about what it is — a derivation, not a system of record.

## No single confidence score

Surface intentionally does not collapse trust into one number. A `ConfidenceBasis` records the reasons confidence does or does not exist — source quality, extraction confidence, corroboration, reviewer authority, freshness remaining, conflict count, proof strength, impact. A consumer that wants a single score can compute one; the kernel will not pretend the inputs are reducible.

A status like `verified` plus a fault line like `freshness_breach` carries more information than any score. Keep both.

## Adapters project, they do not flatten

An adapter translates a product artifact into the kernel's claim, evidence, policy, and event records. It does not flatten domain detail into a generic pass/fail. Surface deliberately preserves enough of the product's native structure (proof lanes, crawl runs, document citations) inside metadata so a reviewer can trace a status back to the source artifact. The contract is portable; the domain context is not lost.
