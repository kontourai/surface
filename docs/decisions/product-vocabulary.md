---
status: needs-decision
subject: Product Vocabulary
decided: 2026-07-03
evidence:
  - kind: adr
    ref: docs/adr/0001-vocabulary-migration.md
  - kind: issue
    ref: https://github.com/kontourai/surface/issues/110
  - kind: issue
    ref: https://github.com/kontourai/surface/issues/224
  - kind: doc
    ref: docs/specs/minimum-trust-panel.md
---
# Product Vocabulary

This subject has provenance in frozen ADR history ([0001-vocabulary-migration.md](../adr/0001-vocabulary-migration.md)) but no living
decision has been ratified yet under the topic-keyed decision registry
(`context/contracts/decision-registry-contract.md` in kontourai/flow-agents).
This stub records that the subject is open and links the frozen ADR(s) as
provenance; the subject as a whole is not yet decided.

## Partially ratified: reader-facing display names for spec enums (2026-08-17, #224)

One slice of this subject is now decided. Canonical reader-facing display
names (with one-line glosses) for the spec enums — `TrustStatus`,
`evidenceType`, and evidence `method` — live in `src/display-names.ts`
(exported from the package index) and, as normative spec text, in
`docs/specs/minimum-trust-panel.md` ("Required Claim States" and "Required
Provenance Names"). Rules ratified with that slice:

- Renderers consume the table (directly, or via `SurfaceConsoleVocab`
  defaults); they do not mint synonyms for a distinction the vocabulary
  already standardizes.
- Product vocab may override a label per key; unmapped values fall back to
  the raw wire enum, never to an invented name.
- Wire contracts are untouched: display names are presentation only, and
  `schemas/` stays byte-identical to hachure.

`tests/display-names.test.ts` holds both shipped renderers (trust panel and
console) to the table. Spec-enum display names are canonical here;
product-minted `claimType` labels still flow through the extension seam
(#206) and remain out of scope.

The rest of the subject (broader product naming, the vocabulary-migration
follow-through from ADR 0001) remains open. When a living decision covers
it, update this file's `status` to `current`, add rationale, and keep the
`adr` evidence links as provenance for the history that led here.
