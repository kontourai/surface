# Releasing Surface

This document is the operator checklist for cutting a release of `@kontourai/surface`.

## Preconditions

- `npm run verify` passes
- `npm run test:external-adapter` passes, proving the package-shaped producer example can consume the public SDK
- `npm run test:package-smoke` passes, proving a fresh consumer can install the packed artifact, import the root entrypoint, and run the CLI
- `npm run check:package-contents` passes, proving the packed file list matches the intended package boundary
- package metadata in `package.json` is correct, including `types`, `exports`, `bin`, license, repository, and public access
- vendored docs assets sourced from `@kontourai/ui` are limited to approved token CSS, or the upstream package declares explicit license metadata for any additional asset class
- any breaking changes are documented

## Release Flow

1. Land conventional commits on `main`; do not manually bump the manifest on a feature branch.
2. The `Release Please` workflow opens and maintains the release PR, including
   the authoritative `package.json` and `.release-please-manifest.json` version
   update. Review and merge that generated release PR after CI passes.
3. On merge, Release Please creates and pushes the matching tag, for example
   `v3.1.0`, then dispatches `Publish NPM` at that tag.
4. Confirm the publish workflow reruns verification, performs `npm pack --dry-run`, and either publishes with provenance or skips because the version already exists.
5. Confirm the published tarball contents and README rendering on npm.

## Trusted Publishing

The repo publishes through npm trusted publishing via GitHub Actions OIDC. Configure npmjs.com to trust:

- organization or user: `kontourai`
- repository: `surface`
- workflow filename: `publish-npm.yml`
- allowed action: `npm publish`

For an already-published package, you can configure the same relationship from a local authenticated npm CLI with npm `11.15.0` or later:

```bash
npm trust github @kontourai/surface --repo kontourai/surface --file publish-npm.yml --allow-publish
```

Publishing through trusted publishing requires npm CLI `11.5.1` or later in CI. The checked-in workflow uses Node 24 for the publish job so npm can authenticate through OIDC without a long-lived `NPM_TOKEN`.
