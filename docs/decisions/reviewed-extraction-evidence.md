---
status: current
subject: Reviewed Extraction Evidence
decided: 2026-07-20
evidence:
  - kind: issue
    ref: "161"
  - kind: issue
    ref: "262"
  - kind: doc
    ref: docs/guides/reviewed-extraction-evidence.md
  - kind: doc
    ref: tests/reviewed-extraction-evidence.test.ts
---
# Reviewed Extraction Evidence

Surface projects reviewed extraction provenance through standard portable
Evidence rather than defining a competing evidence schema. `sourceRef`,
`sourceLocator`, and `integrityRef` remain the generic anchors. The open
`Evidence.metadata.reviewedExtraction` namespace carries a versioned, reversible
profile for the complete reviewed record.

The profile consumes the landed Survey import, ReviewItem, and ReviewDecision
resource shapes. It keeps candidate confidence, reviewer disposition, collector
identity, and structural validation state separate. Artifact unavailability,
digest mismatch, unsupported inference vocabulary, explicitly dropped
provenance, unsafe structure, and non-accepted review are typed in-band gaps.
Unsafe evidence is `cited`, non-passing, and blocking; only accepted, verified,
validated, gap-free evidence entails its claim.
The native Survey accept-proposed decision is verified with no explicit
resolution, and the projection preserves that shape rather than inventing one.

The golden fixture round-trips the source and prepared-artifact references,
exact locator plus format coordinates, field/value and type origin,
provider/model, task/example digests, attempt, and review outcome, including all
prepared-artifact resolution fields. A canonical profile digest binds the full
input, gaps, and every portable evidence field. Adversarial tests reject field
tampering, credentials, forged artifact identity, incoherent spans, and JSON
collapse; a policy regression proves rejected or invalid evidence cannot verify.
The resulting evidence validates against the upstream schema. This proves the
current upstream Evidence structure is sufficient, so no schema change is needed.

## Reference profile (v2)

The v1 profile embeds the whole import record, so a bundle with one evidence
item per reviewed proposal of an N-proposal run carries N copies of every
proposal. `surface.reviewed-extraction-evidence/v2` is an opt-in alternative
(`projectReviewedExtractionEvidence(input, { profile })`); v1 stays the default
and keeps restoring unchanged, so existing bundles and the pinned v1 profile
digest are unaffected.

A v2 item carries the cited proposal and `importRecordDigest`, the canonical
JSON SHA-256 of the import record, in place of the record. The profile digest
covers that input, so it binds the record by digest.

**Self-verification.** A v2 bundle can verify from the bundle alone, as a v1
bundle does, when it carries each of its import records: one v2 item per record
holds it as an optional `importRecord` sidecar in its `reviewedExtraction`
metadata, outside the digested profile input, accepted only when it hashes to
that item's `importRecordDigest`. This is a producer precondition, not a
default. Projection leaves the sidecar off (`includeImportRecord` defaults to
false, since a sidecar on every item re-bloats the bundle past v1). The producer
calls `attachImportRecords(evidence, records)`, which puts exactly one sidecar
on the first v2 item for each digest, and can assert
`findUncarriedImportRecordDigests(bundle)` is empty before publishing. A reader
then passes `resolverFromBundle(bundle)` to any restore or policy call. A bundle
that misses the precondition is not accepted on trust: its uncarried items fail
closed as unresolved.
A bundle-level map was rejected because `TrustBundle`
is closed (`additionalProperties: false`) and merge drops `proof`; a separate
carrier Evidence item was rejected because it needs a `claimId` and would enter
claim evaluation. Evidence `metadata` is open, so the sidecar needs no schema
change.

Restore stays fail-closed. It resolves through the synchronous
`resolveImportRecord(digest)` option (a caller may also back it with its own
record store), refuses a record whose digest differs and an embedded proposal
that is not `proposals[proposalIndex]`, then runs the v1 validation and
re-projection on the rebuilt input, so every v1 check applies. With no record,
as in a sliced bundle that lost its carrier, it throws a typed
`ReviewedExtractionImportRecordUnresolvedError`; the grounding policy reports
an `import-record-unresolved` gap, and the other readers that restore
(source-state builders, answer assessment, the Basis reviewed-source adapter)
take the same optional resolver and fail closed without it. A sidecar that
does not match its digest is refused: restoring its own item fails, and
`resolverFromBundle` refuses every lookup of that digest rather than falling
back to another copy. Two sidecars claiming one digest with different content
therefore refuse every item of that record, since at least one of them cannot
hash to the digest. A supplied resolver is consulted before an item's own
sidecar, so a refused digest stays refused for the carrier too.

Known denial of service: merge keeps one copy per evidence id, choosing by
content order. A tampered copy of the carrier with the same id can therefore
replace the genuine carrier in a merged bundle. Every item of that record is
then refused, and the refusal names the offending evidence id, so this fails
closed. It is equivalent to deleting the carrier, and `mergeBundlesDetailed`
reports the collision.

The v2 profile does not change the review shape; the two-candidate transition
review (#195) is still out of scope.
