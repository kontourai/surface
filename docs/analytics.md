# Trust Analytics Projection

Surface analytics means evidence intelligence over a trust report. It is not a generic BI layer.

The projection turns an existing `TrustReport` into a stable JSON object for the Surface Console, agents, and local query commands. It is derived from portable Surface primitives:

- claims
- evidence
- verification policies
- evidence requirements
- freshness and status
- transparency gaps through the current `transparencyGaps` field
- confidence basis
- attestations
- authority trace

Downstream products still own product-specific extraction, workflow vocabulary, domain interfaces, and user account systems.

## API

```ts
import { buildTrustAnalyticsProjection, buildTrustReport } from "@kontourai/surface";

const report = buildTrustReport(input);
const analytics = buildTrustAnalyticsProjection(report);
```

The projection includes:

- verification coverage by producer namespace
- stale claims
- disputed claims
- high-impact unsupported claims
- transparency gaps by type and severity
- evidence and requirement gaps
- confidence basis rollups
- authority trace totals and active, expired, or revoked records
- review/action queues
- attestation validity signals

Trace analysis is implemented by `analyzeTrustTraces(report)`. Analytics uses that module for Evidence Trace and Authority Trace checks, then combines trace gaps with policy-derived evidence gaps for queues and Surface Console projections.

## CLI

```bash
surface report --input examples/surface-fixtures.json --format analytics
```

The command emits projection JSON. The existing `json`, `summary`, and `linked` report formats are unchanged.

Projection-backed query commands expose the first local agent query surface:

```bash
surface stale
surface missing
surface get --claim-id claim.field-attested-records.registration-status
surface policy --policy-id policy.public-data-field.short-lived
```

These commands intentionally stay local and report-derived. MCP resources and a human console can consume the same projection contract after the CLI behavior stabilizes.

## Attestation Validity

Attestations are evidence, but not every attestation is trusted authority.

Surface preserves self-declared attestations as evidence. The analytics projection then marks whether each attestation is:

- `valid`: actor identity, authority source, freshness, and integrity are present.
- `weak`: an actor exists, but one or more trust anchors are missing.
- `invalid`: the attestation is missing an actor, expired, or revoked.

This prevents a product from bypassing policy by inventing an attestation string. A fabricated attestation can be recorded, but the projection exposes gaps such as:

- `attestation_identity_unverified`
- `attestation_authority_unverified`
- `attestation_integrity_missing`
- `attestation_expired`
- `attestation_revoked`

Surface does not own auth. Product systems should emit actor references, identity evidence references, first-class Authority Trace records, validity windows, revocation markers, and integrity hashes from their own identity providers, directories, signing systems, or audit logs. Metadata-only authority fields remain readable for older producers, but analytics prefers matching `authorityTrace` records when present.

## Authority Trace Projection

Analytics exposes `authorityTrace` with `totalRecords`, active, expired, and revoked counts, plus stable records containing the actor, subject, authority type, authority reference, source, linked claim IDs, linked evidence IDs, validity fields, and integrity reference. This lets consumers display authority state without parsing producer metadata.

## Seam

Surface owns the generic projection and gap vocabulary. It does not decide who belongs to a product's organization, which user has which role, or how a product authenticates a user.

That seam keeps Surface product-neutral while still making human and organizational trust inspectable.
