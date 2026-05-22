# Disclosure Requirements

Status: first pass

Disclosure Requirements define what a product built with Surface must make visible so Viewers, Operators, Builders, Verifiers, and agents can inspect trust state.

## Required Disclosure

For each material claim, a product built with Surface should disclose:

- claim subject, type, asserted field or behavior, value, and impact
- current status and status reason when supplied
- evidence items that support or challenge the claim
- evidence type, method, source, observed time, and result when supplied
- freshness state and validity window when policy supplies one
- conflicts, disputes, stale evidence, missing evidence, and unsupported inference signals when supplied
- evidence visibility: public, redacted, private, permissioned, unavailable, or missing
- trace and integrity references when supplied
- authority trace when authority matters
- available access-request or reverification capability when supplied

Private, permissioned, redacted, or unavailable evidence must not be represented as missing evidence. Missing means the evidence was not supplied for the claim or policy requirement.

## Redaction and Access

Surface represents disclosure state and request metadata. Producers enforce access requirement and decide whether evidence can be shared.

A disclosure record should explain:

- what is hidden or unavailable
- why it is hidden when safe to reveal
- whether access can be requested
- who or what requirements access when supplied
- whether redaction affects claim status or policy satisfaction

## Materiality

Disclosure should prioritize material claims: claims that affect whether a user or agent should rely on product output. Producers own materiality mapping. Surface displays and carries the mapping so gaps around important claims are visible.

## Current Implementation Names

Use current field names only where exact technical reference requires them:

- Existing evidence fields remain valid even when visibility is represented through `metadata`.
- `TrustReport.summary` remains the current aggregate entry point.
- `transparencyGaps` remains the current typed report gap field and should be presented as Transparency Gaps or Conflicts.
- Existing status names should be mapped to human labels in product surfaces.

## Non-Goals

- no requirement to publish private evidence publicly
- no Surface-owned access requirement system
- no OAuth-only access-request requirement
- no universal credibility ranking
