# Claim Subject Matching

> **Status: new, minimal, shape may evolve.** `matchClaimSubjects` and
> `deriveOrphanedSubjectDisposition` are committed on the strength of one real
> producer integration rather than the longer battle-testing most of Surface's
> API has had. The committed public surface is exactly the two functions plus
> the five exported types their signatures require — see "Full committed API"
> below — deliberately small so a future revision, if one proves necessary,
> touches the smallest possible footprint. Surface has no formal "experimental"
> flag convention, so this note is the mechanism: treat this contract as newer
> and less proven than the rest of `@kontourai/surface` until real usage
> settles its shape.
>
> This page is intentionally kept out of the public docs site navigation
> (`scripts/pages-site/pages.mjs`) while the API is in this early, shape-may-evolve
> state — it remains a repo-internal reference (linked from `docs/README.md`,
> covered by `npm run check:doc-links`) rather than a promoted public-docs
> page. This is a deliberate decision, not an oversight; revisit once the API
> has had more real usage.

Producers frequently own a **Repeated Field Claim** (see `CONTEXT.md`): a
claim whose value is a variable-length list of child rows re-extracted from
the producer's own source of truth on every sync — schedule entries, line
items, roster rows, and similar. `CONTEXT.md`'s Repeated Field Claim entry
notes that independent row-level provenance requires durable row identifiers
or separate row claims supplied by the producer. `claim-subject-matching`
is the helper for that reconciliation step: match a freshly re-extracted list
of child rows against the rows Surface already has claims about, by a
producer-chosen natural key, and decide what happens to the claims of a row
that no longer appears.

This is a different problem from `identity.ts`'s `buildIdentityIndex`, which
resolves cross-*producer* subject coreference (do two subject refs from
different producers denote the same real-world thing?). Claim subject
matching never crosses producers — it reconciles one producer's own child
rows, from one sync to the next, against itself.

## `matchClaimSubjects`

```ts
import { matchClaimSubjects, type ClaimSubjectMatchResult } from "@kontourai/surface";

interface ExistingRow {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

interface IncomingRow {
  label: string;
  startDate: string;
  endDate: string;
}

function naturalKey(row: { label: string; startDate: string; endDate: string }): string {
  return `${row.label.trim().toLowerCase()}|${row.startDate}|${row.endDate}`;
}

const result: ClaimSubjectMatchResult<IncomingRow, ExistingRow> = matchClaimSubjects({
  existing: previouslyStoredRows,
  incoming: freshlyExtractedRows,
  existingKey: naturalKey,
  incomingKey: naturalKey,
  existingId: (row) => row.id,
});

// result.matched  — { id, existing, incoming }[]: row's stable id is preserved
// result.orphaned — ExistingRow[]: no incoming row shares its natural key
// result.created  — IncomingRow[]: no existing row shares its natural key
```

`matchClaimSubjects` is pure, synchronous, and dependency-free. It is generic
over the caller's own row shapes: it does not know or care what a "row" or
"subject" represents, only the natural-key and stable-id functions supplied.

Matching is exact natural-key equality only — no fuzzy matching and no
normalization performed inside the function (normalize inside your own
`existingKey`/`incomingKey`, as the example above does with `.trim().toLowerCase()`).
A key present in both lists is a match; a key present only in `existing` is
orphaned; a key present only in `incoming` is created.

