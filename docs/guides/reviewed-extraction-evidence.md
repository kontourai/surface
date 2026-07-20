# Reviewed Extraction Evidence

Surface can project a producer-reviewed extraction into ordinary portable
`Evidence` with `projectReviewedExtractionEvidence`. Its input is the landed
Survey `ExtractionEnvelopeImport`, its generated `ReviewItem`, and the actual
`ReviewDecision` resource (`status` plus optional `resolution`), together with
the target claim/evidence IDs and the collector identity. Surface structurally
validates this public contract without taking a Survey runtime dependency.
The projection uses the existing evidence anchors:

- `sourceRef` identifies the original source;
- `sourceLocator` carries the exact format locator;
- `integrityRef` binds the prepared-artifact digest; and
- `metadata.reviewedExtraction` reversibly carries the source snapshot,
  prepared artifact, locator scheme and format coordinates, field/value and
  explicit-or-inferred type, extractor/provider/model, task and example
  digests, attempt, review disposition, confidence, and structural trust.

`restoreReviewedExtractionEvidence` recovers the input and rejects disagreement
between any top-level evidence field and the reversible profile. A canonical
SHA-256 profile binding covers the full import, review item, review decision,
gaps, and portable evidence fields, including claim ID, type, method, source,
locator, excerpt, observation time, collector, support, pass/block flags, and
integrity presence. This makes
the ordinary Hachure-compatible fields useful to generic consumers while
preserving the complete reviewed extraction for profile-aware consumers.

## Gaps and trust boundaries

The projection embeds typed gaps in `Evidence.metadata.reviewedExtraction.gaps`
for unavailable artifacts, digest mismatch, unsupported inference vocabulary,
provenance an adapter explicitly says it dropped, invalid/unvalidated structure,
and non-accepted review. Artifact gaps preserve requested/canonical references,
invalid-artifact reason, and mismatch digest/content-length details. The same
gaps are returned as a convenience; they are not sidecar-only state.

Only an accepted, verified, structurally validated, gap-free record emits
`supportStrength: "entails"` with `passing: true`. Every other record is
`cited`, non-passing, and blocking, so evidence requirements cannot accidentally
derive a verified claim from rejected or unsafe extraction evidence.
Survey's accept-proposed decision is `status: "verified"` with `resolution`
absent; the profile recognizes that native form and does not fabricate an
`accepted` resolution. Explicit resolutions, when present, must remain
consistent with their status.

These three signals are deliberately independent:

- `confidence` is the producer's candidate-extraction confidence;
- the `ReviewDecision` status/resolution records the reviewer decision; and
- `structuralTrust` records whether the imported structure was validated.

A reviewed value can therefore be accepted with low extraction confidence or
with an unvalidated structure without appearing stronger than its provenance.
`collectedBy` identifies the collector/ingester. Reviewer identity remains in
the ReviewDecision metadata and is never relabeled as the collector.

## Compatibility result

The golden fixture uses the real landed Survey import/review resource shapes and
the canonical prepared-artifact state fields. Tests validate the projected
record directly against the upstream Hachure evidence schema. The current
schema is sufficient: standard source, locator, integrity, support, and result
fields retain generic semantics, while the open evidence metadata extension
carries the reversible profile. No upstream schema change is needed. A future schema proposal is justified
only by a minimal fixture that this profile cannot round-trip without semantic
loss.

Candidate values, excerpts, references, reviewer identities, and metadata may
be visible to downstream consumers. Producers must exclude credentials, private
configuration, secret-bearing references, and unnecessary personal data before
projection. The projector rejects authorization-bearing references,
credential-shaped stable identities, malformed digests, forged prepared-artifact
references, incoherent locator/excerpt spans, and non-lossless JSON values.

## Additive action policy

`evaluateReviewedGroundingPolicy` lets a consumer require reviewed extraction,
an exact locator, prepared-artifact integrity, accepted review, validated
structure, and a current source for one named downstream action. It does not
modify `VerificationPolicy`, claim status derivation, or the evidence schema.

The result is either `allowed` or `refused` and cites every evaluated claim,
Evidence ID, ReviewItem name, and ReviewDecision name. Its dimensions expose
candidate confidence, reviewer disposition, structural trust, type origin,
locator, artifact state, and source state separately. A source observation with
`status: "drifted"` remains visible and blocks a policy that requires a current
source even when `extractedValueChanged` is false. Missing artifacts, digest
mismatches, unresolved source state, and the profile's typed provenance gaps
remain explicit refusal reasons.
