# Schema Versioning

Surface schemas are product contracts. They should change more slowly than implementation details because adapters, agents, CI jobs, and future hosted services will depend on them.

## Current version

The initial schema family is `0.1.x` and covers:

- claims
- evidence
- verification policies
- verification events
- trust reports

## Compatibility rules

- Additive optional fields can ship in minor releases.
- Required fields need a major schema version or a migration helper.
- Enum additions are compatibility-sensitive because old validators may reject them.
- Removed fields require a documented replacement and fixture coverage.
- Adapter-specific records should stay outside the core schema unless the concept is portable across products.

## Migration expectation

Every schema change should include:

- updated JSON schema
- updated TypeScript types
- fixture demonstrating the new shape
- report-generation test coverage
- docs note explaining why the new field belongs in the trust model
