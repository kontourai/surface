import type { ClaimTypeDefinition, TrustStatus } from "../types.js";

export interface SurfaceConsoleVocab {
  projectName?: string;
  projectKind?: string;
  surfaceLabels?: Record<string, string>;
  surfaceDescriptions?: Record<string, string>;
  claimTypeLabels?: Record<string, string>;
  statusLabels?: Partial<Record<TrustStatus, string>>;
  /**
   * Overrides for the canonical `evidenceType` display names
   * (`EVIDENCE_TYPE_LABELS` in src/display-names.ts). The canonical table is
   * injected as the default; entries here win over it.
   */
  evidenceTypeLabels?: Record<string, string>;
  /**
   * Overrides for the canonical evidence `method` display names
   * (`EVIDENCE_METHOD_LABELS` in src/display-names.ts). The canonical table is
   * injected as the default; entries here win over it.
   */
  methodLabels?: Record<string, string>;
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
  /**
   * Optional producer bundle input paths. Additive to `readModelPath`: when
   * non-empty, the console validates each bundle, merges them order-independently
   * (`mergeBundlesDetailed`), and projects the MERGED ledger into the read model
   * instead of loading a pre-built read-model artifact from `readModelPath`. A
   * single input is projected directly (no merge). See `merged-read-model.ts`.
   */
  inputs?: string[];
  vocab?: SurfaceConsoleVocab;
  theme?: SurfaceConsoleTheme;
}

export interface SurfaceConsoleRuntimeConfig extends SurfaceConsoleConfig {
  readModel?: unknown;
  consoleModel?: unknown;
  emptyConsoleModel?: unknown;
  producer?: string;
  claimTypes?: ClaimTypeDefinition[];
  folderName?: string;
}
