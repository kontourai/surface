# Source Module Audit

This audit records the current `src/` module seams before larger source moves. It is intentionally conservative: Surface is still pre-1.0, but product builders already import from `@kontourai/surface`, so public module changes should be deliberate.

## Public Entry

`src/index.ts` is the only public module entrypoint. Package metadata points `types` and `exports["."].types` at `dist/src/index.d.ts`, and `exports["."].import` at `dist/src/index.js`.

Consumers should import from `@kontourai/surface`. Deep `dist/` imports are not a supported interface, even though built files are present in the package so the public module graph can run.

## Keep / Internal / Split Table

| Area | Files | Current interface | Decision | Rationale |
|------|-------|-------------------|----------|-----------|
| Trust contracts | `src/types.ts`, `schemas/` | Public | Keep public | These define the portable Claim Package, Trust Report, Trace, policy, event, and status shapes. Their size reflects domain breadth more than accidental sprawl. |
| Validation | `src/validate.ts` | Public through `validateTrustInput` | Keep public, split later only behind same interface | Builders need one validation function. If split, keep the interface stable and move implementation-only schema checks behind it. |
| Trust derivation | `src/status.ts`, `src/derivation.ts`, `src/trust-snapshot.ts`, `src/report.ts`, `src/trace-analysis.ts`, `src/claim-groups.ts`, `src/evidence-support.ts`, `src/identity.ts`, `src/policy-resolver.ts` | Public | Keep public for now | Tests and docs already present these helpers as inspectable derivation utilities. Removing exports would be a breaking API decision, not cleanup. |
| Projections | `src/analytics.ts`, `src/linked.ts`, `src/derivation-drilldown.ts` | Public | Keep public | These are useful Builder, Verifier, and Agent Mode read models over reports. |
| Builder helpers | `src/consumer-sdk.ts`, `src/claim-authoring.ts`, `src/store.ts`, `src/policy-helpers.ts`, `src/attestation.ts` | Public | Keep public, review before 1.0 | These are convenience interfaces. They carry more product opinion than the kernel, but they are documented and tested as package surface today. |
| Extensions and adapters | `src/extension.ts`, `src/adapter.ts`, `src/adapters/` | Public | Keep public | Producers need a supported seam for vocabulary, claim types, and input adaptation. |
| CLI implementation | `src/cli.ts` | Internal by convention | Keep internal | The package exposes `bin/surface.mjs`, not `src/cli.ts`. Tests may import it directly, but package consumers should use the CLI. |
| Surface Console runtime | `src/console/server.ts`, `src/console/projection.ts`, `src/console/types.ts` | Partly public through `startConsoleServer` and config types | Keep public entry minimal | `startConsoleServer` is currently exported. Routes and projection internals should stay Surface-owned until a real external embedding use case requires a deeper Console interface. |
| Surface Console assets | `src/console/script.ts`, `src/console/styles.ts`, `src/console/shell.ts` | Internal by convention | Keep internal, split only with a build step | These files are large because they embed dependency-free browser assets. The immediate cleanup is to keep their declarations compact; a future split should preserve the standalone CLI contract. |

## Large File Findings

| File | Current size | Finding | Next action |
|------|--------------|---------|-------------|
| `src/console/styles.ts` | ~2.1k lines | Large embedded stylesheet, but localized to one dependency-free asset module. | Keep until a small asset build step exists; do not split manually into runtime string fragments. |
| `src/console/script.ts` | ~1.3k lines | Large embedded browser script with real UI behavior. | Candidate for `src/console/client/` source layout if Console behavior starts changing frequently. |
| `src/types.ts` | ~600 lines | Broad portable contract file. | Keep together while schema versioning is active; split only if exported type groups gain independent lifecycle. |
| `src/validate.ts` | ~560 lines | Deep validation implementation behind a small public function. | Keep interface; consider internal helper split only if validation changes become hard to review. |

## Guardrails Added

- Package metadata now declares the public ESM and TypeScript entrypoint explicitly.
- Package contents checks require `package.json`, `README.md`, `LICENSE`, runtime files, schemas, docs, and examples.
- Console asset constants are typed as `string` so generated declarations expose a small interface instead of embedded asset contents.
- Package tests fail if the generated Console asset declarations grow beyond a small threshold.

## Top Recommendation

Do not move source folders yet. The next high-leverage refactor is a small Console asset build step that lets `src/console/client/` and `src/console/styles/` be edited as normal source while preserving the current standalone server output. That should be planned as a dedicated slice with browser coverage, not mixed into package metadata cleanup.
