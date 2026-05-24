# Producer Extension Limits

Status: first pass

Producer Extensions make Surface interfaces feel native to a product while preserving shared product transparency semantics. They can customize labels, branding, claim types, required fields, policy templates, evidence labels, and suggested actions.

## Allowed Extensions

Producer Extensions may define:

- producer name and display name
- theme and brand labels
- vocabulary labels for surfaces, claim types, statuses, and actions
- claim type definitions
- metadata field definitions for authoring tools
- policy templates
- evidence labels and visibility copy
- suggested actions and capability labels
- mappings to external standards or producer domain concepts

These are authoring and presentation hints. They are not inputs to Trust Snapshot derivation.

## Hard Limits

Producer Extensions must not:

- redefine core status semantics
- hide transparency gaps required by policy or report state
- convert private evidence into missing evidence
- treat missing evidence as verified
- change freshness, conflict, or dispute derivation
- override evidence trace or authority trace meaning
- make Surface appear to certify or approve a product
- require a hosted Surface service to read trust state
- run domain evidence collection inside Surface core

Extensions may add domain-specific validity claims, but those claims are evaluated as claims. They are not universal action guarantees.

## Review Rules

When adding extension behavior to Surface core, prefer:

- schema-shaped optional fields
- producer-specific metadata for non-portable concepts
- documented mappings from producer terms to Surface terms
- fixtures that prove core semantics are unchanged

If a producer concept changes claim status, evidence meaning, freshness, conflicts, or disclosure semantics, it belongs in a spec or schema proposal before implementation.

Trust Snapshot derivation must remain independent from `SurfaceExtension` registry lookups. Surface Console and authoring tools may read extension hints; derivation modules should consume Claim Packages, policies, evidence, events, traces, and identity links.

## Current Implementation Names

Use current API names only where exact technical reference requires them:

- `SurfaceExtension` remains the current extension type.
- `registerExtension`, `getExtension`, `listExtensions`, `resolveClaimTypeDefinition`, `resolveExtensionVocab`, and `resolveExtensionTheme` remain current helper APIs.
- `vocab.statuses` may change labels but not core status meanings.
- `claimTypes` and `policyTemplates` remain producer customization points.

## Non-Goals

- no plugin system for replacing Surface trust derivation
- no producer fork of the Open Trust Format
- no bypass of schema versioning rules
