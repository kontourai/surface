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

## Trace

A trace is the evidence path behind a claim. It should let a reviewer move from a badge or status back to the source, proof, or decision.

## Check

A check is a verification run or event. Checks can promote a claim to verified, mark it stale, dispute it, reject it, or supersede it.

## Drift

Drift means a once-trusted claim may no longer be safe to rely on. Drift can come from time, source changes, new conflicting evidence, or code changes.

## Fault line

A fault line is a conflict between claims, evidence, or policies. Surface should make conflicts visible instead of smoothing them over.

Fault lines are report annotations in the current contract. They expose provenance gaps, policy violations, freshness breaches, missing corroboration, unsupported inferences, and contradictions without changing trust status by themselves.

## Coverage

Coverage measures how much of a product surface is supported by current evidence and policy.
