---
status: current
subject: MCP Trust-Input Ingestion
decided: 2026-07-12
evidence:
  - kind: issue
    ref: "95"
  - kind: issue
    ref: "84"
  - kind: doc
    ref: docs/reference/mcp.md
---
# MCP Trust-Input Ingestion

**Decision.** `--input` is **not a required launch parameter**, and the server no
longer serves a silent baked-in example fallback. `surface mcp` runs
**input-agnostic** by default: with no `--input`, it holds no default input, and
each tool call supplies its own `input` (first-class multi-input for producers
that emit many, evolving `trust.bundle` files). `--input <file>` remains an
**optional convenience default** for the single-report case. A tool call with
neither a per-call nor a startup input returns an **honest error** — "No trust
input configured" — rather than quietly deriving demo data. The per-call `input`
and `adapter` semantics are stated explicitly in the tool schemas
(`src/commands/mcp.ts`).

This supersedes the earlier framing (keep `--input` as a defaulted single input):
the original question was "why is `input` a launch parameter at all?" The honest
answer is that it should not be a *defaulted* one — a hard default to the example
bundle turned a forgotten `--input` into demo data masquerading as real trust
state, which is worse than an explicit "unknown". Removing the default makes the
multi-input case primary and keeps Surface honest about not having an input.

A **`current`-aware resolver** (a pointer/convention that resolves the active
subject from a directory, glob, or moving "current" marker) is **deferred**, not
rejected — the eventual answer for a producer whose "current" subject moves over
a session without the consumer threading a path on every call. It is held until
the Flow Agents workflow integration (flow-agents ADR 0011) concretely needs it,
so the resolver is designed against a real access pattern rather than
speculatively.

## Why

- A hard-defaulted `--input` (to the bundled example) is a footgun: a real
  producer that forgets it gets demo data presented as its trust state. Honest
  absence — an explicit error — is strictly better than a fake "known".
- The per-call `input` already exists and is exact: each call names its own
  input, so a producer with many bundles is fully served without a startup
  "primary" that may not exist.
- A directory/glob or resolver input is a larger surface (discovery semantics,
  "which is current", watch behavior) that should be shaped by the integration
  that needs it, not guessed. Shipping it early risks a mismatched convention.
- The related envelope-unwrap friction (issue #84) is solved independently by the
  `veritas` adapter preset, so ingestion ergonomics and adapter selection stay
  orthogonal.

## Revisit when

The Flow Agents workflow `trust.bundle` integration needs Surface's MCP to follow
a changing "current" subject without per-call path threading. At that point,
ratify the resolver shape (directory vs pointer vs convention) here and update
`status`/rationale accordingly.
