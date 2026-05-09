import type { TrustInput } from "./types.js";

export interface Adapter<Input = unknown> {
  name: string;
  defaultFixture?: string;
  adapt(record: Input): TrustInput;
}

const REGISTRY = new Map<string, Adapter>();

export function registerAdapter(adapter: Adapter): void {
  if (!adapter.name) {
    throw new Error("Surface adapter name is required");
  }
  if (REGISTRY.has(adapter.name)) {
    throw new Error(`Surface adapter is already registered: ${adapter.name}`);
  }
  REGISTRY.set(adapter.name, adapter);
}

export function getAdapter(name: string): Adapter | undefined {
  return REGISTRY.get(name);
}

export function listAdapters(): Adapter[] {
  return [...REGISTRY.values()];
}
