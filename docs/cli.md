# CLI

The first Surface interface is a local CLI. It should be boring, inspectable, and useful in CI before the product has a hosted console.

## Commands

Generate a report from a native Surface trust input:

```bash
surface report --input examples/surface-fixtures.json --format summary
```

Generate reports from a custom registered adapter:

```bash
surface report --adapter my-producer --input producer-export.json --format summary
```

Custom producer packages can register adapters explicitly through the public registry; those registered adapters are available by name with `--adapter`.

Query local trust state from the same report contract:

```bash
surface stale
surface missing
surface get --claim-id claim.field-attested-records.registration-status
surface policy --claim-id claim.field-attested-records.registration-status
```

Author claims in a local claim store:

```bash
surface claim list
surface claim add --type software-evidence --surface veritas.evidence-check --subject-type repository --subject-id my-repo --field "npm test"
surface claim edit --claim-id my-repo.veritas-evidence-check.npm-test --impact high
surface claim remove --claim-id my-repo.veritas-evidence-check.npm-test
surface claim validate
```

Output formats:

- `json`: full trust report with claims, evidence, policies, events, and derived summary.
- `summary`: compact human-readable status overview.
- `linked`: JSON-LD-style linked output for graph-oriented consumers.
- `analytics`: trust analytics projection with producer-namespace coverage, stale/disputed queues, transparency gap rollups through the current `transparencyGaps` field, requirement gaps, confidence basis, and attestation validity signals.

Query commands emit JSON:

- `surface stale`: stale claim queue.
- `surface missing`: evidence and requirement gaps, including weak attestation signals.
- `surface get`: claim drilldown with evidence, events, policy, requirement gaps, current `transparencyGaps` annotations, and a `derivation` read model.
- `surface policy`: policy drilldown or policy index with related claims and gaps.
- `surface claim`: read and write `veritas.claims.json` claim stores.

## Contract

The CLI does not trust incoming status labels by default. A claim is only `verified` when a verification event and required evidence support it. Commit-scoped verification becomes `stale` when the current integrity reference no longer matches the evidence used by the verification event.

`surface get --claim-id <derived-claim>` preserves the existing top-level shape:

```typescript
{
  claim,
  evidence,
  authorityTrace,
  events,
  policy,
  evidenceRequirement,
  transparencyGaps,
  derivation
}
```

The `derivation` field starts at the requested claim and exposes `directInputs`, nested `childInputs`, `leafClaims`, and `diagnostics`. Structured `derivationEdges` keep their method metadata, such as `sum`, `max`, `model`, `rule-application`, `copy`, `normalization`, and `manual`. Leaf claims include their direct evidence and events so agents can explain a derived claim back to source evidence without changing how ordinary claims are consumed.

## Claim Store Flags

`surface claim` defaults to `./veritas.claims.json`. Use `--store <path>` to write elsewhere.

`surface claim add` requires `--type`, `--surface`, `--subject-type`, `--subject-id`, and `--field`. Optional flags are `--id`, `--impact`, `--policy-id`, and `--metadata` with a JSON object.

## Near-term additions

- `surface validate` for schema-only checks.
- `surface diff` for comparing two reports.
- `surface adapters` for listing registered custom adapters and their expected input shapes.
- `surface publish` for writing static reports to Pages or artifact storage.

The `analytics` format is the local evidence-intelligence contract that future query commands, MCP resources, and the Surface Console should consume. It is derived from the report; it is not a hosted store or generic BI surface.
