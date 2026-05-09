# Surface Privacy

Surface produces two very different kinds of files. They look similar (JSON, under `.surface/`) but have opposite version-control rules. Read this once before persistence is wired in.

## The split: inputs vs. derived

**Inputs** are configuration or human judgment. They change deliberately. They belong in git.

**Derived** files are computed every run from inputs + repo state. They change on every CI run. They do not belong in git.

| Path | Kind | Commit? | Why |
|---|---|---|---|
| `.surface/policies/` | input | ✅ yes | Verification policies are configuration |
| `.surface/identity-links/` | input | ✅ yes | Curated subject merges, hand-authored |
| `.surface/attestations/` | input | ✅ yes | Human-created claim data ("I verified X on date Y") |
| `schemas/` | input | ✅ yes | Schema contracts |
| `examples/` | input | ✅ yes | Fixtures |
| `.surface/claims/` | derived | ❌ no | Per-claim status snapshots, regenerated each run |
| `.surface/reports/` | derived | ❌ no | Trust reports — outputs of `surface report` |
| `.surface/runs/` | derived | ❌ no | Per-run evidence dumps with timestamps and run IDs |
| `.surface/cache/` | derived | ❌ no | Any computed index or cache |
| `.surface/history.jsonl` | append-only ledger | ⚠️ judgment call | See "history log" below |

The `.gitignore` enforces the derived row. Don't fight it. If you find yourself wanting to commit a `.surface/claims/*.json` file, you almost certainly want a `.surface/attestations/` entry instead.

## The history log judgment call

`.surface/history.jsonl` is append-only, doesn't conflict, and gives a free audit trail. Two reasonable defaults:

- **Public open-source repo:** commit it. The "every claim has a public history" signal is worth the noise.
- **Private / internal repo:** gitignore it. Operational metrics should stay internal.

Pick one in the README and stick with it. Don't sometimes-commit it.

## Public-repo redaction rules

Anything checked in is searchable forever, even after deletion (git history). Before persistence is wired in, decide what is allowed in committed claim-shaped data.

**Allowed in committed `.surface/` files:**
- Claim IDs, subject types, surface names
- Schema-defined enums (status, evidence type, method)
- Commit SHAs, file paths within the repo
- Policy IDs and rule IDs
- Timestamps

**Forbidden in committed `.surface/` files:**
- Email addresses
- Person names (in `attestedBy`, `collectedBy`, `actor`, `notes`, `excerptOrSummary`)
- Internal ticket IDs, customer IDs, account IDs
- URLs to private systems
- Any free-form `notes` / `metadata` field that hasn't been reviewed
- Anything from a downstream adapter that handles real-world subjects (records, facts, accounts) until that adapter has its own redaction step

For human attestations, use opaque actor identifiers (e.g., `reviewer:alice` mapped via a private lookup) rather than raw names or emails.

## CI guard

Add a CI step that scans committed `.surface/` files and fails on:

- Email regex: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
- The `notes`, `excerptOrSummary`, and `metadata` fields (warn — these need explicit review)
- Anything matching the project's secret-pattern allowlist

Keep the regex set small; tune as adapters land.

## When a downstream adapter ships

`field-attested-records` and `fact-resolution` adapters work with real-world subjects. Before either of them produces committable output:

1. The adapter MUST define a redaction step that strips PII before files reach `.surface/`.
2. That redaction step MUST run before any persistence write, not as a post-hoc cleaner.
3. This file MUST be updated with the adapter's specific allowed/forbidden field rules.

Until those three things are done, those adapters write only to `.surface/runs/` (gitignored) and never to `.surface/claims/` or `.surface/attestations/`.

## TL;DR

Inputs in, derived out. Treat `.surface/` like `package.json` (commit) vs. `node_modules/` (ignore). No PII in committed claims. Redact at the adapter boundary, not at the git boundary.
