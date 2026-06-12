# Contributing

This file is intentionally short.

The main docs in this repo are written for people installing and using Surface.
This file is the footnote for people developing the product itself.

## Development Rules

- keep Surface behavior stable unless the task explicitly asks for runtime changes — validation, trust derivation, report projection, adapters, extension registry, CLI, and Console routes are compatibility-sensitive
- prefer small edits that match existing TypeScript and docs style
- do not hand-edit generated Pages output in `docs-site/`
- do not add empty placeholder directories
- keep `CONTEXT.md` current with the domain vocabulary when surface boundary changes

## Setup

```bash
npm install
```

Node >= 20 is required.

## Verification

Before opening a PR:

```bash
npm run verify
```

This runs the content-boundary check, doc-link check, generated-boundary check, typecheck, full test suite, docs build, console-kit asset check, package-contents check, external-adapter test, package smoke test, surface summary, and browser tests.

Individual checks by change type:

- docs-only: `npm run check:doc-links` and `npm run docs:build`
- generated/source boundary: `npm run check:generated-boundaries`
- public API or package metadata: `npm run check:package-contents` and `npm run test:package-smoke` and `npm run test:external-adapter`
- CLI, trust derivation, schemas, adapters, or Console runtime: `npm test`
- browser-visible changes: `npm run test:browser`

## PR Expectations

- one concern per PR; keep diffs reviewable
- update `docs/` when the public API, CLI, or adapter surface changes
- use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`) — releases are automated with release-please
- see `docs/maintenance/RELEASING.md` for release guidance

## Releases

Releases are automated with release-please: merges to main accumulate into a release PR, and merging it tags the version and dispatches the npm publish workflow.

## Repository

https://github.com/kontourai/surface

All projects are Apache-2.0.

## Integration tests

Every embeddable artifact this repo ships — the trust panel web component and
the MCP UI resources built from it — must be covered at two levels:

1. **Contract tests** that spawn the real process (`tests/mcp.test.ts` runs the
   actual stdio server) or build the real artifact, asserting payload shapes.
2. **Browser specs** in `tests/browser/` that render the artifact in Chromium
   and exercise it: the element upgrades, real data is visible, themes apply,
   and no external network requests occur. Anything that interpolates data
   into HTML must include a hostile-input case proving markup and script
   payloads render as inert text.

`tests/browser/` runs in CI on every build via `npm run verify` — a render
regression fails the pipeline, not just a local check.
