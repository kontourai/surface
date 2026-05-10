# Concepts

## Surface

A surface is an area of a product where claims are made. It can be code, data, docs, workflows, generated reports, or user-facing UI.

## Claim

A claim is the smallest trust-bearing unit: a subject, field or behavior, value, status, and metadata.

Examples:

- A field-attested record has `registrationStatus = OPEN`.
- A resolved fact has `w2.wages = 123456`.
- A repo surface requires `npm test` before a change is trusted.

## Evidence

Evidence explains why a claim deserves trust. It can be a source excerpt, test output, human attestation, calculation trace, document citation, crawl observation, or policy rule.

Each evidence record also declares a verification method: observation, extraction, validation, corroboration, attestation, auditability, anchoring, or monitoring. The evidence type says what the artifact is; the method says how much verification depth it represents.

## Attestation

Attestation is the canonical shape for a human saying, "this policy, record, or source is the reviewed thing I approve." Use `evidenceType: "attestation"` with `method: "attestation"`, set `collectedBy` to the attesting actor, and put the attested content hash in `integrityRef`. Consumers should include the actor identity, attestation timestamp, optional expiry, and content hash in `metadata`.

The exported `buildHumanAttestationEvidence({ subject, actor, attestedAt, validUntil, contentHash })` helper builds this evidence record for consumers that need a consistent human attestation payload.

## Trace

A trace is the evidence path behind a claim. It should let a reviewer move from a badge or status back to the source, proof, or decision.

## Check

A check is a verification run or event. Checks can promote a claim to verified, mark it stale, dispute it, reject it, or supersede it.

## Drift

Drift means a once-trusted claim may no longer be safe to rely on. Drift can come from time, source changes, new conflicting evidence, or code changes.

## Fault line

A fault line is a conflict between claims, evidence, or policies. Surface should make conflicts visible instead of smoothing them over.

Fault lines are report annotations in the current contract. They expose provenance gaps, policy violations, freshness breaches, missing corroboration, unsupported inferences, and contradictions without changing trust status by themselves.

## Trust Report

`buildTrustReport(input, options?)` is the stable public API that turns a validated `TrustInput` into a `TrustReport`. The report preserves the input claims, evidence, policies, and events, then adds derived status, freshness outcomes, proof requirements, fault lines, subject groups, and summary counts.

Consumers should project product-specific workflow data into `TrustInput`, call `validateTrustInput`, and then call `buildTrustReport`. Product layers may persist a compact report summary, but Surface remains responsible for deriving statuses such as `verified`, `stale`, `disputed`, and `rejected`.

## Confidence Basis

Confidence basis records how much verification depth supports a claim. It captures:

- `sourceQuality`: the quality of evidence source (strong, moderate, weak)
- `reviewerAuthority`: who verified the claim (system, human, agent)
- `proofStrength`: for technical proofs, the proof strength (strong, moderate, weak)

When claims depend on other claims (`derivedFrom`), the confidence ceiling is determined by the weakest link in the chain. Surface applies derivation ceilings to prevent upstream weak links from inflating downstream confidence.

## Derivation

When one claim depends on another (e.g., a proof-family claim depends on proof-lane outcomes), the dependent claim carries a `derivedFrom` field. This chains the provenance so reviewers and systems can:

- Detect when upstream claims become stale
- Apply confidence ceilings (derived claims cannot be stronger than their sources)
- Surface conflict when an upstream claim is disputed or superseded

## Coverage

Coverage measures how much of a product surface is supported by current evidence and policy.
