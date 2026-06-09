# Claim Authoring

Surface supports authored claim stores for producers such as Veritas. The store is a stable JSON file that belongs in git, separate from per-run evidence.

```text
Application -> veritas.claims.json -> authored claims
Producer    -> trust input evidence -> run observations
Surface     -> Trust Snapshot       -> derived status, conflicts, transparency gaps
```

## Store File

The default store path is `veritas.claims.json`.

```json
{
  "schemaVersion": 1,
  "producer": "veritas",
  "claims": [],
  "policies": []
}
```

`schemaVersion` is currently `1`. `producer` names the producer extension that owns the vocabulary. `claims` contains authored `ClaimDefinition` records. `policies` contains reusable Surface `VerificationPolicy` records that claims can reference by ID.

## ClaimDefinition

Authored claims contain only stable declaration fields:

- `id`: stable claim identifier.
- `surface`: producer-defined namespace for related claims, such as `veritas.evidence-check`. This is an existing schema field, not the product-facing noun for a page, area, or evaluated object.
- `claimType`: claim type ID, such as `software-evidence`.
- `fieldOrBehavior`: the behavior being asserted.
- `subjectType`: subject namespace, such as `repository`.
- `subjectId`: stable subject identifier.
- `impactLevel`: optional `low`, `medium`, `high`, or `critical`.
- `verificationPolicyId`: optional policy ID from the same store.
- `metadata`: optional producer-specific object.
- `createdAt` and `updatedAt`: ISO timestamps.

Runtime fields such as `status`, `currentIntegrityRef`, `confidenceBasis`, and `derivedFrom` are not authored in the store. Producers add runtime context when they collect evidence for a run.

## CLI

Surface writes to `./veritas.claims.json` by default:

```bash
surface claim add \
  --type software-evidence \
  --surface veritas.evidence-check \
  --subject-type repository \
  --subject-id my-repo \
  --field "npm test" \
  --impact high \
  --policy-id veritas.evidence-check
```

Available commands:

```bash
surface claim list [--store veritas.claims.json]
surface claim add --type <type> --surface <surface> --subject-type <type> --subject-id <id> --field <field> [--id <id>] [--impact low|medium|high|critical] [--policy-id <id>] [--metadata '{"key":"value"}'] [--store <path>]
surface claim edit --claim-id <id> [same optional fields as add] [--store <path>]
surface claim remove --claim-id <id> [--store <path>]
surface claim validate [--store <path>]
```

If `--id` is omitted, Surface generates one from subject ID, the `surface` namespace, and field.

## Policies

Add a policy to the store when a claim needs a durable verification contract that is not already supplied by the producer. Reuse a policy when multiple claims share the same evidence requirements, methods, freshness rule, and review authority.

During report generation, producers turn claim definitions into runtime `Claim` records, collect evidence against the authored claim IDs, and pass those records to `buildTrustReport`. `buildTrustReport` is the current API name; product-facing docs should describe the output as a Trust Snapshot. Surface derives the authoritative claim status from the evidence and policy.
