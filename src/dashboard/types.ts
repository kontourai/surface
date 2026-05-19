import type { ClaimTypeDefinition, TrustStatus } from "../types.js";

export interface SurfaceDashboardVocab {
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

export interface SurfaceDashboardTheme {
  primaryColor?: string;
  brandName?: string;
}

export interface SurfaceDashboardConfig {
  port?: number;
  readModelPath?: string;
  storePath?: string;
  vocab?: SurfaceDashboardVocab;
  theme?: SurfaceDashboardTheme;
}

export interface SurfaceDashboardRuntimeConfig extends SurfaceDashboardConfig {
  readModel?: unknown;
  producer?: string;
  claimTypes?: ClaimTypeDefinition[];
  folderName?: string;
}
