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

import type { ConfidenceBasis, DerivationMethod, EvidenceMethod, EvidenceSupportStrength, EvidenceType, TrustStatus } from "./types.js";

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

// ── Claim basis vocabulary (kontourai/ui#87) ──────────────────────────────
//
// The tables below name how a claim's status was established: the derivation
// step, whether each evidence item establishes or only cites the claim, each
// item's own result, who reviewed the claim, and the producer's own strength
// rating. `claimBasisView` (src/claim-basis-view.ts) composes them into the
// basis line shown after the status chip; the trust panel carries inline
// copies of the support and result labels (tests/display-names.test.ts pins
// them equal).

/**
 * Reader-facing names for `derivationEdges[].method`. `model` is the key
 * caveat: the derivation step was a model, not a deterministic rule.
 */
export const DERIVATION_METHOD_DISPLAY_NAMES: Record<DerivationMethod, DisplayName> = {
  sum: {
    label: "Calculated (sum)",
    gloss: "Computed as the sum of its input claims.",
  },
  max: {
    label: "Calculated (maximum)",
    gloss: "Computed as the largest of its input claims.",
  },
  min: {
    label: "Calculated (minimum)",
    gloss: "Computed as the smallest of its input claims.",
  },
  model: {
    label: "Model-derived",
    gloss: "A model produced this from its input claims; the step is not a deterministic rule.",
  },
  "rule-application": {
    label: "Rule applied",
    gloss: "Derived by applying a stated rule to its input claims.",
  },
  copy: {
    label: "Copied from an input",
    gloss: "Carried over unchanged from an input claim.",
  },
  normalization: {
    label: "Normalized from an input",
    gloss: "An input claim's value converted to a standard form or unit.",
  },
  manual: {
    label: "Entered by a person",
    gloss: "A person set this value by hand from its input claims.",
  },
};

/**
 * Evidence support as a reader sees it: the wire `supportStrength` values plus
 * `unstated` for an absent field. Absent is named as absent rather than shown
 * as "entails" (the kernel's default for status derivation), matching the
 * trust panel's evidence rows.
 */
export type EvidenceSupportState = EvidenceSupportStrength | "unstated";

/** Reader-facing names for evidence support (`supportStrength`, or its absence). */
export const EVIDENCE_SUPPORT_DISPLAY_NAMES: Record<EvidenceSupportState, DisplayName> = {
  entails: {
    label: "Entails the claim",
    gloss: "If accurate, this evidence establishes the claim.",
  },
  cited: {
    label: "Cited only",
    gloss: "Referenced as context; it does not by itself establish the claim.",
  },
  unstated: {
    label: "Support strength not stated",
    gloss: "The producer did not say whether this evidence establishes the claim or is only cited.",
  },
};

/**
 * An evidence item's own result, from `passing` and `blocking`. An absent
 * `passing` is `not-evaluated`, never a pass.
 */
export type EvidenceResultState = "passed" | "failed" | "failed-blocking" | "not-evaluated";

/** Reader-facing names for an evidence item's own result. */
export const EVIDENCE_RESULT_DISPLAY_NAMES: Record<EvidenceResultState, DisplayName> = {
  passed: {
    label: "Passed",
    gloss: "The evidence's own check passed.",
  },
  failed: {
    label: "Failed",
    gloss: "The evidence's own check failed and is not marked as blocking the claim.",
  },
  "failed-blocking": {
    label: "Failed — blocking",
    gloss: "The evidence's own check failed and is marked as blocking the claim.",
  },
  "not-evaluated": {
    label: "Not evaluated",
    gloss: "No result is recorded for this evidence; this is not a pass.",
  },
};

/** `confidenceBasis.reviewerAuthority` values. */
export type ReviewerAuthority = NonNullable<ConfidenceBasis["reviewerAuthority"]>;

