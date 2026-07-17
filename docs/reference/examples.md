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

## Contract-Claim Examples And Policy Template

The [Hachure contract-claims
profile](https://github.com/hachure-org/spec/blob/main/contract-claims.md) models
an integration assertion whose truth depends on a provider-consumer boundary.
Contract claims use `claimType: "contract"` and these REQUIRED qualifiers,
spelled exactly as shown:

- `provider`: the component or boundary that supplies the value, shape, state,
  or behavior.
- `consumer`: the component that relies on what the provider supplies.
- `contract`: a concise, testable statement of what must cross or hold at the
  boundary.

Qualifier values are producer-owned identifiers. Producers SHOULD keep them
stable across runs so consumers can compare and merge repeated observations of
the same scoped contract. Because qualifiers participate in canonical claim
identity, rewording the concise `contract` statement forks cross-producer and
merge identity rather than merely changing display text.

Use this reusable verification-policy template for contract claims emitted by
Veritas checks, Flow gates, plumb-style probes, and other producers:

```json
{
  "id": "policy.contract.live-exercise",
  "claimType": "contract",
  "requiredEvidence": ["runtime_observation"],
  "requiredMethods": ["observation"],
  "requiresCorroboration": false,
  "acceptanceCriteria": [
    "the provider-to-consumer path is exercised in a running target environment",
    "the observed result directly entails the stated contract"
  ],
  "reviewAuthority": "deployment-verifier",
  "validityRule": { "kind": "duration", "durationDays": 7 },
  "stalenessTriggers": [
    "provider configuration changes",
    "consumer version changes",
    "target environment is redeployed"
  ],
  "conflictRules": ["a blocking failed live exercise disputes the claim"],
  "impactLevel": "critical"
}
```

A qualifying receipt uses `evidenceType: "runtime_observation"` and includes
an `execution` block with schema-required `runner` and `label`, plus
`environment` and `exitCode`. Record whether a secret or field was present and
whether a payload parsed; never record secret values. An execution environment
is descriptive, not automatically live: a producer MUST NOT label a unit test
`production` and treat that label alone as an end-to-end exercise. The
receipt's content and collection path must establish that the
provider-to-consumer boundary was actually traversed.

The suggested seven-day window is a starting point, not a universal lifetime;
material provider, consumer, or deployment changes should trigger recollection
sooner. A deployment-bound producer MAY instead use a commit validity rule when
the evidence and current integrity reference reliably bind both endpoints and
their deployment config.

`examples/contract-claim-env-passthrough.json` shows the conservative failure
shape. A test proves launcher wiring, but cannot prove that configuration
reached the deployed consuming process, so Surface derives `proposed` plus a
blocking `provenance_gap` for the missing runtime observation and a blocking
`policy_violation` for the missing observation method.

`examples/contract-claim-payload-shape.json` shows the passing shape. A live
production receipt records that an external download had the expected fields
and the consuming parser accepted it, so Surface derives `verified`.

Status-function Step 4b checks required evidence types and methods as
independent sets across all entailing evidence. It does not guarantee that one
evidence item pairs `runtime_observation` with `observation`. Corroboration is a
different policy axis, controlled by `requiresCorroboration`.

Contracts SHOULD graduate to a schema-level relational subject only when a
conforming derivation or merge rule must understand the endpoints as structured
relations. Until such an observable interoperability need exists, producers
MUST represent the relation with this profile's free-form qualifiers and MUST
NOT invent `hachure.org/*` extension namespaces for contract subjects,
qualifiers, or claims.

## Example contract

An example is not just sample data. It is a regression contract for what the company means by trust: source, evidence, freshness, failure mode, and reviewability must remain visible.
