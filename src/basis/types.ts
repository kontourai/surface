/** A small, portable and deliberately headless answer-basis contract. */
export const SURFACE_BASIS_VERSION = "surface.basis-projection/v1" as const;
export const SURFACE_ANSWER_ASSESSMENT_VERSION = "surface.answer-assessment/v1" as const;

/** Thread #46: these IDs are opaque identity tokens, never display text. */
export interface ThreadAnswerRef { authority: "@kontourai/thread"; schemaVersion: "1.2.0"; kind: "assistant-message"; standing: "observed"; threadId: string; messageId: string; }
/** This is an observation, not an answer payload. Basis never receives answer text. */
export interface ThreadAnswerObservation { ref: ThreadAnswerRef; fact: "answer-observed"; observedAt: string; }
/** Surface, and only Surface, names the assessment that may affect standing. */
export interface SurfaceAnswerAssessmentRef { authority: "@kontourai/surface"; schemaVersion: typeof SURFACE_ANSWER_ASSESSMENT_VERSION; kind: "answer-assessment"; bundleId: string; claimId: string; }

export type BasisContributionRef =
  | { authority: "@kontourai/thread"; schemaVersion: "1.2.0"; kind: "result"; threadId: string; resultId: string }
  | { authority: "@kontourai/station"; schemaVersion: "1"; kind: "input"; sessionId: string; eventId: string }
  | { authority: "@kontourai/station"; schemaVersion: "1"; kind: "task-output"; taskId: string; outputId: string }
  | { authority: "@kontourai/station"; schemaVersion: "1"; kind: "live"; sessionId: string; observationId: string }
  | { authority: "@kontourai/flow-agents"; schemaVersion: "grounded-execution-narrative/v1"; kind: "narrative"; narrativeId: string };
/** A non-sensitive descriptor is all an unavailable/restricted owner read exposes. */
export interface BasisOwnerDescriptor<A extends string = string> { authority: A; }
export type OwnerRead<T, A extends string> =
  | { owner: BasisOwnerDescriptor<A>; state: "available"; observedAt: string; value: T }
  | { owner: BasisOwnerDescriptor<A>; state: "observed-empty"; observedAt: string; value: readonly [] }
  | { owner: BasisOwnerDescriptor<A>; state: "not-captured"; observedAt: string }
  | { owner: BasisOwnerDescriptor<A>; state: "restricted"; observedAt: string }
  | { owner: BasisOwnerDescriptor<A>; state: "stale"; observedAt: string }
  | { owner: BasisOwnerDescriptor<A>; state: "corrupt"; observedAt: string }
  | { owner: BasisOwnerDescriptor<A>; state: "unsupported-version"; observedAt: string }
  | { owner: BasisOwnerDescriptor<A>; state: "unavailable"; observedAt: string };
export type AnswerObservationRead = OwnerRead<ThreadAnswerObservation, "@kontourai/thread">;

export type BasisContributionRole = "input" | "execution" | "process" | "outcome" | "source" | "live";
/** Context-only display shapes. None contains arbitrary metadata, markup, or prose. */
export type BasisContextProjection =
  | { kind: "station-input"; inputKind: string; promptExcerpt?: string; attachmentCount: number }
  | { kind: "thread-result"; name: string; terminalStatus: string; textParts?: number; truncatedParts: number; omittedParts: number }
  | { kind: "station-output"; title: string; mediaType: string; byteLength: number; digest: string }
  | { kind: "station-live"; state: string; observedAt: string }
  | { kind: "grounded-narrative"; statementCount: number; sourceCompleteness: "complete" | "partial" | "unknown" };
export interface BasisContribution<TRef extends BasisContributionRef = BasisContributionRef> { ref: TRef; answer: ThreadAnswerRef; role: BasisContributionRole; context: BasisContextProjection; gaps?: readonly BasisGap[]; }
/** Basis v1 relationships are Surface assessment edges, never owner workflow assertions. */
export interface BasisRelationship { kind: "cites" | "supports" | "derived-from" | "counterevidence"; from: string; to: string; source: "surface-assessment"; /** Edge-local only. */ gaps: readonly BasisGap[]; }
export interface BasisGap { code: string; message: string; }
export interface BasisAssessmentEvidence { id: string; label: string; sourceRef: string; observedAt: string; }
export interface SurfacePolicyOutcome { id: string; outcome: "satisfied" | "not-satisfied"; /** Redundant on purpose: must agree with outcome for easy consumers. */ satisfied: boolean; }
export interface AnswerAssessmentProjection {
  version: typeof SURFACE_BASIS_VERSION; ref: SurfaceAnswerAssessmentRef; found: boolean;
  bundle: { id: string; schemaVersion: number; source: string; generatedAt: string };
  claim: { id: string; subject: { subjectType: string; subjectId: string }; status: string; freshness: { asOf: string; expiresAt: string | null; stale: boolean } | null } | null;
  /** Only an explicit Surface policy-evaluation outcome may populate this. */ policy: SurfacePolicyOutcome | null;
  evidence: { cited: readonly BasisAssessmentEvidence[]; entails: readonly BasisAssessmentEvidence[]; counterevidence: readonly BasisAssessmentEvidence[] };
  derivation: { available: boolean; directInputs: readonly { claimId: string; status: string | null }[] }; gaps: readonly BasisGap[];
}
export type SurfaceAssessmentRead = OwnerRead<AnswerAssessmentProjection, "@kontourai/surface">;
/** Each read arm statically binds its exact owner authority to its value refs. */
export type ContributionRead = { [A in BasisContributionRef["authority"]]: OwnerRead<readonly BasisContribution<Extract<BasisContributionRef, { authority: A }>>[], A> }[BasisContributionRef["authority"]];
export interface BasisCompositionInput { version: typeof SURFACE_BASIS_VERSION; answer: AnswerObservationRead; assessment: SurfaceAssessmentRead; contributions: readonly ContributionRead[]; }
export type BasisStanding = "policy-met" | "assessed-with-gaps" | "execution-only" | "unresolved";
export type BasisUnresolvedReason = "answer-not-captured" | "answer-observed-empty" | "answer-unavailable" | "answer-stale" | "answer-corrupt" | "answer-unsupported-version" | "answer-restricted" | "assessment-not-captured" | "assessment-observed-empty" | "assessment-unavailable" | "assessment-stale" | "assessment-corrupt" | "assessment-unsupported-version" | "assessment-restricted" | "claim-not-in-assessment" | "no-matching-context";
export interface BasisRegionItem { ref: BasisContributionRef; role: BasisContributionRole; context: BasisContextProjection; gaps: readonly BasisGap[]; }
export interface BasisProjection {
  version: typeof SURFACE_BASIS_VERSION; answer: AnswerObservationRead; standing: BasisStanding; unresolvedReason: BasisUnresolvedReason | null; assessment: SurfaceAssessmentRead;
  regions: { inputs: readonly BasisRegionItem[]; execution: readonly BasisRegionItem[]; process: readonly BasisRegionItem[]; outcomes: readonly BasisRegionItem[]; support: readonly BasisRegionItem[]; sources: readonly BasisRegionItem[]; live: readonly BasisRegionItem[] }; relationships: readonly BasisRelationship[]; gaps: readonly BasisGap[];
}
export type BasisParseResult = { ok: true; value: BasisCompositionInput } | { ok: false; gap: BasisGap };
export type BasisProjectionParseResult = { ok: true; value: BasisProjection } | { ok: false; gap: BasisGap };
