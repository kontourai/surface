# Implementation Backlog

This backlog turns the Surface roadmap into executable work.

## Now

- Trim the README so install and report generation appear before the full trust vocabulary.
- Cross-link Veritas as a reference consumer of `surface.input` and commit-validity policies.
- Promote the external adapter example with a short README.

## Next

- Add an `npm-audit` reference adapter to demonstrate a third-party, non-Kontour input shape.
- Add `surface validate`, `surface adapters`, and `surface diff` after the current report CLI stays stable.
- Finish candidate-value, assumption, comparison, and review-signal primitives so downstream adapters can represent high-stakes workflows without custom semantics.

## Later

- Publish SHACL shapes for the Surface vocabulary.
- Add MCP/query resources for stale, missing, disputed, and policy-bound claims.
- Add a human console and hosted sink only after local report contracts prove useful.
