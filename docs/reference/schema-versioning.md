# Schema Versioning

Surface schemas are product contracts. They should change more slowly than implementation details because adapters, agents, CI jobs, and future hosted services will depend on them.

## Current version

Surface **writes** TrustBundles as schema version 5 or 7 according to their
content, and writes TrustReports as version 5. On **read**, it accepts
`schemaVersion: 2` through `7` (see
[v3 to v5 migration](#v3-to-v5-migration) for the one-release read-tolerance
shim that covers 2-4). Each version is a strict superset of the one before
it except for the deliberate v5 `surface` to `facet` wire rename documented
below. The v6 and v7 fields are additive and optional, so adapters can adopt
them on their own cadence.

Version 7 adds `runtime_observation` evidence and the optional
`execution.environment` field (`test`, `staging`, or `production`). A policy
can require `runtime_observation` when passing tests alone must not verify a
claim about deployed behavior. Surface stamps emitted TrustBundles
content-sensitively: bundles using either v7 evidence field, or a policy that
requires `runtime_observation`, declare version 7; pure-v5 content remains at
version 5 so Hachure 0.14 and older receivers do not reject it. An explicitly
versioned `TrustBundleBuilder` fails when its declaration is too old for its
content.

Hachure 0.15's `trust-report.schema.json` still permits only top-level versions
5 and 6, even though its embedded evidence and policy references accept the v7
vocabulary. `buildTrustReport` therefore continues declaring version 5 while
carrying those widened pass-through records. This is an upstream schema
limitation, not a different evidence interpretation.

Version 3 covers everything v2 covers plus:

- `subjectAliases` on a claim and top-level `identityLinks` for cross-system identity resolution
- `parentType` on a verification policy, enabling claim-type families and most-specific policy resolution
- `incompatibleValues` and `incompatibleStatuses` on a verification policy, which the kernel uses to surface contradictions across same-subject claim pairs
- `derivedFrom` on a claim, which bounds derived-claim status by the weakest input
- a linked-data export envelope with a stable `@context`

## Versioning Rules

- Additive optional fields can ship in minor releases.
- Required fields need a major schema version or a migration helper.
- Enum additions are version-sensitive because older validators may reject them.
- Removed fields require a documented replacement and example coverage.
- Adapter-specific records should stay outside the core schema unless the concept is portable across products.

## v1 to v2 migration

Version 2 intentionally chooses a clean contract over silent acceptance:

- add top-level `"schemaVersion": 2` to Surface trust inputs and reports
- add `method` to every evidence record
- add `requiredMethods` and `requiresCorroboration` to verification policies when method depth matters
- read requirement data from report-level `evidenceRequirementsByClaimId`, not duplicated claim fields
- read typed report gaps from `transparencyGaps` and `summary.transparencyGapsByType`

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
- nothing else has to change — existing examples, policies, and adapters remain valid

When the kernel validates a v3 input, every v3-only field passes through the
same strict validation as v2 fields: structural checks reject malformed shapes
rather than silently dropping them.

## v3 to v5 migration

Version 5 is a deliberate hard break on the wire schema, following the
Hachure spec's facet rename: `Claim.surface` and `ClaimDefinition.surface`
are renamed to `facet` (and made optional). `schemas/claim.schema.json`,
`schemas/trust-bundle.schema.json`, and `schemas/trust-report.schema.json`
declared `"schemaVersion": { "enum": [5] }` when the rename shipped — the enum
was reset to a single value rather than widened, because every bundle or report
Surface wrote at that release self-declared `schemaVersion: 5`
(`CURRENT_SCHEMA_VERSION` in `src/types.ts`). There is no `schemaVersion: 4`
in the wild to widen the enum for; version 4 only ever existed as an
in-progress marker for the `expiresAt`/`ttlSeconds` validity-window fields
before this rename shipped.

The current Hachure schemas widen the readable TrustBundle contract to
`[5, 6, 7]`; Surface-generated TrustReports remain version 5, and generated
TrustBundles follow the content-sensitive rule above.

To adopt v5 as a producer:

- rename `surface` to `facet` on every `Claim` and `ClaimDefinition` you emit
- bump the top-level field to `"schemaVersion": 5`
- nothing else has to change — `facet` is optional, exactly like `surface`
  was, and every other v3 field is unchanged

**Reading** is more forgiving than writing. `validateTrustBundle`
(`src/validate.ts`), the local claim-authoring store reader (`src/store.ts`),
and `mergeBundles`/`mergeBundlesDetailed` (`src/merge.ts`) all carry an
owner-ratified TOLERANCE SHIM, kept until the next major release: a claim
that still carries `surface` (with no `facet` already present) has that
value copied onto `facet`, `surface` is stripped and never re-emitted, and a
deprecation warning is printed once per process (not once per claim) the
first time the shim actually does something. Bundles self-declaring
`schemaVersion` 2, 3, or 4 are still accepted on read for the same reason.
This shim is read-tolerance only — it exists so `@kontourai/surface`'s own
reader keeps archived or not-yet-migrated bundles usable while producers
catch up. It is not a permanent feature: the next major release is expected
to drop it, and the wire schema itself never accepted `surface` again after
this bump.

The [Quickstart](../../README.md#quickstart) intentionally ships
`examples/surface-example-bundle.json` still in this legacy `surface` /
`schemaVersion: 3` shape (rather than migrating it) so a first-run `surface
report` doubles as a live demonstration of this exact read-tolerance
behavior — you will see the deprecation warning on stderr the first time you
run it.

## Migration expectation

Every schema change should include:

- updated JSON schema
- updated TypeScript types
- example demonstrating the new shape
- report-generation test coverage
- docs note explaining why the new field belongs in the trust model
