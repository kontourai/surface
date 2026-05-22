# Releasing Surface

This document is the operator checklist for cutting a release of `@kontourai/surface`.

## Preconditions

- `npm run verify` passes
- `npm pack --dry-run` shows only intended package files
- package metadata in `package.json` is correct
- any breaking changes are documented

## Release Flow

1. Update `package.json` version.
2. Merge the release commit to `main`.
3. Create and push a tag matching the package version, for example `v0.4.0`.
4. Let `.github/workflows/publish-npm.yml` publish the package.
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
