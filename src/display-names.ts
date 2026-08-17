// Canonical reader-facing display names for the spec vocabulary (#224).
//
// The evidence vocabulary (`evidenceType`, `method`) and the trust status set
// are spec enums: the spec's `sf-runtime-observation-required` conformance
// vector and Surface's runtime-observation vocabulary exist to enforce the
// declared-vs-observed axis these enums carry. When the shared layer offers no
// display language for them, every renderer mints its own synonym set
// ("witnessed / repeatable / reported") and the one vocabulary quietly forks
// at the UI layer — Surface's own two renderers had already diverged
// ("Pending review" vs "Pending", "No evidence" vs "Never run").
//
// This module is the single source for those reader-facing names. Renderers
// must consume it (directly, or via `SurfaceConsoleVocab` defaults) rather
// than minting labels; `docs/specs/minimum-trust-panel.md` carries the same
// tables as normative spec text, and `tests/display-names.test.ts` holds the
// shipped renderers to them.
//
// Wire enums stay untouched: nothing here changes `schemas/` (byte-identical
// to hachure per tests/schema-parity.test.ts) or any serialized shape. Display
// names are presentation only.

import type { EvidenceMethod, EvidenceType, TrustStatus } from "./types.js";

/** A reader-facing name for one spec enum member. */
export interface DisplayName {
  /** Short label to render in place of the wire enum. */
  label: string;
  /** One-line plain-language gloss, e.g. for tooltips or legends. */
  gloss: string;
}

/**
 * Reader-facing names for `TrustStatus`. Labels match the (pre-existing)
 * "Required Claim States" table in docs/specs/minimum-trust-panel.md; this
 * table is now the single source both shipped renderers consume.
 */
export const TRUST_STATUS_DISPLAY_NAMES: Record<TrustStatus, DisplayName> = {
  unknown: {
    label: "No evidence",
    gloss: "No evidence has been recorded for this claim.",
  },
  proposed: {
    label: "Pending review",
    gloss: "Asserted by the producer but not yet reviewed or verified.",
  },
  assumed: {
    label: "Assumed",
    gloss: "Treated as true without evidence; rely on it knowingly.",
  },
  verified: {
    label: "Verified",
    gloss: "Current evidence supports the claim under its policy.",
  },
  stale: {
    label: "Needs refresh",
    gloss: "Previously verified, but the verification has aged out or the subject changed.",
  },
  disputed: {
    label: "Disputed",
    gloss: "Producers or reviewers currently disagree about this claim.",
  },
  superseded: {
    label: "Superseded",
    gloss: "A newer claim replaces this one.",
  },
  rejected: {
    label: "Rejected",
    gloss: "The claim was checked and found not to hold.",
  },
  revoked: {
    label: "Revoked",
    gloss: "The producer withdrew this claim.",
  },
};

/** Reader-facing names for `evidenceType` — what the evidence artifact is. */
export const EVIDENCE_TYPE_DISPLAY_NAMES: Record<EvidenceType, DisplayName> = {
  source_excerpt: {
    label: "Source excerpt",
    gloss: "A passage quoted from the source material itself.",
  },
  test_output: {
    label: "Test output",
    gloss: "The recorded result of running an automated test.",
  },
  runtime_observation: {
    label: "Machine-observed at run time",
    gloss: "What the running system actually did, captured by a machine while it ran.",
  },
  human_attestation: {
    label: "Human sign-off",
    gloss: "A named person stating they reviewed this and stand behind it.",
  },
  attestation: {
    label: "Attested statement",
    gloss: "A statement an actor put their name to, anchored to the reviewed content.",
  },
  calculation_trace: {
    label: "Calculation trace",
    gloss: "The recorded steps of a calculation, so the result can be re-checked.",
  },
  document_citation: {
    label: "Document citation",
    gloss: "A pointer to a document that states this.",
  },
  crawl_observation: {
    label: "Crawled page capture",
    gloss: "What an automated crawler saw at the source when it looked.",
  },
  policy_rule: {
    label: "Policy rule",
    gloss: "A rule from a governing policy that applies to this claim.",
  },
};

/** Reader-facing names for evidence `method` — how much verification depth it represents. */
export const EVIDENCE_METHOD_DISPLAY_NAMES: Record<EvidenceMethod, DisplayName> = {
  observation: {
    label: "Directly observed",
    gloss: "Observed directly at the source rather than reported second-hand.",
  },
  extraction: {
    label: "Extracted from a source",
    gloss: "Pulled out of a source document or dataset without an independent check.",
  },
  validation: {
    label: "Checked against expectations",
    gloss: "Compared against expected results by a check that can fail.",
  },
  corroboration: {
    label: "Corroborated independently",
    gloss: "Confirmed against at least one independent source.",
  },
  attestation: {
    label: "Vouched for",
    gloss: "An actor put their name behind this rather than a machine proving it.",
  },
  auditability: {
    label: "Audit-trail backed",
    gloss: "Backed by records that let a later audit re-check it.",
  },
  anchoring: {
    label: "Tamper-evident",
    gloss: "Tied to a hash, signature, or log entry that would reveal tampering.",
  },
  monitoring: {
    label: "Continuously monitored",
    gloss: "Watched on an ongoing schedule rather than checked once.",
  },
};

function labelsOf<K extends string>(table: Record<K, DisplayName>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(table) as K[]) out[key] = table[key].label;
  return out;
}

/** Label-only projection of {@link TRUST_STATUS_DISPLAY_NAMES} (vocab-map shape). */
export const TRUST_STATUS_LABELS: Record<TrustStatus, string> = labelsOf(TRUST_STATUS_DISPLAY_NAMES);
/** Label-only projection of {@link EVIDENCE_TYPE_DISPLAY_NAMES} (vocab-map shape). */
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = labelsOf(EVIDENCE_TYPE_DISPLAY_NAMES);
/** Label-only projection of {@link EVIDENCE_METHOD_DISPLAY_NAMES} (vocab-map shape). */
export const EVIDENCE_METHOD_LABELS: Record<EvidenceMethod, string> = labelsOf(EVIDENCE_METHOD_DISPLAY_NAMES);

/** Display label for a trust status; unknown inputs fall back to the raw value. */
export function trustStatusLabel(status: string): string {
  return (TRUST_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/** Display label for an `evidenceType`; unknown inputs fall back to the raw value. */
export function evidenceTypeLabel(evidenceType: string): string {
  return (EVIDENCE_TYPE_LABELS as Record<string, string>)[evidenceType] ?? evidenceType;
}

/** Display label for an evidence `method`; unknown inputs fall back to the raw value. */
export function evidenceMethodLabel(method: string): string {
  return (EVIDENCE_METHOD_LABELS as Record<string, string>)[method] ?? method;
}
