---
status: current
subject: Reviewed Extraction Evidence
decided: 2026-07-20
evidence:
  - kind: issue
    ref: "161"
  - kind: issue
    ref: "262"
  - kind: issue
    ref: "289"
  - kind: issue
    ref: "195"
  - kind: doc
    ref: tests/reviewed-extraction-choice.test.ts
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
calls `attachImportRecords(evidence, records)`, which gives each digest exactly
one carrier (the first v2 item citing it, unless a matching carrier already
exists elsewhere, which stays where it is), and can assert
`findUncarriedImportRecordDigests(bundle)` is empty before publishing. That
check covers carrier completeness and consistency (a digest with any
mismatching carrier is reported), not full integrity: consistently tampered
evidence still fails at restore. A reader
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

The v2 profile does not change the review shape; a review item with more
than one candidate needs the v3 profile below.

## Choice profile (v3, #195)

Survey 7 groups conflicting proposals for one claim into one review item with
a candidate per distinct value, and its `select-proposed` decision names the
chosen candidate and lists the others in `unselectedCandidateIds`. v1 and v2
restore by re-running a validation that accepts exactly one candidate, so a
reader of the current release would refuse such evidence; widening them is not
additive. `surface.reviewed-extraction-evidence/v3` is a new opt-in profile
(`reviewedExtractionEvidenceChoiceProfile`); v1 and v2 are unchanged, and a
test pins their bytes and profile digests from 4.3.0.

v3 is the v2 reference shape (cited proposal, `importRecordDigest`, optional
`importRecord` sidecar), so it is self-verifying the same way through
`attachImportRecords`, `findUncarriedImportRecordDigests`, and
`resolverFromBundle`, and fails closed without the record. It accepts only
items with two or more candidates, so v3 evidence always records a choice and
a single-candidate review stays v1 or v2.

**Binding.** Each candidate is bound through Survey's own per-candidate
envelope binding (`producer["survey.kontourai.io/extraction-envelope"]`, with
`importName` naming the bound import and `proposalIndex`). A bound candidate
must have role `proposed`, name a distinct proposal, and meet every v1
candidate rule against that proposal (value, confidence, source, locator,
extraction, model). A separate candidate-to-proposal input map was rejected:
it would duplicate, and could contradict, the item it describes, as with the
review signals above. The cited proposal must be one candidate's.

**Decision.** The decision must name one candidate (`candidateId` is optional
in v1 and v2). When that candidate is one of several proposed values,
`unselectedCandidateIds` must list exactly the other proposed candidates in
item order, which is Survey's own rule; otherwise it must be empty.
Value-neutral decisions on a conflict (reject all, could not confirm) name no
candidate and are refused; they choose nothing to ground.

**Projection.** Evidence citing the named candidate projects as before
(`entails` when accepted, validated, and gap-free). Evidence citing another
candidate gets a `candidate-not-chosen` gap and is `cited`, so one item per
candidate can be exported and only the chosen one supports the claim. Every
v3 item carries a derived `choice` block: every candidate with its role, bound
proposal, and value digest; the cited and decision candidates; and
`chosenOver`, the rivals the cited candidate was chosen over. It is derived
from the digest-bound input, and restore's re-projection compares it, so it
cannot be edited. A reader sees the rivals without restoring, and the profile
name alone says the value was one of several.

**Grounding.** A chosen value is allowed on its own evidence, like any other;
the rival's evidence is refused. `requireAcceptedReview` treats a decision
that names a different candidate as not accepting the cited one. The dimension
carries the `choice`. The opt-in `refuseChosenOverRivals` refuses a chosen
value with any rival (`chosen-over-rival-unresolved`), in the style of
`refuseExcludedRivals`: a rival that was seen and not chosen is not disproven,
and nothing currently resolves one, so every rival counts.

**Prior versus proposed.** The recheck shape fits the same rules: a candidate
without the envelope binding is a prior value, allowed only with role
`current` and at most once. It has no proposal, so it is never cited; it
appears in `choice` with no `proposalIndex`, and a keep-current decision
leaves the proposal's evidence `cited` with `candidate-not-chosen`. Accepted
gaps: the proposed candidate must carry Survey's envelope binding, and the
item must be non-editable, as in v1. Survey's own binding rule wants every
candidate to carry the binding, so on such an item the review signals read
excerpt verification as unverified.

Verified end to end against `@kontourai/survey` 7.0.0 from npm: its import,
`buildReviewDecision` with `select-proposed`, and
`toSurfaceReviewedExtractionImport` (which passes the record through) project
under v3, restore from the bundle alone, and ground the claim
`buildSurveyTrustBundle` exports, whose `metadata.survey.candidates` lists the
same candidates with the chosen one `selected`. The fixture in
`tests/fixtures/reviewed-extraction-choice.survey7.json` is that output.

## Review signals (#289)

Survey's excerpt verification and excluded proposals are read from the import
record and review item the profile already binds, not added as profile fields.
Projection is unchanged, so the pinned profile digests hold and no profile
version bump is needed: an older reader restores the same evidence and simply
does not interpret the facts. Grounding decisions over bundles without the
facts are unchanged; decisions over Survey 6 bundles that carry them gain the
`excerptVerification` and `excludedRivals` dimension fields. The item's facts
are read only when its Survey binding is intact, and the import record's
`excerpt-mismatch` diagnostics are checked too, so a stripped item entry
cannot hide a rival. A separate
input field was rejected because it would duplicate, and could contradict, the
item it came from. Absence reads as unverified and as no excluded proposals;
the policy requirements that use them are opt-in.
