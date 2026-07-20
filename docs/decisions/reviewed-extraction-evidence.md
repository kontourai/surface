---
status: current
subject: Reviewed Extraction Evidence
decided: 2026-07-20
evidence:
  - kind: issue
    ref: "161"
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
