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

### Reference profile (v2)

The v1 profile above embeds the whole import record in every evidence item, so
a run with many reviewed proposals repeats its full envelope once per item. To
keep each item's size independent of the run, project with
`{ profile: reviewedExtractionEvidenceReferenceProfile }`
(`surface.reviewed-extraction-evidence/v2`). The item then carries the cited
proposal and `importRecordDigest` (`reviewedExtractionImportRecordDigest` of the
record) instead of the record. Store each import record once, keyed by that
digest, and pass a resolver when restoring:

```ts
const records = new Map([[reviewedExtractionImportRecordDigest(record), record]]);
const input = restoreReviewedExtractionEvidence(evidence, { resolveImportRecord: (digest) => records.get(digest) });
```

Restore checks that the resolved record has the bound digest and that its
`proposals[proposalIndex]` is the embedded proposal, then applies every v1
check. Without a record it throws `ReviewedExtractionImportRecordUnresolvedError`
(`code: "import-record-unresolved"`). The same optional `resolveImportRecord`
is accepted by `restoreReviewedExtractionEvidenceBrowser`,
`evaluateReviewedGroundingPolicy`, `buildReviewedExtractionSourceState`,
`buildUnknownReviewedExtractionSourceState`, `evaluateAnswerAssessmentPolicy`,
`buildAnswerAssessmentProjection`, and `buildReviewedSourceBasisContribution`;
each refuses v2 evidence it cannot resolve. v1 evidence ignores the resolver.

The profile validates only the envelope fields it reads, so additive producer
keys pass through unchanged and stay inside the profile digest. This covers a
proposal's `producedBy` model record and `evidenceMatch` annotation, a provider
failure's `code`, and a result's `coverage` ranges; a test pins that they
project and restore. When a proposal carries `producedBy`, the ReviewItem
candidate's model must equal `producedBy.model` (a credential-free stable
identity); otherwise it must equal `result.model`. In a multi-chunk run
`result.model` names only one chunk's model, so the per-proposal record is the
one that identifies who produced the value.

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

Surface derives structural trust from the proposal itself
(`deriveStructuralTrust`): the candidate value must conform to the declared
`valueType` (`string`, `number`, `boolean`, `date`; `date` requires a string, as
in Traverse) and lie inside `enumValues` when present. A non-conforming value is
`invalid`; a proposal with no checkable type (none, `array`, `object`, or `enum`
without `enumValues`) is `unvalidated`. The projection uses the weaker of the
derived value and the caller's `structuralTrust`, so a caller can downgrade but
never upgrade. Restore re-derives it, so relabelling a non-conforming item as
`validated` does not restore as entailing evidence. For a conforming value the
label still round-trips, because the profile digest is unkeyed and cannot say
who asserted it.
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

`requiredClaimIds` must come from the caller's intent (the task's fields or the
output schema), independently of the evidence passed to the same call. Building
it from that evidence is circular: a claim that should have reviewed evidence
but has none is never required, so `missing-reviewed-evidence` cannot fire. An
empty list is refused with a `no-required-claims` gap.

`claims` is required and binds claim values to the reviewed evidence. Each
dimension carries `candidateValueDigest`, `valueDigest(candidateValue)`
(SHA-256 over canonical JSON, so object key order does not matter). A required
claim that is absent from `claims` is a `claim-missing` gap, and a claim whose
value digest differs is a `value-mismatch` gap. A call without a `claims` array
(possible from untyped callers) is refused with `claims-not-supplied`, because
it could only say the evidence was reviewed, not that any claim carries the
reviewed value.
`evaluateAnswerAssessmentPolicy` applies the same binding to entailing
reviewed-extraction evidence and reports `value-unbound` on a mismatch.

Evidence from an extraction that did not read the whole source is always
refused with an `extraction-coverage-incomplete` gap, whatever the policy's
optional requirements. The gap is derived from the digest-bound envelope, not
supplied by the caller: `outcome: "partial"` when the envelope outcome is
partial, `"provider-failure"` when a successful outcome still recorded provider
failures, and `"failure"` for any other non-success (or missing) outcome. It
carries the outcome `reason` or `code` when one is recorded, and
`providerFailureCount` when failures were recorded.

A success outcome is trusted only when the rest of the envelope agrees with it.
It is treated as `"failure"` when `providerFailures` is not an array, when a
`partial` record is present, or when `coverage` is not an array or has a range
whose status is not `complete`. It is also incomplete when
`warningClassifications` carries an `output-truncated`,
`content-truncated-at-dispatch`, `content-truncated`, `missing-tool-call`, or
`chunk-provider-failure` code: producers before Traverse 2.0.0 recorded a run
that lost a chunk as a success with only such a warning. That case is labelled
`"failure"`, or `"provider-failure"` when provider failures were also recorded.

Accepted gap: producers before Traverse 1.0.0 classify a truncated answer, a
missing tool call, and other adapter notices all as the generic
`provider-warning` code, and the classification carries no other field that
tells them apart. Surface does not match warning text, so a success envelope
from such a producer whose only loss signal is `provider-warning` still
evaluates as complete.

The gap is per evidence item, not per field. A partial envelope may carry
`coverage` ranges naming which part of the prepared text was unread, but the
policy does not map fields to ranges: a field in the unread part has no claim
at all, and only this gap shows that coverage was incomplete.

## Source observation facts

`buildReviewedExtractionSourceState(evidence, observation, observedAt)` is the
optional pure adapter for a source recheck. It restores frozen reviewed evidence
first, then accepts only the closed `surface.reviewed-source-observation/v1`
fact shape. The fact has an owner (`authority`, `observationRef`) and both
`expected` and `observed` captures. Each capture preserves its snapshot
reference, source and resource identities, capture time, and separate SHA-256
envelope and content digests.

The builder requires the expected snapshot reference to equal the snapshot
bound into reviewed evidence. When source and resource identities match, equal
content digests produce `current` even where the captures and envelope digests
are distinct; both identities remain available under `sourceState.observation`.
Different content digests produce `drifted`; that alone does **not** establish
that the extracted field changed, so the builder leaves
`extractedValueChanged` absent unless a producer independently supplies a
value-comparison fact through the legacy source-state input. A changed
source/resource, contradictory facts (including capture time) for one capture
reference, a capture after its check time, unsupported version, malformed
digest, or mismatched expected snapshot is rejected. `observedAt` remains the
time a producer checked the source; it is not either capture's `capturedAt`.
A 304 check can preserve an older capture and report a newer check time without
claiming the capture, its metadata, or the review was renewed.

Surface performs no source retrieval or owner authentication. A producer such
as Fieldwork must resolve exact captures, validate their full-envelope
integrity, and establish the registered source/final-resource relationship
before it supplies this fact. The builder deliberately does not accept a
caller-provided `status`, boolean, URL, title, or timestamp as proof of content
equivalence. Supplying no observation retains the existing source-state
behavior.
