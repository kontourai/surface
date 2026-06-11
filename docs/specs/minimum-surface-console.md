# Minimum Surface Console Spec

Status: first pass

The Surface Console is the Operator-facing workspace for shaping product transparency. It manages claims, policies, evidence context, owners, materiality, gaps, and review queues for a product built with Surface.

## Scope

A minimum Console lets an Operator:

- browse and filter managed claims
- inspect evidence, events, policies, and transparency gaps
- edit authored claims when the producer exposes a writable claim store
- assign or display claim ownership
- review candidate claims before promotion
- see materiality mappings from product outputs to claims
- trigger producer-owned reverification when a capability is advertised

The Console may run locally, be embedded in a producer product, or be offered by a hosted Surface service. Hosted Surface services add storage, monitoring, discovery, and collaboration; they are not required for the open trust format.

## Minimum Views

1. Claim inventory: status, impact, subject, claim type, owner, policy, freshness, and last event.
2. Claim detail: current assertion, evidence, evidence trace, authority trace, integrity references, policy requirements, and event history.
3. Gaps queue: missing evidence, stale evidence, conflicts, disputes, private or unavailable evidence, and unsupported inference signals supplied by producer policy.
4. Candidate claims: proposed claims from product output, docs, transcripts, reports, APIs, or workflows. Candidate claims are not trusted claims until promoted by an Operator or producer-owned rule.
5. Policy and materiality view: policy coverage, required evidence methods, review authority, validity windows, and product outputs affected by each material claim.
6. Capability view: advertised reverification and evidence access workflows, including current availability and audit trace when supplied.

## Write Boundaries

Surface may provide generic authoring and review tools. Producers own:

- domain evidence collection
- source integrations
- claim discovery rules
- domain policy interpretation
- action decisions
- access requirement enforcement

Surface records and displays the resulting trust state; it does not independently collect evidence or certify outcomes.

## Current Implementation Names

Use current command and field names only where exact technical reference requires them:

- `surface console` and console routes are current command/API names. Product docs should call the operator product surface the Surface Console.
- `.surface/runs/*.console.json` remains the current local read-model convention.
- `TrustBundle` remains the current producer input contract.
- `TrustReport` remains the current generated report contract.
- `collectWhen` remains a policy signal for producers; Surface does not collect evidence itself.

## Non-Goals

- no replacement for producer workflow tools
- no universal compliance engine
- no Surface-owned reviewer authority
- no custom extension path that changes core trust semantics
