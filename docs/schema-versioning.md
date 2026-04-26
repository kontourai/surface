# Schema Versioning

Surface schemas are product contracts. They should change more slowly than implementation details because adapters, agents, CI jobs, and future hosted services will depend on them.

## Current version

The current trust input and report contract is `schemaVersion: 2` and covers:

- claims
- evidence with required verification `method`
- verification policies
- verification events
- trust reports

## Compatibility rules

- Additive optional fields can ship in minor releases.
- Required fields need a major schema version or a migration helper.
- Enum additions are compatibility-sensitive because old validators may reject them.
- Removed fields require a documented replacement and fixture coverage.
- Adapter-specific records should stay outside the core schema unless the concept is portable across products.

## v1 to v2 migration

Version 2 intentionally chooses a clean contract over silent compatibility:

- add top-level `"schemaVersion": 2` to Surface trust inputs and reports
- add `method` to every evidence record
- add `requiredMethods` and `requiresCorroboration` to verification policies when method depth matters
- read proof requirements from report-level `proofRequirementsByClaimId`, not duplicated claim fields
- read typed report gaps from `faultLines` and `summary.faultLinesByType`

Before:

```json
{
  "source": "example",
  "evidence": [
    { "id": "e1", "claimId": "c1", "evidenceType": "test_output" }
  ]
}
```

After:

```json
{
  "schemaVersion": 2,
  "source": "example",
  "evidence": [
    { "id": "e1", "claimId": "c1", "evidenceType": "test_output", "method": "validation" }
  ]
}
```

## Migration expectation

Every schema change should include:

- updated JSON schema
- updated TypeScript types
- fixture demonstrating the new shape
- report-generation test coverage
- docs note explaining why the new field belongs in the trust model
