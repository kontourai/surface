# Extension API

Surface extensions let a producer brand the dashboard, define producer vocabulary, and describe claim types for authoring tools.

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
- `vocab`: dashboard labels for project kind, surfaces, claim types, statuses, and actions.
- `theme`: dashboard brand name and primary color.
- `claimTypes`: optional claim type definitions for authoring UIs.
- `policyTemplates`: optional reusable policy templates keyed by ID.

## Claim Types

`ClaimTypeDefinition` describes how an authored claim should appear in tools:

- `id`
- `displayName`
- `description`
- `defaultImpact`
- `defaultSurface`
- `policyTemplateId`
- `metadataFields`

Metadata fields support `string`, `boolean`, and `number` inputs. The dashboard uses these definitions to render the add/edit claim modal.

## Registry Helpers

Surface exports:

- `registerExtension(extension)`
- `getExtension(name)`
- `listExtensions()`
- `resolveClaimTypeDefinition(claimTypeId)`
- `resolveExtensionVocab(producerName)`
- `resolveExtensionTheme(producerName)`

The dashboard includes registered claim type definitions in its runtime config so local producer dashboards can expose first-class authoring without hardcoding producer-specific fields in Surface.
