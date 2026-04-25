# Taxes Adapter

The taxes adapter proves Surface can model high-stakes fact verification, citations, assumptions, and discrepancy review.

## Input

The adapter reads a compact taxes trust export with:

- `verifiedFacts`
- `resolvedFacts`
- `returnPackage`
- return-package fields and citations
- assumptions
- comparison summaries
- review signals

The source tax workflow is not changed. Surface only imports a JSON artifact.

## Output

The adapter emits standard Surface records:

- `tax-verified-fact` claims for verified facts.
- `tax-resolved-fact` claims for resolved facts that still need verification.
- `tax-return-field` claims for generated return-package fields.
- `tax-review-signal` claims for assumptions, material comparison gaps, and review-required signals.

## Trust behavior

- Verified facts become `verified`.
- Resolved-but-not-verified facts remain `proposed`.
- Citation-backed generated return fields can become `verified`.
- Unresolved return-package fields remain `unknown`.
- Assumptions, material comparison gaps, and review-required signals become `disputed`.

## CLI

```bash
surface report --adapter taxes --input examples/taxes-trust-export.json --format summary
```
