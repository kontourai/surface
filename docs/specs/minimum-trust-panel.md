# Minimum Trust Panel Spec

Status: first pass

The Trust Panel is the Viewer-facing way to inspect product transparency before relying on product information, recommendations, reports, or agent output. It must show the work behind material claims without implying Surface certification, a trust score, or a universal action decision.

## Scope

A minimum Trust Panel reads a Trust Snapshot or current `TrustReport` and renders:

- the subject or product output being inspected
- material claims about that subject
- current claim status using product labels
- evidence and evidence visibility for each material claim
- freshness, conflicts, and transparency gaps
- trace and integrity references when supplied
- available producer-owned reverification or access-request capabilities

The panel may be embedded in a product, opened from a product detail page, or exposed as a standalone local view. Hosted Surface services are optional and must not be required to understand the trust state.

## Required Claim States

The panel must map current API statuses to human labels without changing the underlying contract:

- `verified` -> Verified
- `stale` -> Needs refresh
- `disputed` -> Disputed
- `rejected` -> Rejected
- `revoked` -> Revoked
- `superseded` -> Superseded
- `assumed` -> Assumed
- `unknown` -> No evidence
- `proposed` (or any pending or review-oriented producer state) -> Pending review

This table is the single source for status display names. The exported
`TRUST_STATUS_DISPLAY_NAMES` table in `src/display-names.ts` carries the same
mapping (with one-line glosses) in importable form, and every shipped renderer
must consume it — a renderer must not mint its own synonym for a status the
table already names (for example `proposed` must render as "Pending review",
never as a locally invented "Pending", and `unknown` as "No evidence", never
"Never run").

Surface must not collapse these states into a single trust score. Producers may add explanatory labels, but they must not redefine core status meanings.

## Required Provenance Names

The evidence vocabulary — `evidenceType` (what the artifact is) and `method`
(how much verification depth it represents) — is the spec's axis for grading
provenance; the `sf-runtime-observation-required` conformance vector exists to
enforce the declared-vs-observed distinction it carries. The panel must map
these wire enums to the reader-facing names below without changing the
underlying contract, and must never show a reader the raw enum (an owner must
not read "test_output via validation"):

`evidenceType` — what the evidence artifact is:

- `source_excerpt` -> Source excerpt — a passage quoted from the source material itself
- `test_output` -> Test output — the recorded result of running an automated test
- `runtime_observation` -> Machine-observed at run time — what the running system actually did, captured by a machine while it ran
- `human_attestation` -> Human sign-off — a named person stating they reviewed this and stand behind it
- `attestation` -> Attested statement — a statement an actor put their name to, anchored to the reviewed content
- `calculation_trace` -> Calculation trace — the recorded steps of a calculation, so the result can be re-checked
- `document_citation` -> Document citation — a pointer to a document that states this
- `crawl_observation` -> Crawled page capture — what an automated crawler saw at the source when it looked
- `policy_rule` -> Policy rule — a rule from a governing policy that applies to this claim

`method` — how much verification depth the evidence represents:

- `observation` -> Directly observed — observed directly at the source rather than reported second-hand
- `extraction` -> Extracted from a source — pulled out of a source document or dataset without an independent check
- `validation` -> Checked against expectations — compared against expected results by a check that can fail
- `corroboration` -> Corroborated independently — confirmed against at least one independent source
- `attestation` -> Vouched for — an actor put their name behind this rather than a machine proving it
- `auditability` -> Audit-trail backed — backed by records that let a later audit re-check it
- `anchoring` -> Tamper-evident — tied to a hash, signature, or log entry that would reveal tampering
- `monitoring` -> Continuously monitored — watched on an ongoing schedule rather than checked once

These tables are the single source for provenance display names, exported as
`EVIDENCE_TYPE_DISPLAY_NAMES` and `EVIDENCE_METHOD_DISPLAY_NAMES` in
`src/display-names.ts`. As with claim states, a renderer must not mint its own
synonym set for a distinction the vocabulary already standardizes (for example
"witnessed / repeatable / reported" as a private grading of the same axis).
Producers may add explanatory labels, but they must not redefine what an
evidence type or method means, and unmapped values must fall back to the raw
enum rather than to an invented name.

## Required Sections

1. Summary: subject, generated time, producer, schema version, and status counts.
2. Material claims: claim label, subject, asserted field or behavior, value, impact, owner when supplied, and policy link when supplied.
3. Evidence: evidence summary, type, method, source, observed time, result when supplied, and visibility state.
4. Trace: evidence trace, authority trace, execution metadata, and integrity references when supplied.
5. Gaps and conflicts: missing evidence, private or unavailable evidence, stale evidence, contradictory claims, disputed claims, and unsupported inferences when supplied by producer policy.
6. Actions: producer-owned reverification, evidence access request, or escalation links when advertised.

## Current Implementation Names

Use current field names only where exact technical reference requires them:

- `TrustReport` remains the current report contract; product docs may call the projected view a Trust Snapshot.
- `transparencyGaps` remains the current typed report gap field; product docs should present these as Transparency Gaps or Conflicts.
- `claimGroups` remains the current grouping field; product docs should present these as Claim Groups or producer-defined views.
- `surface` remains a producer-defined grouping or namespace on claims, not the primary evaluated object.

## Non-Goals

- no Surface certification badge
- no opaque trust score
- no hosted-only panel requirement
- no Surface-owned evidence collection
- no guarantee that the user or agent should act
