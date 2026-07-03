> **FROZEN — immutable history.** Superseding/current decisions live in [`docs/decisions/`](../decisions/index.md). Do not edit.

# ADR 0004: Testimony Admissibility

Status: accepted

Date: 2026-06-11

## Context

Kontour records reviewer decisions as `ReviewOutcome` records. Those outcomes are
testimony: a human said something on the record. But the existing shape records
only *what* was decided, not *how* the human was asked or what authorized their
answer. Without that provenance, downstream verifiers cannot assess whether the
testimony is self-contained — interpretable without re-reading the surrounding
conversation or trusting that the UI asked the right question.

Three collection channels exist across the product line:

- **cli-interactive** — the human runs the attesting command themselves at a
  terminal; the command and its flags are the authorizing act.
- **delegated** — an agent or resolver executes the command on a human's
  behalf; the human's verbatim authorization must travel with the record.
- **ui** — a reviewer operates Survey's workbench and takes a named action
  against a rendered prompt.

Each channel produces a different evidence trail. Without specifying what a
complete record looks like per channel, testimony is only as good as the
consumer's willingness to trust the collecting system's internals.

Cryptographic signing and session binding are desirable but deferred; they
require key-management infrastructure that is not yet in place.

## Decision

### 1. Testimony must be self-contained

An admissible `authorizing` block on a `ReviewOutcome` must be interpretable
without the surrounding conversation. "The reviewer clicked a button" is not
admissible. "The reviewer clicked 'Affirm control' in response to the versioned
prompt `auth-v2` rendered as '…'" is admissible.

### 2. Three admissible kinds

`explicit-statement` — the reviewer typed a free-form statement. Required field:
`statement` (non-empty string). Optional: `source` (channel or UI reference).
Use when there is no prompt template — the statement stands alone.

`exchange` — a prompt was shown and the reviewer supplied a response. Required
fields: both `prompt` and `response` (non-empty strings). Optional: `source`.
Both halves are required; a prompt without a response, or a response without the
prompt that triggered it, is not self-contained and fails validation.

`authorized-action` — the reviewer took a named UI action against a versioned
prompt. Required fields: `promptRef` (versioned template identifier),
`renderedPrompt` (exact text shown), `action` (`"affirmed-control"` or
`"typed"`), `authorityRef` (an `AuthorityTrace` id proving the reviewer had
permission at decision time). All four fields are required; any missing field
fails validation.

### 3. Channel mapping

| Channel          | Likely kind          | Notes                                              |
| ---------------- | -------------------- | -------------------------------------------------- |
| cli-interactive  | `explicit-statement` | The human's own command names the act; environment captured silently. |
| delegated        | `exchange` (or `explicit-statement` when the human's words name the act alone) | Both halves of the human's authorization travel verbatim with the record. |
| ui               | `authorized-action`  | Survey workbench records promptRef, renderedPrompt, action, authorityRef. |

`explicit-statement` is available in any channel when a free-form attestation is
the appropriate evidence form (e.g., a reviewer adds a rationale note that serves
as the primary authorization record).

### 4. Admissibility heuristics emit transparency gaps, never hard blocks

`validateAuthorizing` in Survey returns structured issues. Consumers surface
these as transparency gaps for human review. Heuristics do not silently decide
on admissibility, and they do not hard-block a decision. A decision with a
missing or invalid `authorizing` block is recorded; the gap is flagged for the
attention queue so a human reviewer — not the model — decides whether to
accept, escalate, or re-collect.

### 5. Survey's workbench is the reference collector

Survey's review workbench is the reference implementation for testimony
collection in vertical UIs. A UI that renders `ReviewItem` candidates and emits
`ReviewDecision` payloads via the workbench automatically produces correctly
structured `authorized-action` blocks — the vertical UI inherits correct
testimony collection without re-implementing the provenance logic. The
`ReviewDecisionSpec` shape carries `authorizing` as an optional field; workbench
consumers should populate it when the collection channel is known.

### 6. Backlog

- **Cryptographic signing**: sign the `authorizing` block with the reviewer's
  key so the record is tamper-evident. Deferred pending key-management
  infrastructure.
- **Session binding**: link the `authorizing` block to the `ReviewSession` and
  `ReviewSessionEvent` chain so per-decision testimony is anchored to a
  replay-verifiable event log. Deferred; the session replay machinery is in
  place but the linkage contract is not yet specified.

## Consequences

- `ReviewOutcome.authorizing` is additive and optional; all existing records
  are valid without it, and no existing tests require changes.
- Vertical UIs that use Survey's workbench inherit admissible testimony
  collection by construction.
- Admissibility is defined in code (`validateAuthorizing`), not only in prose,
  so it can be tested and extended without doc-only drift.
- The three-kind taxonomy is closed by design; new kinds require a new ADR and
  a schema change. Ad-hoc string values in the `kind` field will fail validation.
- Cryptographic signing and session binding are explicitly backlogged so
  implementers know they are desired, not forgotten.

## Channel roster (amendment)

Photo- and video-attested actions are a collection channel variant. They map to
existing testimony kinds — `authorized-action` when a named action is captured,
or `exchange` when a verbal approval is recorded — with the media attached as
ordinary evidence on the `ReviewOutcome`. When the media carries a valid
capture-provenance credential (e.g., a C2PA manifest), it is attached with an
integrity anchor; without one it is ordinary L0 evidence.

Regulatory precedent: remote online notarization frameworks already accept
video-witnessed signatures as legally admissible acts, establishing that a
recorded human gesture can satisfy a formal authorization requirement.

Accessibility benefit: recorded verbal approval is an admissible `exchange`
testimony form, widening participation for reviewers who cannot use keyboard or
pointer-based interfaces.

This channel variant is a **capability, not a requirement**. It is never
enabled by default; a vertical UI or deployment must explicitly configure it.
Channels never substitute for the required fields of the mapped kind — media is
attached context, not a replacement for `promptRef`, `renderedPrompt`, `action`,
`authorityRef`, or the `prompt`/`response` pair.
