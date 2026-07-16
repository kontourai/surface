# Where Kontour Fits in the Trust Landscape

This page places Kontour in the wider world of trust, attestation, and provenance
standards — what problem is genuinely unsolved, where Kontour sits, and the
evidence that this position is real rather than aspirational. The claims below are
grounded in an adversarially-verified landscape review (2026-07); sources are
linked inline.

## The layers

- **[Hachure](https://github.com/hachure-org/spec) is the open, vendor-neutral trust format** Kontour created and stewards. It defines portable records — claims, evidence, verification policies, append-only events — and a *published, versioned status function* `status = f(evidence, policy, now)` that any consumer recomputes.
- **The building-block tools** — forage (crawl), traverse (extract), lookout (drift) — emit hachure-evidence-shaped output but depend on nothing in the trust layer; a consumer lifts their output into a bundle.
- **Surface is the integration surface** — the reference implementation of Hachure that derives and validates trust state from bundles and exposes it (CLI, the Surface Console, the MCP surface). Every product speaks the format through Surface.
- **Kontour's products sit on top** — evaluation and evidence producers (e.g. Survey) project through Surface; consumers read derived trust over the MCP surface. Producers own their domain; Surface owns portable trust primitives; dependencies point one way.

For the engineering-canonical version of this stack — the four layers, dependency direction, and today-vs-target state — see the [Portfolio Layer Doctrine](../architecture/portfolio-layer-doctrine.md).

## The gap nobody else fills

The standards world has thoroughly solved **portable attestation** — signing and recording *frozen statements* at a point in time. What none of them standardize is the step *after*: **"what is this claim worth right now?"** Every adjacent standard leaves that appraisal — the relying-party trust decision, and the *content* of any policy — to the verifier.

- **IETF SCITT (RFC 9943, Proposed Standard, June 2026)** registers signed statements on append-only transparency services and returns receipts. It *requires* transparency services to maintain (and even publish) registration policies, but *the relying-party trust decision is explicitly out of scope*, and the appraisal-policy *content* is left to each operator — SCITT standardizes the registry mechanism, not a recomputable status function. ([RFC 9943](https://www.rfc-editor.org/info/rfc9943))
- **in-toto / DSSE / SLSA / Sigstore** seal statements about artifacts; verification means checking a signature, not re-deriving a status.
- **NIST OSCAL Assessment Results** is a snapshot *document* with assessor-populated status fields and no executable appraisal function.
- **C2PA** recomputes only *cryptographic validity* at validation time, not a policy-driven status.
- **RATS/EAT** has an "appraisal" concept but *centralizes* it in a trusted Verifier and seals the result; the appraisal policy is left unstandardized.
- **W3C VC status lists** publish a revocation *bit the issuer flips* — a lookup, not an appraisal over evidence and policy.
- **General policy engines (OPA/Rego, Cedar, CEL)** do recompute `f(input, policy)` — but they are *languages and runtimes*, not a specific, published, versioned trust-status function. Hachure could run *on* one; the engine is substrate, the standardized function is the product.

The closest *ideas* are two 2026 academic preprints (Proof-Carrying Agent Actions; KYA) that describe consumer-side recomputable policy — but both sit in the agent-authorization lane (not eval-conclusion trust), carry no calibrated confidence, and are unadopted research, not shipping formats.

**Verdict from the review:** the "portable, recomputable appraisal function + optional sealing" niche is *genuinely unoccupied at the format layer*. Kontour composes with this ecosystem — SCITT/DSSE/Sigstore as sealing and transport, SLSA/OSCAL/C2PA/BOMs as evidence inputs — rather than competing with it.

## The wedge: trust for AI evaluations and agent outputs

The sharpest, least-contested place this matters is AI. An eval result — "the model passed the safety eval," "the agent verified the change" — is produced with rich context and then, crossing a boundary, collapses to a badge or a number. The evidence is gone, there is no expiry, the receiver can't re-check.

- The **problem is funded and named**: self-reported eval claims no longer pass — in 2024 the Texas Attorney General settled with Pieces Technologies over marketing an unproven "<0.001%" hallucination rate, imposing five years of disclosure obligations ([Texas AG settlement, Sept 2024](https://www.nelsonmullins.com/insights/blogs/ai-task-force/all/texas-attorney-general-announces-first-of-its-kind-healthcare-generative-ai-settlement)). A third-party AI-assurance market is scaling with public funding — the UK's £11M **AI Assurance Innovation Fund** ([DSIT Trusted Third-Party AI Assurance Roadmap, Sept 2025](https://www.gov.uk/government/publications/trusted-third-party-ai-assurance-roadmap/trusted-third-party-ai-assurance-roadmap)). And the compliance-audit world is shifting from point-in-time reports toward *continuous, freshness-tested* evidence — which is `status = f(evidence, policy, now)` in the auditor's own direction of travel.
- Every AI-attestation *format* shipping today (CycloneDX ML-BOM, OpenSSF Model Signing, in-toto for ML, the IETF model-lifecycle-attestation draft, C2PA, machine-readable model cards) **seals a statement or inventory** — none carries a portable, recomputable eval *conclusion*.
- Kontour's **`conclusionConfidence` + comfort-zone** — a calibrated probability the conclusion is correct plus an in/out-of-distribution signal, carried on the conclusion across the boundary — is *ahead of the ecosystem*; no adopted format ships it. This is the wedge to lead with.

This lane is defined vendor-neutrally in the open standard: [Hachure AI Evaluation profile](https://github.com/hachure-org/spec/blob/main/ai-evaluation.md).

## Honest positioning

- The **problem is real and funded now**; the demand for *this specific format* is a **forward bet** — no regulation mandates recomputable trust yet (EU AI Act, NIST, ISO accept maintained documents), though every one has converged on *continuous* + *cross-boundary* evidence, the two conditions that break sealed attestations.
- The right go-to-market is to **ride under an assurance/attestation motion** buyers already accept, not to sell a novel format cold.
- "Recomputable" honestly means a consumer **re-derives the status under their policy at their now** over the carried evidence — not always re-running the eval, which may be infeasible. Overclaiming here would be self-refuting for a trust product.

For the plain-language version of the problem and solution, see [Start Here](start-here.md). For the trust vocabulary, see [Concepts](concepts.md).
