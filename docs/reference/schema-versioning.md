# Schema Versioning

Surface schemas are product contracts. They should change more slowly than implementation details because adapters, agents, CI jobs, and future hosted services will depend on them.

## Current version

Surface **writes** TrustBundles as schema version 5, 7 or 8 according to their
content, and writes TrustReports as version 5. On **read**, it accepts
`schemaVersion: 2` through `8` (see
[v3 to v5 migration](#v3-to-v5-migration) for the one-release read-tolerance
shim that covers 2-4). Each version is a strict superset of the one before
it except for the deliberate v5 `surface` to `facet` wire rename documented
below. The v6 and v7 fields are additive and optional, so adapters can adopt
them on their own cadence. Version 8 adds one optional field and, for bundles
that declare it, two validation rules; see
[v7 to v8 migration](#v7-to-v8-migration).

Version 7 adds `runtime_observation` evidence and the optional
`execution.environment` field (`test`, `staging`, or `production`). A policy
can require `runtime_observation` when passing tests alone must not verify a
claim about deployed behavior. Surface stamps emitted TrustBundles
content-sensitively: bundles using either v7 evidence field, or a policy that
requires `runtime_observation`, declare version 7; pure-v5 content remains at
version 5 so Hachure 0.14 and older receivers do not reject it. An explicitly
versioned `TrustBundleBuilder` fails when its declaration is too old for its
content.

Hachure's `trust-report.schema.json` (unchanged in 0.16) still permits only
top-level versions 5 and 6, even though its embedded claim, evidence and policy
references accept the v7 and v8 vocabulary. `buildTrustReport` therefore continues declaring version 5 while
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
`[5, 6, 7, 8]`; Surface-generated TrustReports remain version 5, and generated
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

The tolerance does not extend to unknown keys. `validateTrustBundle` rejects a
top-level key the Hachure trust-bundle schema does not define (the schema is
closed with `additionalProperties: false`) with `trust bundle contains
unsupported field: <key>`, the same way the claim, evidence, and event
validators reject unknown record fields. It also rejects two claims or two
evidence items that share an id, since every reference in a bundle resolves by
id. A producer adding a new block must wait for a schema and Surface release
that define it; an older reader fails loudly instead of returning a bundle and
report that silently dropped the block.

Rollout note: this rejects some bundles that validated before. Two known
producer shapes added a root key. Fieldwork's reviewed export before 0.11.0
added `reviewedGrounding` and `reviewRound` at the bundle root, so the
exported file was refused when fed back into `validateTrustBundle` or `surface
report`. From 0.11.0 the export wraps the bundle instead of extending it —
`{ apiVersion, kind: "ReviewedExport", bundle, reviewedGrounding, reviewRound }`
— and the `bundle` member validates on its own (extract it with `jq .bundle
reviewed.json`). At least one CLI tool writes a
`critique_resolution_events` key at the root, which is now refused. Producers
should carry such data outside the bundle, as Fieldwork's wrapper does, or in
the record-level `metadata` fields of claims and evidence.

The [Quickstart](../../README.md#quickstart) intentionally ships
`examples/surface-example-bundle.json` still in this legacy `surface` /
`schemaVersion: 3` shape (rather than migrating it) so a first-run `surface
report` doubles as a live demonstration of this exact read-tolerance
behavior — you will see the deprecation warning on stderr the first time you
run it.

## v7 to v8 migration

Version 8 arrives with Hachure 0.16. It changes one record: a claim's optional
`conclusionConfidence`.

- **New field.** `conclusionConfidence.calibration` names the calibration table
  a calibrator applied to produce `value`: `tableRef` and `tableVersion`
  (required, non-empty strings), and optional `method`, `sampleSize` (an
  integer of at least 1) and `boundMethod`. No other key is allowed. The object
  is validated whenever it is present, at any schema version.
- **Rules for bundles that declare `schemaVersion: 8`.**
  - `value` requires `calibration`. A raw or self-reported score never goes in
    `value`.
  - `interval.low` and `interval.high` lie in `[0, 1]`.
  - `interval.low <= interval.high`, and when `value` is present,
    `interval.low <= value <= interval.high`. JSON Schema cannot express these
    two; `validateTrustBundle` checks them in code, as Hachure's own validator
    does.
  - `validateTrustBundle` also applies the rest of the claim schema's
    `conclusionConfidence` shape to a version 8 bundle (`value` in `[0, 1]`, no
    unknown keys, `comfortZone.within` required). For versions 2-7 it keeps
    checking only that `conclusionConfidence` is an object, as before.
- **Earlier versions are unchanged.** A version 5-7 bundle may still carry
  `value` without `calibration`.

Emitters (`TrustBundleBuilder`, `mergeBundles`, the verification responder)
declare version 8 only when a claim carries `conclusionConfidence.calibration`.
Content without it stays at 5 or 7, so declaring 8 never makes existing
uncalibrated confidence invalid. An explicitly versioned `TrustBundleBuilder`
below 8 throws when its content carries `calibration`. Merging a bundle that
carries `calibration` with one that carries an uncalibrated `value` produces a
version 8 bundle that `validateTrustBundle` refuses; calibrate or drop the
uncalibrated value first.

To adopt v8 as a producer: add `calibration` beside every
`conclusionConfidence.value` you emit, keep interval bounds inside `[0, 1]` and
around `value`, and declare `"schemaVersion": 8` (or let the builder infer it).

Version 8 is a schema change only. `conclusionConfidence` is carried, not
derived: the status function never reads it.

### Status function version 3

Hachure 0.16 also moves the status function from version `"2"` to `"3"`. This
is independent of `schemaVersion`: it applies to every bundle Surface derives,
whatever version the bundle declares. The governing rule is that omission fails
closed — leaving out an input the policy depends on can only weaken a derived
status. A bundle derives a different status under `"3"` exactly when one of
these applies to a claim whose latest event is `verified` (or, where noted, to
any claim):

| Bundle shape | `"2"` | `"3"` |
|---|---|---|
| No policy resolves for the claim (also for an authority-gated resolution to `verified`) | `verified` | `proposed` |
| `verificationPolicyId` names a policy that is not in the bundle | policy resolved by `claimType` | no policy: `proposed` |
| The resolved policy has empty `requiredEvidence` and no `requiredMethods` | `verified` | `proposed` |
| Required check evidence (`test_output`, `calculation_trace`, `runtime_observation`) has `passing` absent, or `passing: false` with `blocking: false` | `verified` | `proposed` |
| Corroboration is met only by counting check evidence without `passing: true` | `verified` | `proposed` |
| `commit` validity rule and no `claim.currentIntegrityRef` | `verified` | `stale` |
| `validityRule.kind` missing or unknown | `verified` | `stale` |
| `duration` rule with `durationDays` missing, negative or not finite; unparseable verification time | `verified` (or `stale`, by `now`, for a negative window) | `stale` |
| `ttlSeconds` negative or not finite; unparseable `expiresAt` | `verified` (or `stale`, by `now`, for a negative window) | `stale` |
| A blocking failure and an unmet requirement together | `proposed` | `disputed` |
| No event and no evidence, under a policy that requires nothing (any claim without a `proposed` / `assumed` baseline) | `proposed` | `unknown` |
| A dispute-resolution event whose `AuthorityTrace` window (`revokedAt`, `validFrom`, `validUntil`) is spelled differently from the event time: no milliseconds, or another UTC offset | compared as strings, so the trace can read active when it is revoked or expired, or the reverse | compared as instants |
| An event whose `createdAt` cannot be parsed | order left to a NaN comparison | sorts as the oldest event |
| Evaluation with an invalid `now` (any claim) | freshness checks pass | refused (`RangeError`) |

Two rules Hachure lists as new in `"3"` were already Surface's behaviour under
`"2"` and so change nothing here: an `invalidation` event with a non-terminal
status derives `stale`, and the derivation ceiling uses the ordering `revoked` <
`rejected` < `disputed` < `superseded` < `stale` < `unknown` < `assumed` <
`proposed` < `verified` with a missing input counted as `unknown`.

`validateTrustBundle` already refuses several of these shapes (a dangling
`verificationPolicyId`, a `duration` rule without a finite `durationDays`, an
unknown validity kind, an unparseable timestamp), so they reach derivation only
from typed or in-memory input.

By default `validateTrustBundle` no longer refuses a verified claim under a
`commit` rule without `currentIntegrityRef`: that claim now derives `stale`
instead of `verified`, so the refusal has nothing left to guard. Under `"2"` it
still derives `verified`, so a caller that derives under `"2"` must validate
for it too: `validateTrustBundle(input, { statusFunctionVersion: "2" })` keeps
the refusal exactly as it was before this release.

The authority-window row has no Hachure 0.16.0 conformance vector; Surface
checks it against the `hachure` package's bundled implementation instead. As
in that implementation, a window bound that is present but cannot be parsed
does not exclude the trace.

To keep a claim `verified` under `"3"`:

- attach a policy that names at least one required evidence type or method;
- set `passing: true` on check evidence that passed;
- set `currentIntegrityRef` on claims governed by a `commit` rule.

#### Producers of claims verified by a policy that requires nothing

Some producers record a review, critique or sign-off as a claim with a
`verified` event, governed by a policy whose `requiredEvidence` is empty, often
with no evidence at all. Under `"3"` these claims derive `proposed` (or
`unknown` when there is no event either), and setting `passing: true` does not
help, because there is no check evidence to set it on. To keep them `verified`:

1. Emit the attestation as evidence on the claim: `evidenceType:
   "human_attestation"` (or `"attestation"`), `method: "attestation"`, with the
   reviewer in `collectedBy` and the review record in `sourceRef`.
2. Require it: put that evidence type in the policy's `requiredEvidence` (and
   the method in `requiredMethods` if it matters).
3. Link the evidence from the verified event's `evidenceIds`.

Bundles already written do not change. A consumer that must read them as they
were derived can re-derive under `"2"`, the version recorded on the report or
inquiry record made from them.

#### Selecting version 2

Version `"2"` stays selectable so a record resolved under it can be re-derived:
pass `statusFunctionVersion: "2"` to `buildTrustReport`, `deriveTrustSnapshot`,
`deriveClaimStatus`, `deriveTrustStatus`, `resolveInquiry`,
`evaluateDerivationRule` or `validateTrustBundle`. The report, inquiry record
and checkpoint record the version used, and a checkpoint is only reused by a
derivation under the same version. Any other value is refused.

Version `"2"` is selectable through the library API only. The `surface` CLI
(`report`, `console` and the other commands), the console read model and the
MCP tools always derive under the current version, `"3"`, and have no flag for
it.

`explainClaim` now reports each evidence item's own `passing` value when the
item has no `execution` record: `true`, `false`, or `null` when it reports no
result. It previously reported `true` for any such item that was not marked
disputed.

## Migration expectation

Every schema change should include:

- updated JSON schema
- updated TypeScript types
- example demonstrating the new shape
- report-generation test coverage
- docs note explaining why the new field belongs in the trust model