/** Reader-facing names for `confidenceBasis.reviewerAuthority`. */
export const REVIEWER_AUTHORITY_DISPLAY_NAMES: Record<ReviewerAuthority, DisplayName> = {
  domain_expert: {
    label: "Domain expert reviewed",
    gloss: "A reviewer with expertise in the subject reviewed this claim.",
  },
  operator: {
    label: "Operator reviewed",
    gloss: "An operator of the producing system reviewed this claim.",
  },
  system: {
    label: "System reviewed",
    gloss: "An automated system, not a person, reviewed this claim.",
  },
  none: {
    label: "Not reviewed",
    gloss: "The producer records no reviewer for this claim.",
  },
};

/** `confidenceBasis.evidenceStrength` values. */
export type ProducerEvidenceStrength = NonNullable<ConfidenceBasis["evidenceStrength"]>;

/**
 * Reader-facing names for `confidenceBasis.evidenceStrength`. This is the
 * producer's own rating, not something Surface derives, so every label says
 * "(producer-rated)" and the basis line never shows it; it belongs in the
 * inspector only.
 */
export const EVIDENCE_STRENGTH_DISPLAY_NAMES: Record<ProducerEvidenceStrength, DisplayName> = {
  strong: {
    label: "Strong support (producer-rated)",
    gloss: "The producer rates its own evidence as strong; Surface does not derive this rating.",
  },
  moderate: {
    label: "Moderate support (producer-rated)",
    gloss: "The producer rates its own evidence as moderate; Surface does not derive this rating.",
  },
  weak: {
    label: "Weak support (producer-rated)",
    gloss: "The producer rates its own evidence as weak; Surface does not derive this rating.",
  },
  none: {
    label: "No support (producer-rated)",
    gloss: "The producer rates its own evidence as giving no support; Surface does not derive this rating.",
  },
};

/** Why a claim's basis line has nothing to summarize. Never rendered as blank. */
export type ClaimBasisMissingState = "not-recorded" | "restricted" | "unavailable" | "not-available";

/** Reader-facing names for the claim basis line's missing states. */
export const CLAIM_BASIS_MISSING_DISPLAY_NAMES: Record<ClaimBasisMissingState, DisplayName> = {
  "not-recorded": {
    label: "Basis not recorded",
    gloss: "No evidence, derivation, or review is recorded for this claim.",
  },
  restricted: {
    label: "Basis restricted",
    gloss: "A basis exists but is not visible to this viewer.",
  },
  unavailable: {
    label: "Basis unavailable",
    gloss: "The basis could not be read.",
  },
  "not-available": {
    label: "Basis not available",
    gloss: "No basis can be shown here; it may be missing, restricted, or unreadable.",
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

/** Label-only projection of {@link DERIVATION_METHOD_DISPLAY_NAMES}. */
export const DERIVATION_METHOD_LABELS: Record<DerivationMethod, string> = labelsOf(DERIVATION_METHOD_DISPLAY_NAMES);
/** Label-only projection of {@link EVIDENCE_SUPPORT_DISPLAY_NAMES}. */
export const EVIDENCE_SUPPORT_LABELS: Record<EvidenceSupportState, string> = labelsOf(EVIDENCE_SUPPORT_DISPLAY_NAMES);
/** Label-only projection of {@link EVIDENCE_RESULT_DISPLAY_NAMES}. */
export const EVIDENCE_RESULT_LABELS: Record<EvidenceResultState, string> = labelsOf(EVIDENCE_RESULT_DISPLAY_NAMES);
/** Label-only projection of {@link REVIEWER_AUTHORITY_DISPLAY_NAMES}. */
export const REVIEWER_AUTHORITY_LABELS: Record<ReviewerAuthority, string> = labelsOf(REVIEWER_AUTHORITY_DISPLAY_NAMES);
/** Label-only projection of {@link EVIDENCE_STRENGTH_DISPLAY_NAMES}. */
export const EVIDENCE_STRENGTH_LABELS: Record<ProducerEvidenceStrength, string> = labelsOf(EVIDENCE_STRENGTH_DISPLAY_NAMES);
/** Label-only projection of {@link CLAIM_BASIS_MISSING_DISPLAY_NAMES}. */
export const CLAIM_BASIS_MISSING_LABELS: Record<ClaimBasisMissingState, string> = labelsOf(CLAIM_BASIS_MISSING_DISPLAY_NAMES);

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
