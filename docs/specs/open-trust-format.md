# Open Trust Format and Claim Package Shape

Status: first pass

The Open Trust Format is Surface's portability commitment: trust state must be schema-first, exportable, embeddable, locally inspectable, and usable without a proprietary hosted service.

## Claim Package

A Claim Package is the portable unit a producer emits or exports so Surface tools can evaluate, display, or share product transparency state.

A minimum Claim Package contains:

- `schemaVersion`
- producer identity
- claims
- evidence
- verification policies
- verification events
- optional claim groups
- optional identity links
- optional materiality mappings
- optional evidence traces
- optional authority traces
- optional integrity references
- optional producer extension reference
- optional transparency capabilities

In the current implementation, this shape is represented primarily through `TrustInput` and generated into `TrustReport`. Product language may call the evaluated projection a Trust Snapshot.

## Core Records

Claims describe what a producer says is true enough to inspect. Evidence supports or challenges claims. Policies describe what evidence, methods, authority, freshness, and conflict behavior matter. Events record append-only claim lifecycle changes.

Trace and integrity records explain how evidence or authority was produced, who or what produced it, when it was observed, and what source state it was anchored to. Surface standardizes the representation; producers own claimGroup and verification workflows.

## Required Properties

An Open Trust Format package must be:

- deterministic: same input produces the same derived trust state
- inspectable: humans and agents can see claims, evidence, freshness, and gaps
- portable: no hosted Surface dependency is required to parse it
- explicit: missing, private, redacted, permissioned, unavailable, and stale evidence remain distinguishable
- extensible at the edge: producer-specific fields belong in extension or metadata areas unless the concept is portable

## Current Implementation Names

Use current field names only where exact technical reference requires them:

- `TrustInput` is the current claim package input contract.
- `TrustReport` is the current derived report contract.
- `schemaVersion: 2` and `schemaVersion: 3` remain accepted.
- `evidence.execution` remains the current structured execution trace field.
- `metadata` remains valid for producer-specific trace details until first-class portable fields are added.
- `transparencyGaps` remains the current typed gap field; product docs should present it as Transparency Gaps or Conflicts.
- `claimGroups` remains the current grouping field; product docs should present it as Claim Groups.

## Non-Goals

- no proprietary handshake requirement
- no global identity provider requirement
- no Surface-owned evidence collection
- no universal legal, compliance, or action verdict
