import type { ClaimTypeDefinition, TrustStatus } from "../types.js";

export interface SurfaceConsoleVocab {
  projectName?: string;
  projectKind?: string;
  surfaceLabels?: Record<string, string>;
  surfaceDescriptions?: Record<string, string>;
  claimTypeLabels?: Record<string, string>;
  statusLabels?: Partial<Record<TrustStatus, string>>;
  actionText?: {
    reviewItem?: string;
    refreshEvidence?: string;
    markProposed?: string;
  };
}

export interface SurfaceConsoleTheme {
  primaryColor?: string;
  brandName?: string;
}

export interface SurfaceConsoleConfig {
  port?: number;
  readModelPath?: string;
  storePath?: string;
  vocab?: SurfaceConsoleVocab;
  theme?: SurfaceConsoleTheme;
}

export interface SurfaceConsoleRuntimeConfig extends SurfaceConsoleConfig {
  readModel?: unknown;
  producer?: string;
  claimTypes?: ClaimTypeDefinition[];
  folderName?: string;
}
