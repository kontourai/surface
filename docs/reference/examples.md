# Examples

Examples are the first evidence that Surface is not just a concept document. They show how different products can map into one trust model without pretending every domain verifies truth the same way.

## Native example bundle

`examples/surface-example-bundle.json` is a canonical Surface trust input. It includes claims inspired by:

- repo-governance evidence checks
- field-attested public-data freshness
- fact-resolution verified facts and discrepancy review

It uses `schemaVersion: 3`, required evidence methods, structured policy method requirements, report-derived requirement fields, and typed transparency gap output through the current `transparencyGaps` field.

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

## Answer Provenance Product Profile Example

`examples/answer-provenance.json` is a rendered end-to-end reference bundle for
an answer product. It distinguishes an LLM answer receipt from routing and
tool-use context claims. Only declared entailing evidence for the exact answer
claim can satisfy its policy; context never becomes semantic answer support by
shared metadata or proximity. See [Authoring a Product Profile](../guides/authoring-product-profile.md)
for the extension, packaging, and interoperability boundary.

## Package-Safety (npm audit) Example

`examples/npm-audit-export.json` is raw `npm audit --json` output. It shows
how a producer maps a third-party audit report into Evidence that supports or
challenges an authored package-safety claim — see [Use Cases](../product/use-cases.md)
for the full mapping and why a freshness policy keeps the claim from staying
`verified` on the strength of a stale scan.

## System Card Demo

`examples/system-card/` is the flagship demo for `@kontourai/surface`: a
fictional model/system card (`bundle.json`) decomposed into evidenced claims,
driven end to end by `run-demo.ts` (`npm run build && node
dist/examples/system-card/run-demo.js`). It walks all three ADR 0003 verbs —
Assert, Observe, Resolve — including staleness over time, exact/derived/
unsupported `resolveInquiry` outcomes, dispute resolution via
`buildDisputeResolutionEvent`, and in-toto/DSSE assertion. See
[`examples/system-card/README.md`](../../examples/system-card/README.md) for
the full walkthrough.

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

## Worked Example: Data-Flow (Privacy) Claim

`examples/data-flow-privacy-claim.json` asserts that transcript excerpts reach
only the configured model runtime. The claim is about what a running
deployment does with data, so its policy requires `runtime_observation`
evidence with the `observation` method, so a passing unit test, recorded
honestly as `test_output`, cannot satisfy it.

The evidence comes from a marker test. The probe plants a unique marker string
in one transcript excerpt on the running deployment and captures every
outbound path it can see: requests, log lines, and telemetry payloads. It then
records where the marker appeared. The receipt is ordinary `Evidence` with
`evidenceType: "runtime_observation"`, a `passing` result, and an `execution`
block whose `environment` says where it ran. The excerpt records counts and
destinations, never the transcript content.

The bundle has three deployments under one policy. At `2026-10-04T00:00Z` they
derive:

| Claim | Evidence | Status |
| --- | --- | --- |
| `deployment-a` | Passing marker run in `staging` | `verified` |
| `deployment-b` | Passing unit test against a network double (`test_output`, `environment: "test"`) | `proposed`, with a blocking `provenance_gap` and `policy_violation` |
| `deployment-c` | A passing marker run, then a later run that found the marker in an error-report payload (`passing: false`, `blocking: true`) | `disputed` |

The policy's seven-day `duration` window means a data-flow claim cannot stay
`verified` on an old run: `deployment-a` derives `stale` after
`2026-10-08T10:05Z`, and by then so has `deployment-b`. The policy's `stalenessTriggers` (a new outbound
integration, a changed runtime endpoint, changed logging) are descriptive. No
derivation step reads them, so the producer must re-run the probe when one
fires. Once its window lapses, `deployment-c` also derives `stale`, because
the staleness check runs before the blocking-failure check. Its blocking
`policy_violation` gap for the leaking run remains, so a consumer that gates
on blocking gaps still refuses it.

The status function trusts the producer's labels. It checks that a
`runtime_observation` with the `observation` method is present, not that the
run touched a live system, and `environment` only records where the probe ran.
What makes this evidence live is the probe itself: the marker crossed the real
outbound paths of a running deployment. A producer that labels a unit test
`runtime_observation` would derive `verified`, and that mislabel is the
producer's fault, not something Surface detects.

```ts
import { readFileSync } from "node:fs";
import { buildTrustReport, validateTrustBundle } from "@kontourai/surface";

const bundle = validateTrustBundle(
  JSON.parse(readFileSync("examples/data-flow-privacy-claim.json", "utf8")),
);
buildTrustReport(bundle, { now: new Date("2026-10-04T00:00:00Z") });
```

## Worked Example: Learned-Rule Freshness

`examples/learned-rule-freshness.json` models rules an agent learned from a
developer's messages. Each rule is a claim (`claimType: "agent-rule"`) whose
value is the rule's wording. Its policy requires two kinds of evidence:

- A `source_excerpt` with `method: "extraction"` that quotes the message the
  rule came from and points at it with `sourceRef` and `sourceLocator`. A model
  did the extraction, so the item records `collectedByKind: "model"` and names
  the model in `metadata.collectorModel`.
- A `human_attestation` with `method: "attestation"` and
  `collectedByKind: "human"`, recording that a maintainer compared the rule
  with its source and ratified it. A person's review of model output is
  separate evidence, not a property of the extraction item.

A producer that holds the full review record can project the extraction item
with the [reviewed-extraction profile](../guides/reviewed-extraction-evidence.md)
instead. This example keeps the extraction as plain evidence so the freshness
behavior is easy to follow.

Ratification is not permanent. Each rule carries its own freshness, which
overrides the policy's validity window:

| Claim | Freshness | `2026-10-06` | `2026-10-20` | `2027-01-05` |
| --- | --- | --- | --- | --- |
| `open-pull-request` | `ttlSeconds: 15552000` (180 days from the ratification) | `verified` | `verified` | `stale` |
| `release-freeze` | `expiresAt: 2026-10-16T00:00Z` (a temporary rule) | `verified` | `stale` | `stale` |
| `squash-commits` | Extracted, never ratified | `unknown` | `unknown` | `unknown` |

A stale rule reports a blocking `freshness_breach` gap, so a consumer that
loads rules into an agent can refuse it or send it back for re-ratification.
The unratified rule reports a `provenance_gap` for the missing
`human_attestation` and a `policy_violation` for the missing `attestation`
method. The extraction alone never establishes the rule, however confident the
extractor was. Its status is `unknown` rather than `proposed` because the
policy's required `human_attestation` evidence is missing: a claim with all
required evidence but no `verified` event would derive `proposed`.

`tests/worked-examples.test.ts` validates both bundles against the schemas and
Surface's validator, and checks every status above.

## Example contract

An example is not just sample data. It is a regression contract for what the company means by trust: source, evidence, freshness, failure mode, and reviewability must remain visible.
