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
- `unknown` -> No evidence
- pending or review-oriented producer state -> Pending review

Surface must not collapse these states into a single trust score. Producers may add explanatory labels, but they must not redefine core status meanings.

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
