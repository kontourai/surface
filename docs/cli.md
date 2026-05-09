# CLI

The first Surface interface is a local CLI. It should be boring, inspectable, and useful in CI before the product has a hosted console.

## Commands

Generate a report from a native Surface trust input:

```bash
surface report --input examples/surface-fixtures.json --format summary
```

Generate reports from generic example exports:

```bash
surface report --adapter field-attested-records --input examples/field-attested-records-export.json --format summary
surface report --adapter fact-resolution --input examples/fact-resolution-export.json --format summary
```

Output formats:

- `json`: full trust report with claims, evidence, policies, events, and derived summary.
- `summary`: compact human-readable status overview.

## Contract

The CLI does not trust incoming status labels by default. A claim is only `verified` when a verification event and required evidence support it. Commit-scoped verification becomes `stale` when the current integrity reference no longer matches the evidence used by the verification event.

## Near-term additions

- `surface validate` for schema-only checks.
- `surface diff` for comparing two reports.
- `surface adapters` for listing registered adapters and their expected input shapes.
- `surface publish` for writing static reports to Pages or artifact storage.
