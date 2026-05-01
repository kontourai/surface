# Fact Resolution Example

This example proves Surface can model high-stakes fact verification, citations, assumptions, and discrepancy review.

## Input

The example reads a compact fact-resolution export with:

- `verifiedFacts`
- `resolvedFacts`
- `returnPackage`
- return-package fields and citations
- assumptions
- comparison summaries
- review signals

The source workflow is not named here and real adapters belong in downstream product repos. Surface only imports a JSON artifact.

## Output

The adapter emits standard Surface records:

- `verified-fact` claims for verified facts.
- `resolved-fact` claims for resolved facts that still need verification.
- `return-package-field` claims for generated return-package fields.
- `review-signal` claims for assumptions, material comparison gaps, and review-required signals.

## Trust behavior

- Verified facts become `verified`.
- Resolved-but-not-verified facts remain `proposed`.
- Citation-backed generated return fields can become `verified`.
- Unresolved return-package fields remain `unknown`.
- Assumptions, material comparison gaps, and review-required signals become `disputed`.

## CLI

```bash
surface report --adapter fact-resolution --input examples/fact-resolution-export.json --format summary
```
