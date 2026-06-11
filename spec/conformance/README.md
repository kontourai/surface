# Spec Conformance Fixtures

This directory contains input bundles and expected per-claim statuses that make
the [Status Derivation specification](../status-function.md) executable.

Each fixture is a JSON file with an `input` (a valid TrustBundle) and an `expect`
object listing expected per-claim statuses at a fixed `now` timestamp. The test at
`tests/spec-conformance.test.ts` loads every fixture and asserts that the reference
implementation derives the expected statuses.

## Fixture inventory

| File | Scenario | Now |
|---|---|---|
| `sf-verified-commit.json` | Commit-scoped policy — verified when integrity ref matches | 2026-06-10T00:00:00.000Z |
| `sf-stale-duration.json` | Duration policy — stale when window expired | 2026-06-10T00:00:00.000Z |
| `sf-disputed-blocking.json` | Verified event + blocking contradicting evidence → disputed | 2026-06-10T00:00:00.000Z |
| `sf-authority-resolved.json` | Disputed claim resolved by authority-gated event | 2026-06-10T00:00:00.000Z |
| `sf-surface-fixtures-snapshot.json` | Full surface-fixtures.json at fixed now — four claims | 2026-06-10T00:00:00.000Z |

## Fixture format

```json
{
  "now": "<ISO 8601 string>",
  "input": { /* TrustBundle */ },
  "expect": {
    "statusByClaimId": { "<claimId>": "<TrustStatus>" }
  }
}
```
