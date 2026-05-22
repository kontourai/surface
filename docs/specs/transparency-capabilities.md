# Transparency Capabilities

Status: first pass

Transparency Capabilities are producer-advertised actions or machine-readable affordances that help a Viewer, Operator, Verifier, or agent inspect and refresh trust state. Surface exposes these capabilities; producers perform the underlying domain work.

## Capability Types

Minimum capability categories:

- evidence reverification: recheck source state, rerun a test, refresh an observation, or validate an attestation
- authority reverification: confirm that an actor or system still has authority
- integrity check: compare current source state with the integrity reference behind evidence or claims
- evidence access request: ask for permissioned or private evidence
- materiality review: ask an Operator to review whether a claim is material to a product output
- dispute or correction: report a challenge to a claim, evidence item, or source

## Capability Record

A capability should describe:

- stable capability ID
- capability type
- producer that owns execution
- applicable claim, evidence, policy, subject, or claim group scope
- availability state
- input requirements
- expected output shape
- audit trace or event emitted after execution
- human label and suggested action text

Surface tools may render or expose the capability through Trust Panel, Console, API, or MCP resources. Surface must not imply that availability guarantees a successful refresh or that Surface performs the check.

## Agent Guidance

Agent-readable guidance may recommend actions such as reverify, ask for evidence, ask a human, surface uncertainty, or do not rely yet. Vertical products and agent runtimes own execution policy and final action decisions.

## Current Implementation Names

Use current field names only where exact technical reference requires them:

- `collectWhen` remains a verification policy signal that producers may use to schedule evidence collection.
- `evidence.execution` remains a current trace shape for command or MCP tool results.
- producer-specific capability details may live in `metadata` until a portable schema is added.
- MCP integrations should expose the same trust state rather than replace the Open Trust Format.

## Non-Goals

- no guaranteed refresh
- no Surface-owned verification service
- no agent runtime policy engine
- no certification or approval decision
