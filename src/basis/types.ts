/**
 * Headless, owner-attributed input for an answer's basis.  This module is
 * deliberately structural: it names product records without importing their
 * runtime packages, stores, or UI.
 */
export const SURFACE_BASIS_VERSION = "surface.basis-projection/v1" as const;

export interface ThreadAnswerRef {
  authority: "@kontourai/thread";
  schemaVersion: "1.2.0";
  kind: "assistant-message";
  threadId: string;
  messageId: string;
}

export type BasisOwnerRef =
  | { authority: "@kontourai/thread"; schemaVersion: "1.2.0"; kind: "result"; component: "thread" }
  | { authority: "@kontourai/flow-agents"; schemaVersion: "1"; kind: "narrative"; component: "flow-agents" }
  | { authority: "@kontourai/flow"; schemaVersion: "1"; kind: "gate-evaluation"; component: "flow" }
  | { authority: "@kontourai/survey"; schemaVersion: "1"; kind: "review"; component: "survey" }
  | { authority: "@kontourai/station"; schemaVersion: "1"; kind: "input" | "task-output" | "live"; component: "station" };

/** Owner retrieval is intentionally observable.  A restricted read cannot leak any identifier or detail. */
export type OwnerRead<T> =
  | { owner: BasisOwnerRef; state: "available"; value: T }
  | { owner: BasisOwnerRef; state: "observed-empty"; value: readonly [] }
  | { owner: BasisOwnerRef; state: "not-captured" }
  | { owner: BasisOwnerRef; state: "restricted" }
  | { owner: BasisOwnerRef; state: "stale" }
  | { owner: BasisOwnerRef; state: "corrupt" }
  | { owner: BasisOwnerRef; state: "unsupported-version" }
  | { owner: BasisOwnerRef; state: "unavailable" };

export type BasisContributionRole = "input" | "execution" | "process" | "outcome" | "source" | "live";

export interface SafeDisplayField {
  label: string;
  value: string;
}

/** Inert rendering data only.  `status` is descriptive and never a verification verdict. */
export interface SafeDisplayProjection {
  title: string;
  summary?: string;
  fields?: readonly SafeDisplayField[];
  status?: "available" | "observed" | "pending" | "unavailable";
}

/**
 * Product context that may be shown beside an answer.  It is not evidence and
 * cannot supply support, policy satisfaction, or standing.
 */
export interface BasisContribution {
  id: string;
  owner: BasisOwnerRef;
  answer: ThreadAnswerRef;
  role: BasisContributionRole;
  display: SafeDisplayProjection;
}

export type BasisRelationshipKind =
  | "cites"
  | "supports"
  | "derived-from"
  | "observed-during"
  | "produced"
  | "checked-by"
  | "kept-in-task";

export interface BasisRelationship {
  kind: BasisRelationshipKind;
  from: string;
  to: string;
  /** Only Surface assessment may emit standing-bearing semantic relations. */
  source: "surface-assessment" | "owner-context";
  gaps: readonly BasisGap[];
}

export interface BasisGap {
  code: string;
  message: string;
}

export interface BasisAssessmentEvidence {
  id: string;
  label: string;
  sourceRef: string;
  observedAt: string;
}

export interface AnswerAssessmentProjection {
  version: typeof SURFACE_BASIS_VERSION;
  found: boolean;
  bundle: { id: string; schemaVersion: number; source: string; generatedAt: string };
  claim: {
    id: string;
    subject: { subjectType: string; subjectId: string };
    status: string;
    freshness: { asOf: string; expiresAt: string | null; stale: boolean } | null;
  } | null;
  /** Null means Surface has no existing, evaluable owner policy for this claim. */
  policy: { id: string; outcome: "satisfied" | "not-satisfied" } | null;
  evidence: {
    cited: readonly BasisAssessmentEvidence[];
    entails: readonly BasisAssessmentEvidence[];
    counterevidence: readonly BasisAssessmentEvidence[];
  };
  derivation: { available: boolean; directInputs: readonly { claimId: string; status: string | null }[] };
  gaps: readonly BasisGap[];
}

export interface BasisCompositionInput {
  version: typeof SURFACE_BASIS_VERSION;
  answer: ThreadAnswerRef;
  assessment: OwnerRead<AnswerAssessmentProjection>;
  contributions: readonly OwnerRead<readonly BasisContribution[]>[];
}

export type BasisStanding = "policy-met" | "assessed-with-gaps" | "execution-only" | "unresolved";
export type BasisUnresolvedReason =
  | "assessment-not-captured"
  | "assessment-observed-empty"
  | "assessment-unavailable"
  | "assessment-stale"
  | "assessment-corrupt"
  | "assessment-unsupported-version"
  | "assessment-restricted"
  | "claim-not-in-assessment"
  | "no-matching-context";

export interface BasisRegionItem {
  id: string;
  owner: BasisOwnerRef;
  role: BasisContributionRole;
  display: SafeDisplayProjection;
  gaps: readonly BasisGap[];
}

export interface BasisProjection {
  version: typeof SURFACE_BASIS_VERSION;
  answer: ThreadAnswerRef;
  standing: BasisStanding;
  unresolvedReason: BasisUnresolvedReason | null;
  assessment: OwnerRead<AnswerAssessmentProjection>;
  regions: {
    inputs: readonly BasisRegionItem[];
    execution: readonly BasisRegionItem[];
    process: readonly BasisRegionItem[];
    outcomes: readonly BasisRegionItem[];
    support: readonly BasisRegionItem[];
    sources: readonly BasisRegionItem[];
    live: readonly BasisRegionItem[];
  };
  relationships: readonly BasisRelationship[];
  gaps: readonly BasisGap[];
}

export type BasisParseResult =
  | { ok: true; value: BasisCompositionInput }
  | { ok: false; gap: BasisGap };