**Renames are not silently merged.** A changed natural key (for example, a
row's label edited between syncs) produces one orphan (the old key) plus one
creation (the new key), never a single updated match. Nothing in a natural
key alone can distinguish "this row was renamed" from "this row was deleted
and an unrelated new row happened to get a similar key" — a caller that needs
rename-aware reconciliation must supply a durable identifier as part of the
natural key, or perform its own reconciliation pass over `orphaned`/`created`
using additional signals it has and this function does not (e.g. proximity of
dates, an explicit rename marker from its own source system).

**Duplicate natural keys** within `existing` or within `incoming` — a
producer data-quality condition, not something this function can rule out —
resolve deterministically, first-in-first-matched, in list order: the first
`existing` row claims the first still-unconsumed `incoming` row sharing its
key, and any surplus on either side falls through to `orphaned`/`created`
rather than being dropped or paired arbitrarily.

## `deriveOrphanedSubjectDisposition`

```ts
import { deriveOrphanedSubjectDisposition, type SubjectRef } from "@kontourai/surface";

const orphanedSubjects: SubjectRef[] = result.orphaned.map((row) => ({
  subjectType: "schedule-row",
  subjectId: row.id,
}));

const events = deriveOrphanedSubjectDisposition({
  orphanedSubjects,
  claims: authoredClaimsForThisProducer,
  status: "revoked",
  actor: "system:sync",
  method: "monitoring",
});

// append `events` to the producer's own VerificationEvent ledger
```

For every claim whose (`subjectType`, `subjectId`) matches one of
`orphanedSubjects`, `deriveOrphanedSubjectDisposition` emits one
`VerificationEvent` carrying the caller-specified `status` — no new status is
invented — along with `actor` and `method`. The caller appends the returned
events to its own event ledger; Surface's normal claim-status derivation
(`deriveTrustStatus`/`deriveClaimStatus`) takes it from there.

**`status` is constrained to `OrphanedSubjectDispositionStatus`**
(`"rejected" | "disputed" | "superseded" | "stale" | "revoked"`), not the full
`TrustStatus` taxonomy — callers typically pass `"revoked"`. This function
deliberately leaves `VerificationEvent.type` unset, which `deriveTrustStatus`
only treats as terminal for this exact subset of statuses; any other
`TrustStatus` would silently no-op instead of moving the claim off its current
status, so the type system and a runtime guard both reject it. Note that
`"revoked"` folds through `deriveTrustStatus` to a resulting claim status of
`"stale"` (Surface's event-driven staleness representation of a revocation),
not literally `"revoked"` — see `src/status.ts`.

`orphanedSubjects` takes plain `SubjectRef`s rather than `matchClaimSubjects`'s
`orphaned` array directly, because the caller's existing-row shape is
producer-specific — mapping `{ subjectType, subjectId }` out of it is the same
step the caller already performs when authoring claims for those rows.

## Full committed API

The entire public surface this contract commits to, in full:

- `matchClaimSubjects<TIncoming, TExisting>(input: MatchClaimSubjectsInput<TIncoming, TExisting>): ClaimSubjectMatchResult<TIncoming, TExisting>`
- `deriveOrphanedSubjectDisposition(input: DeriveOrphanedSubjectDispositionInput): VerificationEvent[]`
- `ClaimSubjectMatch<TIncoming, TExisting>` — one entry of `matched`: `{ id, existing, incoming }`.
- `ClaimSubjectMatchResult<TIncoming, TExisting>` — `matchClaimSubjects`'s return shape: `{ matched, orphaned, created }`.
- `MatchClaimSubjectsInput<TIncoming, TExisting>` — `matchClaimSubjects`'s parameter object: `{ existing, incoming, existingKey, incomingKey, existingId }`.
- `DeriveOrphanedSubjectDispositionInput` — `deriveOrphanedSubjectDisposition`'s parameter object: `{ orphanedSubjects, claims, status, actor, method, now? }`.
- `OrphanedSubjectDispositionStatus` — the subset of `TrustStatus` accepted by `DeriveOrphanedSubjectDispositionInput.status`: `"rejected" | "disputed" | "superseded" | "stale" | "revoked"`. These are exactly the statuses for which Surface's `deriveTrustStatus` treats an unset `VerificationEvent.type` as equivalent to `type: "invalidation"` (see `status.ts`'s internal `TERMINAL_EVENT_STATUSES`). Passing anything outside this set is a type error at compile time and throws at runtime — the rest of `TrustStatus` (`"verified"`, `"assumed"`, `"proposed"`, `"unknown"`) would otherwise silently no-op instead of moving the claim to a terminal, no-longer-current status.

Two named interfaces (`MatchClaimSubjectsInput`, `DeriveOrphanedSubjectDispositionInput`) are exported in addition to the two functions and two result types, following the existing repo convention of naming a function's parameter-object type (`ClaimFoldInput`, `ConflictDerivationInput`, `NormalizedDerivationInput` elsewhere in `src/`) rather than inlining it. That brings the real committed surface to 2 functions + 5 types, not 2 functions + 2 types — this section is the canonical record of that commitment.

## Why this belongs in Surface

The disposition half of this contract (`VerificationEvent`/`TrustStatus`) is
Surface vocabulary — a producer reconciling child rows still needs Surface's
own claim-lifecycle types to record "this row's claims are no longer
current," not a parallel vocabulary it invents itself. Surface is the correct
home for both the matching half and the disposition half of this contract.
