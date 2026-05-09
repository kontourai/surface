# Veritas Adapter

Veritas is a separate developer/AI-agent governance product built on Surface. This adapter documents how Surface can import Veritas evidence artifacts at the product boundary without making Surface depend on Veritas runtime code.

## Input

The adapter reads a Veritas evidence artifact shaped by `veritas/schemas/veritas-evidence.schema.json`.

Important fields:

- `run_id`: source identity for the evidence artifact.
- `timestamp`: observed and verified time for generated evidence.
- `source_ref`: commit, branch diff, or working-tree integrity reference.
- `affected_nodes`: repo surfaces touched by the change.
- `affected_node_details`: ownership, boundary, and surface-classification metadata.
- `file_nodes`: which graph nodes each changed file belongs to.
- `selected_proof_commands`: proof lanes Veritas selected.
- `selected_proof_lanes`: proof lane objects with methods and claim mapping.
- `proof_family_results`: results from declared proof family manifests.
- `verification_budget`: aggregated budget view across all proof families.
- `external_tool_results`: advisory or blocking external tool verdicts (e.g., Fallow).
- `baseline_ci_fast_passed`: proof-lane result when available.
- `policy_results`: policy pack evaluations and failure details.
- `surface.input`: an embedded `TrustInput` projection for Surface validation.

If `surface.input` is present, the adapter uses it directly. The fallback mapper exists for older Veritas evidence artifacts, but the embedded projection is the preferred contract because Veritas owns the repo-specific mapping decisions at evidence-generation time.

Dependency direction stays one-way: Veritas can build on Surface; Surface should only consume Veritas artifacts as data at this adapter boundary.

## Output

The adapter emits six claim types:

### 1. `veritas-affected-surface`

One claim per affected repo surface. Records which surfaces the change touched.

- Subject: the repo surface node
- Evidence: policy-rule references and verification metadata
- Verification: observed via repo-surface classification

### 2. `software-proof`

One claim per selected proof lane. Records which proof commands ran and their results.

- Subject: the proof lane
- Evidence: test-output or audit-log excerpts
- Verification: validation (proof command passed/failed)

### 3. `veritas-policy-result`

One claim per policy-pack rule that was evaluated. Records which policies passed or failed.

- Subject: the rule
- Evidence: policy-rule definition and match results
- Verification: validation (policy evaluation)

### 4. `veritas-proof-family`

One claim per proof family. Records the aggregated disposition (required/candidate/advisory/retiring), blocking status, freshness, and `proofStrength`.

- Subject: the proof family (subjectType: `repo-proof-family`)
- Evidence: proof-family manifest, recent-catch evidence, freshness metadata
- Verification: auditability (family definition and owner/review-trigger audit)
- `proofStrength`: derived from family blocking status, recent catches, and false-positive risk

### 5. `veritas-verification-budget`

One claim summarizing the overall budget. Records the count and classification of all proof families.

- Subject: the repo verification budget (subjectType: `repo-verification-budget`)
- Evidence: budget metadata and family-count summaries
- Verification: auditability (budget computation from family manifests)

### 6. `veritas-external-tool-result`

One claim per external tool result attached to a proof lane, such as an advisory or blocking Fallow audit.

- Subject: the external tool plus proof lane
- Evidence: normalized external tool artifact metadata
- Verification: auditability (the tool artifact and Veritas normalization)
- Status: verified for passing verdicts, disputed/rejected for warning or failing verdicts depending on blocking mode

## Confidence Basis

Every emitted claim carries a `confidenceBasis` block:

```json
{
  "sourceQuality": "strong" | "moderate" | "weak",
  "reviewerAuthority": "system" | "operator" | "tool" | "none",
  "proofStrength": "strong" | "moderate" | "weak",
  "impactLevel": "low" | "medium" | "high",
  "conflictCount": 0
}
```

The `TrustReportSummary.confidenceBasis` aggregates per-claim bases:

```json
{
  "sourceQuality": { "<claim-type>": <avg-score> },
  "reviewerAuthority": { "<authority>": <count> },
  "corroboratedClaims": <count>,
  "averageExtractionConfidence": <0-1>,
  "freshnessAtRisk": <count>,
  "conflictedClaims": <count>
}
```

Derivation ceilings are applied from `derivedFrom` chains: proof-family, external-tool, and verification-budget claims carry `derivedFrom` to signal that their confidence is capped by upstream dependencies.

In current Veritas projections:

- proof-family claims derive from selected proof-lane claims
- external-tool claims derive from selected proof-lane claims
- verification-budget claims derive from proof-family claims when present, otherwise policy-result claims

## Trust behavior

Passing evidence does not become a generic confidence score. Surface preserves the reason:

- proof commands are backed by `test_output`.
- policy results are backed by `policy_rule`.
- proof-family results are backed by manifest ownership, review triggers, and recent-catch evidence.
- external-tool results are backed by normalized tool artifacts and retain advisory/blocking mode.
- every generated claim keeps the Veritas `source_ref` as its current integrity reference.
- commit-scoped verification becomes stale when the evidence no longer matches the current integrity reference.

Freshness is tracked per claim:

- `veritas-affected-surface` claims become stale when the source_ref changes (commit sha or diff boundary changes).
- `software-proof` claims become stale when the proof command changes or the baseline proof fails.
- `veritas-policy-result` claims become stale when the policy pack or rule implementation changes.
- `veritas-proof-family` claims include explicit `freshness_status`: current, review-needed, stale, or retiring.
- `veritas-external-tool-result` claims become stale when the source ref or external tool artifact changes.

## Per-Claim Surface Input Slices

Veritas writes per-claim Surface input slices at `.veritas/claims/*.input.json` next to local evidence. These are trimmed input projections scoped to a single claim:

```json
{
  "schemaVersion": 2,
  "source": "veritas:<run-id>",
  "generatedAt": "2026-05-09T00:00:00.000Z",
  "claim": {},
  "evidence": [],
  "events": [],
  "policy": {}
}
```

They are not generated `TrustReport` artifacts. Surface still owns report-only fields such as `summary`, `faultLines`, `proofRequirementsByClaimId`, and `subjectGroups`.

## Privacy and Redaction

Veritas enforces no-email and redaction rules on committed `surface.input` blocks. The `scripts/check-redaction.mjs` tool flags sensitive fields like `notes`, `metadata`, and `excerptOrSummary` in evidence artifacts. This ensures that Veritas evidence can be safely committed without leaking personally identifiable information.

See [SURFACE-PRIVACY.md](../../SURFACE-PRIVACY.md) in the Surface repo for the full input-vs-derived split and public-repo redaction rules.

## CLI

```bash
surface report --adapter veritas --input examples/veritas-evidence.json --format summary
```

The report includes:

- Claim list with types, subjects, statuses, and confidence basis
- Fault lines and conflicts
- Proof-requirement details per claim
- Freshness and stale-claim summaries
- Verification event timeline
