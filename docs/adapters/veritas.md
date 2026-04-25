# Veritas Adapter

The Veritas adapter is the first real bridge from a product-specific proof system into the Surface trust kernel.

## Input

The adapter reads a Veritas evidence artifact shaped by `veritas/schemas/veritas-evidence.schema.json`.

Important fields:

- `run_id`: source identity for the evidence artifact.
- `timestamp`: observed and verified time for generated evidence.
- `source_ref`: commit, branch diff, or working-tree integrity reference.
- `affected_nodes`: repo surfaces touched by the change.
- `selected_proof_commands`: proof lanes Veritas selected.
- `baseline_ci_fast_passed`: proof-lane result when available.
- `policy_results`: policy pack evaluations and failure details.

## Output

The adapter emits standard Surface records:

- `veritas-affected-surface` claims for affected nodes.
- `software-proof` claims for selected proof commands.
- `veritas-policy-result` claims for policy pack results.
- `policy_rule` and `test_output` evidence tied to the Veritas run.
- verification events that mark passing policy/proof claims as `verified`.
- rejection events for failed baseline proof lanes and blocking policy failures.

## Trust behavior

Passing evidence does not become a generic confidence score. Surface preserves the reason:

- proof commands are backed by `test_output`.
- policy results are backed by `policy_rule`.
- every generated claim keeps the Veritas `source_ref` as its current integrity reference.
- commit-scoped verification becomes stale when the evidence no longer matches the current integrity reference.

## CLI

```bash
surface report --adapter veritas --input examples/veritas-evidence.json --format summary
```
