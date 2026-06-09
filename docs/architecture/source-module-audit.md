# Source Module Audit

This audit records the current `src/` module seams before larger source moves. It is intentionally conservative: Surface is still pre-1.0, but product builders already import from `@kontourai/surface`, so public module changes should be deliberate.

## Public Entry

`src/index.ts` is the only public module entrypoint. Package metadata points `types` and `exports["."].types` at `dist/src/index.d.ts`, and `exports["."].import` at `dist/src/index.js`.

Consumers should import from `@kontourai/surface`. Deep `dist/` imports are not a supported interface, even though built files are present in the package so the public module graph can run.

Surface intentionally exposes one package module entrypoint:

| Package surface | Metadata | Status |
|-----------------|----------|--------|
| Root module | `exports["."]`, `types` -> `dist/src/index.d.ts`, `import` -> `dist/src/index.js` | Supported public API |
| CLI | `bin.surface` -> `bin/surface.mjs` | Supported command-line API |
| Deep package paths | `@kontourai/surface/dist/**`, `@kontourai/surface/console/**`, `@kontourai/surface/src/**` | Unsupported; package `exports` should reject these imports |

The root module may re-export `startConsoleServer` and `SurfaceConsoleConfig` / `SurfaceConsoleTheme` / `SurfaceConsoleVocab` as the narrow supported Console embedding seam. Browser assets, route handlers, projections, generated constants, and shell/style/script shims stay private implementation.

## Keep / Internal / Split Table

| Area | Files | Current interface | Decision | Rationale |
|------|-------|-------------------|----------|-----------|
| Trust contracts | `src/types.ts`, `schemas/` | Public | Keep public | These define the portable Claim Package, Trust Report, Trace, policy, event, and status shapes. Their size reflects domain breadth more than accidental sprawl. |
| Validation | `src/validate.ts`, `src/validation/` | Public through `validateTrustInput` | Keep public entry stable; keep internals private | Builders need one validation function. Implementation-only constants, primitive guards, record validators, and reference checks live under `src/validation/` so schema behavior can evolve without widening the public API. |
| Trust derivation | `src/status.ts`, `src/derivation.ts`, `src/trust-snapshot.ts`, `src/report.ts`, `src/trace-analysis.ts`, `src/claim-groups.ts`, `src/evidence-support.ts`, `src/identity.ts`, `src/policy-resolver.ts` | Public | Keep public for now | Tests and docs already present these helpers as inspectable derivation utilities. Removing exports would be a breaking API decision, not cleanup. |
| Projections | `src/analytics.ts`, `src/linked.ts`, `src/derivation-drilldown.ts` | Public | Keep public | These are useful Builder, Verifier, and Agent Mode read models over reports. |
| Builder helpers | `src/consumer-sdk.ts`, `src/claim-authoring.ts`, `src/store.ts`, `src/policy-helpers.ts`, `src/attestation.ts` | Public | Keep public, review before 1.0 | These are convenience interfaces. They carry more product opinion than the kernel, but they are documented and tested as package surface today. |
| Extensions and adapters | `src/extension.ts`, `src/adapter.ts`, `src/adapters/` | Public | Keep public | Producers need a supported seam for vocabulary, claim types, and input adaptation. |
| CLI implementation | `src/cli.ts` | Internal by convention | Keep internal | The package exposes `bin/surface.mjs`, not `src/cli.ts`. Tests may import it directly, but package consumers should use the CLI. |
| Surface Console runtime | `src/console/server.ts`, `src/console/projection.ts`, `src/console/types.ts` | Partly public through `startConsoleServer` and config types | Keep public entry minimal | `startConsoleServer` is currently exported. Routes and projection internals should stay Surface-owned until a real external embedding use case requires a deeper Console interface. |
| Surface Console assets | `src/console/client/parts/`, `src/console/client/index.js`, `src/console/styles/parts/`, `src/console/styles/index.css`, `src/console/assets.generated.ts`, `src/console/script.ts`, `src/console/styles.ts`, `src/console/shell.ts` | Internal by convention | Keep internal, generated behind a build step | The editable browser script and stylesheet are split into ordered concern files. `assets.generated.ts`, `src/console/client/index.js`, and `src/console/styles/index.css` are checked-in generated files so builds and package output stay deterministic, while `script.ts` and `styles.ts` preserve the server imports. |

## Large File Findings

