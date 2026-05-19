import type { ClaimTypeDefinition, SurfaceExtension } from "./types.js";

const registry = new Map<string, SurfaceExtension>();

export function registerExtension(extension: SurfaceExtension): void {
  registry.set(extension.name, extension);
}

export function getExtension(name: string): SurfaceExtension | undefined {
  return registry.get(name);
}

export function listExtensions(): SurfaceExtension[] {
  return [...registry.values()];
}

export function resolveClaimTypeDefinition(claimTypeId: string): ClaimTypeDefinition | undefined {
  for (const extension of registry.values()) {
    const found = extension.claimTypes?.find((claimType) => claimType.id === claimTypeId);
    if (found) return found;
  }
  return undefined;
}

export function resolveExtensionVocab(producerName: string): SurfaceExtension["vocab"] | undefined {
  return registry.get(producerName)?.vocab;
}

export function resolveExtensionTheme(producerName: string): SurfaceExtension["theme"] | undefined {
  return registry.get(producerName)?.theme;
}
