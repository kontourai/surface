# Schema Versioning

Surface schemas are product contracts. They should change more slowly than implementation details because adapters, agents, CI jobs, and future hosted services will depend on them.

## Current version

Surface accepts both `schemaVersion: 2` and `schemaVersion: 3`. Version 3 is a
strict superset of v2: every v2 input remains a valid v3 input. New fields are
additive and optional, so adapters can adopt them on their own cadence.

Version 3 covers everything v2 covers plus:

- `subjectAliases` on a claim and top-level `identityLinks` for cross-system identity resolution
- `parentType` on a verification policy, enabling claim-type families and most-specific policy resolution
- `incompatibleValues` and `incompatibleStatuses` on a verification policy, which the kernel uses to surface contradictions across same-subject claim pairs
- `derivedFrom` on a claim, which bounds derived-claim status by the weakest input
- a linked-data export envelope with a stable `@context`

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

## v2 to v3 migration

Version 3 is opt-in. To adopt it:

- bump the top-level field to `"schemaVersion": 3`
- start using any of the new optional fields (aliases, parent types, incompatibility rules, derived claims, linked export)
- nothing else has to change — existing fixtures, policies, and adapters remain valid

When the kernel validates a v3 input, every v3-only field passes through the
same strict validation as v2 fields: structural checks reject malformed shapes
rather than silently dropping them.

## Migration expectation

Every schema change should include:

- updated JSON schema
- updated TypeScript types
- fixture demonstrating the new shape
- report-generation test coverage
- docs note explaining why the new field belongs in the trust model