| File | Current size | Finding | Next action |
|------|--------------|---------|-------------|
| `src/console/client/parts/` | Split source | Dependency-free browser behavior split by state, formatting, analysis, dashboard/feed, detail sheet, routing/help, authoring, and runs. | Keep the ordered concatenation until browser module loading or a real bundler becomes worth the extra moving parts. |
| `src/console/client/index.js` | Generated | Concatenated browser script source marker used by the asset build step. | Regenerate with `npm run build:console-assets`; do not edit directly. |
| `src/console/styles/parts/` | Split source | Standalone stylesheet split into tokens, header, layout/feed, detail sheet, contextual help, gap display, evidence details, authoring modal, and responsive/reduced-motion sections. | Keep the ordered concatenation until browser module loading or a real bundler becomes worth the extra moving parts. |
| `src/console/styles/index.css` | Generated | Concatenated stylesheet source marker used by the asset build step. | Regenerate with `npm run build:console-assets`; do not edit directly. |
| `src/console/assets.generated.ts` | Generated | Build output from source JS/CSS assets. | Regenerate with `npm run build:console-assets`; do not edit directly. |
| `src/console/script.ts`, `src/console/styles.ts` | Tiny wrappers | Preserve existing server imports for `/console.js` and `/console.css`. | Keep as stable import shims. |
| `src/types.ts` | ~600 lines | Broad portable contract file. | Keep together while schema versioning is active; split only if exported type groups gain independent lifecycle. |
| `src/validate.ts` | Public entry | Orchestrates trust-input validation behind `validateTrustInput`. | Keep the exported function stable; move implementation-only helpers under `src/validation/`. |
| `src/validation/` | Split source | Private validation constants, primitive guards, record validators, and cross-reference checks. | Keep private; add modules here when new schema families need locality. |

## Guardrails Added

- Package metadata now declares the public ESM and TypeScript entrypoint explicitly.
- Package tests require `exports` to expose only `"."` and assert unsupported deep imports are rejected by Node package exports.
- Package tests assert the root public API does not re-export private Console internals such as generated assets, client parts, projections, shell, script, or style shims.
- Package contents checks require `package.json`, `README.md`, `LICENSE`, runtime files, schemas, docs, and examples.
- Console asset constants are typed as `string` so generated declarations expose a small interface instead of embedded asset contents.
- Package tests fail if the generated Console asset declarations grow beyond a small threshold.
- `npm run typecheck` fails if `src/console/assets.generated.ts`, `src/console/client/index.js`, or `src/console/styles/index.css` is stale relative to `src/console/client/parts/` or `src/console/styles/parts/`.

## Active Script Classification

Every `package.json` script is an active repo workflow, release guard, or contributor utility. New scripts should either fit one of these categories or come with a matching docs/test update that explains why the command belongs in the public contributor surface.

| Script | Category | Purpose |
|--------|----------|---------|
| `build` | Build | Regenerates Console assets and compiles TypeScript into `dist/`. |
| `build:console-assets` | Build | Concatenates ordered Console JS/CSS source parts into checked generated assets. |
| `check:console-assets` | Guard | Fails when checked generated Console assets are stale. |
| `typecheck` | Guard | Runs asset sync check before TypeScript `--noEmit`. |
| `test` | Verification | Builds and runs the Node test suite from `dist/tests`. |
| `test:external-adapter` | Verification | Runs the package-consumer adapter example test. |
| `test:browser` | Verification | Runs Playwright coverage for the standalone Console and docs site. |
| `test:coverage` | Verification | Runs Node tests with experimental coverage reporting. |
| `docs:build` | Build | Syncs Console Kit docs assets and builds the static docs site. |
| `sync:console-kit` | Build | Copies docs-site token assets from the installed public `@kontourai/console-kit` package. |
| `check:console-kit-assets` | Guard | Fails when generated docs-site Console Kit assets are stale. |
| `check:package-contents` | Release guard | Verifies the npm tarball includes only intended files. |
| `surface:report` | Smoke test | Builds and runs the CLI report command. |
| `surface:summary` | Smoke test | Builds and runs the CLI summary report used by `verify`. |
| `verify` | Release guard | Runs the full local CI lane. |
| `prepare` | npm lifecycle | Builds the package before npm packaging/install lifecycle hooks need `dist/`. |
| `check:content-boundary` | Guard | Prevents terminology and content-boundary regressions. |
| `setup:repo-hooks` | Contributor utility | Installs repo-owned local Git hooks. |
| `validate:repo-hooks` | Guard | Verifies the repo hook wiring and docs stay aligned. |

## Top Recommendation

Keep the source folders stable for now. The next Console refactor should only replace ordered concatenation with browser modules or a real bundler if new behavior makes the current dependency-free build step painful, and it should include browser coverage for `/console.js` and `/console.css`.
