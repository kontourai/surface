# Field-Attested Records Example

This example proves Surface can model public-data trust, not just developer proof.

## Input

The example reads a compact field-attested records export with:

- `records`
- `fieldSources`
- `fieldAttestations`
- `reviewFlags`
- `crawlRuns`
- `proposals`

The source product is not named here and real adapters belong in downstream product repos. Surface only imports a JSON artifact.

## Output

The adapter emits standard Surface records:

- `public-data-field` claims for approved `fieldSources`.
- `field-attestation` claims for admin or source-backed attestations.
- `review-flag` claims where open flags dispute current public data.
- `crawl-run` claims for crawl freshness and failures.
- `change-proposal` claims for pending, approved, rejected, or superseded proposals.

## Trust behavior

- Approved field sources become `verified`.
- Active attestations become `verified`.
- Stale attestations become `stale`.
- Invalidated attestations and open review flags become `disputed`.
- Failed crawls and rejected proposals become `rejected`.
- Pending proposals remain `proposed`.

## CLI

```bash
surface report --adapter field-attested-records --input examples/field-attested-records-export.json --format summary
```
