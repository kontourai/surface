# Examples

Examples are the first evidence that Surface is not just a concept document. They show how different products can map into one trust model without pretending every domain verifies truth the same way.

## Native example bundle

`examples/surface-example-bundle.json` is a canonical Surface trust input. It includes claims inspired by:

- repo-governance evidence checks
- field-attested public-data freshness
- fact-resolution verified facts and discrepancy review

It uses `schemaVersion: 2`, required evidence methods, structured policy method requirements, report-derived requirement fields, and typed transparency gap output through the current `transparencyGaps` field.

## Field-Attested Records Example

`examples/field-attested-records-export.json` includes approved field sources, active and stale attestations, an open review flag, completed and failed crawls, and pending/rejected proposals. It shows public-data trust can use the same statuses as developer evidence without losing domain context.

## Fact Resolution Example

`examples/fact-resolution-export.json` includes verified facts, resolved facts needing verification, return-package citations, unresolved fields, assumptions, comparison gaps, and review signals. It shows high-stakes truth needs provenance and review state, not a single confidence score.

## Reputation Integrity Example

`examples/reputation-integrity-trust-export.json` distinguishes observed popularity signals, heuristic suspicion, and unsupported owner-intent accusations. It shows Surface can make a verification gap visible without converting weak evidence into a stronger claim.

## Runtime Observation Policy Example

`examples/runtime-observation-policy.json` applies one policy requiring
`runtime_observation` to two otherwise equivalent service-health claims. The
test-only claim derives as `proposed` with a blocking `provenance_gap`; the
claim backed by a production observation derives as `verified`. The optional
`execution.environment` field makes the collection environment explicit, while
the evidence type is what makes the live observation load-bearing.

## Example contract

An example is not just sample data. It is a regression contract for what the company means by trust: source, evidence, freshness, failure mode, and reviewability must remain visible.
