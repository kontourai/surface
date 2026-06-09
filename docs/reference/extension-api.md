# Producer Extension API

Producer Extensions let a producer brand the Surface Console, define producer vocabulary, and describe claim types for authoring tools.

## Registering

Register extensions at producer startup:

```ts
import { registerExtension } from "@kontourai/surface";

registerExtension({
  name: "veritas",
  displayName: "Veritas",
  vocab: {},
  theme: { brandName: "Veritas", primaryColor: "#6366f1" },
});
```

`registerExtension(extension)` stores the extension in an in-process registry. Registering the same `name` again replaces the previous entry.

## SurfaceExtension

An extension has:

- `name`: stable producer key, matching claim store `producer`.
- `displayName`: human-readable producer name.
- `vocab`: Surface Console labels for project kind, producer-defined `surface` namespaces, claim types, statuses, and actions.
- `theme`: Surface Console brand name and primary color.
- `claimTypes`: optional claim type definitions for authoring UIs.
- `policyTemplates`: optional reusable policy templates keyed by ID.

Extensions may make Surface feel native to a product, but they must not redefine core statuses, Evidence semantics, Freshness semantics, Conflicts, Transparency Gaps, or Trust Snapshot derivation. Extension data is an authoring and presentation input, not a derivation hook.

## Claim Types

`ClaimTypeDefinition` describes how an authored claim should appear in tools:

- `id`
- `displayName`
- `description`
- `defaultImpact`
- `defaultSurface`
- `policyTemplateId`
- `metadataFields`

Metadata fields support `string`, `boolean`, and `number` inputs. The Surface Console uses these definitions to render the add/edit claim modal.

## Registry Helpers

Surface exports:

- `registerExtension(extension)`
- `getExtension(name)`
- `listExtensions()`
- `resolveClaimTypeDefinition(claimTypeId)`
- `resolveExtensionVocab(producerName)`
- `resolveExtensionTheme(producerName)`

The Surface Console includes registered claim type definitions in its runtime config so local producer Console instances can expose first-class authoring without hardcoding producer-specific fields in Surface.

## Derivation Seam

Trust Snapshot derivation does not query Producer Extensions. A Producer Extension can label a status, suggest a default surface namespace, provide metadata fields, or point an authored claim at a policy template. It cannot make a claim verified, hide a Transparency Gap, reinterpret an Evidence Trace, or change Authority Trace meaning.
