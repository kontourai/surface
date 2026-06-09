# Generated And Runtime Artifacts

Surface keeps source, generated output, and local runtime state separate so a contributor can tell what to edit.

## Editable Source

- `src/` contains TypeScript runtime source plus editable Surface Console asset parts.
- `docs/` contains Markdown source documentation.
- `schemas/` contains JSON Schema contracts.
- `examples/` contains published example inputs and the external adapter example.
- `scripts/` contains build, guard, and release helper scripts.
- `tests/` contains Node and browser verification source.

## Checked Generated Source

The Surface Console is standalone and dependency-light at runtime, so a few generated source files are checked in for deterministic builds:

- `src/console/client/index.js` is generated from `src/console/client/parts/`.
- `src/console/styles/index.css` is generated from `src/console/styles/parts/`.
- `src/console/assets.generated.ts` embeds the generated script and stylesheet for the Console server.

Edit the part files, then run:

```bash
npm run build:console-assets
```

`npm run check:console-assets` and `npm run check:generated-boundaries` fail if the checked generated files drift or lose their generated-file markers.

## Ignored Generated Output

These paths are local build, verification, cache, or workflow output and should not be committed:

- `dist/`
- `docs-site/`
- `test-results/`
- `playwright-report/`
- `.npm-pack-cache/`
- `.omx/`
- `.flow-agents/`
- `.surface/claims/`, `.surface/reports/`, `.surface/runs/`, `.surface/cache/`

The same boundary applies when these artifact directories appear under examples. For example, `examples/external-adapter/dist/`, `examples/external-adapter/node_modules/`, and `examples/external-adapter/.flow-agents/` are local outputs from validating the package-shaped adapter example, not source.

`.agents/` is different: it can hold durable agent bundle files and is intentionally not gitignored.

## Release Boundary

`package.json` is the source of truth for `exports`, `bin`, and `files`; `src/index.ts` is the source of truth for root module exports. `npm run check:package-contents` runs `scripts/check-package-contents.mjs` to verify the npm tarball contains the intended runtime, docs, schemas, and examples while excluding source, tests, scripts, generated docs-site output, local workflow state, and caches.

`npm run test:package-smoke` installs the packed tarball into a fresh consumer project, imports the root `@kontourai/surface` API, verifies unsupported deep imports stay blocked by package exports, checks declarations are present, and runs the installed `surface` CLI.
