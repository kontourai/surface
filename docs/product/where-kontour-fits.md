# Where Kontour Fits in the Trust Landscape

This page places Kontour in the wider world of trust, attestation, and provenance
standards — what problem is genuinely unsolved, where Kontour sits, and the
evidence that this position is real rather than aspirational. The claims below are
grounded in an adversarially-verified landscape review (2026-07); sources are
linked inline.

## The layers

- **[Hachure](https://github.com/hachure-org/spec) is the open, vendor-neutral trust format** Kontour created and stewards. It defines portable records — claims, evidence, verification policies, append-only events — and a *published, versioned status function* `status = f(evidence, policy, now)` that any consumer recomputes.
- **Surface is Kontour's kernel** — the implementation that derives trust state from Hachure bundles (status, transparency gaps, freshness, merge, projections) and exposes it (CLI, the Surface Console, the MCP surface).
- **Kontour's products sit on top** — evaluation and evidence producers (e.g. Survey) emit Hachure bundles; consumers read derived trust over the MCP surface. Producers own their domain; the kernel owns portable trust primitives; dependencies point one way.

## The gap nobody else fills

The standards world has thoroughly solved **portable attestation** — signing and recording *frozen statements* at a point in time. What none of them standardize is the step *after*: **"what is this claim worth right now?"** Every adjacent standard delegates that appraisal to unpublished, verifier-specific local policy.

- **IETF SCITT (RFC 9943, Proposed Standard, June 2026)** registers signed statements on append-only transparency services and returns receipts — and *explicitly declares registration policy, trust anchors, and the relying-party trust decision out of scope*. ([RFC 9943](https://www.rfc-editor.org/info/rfc9943))
- **in-toto / DSSE / SLSA / Sigstore** seal statements about artifacts; verification means checking a signature, not re-deriving a status.
- **NIST OSCAL Assessment Results** is a snapshot *document* with assessor-populated status fields and no executable appraisal function.
- **C2PA** recomputes only *cryptographic validity* at validation time, not a policy-driven status.
- **RATS/EAT** has an "appraisal" concept but *centralizes* it in a trusted Verifier and seals the result; the appraisal policy is left unstandardized.
- **W3C VC status lists** publish a revocation *bit the issuer flips* — a lookup, not an appraisal over evidence and policy.
- **General policy engines (OPA/Rego, Cedar, CEL)** do recompute `f(input, policy)` — but they are *languages and runtimes*, not a specific, published, versioned trust-status function. Hachure could run *on* one; the engine is substrate, the standardized function is the product.

**Verdict from the review:** the "portable, recomputable appraisal function + optional sealing" niche is *genuinely unoccupied at the format layer*. Kontour composes with this ecosystem — SCITT/DSSE/Sigstore as sealing and transport, SLSA/OSCAL/C2PA/BOMs as evidence inputs — rather than competing with it.

## The wedge: trust for AI evaluations and agent outputs

The sharpest, least-contested place this matters is AI. An eval result — "the model passed the safety eval," "the agent verified the change" — is produced with rich context and then, crossing a boundary, collapses to a badge or a number. The evidence is gone, there is no expiry, the receiver can't re-check.

- The **problem is funded and named**: enterprise procurement no longer accepts self-reported eval claims (the Texas AG's action over an unproven "0.001% hallucination rate" is the reference case, [Sensiba](https://sensiba.com/resources/insights/ai-accuracy-building-enterprise-trust-through-third-party-attestation/)); a third-party AI-assurance market is scaling with public funding (UK's £11M AI Assurance fund); and 2026 SOC 2 guidance now states plainly that **"continuous control monitoring is an evidence expectation, not a differentiator"** and screenshot evidence "fails freshness tests" ([soc2auditors](https://soc2auditors.org/insights/soc-2-for-ai-companies/)) — which is `status = f(evidence, policy, now)` in the auditor's own words.
- Every AI-attestation *format* shipping today (CycloneDX ML-BOM, OpenSSF Model Signing, in-toto for ML, the IETF model-lifecycle-attestation draft, C2PA, machine-readable model cards) **seals a statement or inventory** — none carries a portable, recomputable eval *conclusion*.
- Kontour's **`conclusionConfidence` + comfort-zone** — a calibrated probability the conclusion is correct plus an in/out-of-distribution signal, carried on the conclusion across the boundary — is *ahead of the ecosystem*; no adopted format ships it. This is the wedge to lead with.

This lane is defined vendor-neutrally in the open standard: [Hachure AI Evaluation profile](https://github.com/hachure-org/spec/blob/main/ai-evaluation.md).

## Honest positioning

- The **problem is real and funded now**; the demand for *this specific format* is a **forward bet** — no regulation mandates recomputable trust yet (EU AI Act, NIST, ISO accept maintained documents), though every one has converged on *continuous* + *cross-boundary* evidence, the two conditions that break sealed attestations.
- The right go-to-market is to **ride under an assurance/attestation motion** buyers already accept, not to sell a novel format cold.
- "Recomputable" honestly means a consumer **re-derives the status under their policy at their now** over the carried evidence — not always re-running the eval, which may be infeasible. Overclaiming here would be self-refuting for a trust product.

For the plain-language version of the problem and solution, see [Start Here](start-here.md). For the trust vocabulary, see [Concepts](concepts.md).
