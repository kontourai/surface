import type { TrustReport } from "./types.js";

/**
 * Surface's linked-data export format. The kernel produces a self-contained
 * trust report; this module wraps the same payload with a stable @context so
 * downstream tools can resolve Surface terms to absolute URLs without having
 * to ship our schemas inline.
 *
 * The vocab URL is intentionally versioned (`/v1`). Adding new terms is safe;
 * removing or repurposing terms requires a new namespace bump.
 */

export const SURFACE_LINKED_VOCAB = "https://kontour.ai/surface/v1#";

export const SURFACE_LINKED_CONTEXT = {
  "@version": 1.1,
  "@vocab": SURFACE_LINKED_VOCAB,
  id: "@id",
  claimId: { "@type": "@id" },
  policyId: { "@type": "@id" },
  evidenceIds: { "@type": "@id", "@container": "@set" },
  verificationPolicyId: { "@type": "@id" },
  derivedFrom: {
    "@id": "http://www.w3.org/ns/prov#wasDerivedFrom",
    "@type": "@id",
    "@container": "@set",
  },
  generatedAt: { "@type": "http://www.w3.org/2001/XMLSchema#dateTime" },
  createdAt: { "@type": "http://www.w3.org/2001/XMLSchema#dateTime" },
  updatedAt: { "@type": "http://www.w3.org/2001/XMLSchema#dateTime" },
  observedAt: { "@type": "http://www.w3.org/2001/XMLSchema#dateTime" },
} as const;

export type SurfaceLinkedContext = typeof SURFACE_LINKED_CONTEXT;

export interface LinkedTrustReport extends TrustReport {
  "@context": SurfaceLinkedContext;
}

/**
 * Wraps a trust report with the Surface linked-data context. The original
 * report fields are preserved exactly; only the @context envelope is added.
 */
export function toLinkedReport(report: TrustReport): LinkedTrustReport {
  return { "@context": SURFACE_LINKED_CONTEXT, ...report };
}
