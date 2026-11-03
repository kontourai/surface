---
status: current
subject: Erasure Cascade
decided: 2026-11-02
evidence:
  - kind: issue
    ref: "351"
  - kind: url
    ref: https://github.com/kontourai/corpus/issues/39
---
# Erasure Cascade

Surface consumes retention facts and recomputes the existing derivation; the producer and store own physical erasure. A claim tombstone keeps an opaque identity, the schema-required non-content classification fields, and permitted erasure provenance in `metadata.surfaceRetention`: `{ state: "deleted", erasedAt, actor, rationale }`. The required claim `value` is `null`. Producers must ensure that identifiers, classification fields, provenance, links and metadata contain no erased content, and remove related evidence, events, excerpts, anchors and copies that do. No content digest is retained in this shape; in particular a plain hash of short content enables confirmation attacks. A producer that needs an integrity reference must manage a keyed reference under its own key and retention policy. Surface does not authenticate the metadata or perform a purge.

A deleted input and branches resting only on deleted inputs no longer supply a derivation ceiling. If no input survives, the derived claim is at most `unknown` and gets an `unsupported_inference` gap. Surviving branches continue to apply the ordinary weakest-input ceiling. The report retains a deletion change record with input IDs, and the existing drilldown retains the tombstone. Producers must inspect affected derived content and remove any copy of erased content; a change record is a review signal, not proof of removal. `traceDependents` gives the pre- or post-erasure dependency radius; `recomputeChangeRecords` identifies transitive deletion pressure even where a survivor's status did not change. These APIs do not discover unrecorded dependencies.

This is a Surface-specific convention in Hachure's open claim metadata, not a normative Hachure retention field or proof that other Hachure consumers enforce deletion. It aligns with the retention and erasure extension point in [accumulation design PR 354](https://github.com/kontourai/surface/pull/354) and the intended identity, provenance and links retained by Corpus Store's purge. The store's producer shape and transactional purge are not yet implemented here.

Hachure bundles and their signatures or digests cover their bytes. Removing content or replacing a claim invalidates the old bundle's integrity proof: publish a newly derived bundle and a new proof; do not mutate a signed bundle and claim its original proof still verifies. Old bundles, reports, logs, backups, checkpoints and prior recompute records can contain the erased content or an ordinary digest of it and require producer-owned removal or retention handling. Logical audit continuity does not make old bytes safe to retain. A tombstone does not itself establish that all replicas have been purged.
