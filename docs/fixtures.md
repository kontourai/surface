# Fixtures

Fixtures are the first proof that Surface is not just a concept document. They show how different products can map into one trust model without pretending every domain verifies truth the same way.

## Native fixture

`examples/surface-fixtures.json` is a canonical Surface trust input. It includes claims inspired by:

- Veritas developer proof lanes
- Campfit public-data freshness
- Taxes verified facts and discrepancy review

## Veritas fixtures

`examples/veritas-evidence.json` is a passing Veritas evidence artifact. The adapter maps it into:

- affected surface claims
- selected proof command claims
- policy result claims
- verification events grounded in the evidence timestamp and source reference

`examples/veritas-evidence-fail.json` is a failing artifact. It proves failed proof lanes and blocking policy rules become rejected Surface claims instead of optimistic confidence.

## Campfit fixture

`examples/campfit-trust-export.json` includes approved field sources, active and stale attestations, an open review flag, completed and failed crawls, and pending/rejected proposals. It proves public-data trust can use the same statuses as developer proof without losing domain context.

## Taxes fixture

`examples/taxes-trust-export.json` includes verified facts, resolved facts needing verification, return-package citations, unresolved fields, assumptions, comparison gaps, and review signals. It proves high-stakes financial truth needs provenance and review state, not a single confidence score.

## Fixture rule

A fixture is not just sample data. It is a regression contract for what the company means by trust: source, proof, freshness, failure mode, and reviewability must remain visible.
