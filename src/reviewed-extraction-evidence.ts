import type { Evidence } from "./types.js";
import { canonicalJson, sha256Hex } from "./canonical-digest.js";

export const reviewedExtractionEvidenceProfile = "surface.reviewed-extraction-evidence/v1";
/**
 * Reference profile: each evidence item carries its cited proposal and the
 * canonical digest of the import record instead of the whole record, so its
 * size does not grow with the number of proposals in the run. Restoring it
 * needs the record from `resolveImportRecord`.
 */
export const reviewedExtractionEvidenceReferenceProfile = "surface.reviewed-extraction-evidence/v2";
/**
 * Choice profile: the v2 reference shape for a review item with two or more
 * candidates, where the review decision names one of them. Every candidate
 * that stands for a proposal is bound to it, and the evidence records the
 * candidates the chosen one was chosen over (`choice`). v1 and v2 accept only
 * single-candidate items.
 */
export const reviewedExtractionEvidenceChoiceProfile = "surface.reviewed-extraction-evidence/v3";
export type ReviewedExtractionEvidenceProfile = typeof reviewedExtractionEvidenceProfile | typeof reviewedExtractionEvidenceReferenceProfile | typeof reviewedExtractionEvidenceChoiceProfile;

/**
 * Feature detection for producers: `true` when this Surface projects proposals
 * that carry no producer confidence (4.1.0 and later). A producer that cannot
 * import this name should treat the answer as no. Plain constants, so a bundler
 * keeps them without resolving Surface's package.json.
 */
export const REVIEWED_EXTRACTION_ACCEPTS_UNREPORTED_CONFIDENCE = true;
/**
 * Every reviewed-extraction capability as one object. A missing key means the
 * installed Surface lacks that capability.
 * - `acceptsUnreportedConfidence`: see `REVIEWED_EXTRACTION_ACCEPTS_UNREPORTED_CONFIDENCE`.
 * - `excerptVerification`: `reviewedExtractionReviewSignals` reads the import's
 *   excerpt verification, and the grounding policy can require it.
 * - `excludedProposals`: `reviewedExtractionReviewSignals` reads the review
 *   item's excluded proposals, and the grounding policy can refuse excluded rivals.
 * - `chosenConflicts`: the v3 profile (`reviewedExtractionEvidenceChoiceProfile`)
 *   projects a review item with several candidates and a decision that names
 *   one, and the grounding policy can refuse the rivals it was chosen over.
 */
export const REVIEWED_EXTRACTION_CAPABILITIES = Object.freeze({
  acceptsUnreportedConfidence: true,
  excerptVerification: true,
  excludedProposals: true,
  chosenConflicts: true,
} as const);

const surveyApiVersion = "survey.kontourai.io/v1alpha1";
const surveyEnvelopeProducer = "survey.kontourai.io/extraction-envelope";

export interface SurveyExtractionEnvelopeImport {
  apiVersion: typeof surveyApiVersion;
  kind: "ExtractionEnvelopeImport";
  metadata: { name: string; producerNamespace: string };
  spec: {
    envelope: {
      format: "traverse-extraction-result";
      version: 1;
      source: { ref: string; snapshotRef?: string };
      result: {
        proposals: Array<{
          fieldPath: string; candidateValue: unknown; /** Producer-reported confidence in 0..1; absent when the provider reported none. Never defaulted. */ confidence?: number; extractor: string;
          provenance: { excerpt: string; locator: string; occurrence: { resolverVersion: "exact-occurrence-v1"; count: number; selected: { index: number; start: number; end: number }; selection: "source-order" | "occurrence-hint"; hintUsed: boolean; ambiguous: boolean } };
          pathIndices?: number[]; inferenceType?: "explicit" | "inferred"; valueType?: string; enumValues?: string[];
          /** Producer-owned per-proposal model record; when present, the candidate's model is checked against it instead of `result.model`. */
          producedBy?: { model: string; [key: string]: unknown };
          [key: string]: unknown;
        }>;
        provider: string; model?: string; runId: string; raw: { tokensUsed?: number };
        outcome: { status: string; reason?: string; category?: string; code?: string };
        extractedAt: string; providerCalls: number; totalTokensUsed: number;
        taskDigest?: string; exampleDigests?: string[]; pdfPageOffsets?: number[]; ocrDerived?: true;
        preparedArtifact?: { format: "traverse-prepared-artifact"; version: 1; digest: string; ref: string; preparationMode: string; preparationVersion: string; contentLength: number; sourceSnapshotRef?: string };
        preparedArtifactState?:
          | { status: "available" | "unavailable" | "storage-error" | "identity-mismatch"; requestedRef: string; canonicalRef: string }
          | { status: "invalid-artifact"; reason: string; canonicalRef: string }
          | { status: "digest-mismatch"; requestedRef: string; canonicalRef: string; actualDigest: string; actualContentLength: number };
        [key: string]: unknown;
      };
    };
    sourceKind: string;
    claimTargets: Array<Record<string, unknown>>;
  };
  status: {
    state: "grounded" | "unresolved";
    diagnostics: Array<Record<string, unknown>>;
    /** Written by Survey 6 and later on every import record; Survey 4.0.0 and 5.0.0 never write it. */
    provenance?: "verified" | "unverified";
  };
}

export interface SurveyExtractionReviewItem {
  apiVersion: typeof surveyApiVersion;
  kind: "ReviewItem";
  metadata: { name: string; producer?: Record<string, unknown> };
  spec: {
    target: string;
    candidates: Array<{
      id: string; /** Survey's candidate role; v3 requires `proposed` on a candidate bound to a proposal and `current` on one that is not. */ role?: string; value: unknown; confidence?: number;
      source: { sourceRef: string; sourceId?: string; observedAt?: string; checksum?: string; locatorScheme?: string; [key: string]: unknown };
      locator?: { scheme: string; locator?: string; excerpt?: string };
      extraction: { target: string; extractor?: string; model?: string; confidence?: number; [key: string]: unknown };
      claimTarget: Record<string, unknown>;
      producer?: Record<string, unknown>;
      [key: string]: unknown;
    }>;
    valueDescriptor?: { type: string; enumValues?: string[] };
    [key: string]: unknown;
  };
  status?: Record<string, unknown>;
}

export interface SurveyExtractionReviewDecision {
  apiVersion: typeof surveyApiVersion;
  kind: "ReviewDecision";
  metadata: { name: string; [key: string]: unknown };
  spec: {
    reviewItemName: string; candidateId?: string;
    status: "verified" | "assumed" | "rejected" | "proposed";
    resolution?: "accepted" | "rejected" | "held" | "could_not_confirm";
    resolutionReason?: string; attemptEvidenceIds?: string[];
    actor?: { id: string; displayName?: string }; reviewedAt?: string; rationale?: string;
    evidenceIds?: string[]; withinComfortZone?: boolean; comfortZoneNote?: string;
    authorizing?: Record<string, unknown>; projection?: Record<string, unknown>; editedValue?: unknown;
    /** The proposed candidates a Survey `select-proposed` decision passed over, in item order. */
    unselectedCandidateIds?: string[];
  };
  status?: { appliedToClaimIds?: string[] };
}

export interface ReviewedExtractionEvidenceInput {
  evidenceId: string;
  claimId: string;
  proposalIndex: number;
  importRecord: SurveyExtractionEnvelopeImport;
  /** Absent for unresolved imports, which Survey deliberately does not enqueue for review. */
  reviewItem?: SurveyExtractionReviewItem;
  /** Absent when no ReviewItem was emitted or review is still pending. */
  reviewDecision?: SurveyExtractionReviewDecision;
  /** The system that ingested/projected the record. The reviewer remains in reviewDecision. */
  collectedBy: string;
  /**
   * The caller's structural-trust assessment. It can only lower the trust
   * Surface derives from the proposal (`deriveStructuralTrust`), never raise it:
   * the projection uses the weaker of the two.
   */
  structuralTrust: "validated" | "unvalidated" | "invalid";
  droppedProvenance?: string[];
}

export type ReviewedExtractionProvenanceGap =
  | { kind: "artifact-unavailable"; status: "unavailable" | "storage-error" | "identity-mismatch" | "invalid-artifact"; requestedRef?: string; canonicalRef: string; reason?: string }
  | { kind: "digest-mismatch"; requestedRef: string; canonicalRef: string; expectedDigest: string; actualDigest: string; actualContentLength: number }
  | { kind: "unsupported-inference"; typeOrigin: string }
  | { kind: "dropped-provenance"; field: string }
  | { kind: "structural-trust"; status: "unvalidated" | "invalid" }
  | { kind: "review-not-accepted"; disposition: string }
  /** v3 only: the review decision names a different candidate from the one this evidence cites. */
  | { kind: "candidate-not-chosen"; decisionCandidateId: string };

/**
 * v3 only: the candidates of the reviewed item and which one the decision
 * named, derived from the bound review item and decision. A reader sees from
 * it that the value was one of several.
 */
export interface ReviewedExtractionChoice {
  /** The candidate that stands for the cited proposal. */
  citedCandidateId: string;
  /** The candidate the review decision names. */
  decisionCandidateId: string;
  /**
   * Every candidate of the item, in item order. `proposalIndex` is the proposal
   * the candidate is bound to; a `current` candidate (a prior value) has none.
   */
  candidates: Array<{ candidateId: string; role: "proposed" | "current"; proposalIndex?: number; valueDigest: string }>;
  /**
   * The candidates the cited one was chosen over: every other candidate when
   * the decision accepted the cited candidate, otherwise empty.
   */
  chosenOver: string[];
}

export interface ReviewedExtractionEvidenceProjection {
  evidence: Evidence;
  gaps: ReviewedExtractionProvenanceGap[];
  compatibility: { hachureEvidenceSchema: "sufficient"; upstreamSchemaChangeNeeded: false; profile: ReviewedExtractionEvidenceProfile };
}

/** The v2 profile input: the v1 input with the import record replaced by its digest and the cited proposal. */
export type ReviewedExtractionEvidenceReferenceInput = Omit<ReviewedExtractionEvidenceInput, "importRecord"> & {
  /** `reviewedExtractionImportRecordDigest` of the import record the proposal came from. */
  importRecordDigest: string;
  /** `importRecord.spec.envelope.result.proposals[proposalIndex]`, verbatim. */
  proposal: ExtractionProposal;
};

export interface ReviewedExtractionProjectionOptions {
  /** Defaults to v1, which embeds the whole import record. v3 is required for, and only accepts, an item with several candidates. */
  profile?: ReviewedExtractionEvidenceProfile;
  /**
   * v2 and v3 only: also carry the import record as the `importRecord` sidecar, outside
   * the digested profile input. Set it on one evidence item per import record
   * in a bundle so the bundle verifies on its own (`resolverFromBundle`).
   */
  includeImportRecord?: boolean;
}

export interface ReviewedExtractionRestoreOptions {
  /**
   * Returns the import record whose `reviewedExtractionImportRecordDigest` is
   * `importRecordDigest`, or undefined when it is not available. Only v2 and v3
   * evidence consult it; restore verifies the returned record against the
   * digest, so the resolver needs no trust of its own.
   */
  resolveImportRecord?: (importRecordDigest: string) => SurveyExtractionEnvelopeImport | undefined;
}

/** v2 or v3 evidence could not be restored because no import record was resolved for its digest. */
export class ReviewedExtractionImportRecordUnresolvedError extends Error {
  readonly code = "import-record-unresolved" as const;
  constructor(readonly importRecordDigest: string) {
    super("Reviewed extraction evidence references an import record that was not resolved.");
    this.name = "ReviewedExtractionImportRecordUnresolvedError";
  }
}

/** Canonical-JSON SHA-256 of an import record, as v2 and v3 evidence bind it. */
export function reviewedExtractionImportRecordDigest(importRecord: SurveyExtractionEnvelopeImport): string {
  assertJsonValue(importRecord, "Reviewed extraction import record");
  return digest(importRecord);
}

interface ProfileMetadata {
  profile: ReviewedExtractionEvidenceProfile;
  profileDigest: string;
  input: ReviewedExtractionEvidenceInput | ReviewedExtractionEvidenceReferenceInput;
  gaps: ReviewedExtractionProvenanceGap[];
  /** v3 only: derived from the bound input, so restore's re-projection checks it. */
  choice?: ReviewedExtractionChoice;
  /** v2 and v3: the import record, carried once per bundle; outside the profile digest, checked against `input.importRecordDigest`. */
  importRecord?: SurveyExtractionEnvelopeImport;
}

function isReferenceProfile(profile: unknown): profile is typeof reviewedExtractionEvidenceReferenceProfile | typeof reviewedExtractionEvidenceChoiceProfile {
  return profile === reviewedExtractionEvidenceReferenceProfile || profile === reviewedExtractionEvidenceChoiceProfile;
}
function isKnownProfile(profile: unknown): profile is ReviewedExtractionEvidenceProfile {
  return profile === reviewedExtractionEvidenceProfile || isReferenceProfile(profile);
}

export function projectReviewedExtractionEvidence(input: ReviewedExtractionEvidenceInput, options: ReviewedExtractionProjectionOptions = {}): ReviewedExtractionEvidenceProjection {
  const profile = options.profile ?? reviewedExtractionEvidenceProfile;
  if (!isKnownProfile(profile)) throw new Error("Reviewed extraction evidence profile is unsupported.");
  validateInput(input, profile);
  const proposal = input.importRecord.spec.envelope.result.proposals[input.proposalIndex]!;
  const artifact = input.importRecord.spec.envelope.result.preparedArtifact;
  const choice = profile === reviewedExtractionEvidenceChoiceProfile ? reviewedExtractionChoice(input) : undefined;
  const gaps = provenanceGaps(input, choice);
  const acceptedAndSafe = decisionAccepted(input.reviewDecision) && effectiveStructuralTrust(input) === "validated" && gaps.length === 0;
  const anchors = {
    id: input.evidenceId, claimId: input.claimId, evidenceType: "source_excerpt" as const, method: "extraction" as const,
    sourceRef: input.importRecord.spec.envelope.source.ref, sourceLocator: proposal.provenance.locator,
    excerptOrSummary: proposal.provenance.excerpt, observedAt: input.importRecord.spec.envelope.result.extractedAt,
    collectedBy: input.collectedBy, ...(artifact ? { integrityRef: `sha256:${artifact.digest}` } : {}),
    supportStrength: (acceptedAndSafe ? "entails" : "cited") as Evidence["supportStrength"],
    passing: acceptedAndSafe,
    blocking: !acceptedAndSafe,
  };
  const clonedInput = clone(input);
  const profileInput = profile === reviewedExtractionEvidenceProfile ? clonedInput : referenceInput(clonedInput);
  const profileDigest = digest({ anchors, input: profileInput, gaps });
  if (options.includeImportRecord && !isReferenceProfile(profile)) throw new Error("Only the v2 profile and the v3 profile carry an import record sidecar.");
  const sidecar = options.includeImportRecord ? { importRecord: clone(input.importRecord) } : {};
  const evidence: Evidence = { ...anchors, metadata: { reviewedExtraction: { profile, profileDigest, input: profileInput, gaps, ...(choice ? { choice } : {}), ...sidecar } satisfies ProfileMetadata } };
  return { evidence, gaps, compatibility: { hachureEvidenceSchema: "sufficient", upstreamSchemaChangeNeeded: false, profile } };
}

/**
 * Recovers the full input. v1 evidence is self-contained. v2 and v3 evidence need
 * `options.resolveImportRecord`; without a record it throws
 * `ReviewedExtractionImportRecordUnresolvedError`, and a record whose digest
 * differs from the bound `importRecordDigest` is refused.
 */
export function restoreReviewedExtractionEvidence(evidence: Evidence, options: ReviewedExtractionRestoreOptions = {}): ReviewedExtractionEvidenceInput {
  const metadata = evidence.metadata?.reviewedExtraction;
  if (!isRecord(metadata) || !isKnownProfile(metadata.profile) || typeof metadata.profileDigest !== "string" || !isRecord(metadata.input) || !Array.isArray(metadata.gaps)) throw new Error("Evidence does not carry a complete reviewed extraction evidence profile.");
  const profile = metadata.profile;
  const profileInput = metadata.input;
  const reference = isReferenceProfile(profile);
  // The sidecar is not part of the bound profile; it is only a carrier for the
  // record the digest names. Its own record, when present, must match that digest.
  const hasSidecar = reference && Object.hasOwn(metadata, "importRecord");
  const input = reference ? resolveReferenceInput(profileInput, hasSidecar ? withSidecar(metadata.importRecord, profileInput.importRecordDigest, options) : options, profile) : profileInput as unknown as ReviewedExtractionEvidenceInput;
  validateInput(input, profile);
  const expected = projectReviewedExtractionEvidence(input, { profile, includeImportRecord: hasSidecar });
  const actualDigest = digest({ anchors: withoutMetadata(evidence), input: profileInput, gaps: metadata.gaps });
  if (actualDigest !== metadata.profileDigest || metadata.profileDigest !== (expected.evidence.metadata!.reviewedExtraction as ProfileMetadata).profileDigest) throw new Error("Reviewed extraction evidence profile integrity binding is invalid.");
  if (canonicalJson(evidence) !== canonicalJson(expected.evidence)) throw new Error("Reviewed extraction evidence fields do not match their bound profile.");
  return clone(input);
}

/**
 * Builds a `resolveImportRecord` from the `importRecord` sidecars of a bundle's
 * v2 and v3 evidence, so a reader holding only the bundle can verify it. A sidecar
 * whose record does not hash to its item's `importRecordDigest` poisons that
 * digest: every lookup of it throws instead of falling back to another copy.
 * A digest with no sidecar in the bundle resolves to undefined (unresolved).
 */
export function resolverFromBundle(bundle: { evidence: readonly Evidence[] }): NonNullable<ReviewedExtractionRestoreOptions["resolveImportRecord"]> {
  const records = new Map<string, SurveyExtractionEnvelopeImport>();
  const refused = new Map<string, string>();
  for (const evidence of bundle.evidence) {
    const carried = carriedRecord(evidence);
    if (!carried) continue;
    if (!carried.matches) { if (!refused.has(carried.declared)) refused.set(carried.declared, evidence.id); continue; }
    if (!records.has(carried.declared)) records.set(carried.declared, clone(carried.record));
  }
  return (importRecordDigest) => {
    const offender = refused.get(importRecordDigest);
    if (offender !== undefined) throw new Error(`The bundle carries an import record sidecar that does not match its importRecordDigest (evidence ${offender}); every item of that record is refused.`);
    const record = records.get(importRecordDigest);
    return record === undefined ? undefined : clone(record);
  };
}

/**
 * For each distinct `importRecordDigest` that `records` supplies and no item
 * already carries, puts one `importRecord` sidecar on the first v2 or v3 item citing
 * it, so the bundle meets `resolverFromBundle`'s precondition. An existing
 * matching carrier stays where it is, even on a later item. Idempotent: items that
 * already carry the right record are left alone, and other items are returned
 * unchanged (same object). Throws on an item whose sidecar does not match its
 * digest. Digests with no supplied record stay uncarried; check them with
 * `findUncarriedImportRecordDigests`.
 */
export function attachImportRecords(evidence: readonly Evidence[], records: Iterable<SurveyExtractionEnvelopeImport>): Evidence[] {
  const supplied = new Map<string, SurveyExtractionEnvelopeImport>();
  for (const record of records) supplied.set(reviewedExtractionImportRecordDigest(record), record);
  const carried = new Set<string>();
  for (const item of evidence) {
    const sidecar = carriedRecord(item);
    if (!sidecar) continue;
    if (!sidecar.matches) throw new Error(`Evidence ${item.id} carries an import record sidecar that does not match its importRecordDigest.`);
    carried.add(sidecar.declared);
  }
  return evidence.map((item) => {
    const declared = referenceDigest(item);
    if (declared === undefined || carried.has(declared)) return item;
    const record = supplied.get(declared);
    if (record === undefined) return item;
    carried.add(declared);
    const metadata = item.metadata!.reviewedExtraction as Record<string, unknown>;
    return { ...item, metadata: { ...item.metadata, reviewedExtraction: { ...metadata, importRecord: clone(record) } } };
  });
}

/**
 * Checks carrier completeness and consistency: returns the v2 and v3
 * `importRecordDigest`s that `resolverFromBundle` cannot supply, either because
 * no item carries a matching sidecar or because any carrier of that digest
 * does not match it (which makes the resolver refuse the digest). Empty means
 * every digest has a consistent carrier; it is not a full integrity check, and
 * evidence that is internally consistent but tampered still fails at restore.
 */
export function findUncarriedImportRecordDigests(bundle: { evidence: readonly Evidence[] }): string[] {
  const carried = new Set<string>();
  const mismatched = new Set<string>();
  for (const item of bundle.evidence) { const sidecar = carriedRecord(item); if (sidecar) (sidecar.matches ? carried : mismatched).add(sidecar.declared); }
  for (const declared of mismatched) carried.delete(declared);
  const uncarried: string[] = [];
  for (const item of bundle.evidence) { const declared = referenceDigest(item); if (declared !== undefined && !carried.has(declared) && !uncarried.includes(declared)) uncarried.push(declared); }
  return uncarried;
}

function referenceDigest(evidence: Evidence): string | undefined {
  const metadata = evidence.metadata?.reviewedExtraction;
  if (!isRecord(metadata) || !isReferenceProfile(metadata.profile) || !isRecord(metadata.input)) return undefined;
  return typeof metadata.input.importRecordDigest === "string" ? metadata.input.importRecordDigest : undefined;
}

function carriedRecord(evidence: Evidence): { declared: string; matches: boolean; record: SurveyExtractionEnvelopeImport } | undefined {
  const declared = referenceDigest(evidence);
  const metadata = evidence.metadata?.reviewedExtraction as Record<string, unknown> | undefined;
  if (declared === undefined || !metadata || !Object.hasOwn(metadata, "importRecord")) return undefined;
  let matches = false;
  try { assertJsonValue(metadata.importRecord, "importRecord sidecar"); matches = isRecord(metadata.importRecord) && digest(metadata.importRecord) === declared; } catch { matches = false; }
  return { declared, matches, record: metadata.importRecord as SurveyExtractionEnvelopeImport };
}

/** Checks an item's own sidecar against its digest. A supplied resolver is still consulted first, so a digest it refuses stays refused. */
function withSidecar(sidecar: unknown, declared: unknown, options: ReviewedExtractionRestoreOptions): ReviewedExtractionRestoreOptions {
  if (!isRecord(sidecar)) throw new Error("importRecord sidecar must be an object.");
  assertJsonValue(sidecar, "importRecord sidecar");
  if (typeof declared !== "string" || digest(sidecar) !== declared) throw new Error("importRecord sidecar does not match the bound importRecordDigest.");
  const own = sidecar as unknown as SurveyExtractionEnvelopeImport;
  return { resolveImportRecord: (importRecordDigest) => options.resolveImportRecord?.(importRecordDigest) ?? own };
}

function referenceInput(input: ReviewedExtractionEvidenceInput): ReviewedExtractionEvidenceReferenceInput {
  const { importRecord, ...rest } = input;
  return { ...rest, importRecordDigest: digest(importRecord), proposal: importRecord.spec.envelope.result.proposals[input.proposalIndex]! };
}

/** Rebuilds the v1 input from a v2 or v3 profile input and the resolved record, after checking the record against the bound digest. */
function resolveReferenceInput(profileInput: Record<string, unknown>, options: ReviewedExtractionRestoreOptions, profile: ReviewedExtractionEvidenceProfile): ReviewedExtractionEvidenceInput {
  const { importRecordDigest, proposal, ...rest } = profileInput;
  prefixedDigest(importRecordDigest, "importRecordDigest");
  if (!isRecord(proposal)) throw new Error("proposal must be an object.");
  if ("importRecord" in rest) throw new Error("Reference evidence cannot embed an import record.");
  const importRecord = options.resolveImportRecord?.(importRecordDigest);
  if (importRecord === undefined || importRecord === null) throw new ReviewedExtractionImportRecordUnresolvedError(importRecordDigest);
  assertJsonValue(importRecord, "Resolved import record");
  if (digest(importRecord) !== importRecordDigest) throw new Error("Resolved import record does not match the bound importRecordDigest.");
  const input = { ...rest, importRecord: clone(importRecord) } as unknown as ReviewedExtractionEvidenceInput;
  validateInput(input, profile);
  if (canonicalJson(input.importRecord.spec.envelope.result.proposals[input.proposalIndex]) !== canonicalJson(proposal)) throw new Error("Embedded proposal does not match the resolved import record.");
  return input;
}

type StructuralTrust = ReviewedExtractionEvidenceInput["structuralTrust"];
type ExtractionProposal = SurveyExtractionEnvelopeImport["spec"]["envelope"]["result"]["proposals"][number];

/**
 * Structural trust Surface can recompute from the proposal itself, using the
 * Traverse field vocabulary: `invalid` when the candidate value does not
 * conform to the declared `valueType` or lies outside declared `enumValues`;
 * `unvalidated` when no checkable type is declared (none, `array`, `object`, an
 * unknown type, or `enum` without `enumValues`); otherwise `validated`. `date`
 * follows Traverse and only requires a string.
 */
export function deriveStructuralTrust(proposal: Pick<ExtractionProposal, "candidateValue" | "valueType" | "enumValues">): StructuralTrust {
  const value = proposal.candidateValue;
  const enumValues = Array.isArray(proposal.enumValues) ? proposal.enumValues : undefined;
  if (enumValues !== undefined && !(typeof value === "string" && enumValues.includes(value))) return "invalid";
  switch (proposal.valueType) {
    case "string": case "date": return typeof value === "string" ? "validated" : "invalid";
    case "number": return typeof value === "number" && Number.isFinite(value) ? "validated" : "invalid";
    case "boolean": return typeof value === "boolean" ? "validated" : "invalid";
    case "enum": return enumValues === undefined ? (typeof value === "string" ? "unvalidated" : "invalid") : "validated";
    default: return "unvalidated";
  }
}

const structuralTrustRank: Record<StructuralTrust, number> = { invalid: 0, unvalidated: 1, validated: 2 };

/** The weaker of the caller's assessment and the derived one: a caller can downgrade, never upgrade. */
function effectiveStructuralTrust(input: ReviewedExtractionEvidenceInput): StructuralTrust {
  const derived = deriveStructuralTrust(input.importRecord.spec.envelope.result.proposals[input.proposalIndex]!);
  return structuralTrustRank[derived] < structuralTrustRank[input.structuralTrust] ? derived : input.structuralTrust;
}

/** Effective structural trust of a restored reviewed-extraction input (the value its projection used). */
export function reviewedExtractionStructuralTrust(input: ReviewedExtractionEvidenceInput): StructuralTrust {
  return effectiveStructuralTrust(input);
}

/** Review facts Survey records on the import and its review item, read from a restored reviewed-extraction input. */
export interface ReviewedExtractionReviewSignals {
  /**
   * `verified` only when the import record's `status.provenance` and the review
   * item's `excerptVerification` both say `verified` and the item's Survey
   * binding is intact (see `reviewedExtractionReviewSignals`): the import
   * checked each excerpt against the prepared artifact text. Anything else,
   * including an absent field or a broken binding, is `unverified`.
   */
  excerptVerification: "verified" | "unverified";
  /**
   * Proposals the import left out of this item's claim slot (their cited span
   * did not match their excerpt) whose value differs from the reviewed
   * candidate: rival values that were unverifiable, not disproven. Read from
   * the item's `excludedProposals` entries that match the import record, and
   * from the record's own `excerpt-mismatch` diagnostics, so dropping an entry
   * from the item does not hide a rival. Nothing currently resolves a rival,
   * so every listed rival is unresolved.
   */
  excludedRivalProposalIndices: number[];
  /**
   * Excluded proposals Surface cannot place. `binding-broken`: the item stores
   * excluded entries (or its Survey metadata is gone) but its Survey binding
   * is not intact, so none of them is read. `malformed-entries`: stored
   * entries that cannot be read or do not match the import record, or
   * `excerpt-mismatch` diagnostics whose proposal or claim slot cannot be
   * resolved. Any of them may be a rival. `count` is omitted when unknown.
   */
  excludedProposalsUnreadable?: { reason: "malformed-entries" | "binding-broken"; count?: number };
  /**
   * Proposals in the cited proposal's claim slot, not excluded by the import,
   * whose value differs from the reviewed one and that no candidate of the item
   * carries: a conflicting value the reviewer was not shown. Survey 4 and
   * earlier wrote one item per proposal, so its items legitimately have them.
   * Omitted when there are none.
   */
  hiddenRivalProposalIndices?: number[];
  /**
   * Set only on an item whose Survey binding is intact, which means Survey
   * grouped it by claim slot (Survey 5 and later): proposals that grouping puts in the
   * item, by its `proposalIndices` or as a non-excluded proposal of the claim
   * slot, that no candidate carries. No Survey release writes such an item;
   * candidates were dropped after the fact. Omitted when there are none.
   *
   * On an item whose binding is broken, set to the hidden rivals when the
   * import record carries `status.provenance`: only Survey 6 and later write
   * it, and they group by claim slot, so the item is not a Survey 4 one.
   */
  droppedProposalIndices?: number[];
}

/**
 * Reads the excerpt-verification and excluded-proposal facts from a restored
 * input (see `restoreReviewedExtractionEvidence`). They live in the digest-bound
 * import record and review item, so no profile field is added. Absence reads
 * as unverified and as no excluded proposals; it is never read as verified.
 *
 * The item's Survey metadata is read only when its binding is intact. That is
 * Survey's own rule (a non-empty `importName`, non-empty `proposalIndices`, and
 * every candidate carrying the same `importName`) plus two checks against the
 * bound record: `importName` names this import record, and `proposalIndices`
 * includes the cited proposal.
 */
export function reviewedExtractionReviewSignals(input: ReviewedExtractionEvidenceInput): ReviewedExtractionReviewSignals {
  const status = input.importRecord.status as Record<string, unknown>;
  const binding = surveyEnvelopeBinding(input);
  const excerptVerification = status.provenance === "verified" && binding?.excerptVerification === "verified" ? "verified" : "unverified";
  const rivals: number[] = [];
  const unreadable = { reason: undefined as "malformed-entries" | "binding-broken" | undefined, count: 0, countKnown: true };
  const markUnreadable = (reason: "malformed-entries" | "binding-broken", count: number | undefined) => {
    if (unreadable.reason !== "binding-broken") unreadable.reason = reason;
    if (count === undefined) unreadable.countKnown = false; else unreadable.count += count;
  };
  const proposals = input.importRecord.spec.envelope.result.proposals;
  const reviewedValue = canonicalJson(proposals[input.proposalIndex]!.candidateValue);
  const addRival = (index: number) => { if (!rivals.includes(index)) rivals.push(index); };

  const item = input.reviewItem;
  const metadata = item && isRecord(item.metadata.producer) ? item.metadata.producer[surveyEnvelopeProducer] : undefined;
  if (item !== undefined && !isRecord(metadata)) {
    // As in Survey: a candidate that still carries the envelope binding came
    // from an import whose item metadata is gone, so what it stored is unknown.
    if (item.spec.candidates.some((candidate) => isRecord(candidate.producer) && candidate.producer[surveyEnvelopeProducer] !== undefined)) markUnreadable("binding-broken", undefined);
  } else if (isRecord(metadata) && metadata.excludedProposals !== undefined) {
    const stored = metadata.excludedProposals;
    if (binding === undefined) {
      if (!(Array.isArray(stored) && stored.length === 0)) markUnreadable("binding-broken", Array.isArray(stored) ? stored.length : undefined);
    } else if (!Array.isArray(stored)) {
      markUnreadable("malformed-entries", undefined);
    } else {
      for (const entry of stored) {
        const index = isRecord(entry) ? entry.proposalIndex : undefined;
        const proposal = typeof index === "number" && index !== input.proposalIndex ? readableProposal(proposals, index) : undefined;
        // An entry counts only when it matches the bound proposal it names; the
        // rival test uses the import record's value, not the entry's copy.
        if (!isRecord(entry) || proposal === undefined || !Object.hasOwn(entry, "value") || canonicalJson(entry.value) !== canonicalJson(proposal.candidateValue) || entry.locator !== proposal.provenance.locator || entry.excerpt !== proposal.provenance.excerpt) { markUnreadable("malformed-entries", 1); continue; }
        if (canonicalJson(proposal.candidateValue) !== reviewedValue) addRival(index as number);
      }
    }
  }

  // The record's diagnostics are the import's own list of excluded proposals.
  // A same-slot one with a different value is a rival even if the item omits it.
  const diagnostics = Array.isArray(status.diagnostics) ? status.diagnostics : [];
  const citedSlot = claimSlotKey(input, input.proposalIndex);
  for (const diagnostic of diagnostics) {
    if (!isRecord(diagnostic) || diagnostic.kind !== "excerpt-mismatch") continue;
    const index = diagnostic.proposalIndex;
    const proposal = typeof index === "number" && index !== input.proposalIndex ? readableProposal(proposals, index) : undefined;
    const slot = proposal === undefined ? undefined : claimSlotKey(input, index as number);
    if (slot === undefined || citedSlot === undefined) { markUnreadable("malformed-entries", 1); continue; }
    if (slot === citedSlot && canonicalJson(proposal!.candidateValue) !== reviewedValue) addRival(index as number);
  }

  const hidden = hiddenProposals(input, excerptMismatch(diagnostics), citedSlot);
  return {
    excerptVerification, excludedRivalProposalIndices: rivals,
    ...(unreadable.reason ? { excludedProposalsUnreadable: { reason: unreadable.reason, ...(unreadable.countKnown ? { count: unreadable.count } : {}) } } : {}),
    ...(hidden.rivals.length ? { hiddenRivalProposalIndices: hidden.rivals } : {}),
    ...(hidden.dropped.length ? { droppedProposalIndices: hidden.dropped } : {}),
  };
}

function excerptMismatch(diagnostics: unknown[]): Set<number> {
  const indices = new Set<number>();
  for (const diagnostic of diagnostics) if (isRecord(diagnostic) && diagnostic.kind === "excerpt-mismatch" && typeof diagnostic.proposalIndex === "number") indices.add(diagnostic.proposalIndex);
  return indices;
}

/**
 * The proposals an item stands for: the cited one, each candidate's bound
 * proposal, and the same-value proposals a candidate lists, counted only when
 * the named proposal really has the candidate's value.
 */
function carriedProposals(input: ReviewedExtractionEvidenceInput): Set<number> {
  const proposals = input.importRecord.spec.envelope.result.proposals;
  const carried = new Set<number>([input.proposalIndex]);
  for (const candidate of input.reviewItem?.spec.candidates ?? []) {
    const binding = isRecord(candidate.producer) ? candidate.producer[surveyEnvelopeProducer] : undefined;
    if (!isRecord(binding)) continue;
    const lead = readableProposal(proposals, binding.proposalIndex);
    if (lead !== undefined && canonicalJson(lead.candidateValue) === canonicalJson(candidate.value)) carried.add(binding.proposalIndex as number);
    for (const same of Array.isArray(binding.sameValueProposals) ? binding.sameValueProposals : []) {
      const index = isRecord(same) ? same.proposalIndex : undefined;
      const proposal = readableProposal(proposals, index);
      if (proposal !== undefined && canonicalJson(proposal.candidateValue) === canonicalJson(candidate.value)) carried.add(index as number);
    }
  }
  return carried;
}

function hiddenProposals(input: ReviewedExtractionEvidenceInput, excluded: Set<number>, citedSlot: string | undefined): { rivals: number[]; dropped: number[] } {
  const proposals = input.importRecord.spec.envelope.result.proposals;
  const reviewedValue = canonicalJson(proposals[input.proposalIndex]!.candidateValue);
  const carried = carriedProposals(input);
  const inSlot: number[] = [];
  proposals.forEach((proposal, index) => {
    if (!carried.has(index) && !excluded.has(index) && readableProposal(proposals, index) !== undefined && citedSlot !== undefined && claimSlotKey(input, index) === citedSlot) inSlot.push(index);
  });
  const rivals = inSlot.filter((index) => canonicalJson(proposals[index]!.candidateValue) !== reviewedValue);
  // Survey 5 and later group every non-excluded proposal of the slot into the item and list them.
  // A broken binding is already reported (and never read as verified); only an intact one is held to that.
  const binding = surveyEnvelopeBinding(input);
  if (binding === undefined) {
    // Survey 6 and later write `status.provenance` on every import record; 4.0.0 and 5.0.0 never do
    // (their validators reject it). Such a record is not a Survey 4 import, so the item it reviews was
    // grouped by claim slot and a rival it does not carry was dropped, however its binding was broken.
    const grouped = input.reviewItem !== undefined && Object.hasOwn(input.importRecord.status, "provenance");
    return { rivals, dropped: grouped ? rivals : [] };
  }
  const dropped = new Set<number>(inSlot);
  for (const index of binding.proposalIndices as unknown[]) if (Number.isSafeInteger(index) && !carried.has(index as number) && !excluded.has(index as number)) dropped.add(index as number);
  return { rivals, dropped: [...dropped].sort((left, right) => left - right) };
}

function surveyEnvelopeBinding(input: ReviewedExtractionEvidenceInput): Record<string, unknown> | undefined {
  const item = input.reviewItem;
  if (item === undefined || !isRecord(item.metadata.producer)) return undefined;
  const metadata = item.metadata.producer[surveyEnvelopeProducer];
  if (!isRecord(metadata)) return undefined;
  const importName = metadata.importName;
  if (typeof importName !== "string" || importName.length === 0 || importName !== input.importRecord.metadata.name) return undefined;
  if (!Array.isArray(metadata.proposalIndices) || metadata.proposalIndices.length === 0 || !metadata.proposalIndices.includes(input.proposalIndex)) return undefined;
  const candidates = item.spec.candidates;
  const bound = candidates.length > 0 && candidates.every((candidate) => isRecord(candidate.producer) && isRecord(candidate.producer[surveyEnvelopeProducer]) && (candidate.producer[surveyEnvelopeProducer] as Record<string, unknown>).importName === importName);
  return bound ? metadata : undefined;
}

type ReadableProposal = ExtractionProposal & { provenance: Record<string, unknown> };
/** Only the cited proposal is validated at restore, so another one may be malformed. */
function readableProposal(proposals: readonly unknown[], index: unknown): ReadableProposal | undefined {
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) return undefined;
  const named = proposals[index];
  return isRecord(named) && isRecord(named.provenance) && Object.hasOwn(named, "candidateValue") ? named as ReadableProposal : undefined;
}

/** Survey's claim slot: the claim a proposal would project to, at its `pathIndices`. */
function claimSlotKey(input: ReviewedExtractionEvidenceInput, index: number): string | undefined {
  const target = input.importRecord.spec.claimTargets[index];
  const proposal = input.importRecord.spec.envelope.result.proposals[index];
  if (!isRecord(target) || !isRecord(proposal)) return undefined;
  return canonicalJson({ subjectType: target.subjectType, subjectId: target.subjectId, facet: target.facet, claimType: target.claimType, fieldOrBehavior: target.fieldOrBehavior, claimId: target.claimId ?? null, pathIndices: proposal.pathIndices ?? null });
}

/**
 * The choice a restored input records, or undefined for a single-candidate
 * item (v1 and v2 accept only those; v3 only items with several candidates).
 * Candidates are bound by Survey's own per-candidate envelope binding
 * (`proposalIndex`); a `current` candidate carries a prior value and none.
 * Call it on an input that `restoreReviewedExtractionEvidence` returned.
 */
export function reviewedExtractionChoice(input: ReviewedExtractionEvidenceInput): ReviewedExtractionChoice | undefined {
  const item = input.reviewItem;
  const decision = input.reviewDecision;
  if (item === undefined || decision === undefined || item.spec.candidates.length < 2) return undefined;
  const candidates = item.spec.candidates.map((candidate) => {
    const index = candidateProposalIndex(candidate);
    return { candidateId: candidate.id, role: index === undefined ? "current" as const : "proposed" as const, ...(index === undefined ? {} : { proposalIndex: index }), valueDigest: digest(candidate.value) };
  });
  const cited = candidates.find((candidate) => candidate.proposalIndex === input.proposalIndex);
  const decisionCandidateId = decision.spec.candidateId;
  if (cited === undefined || decisionCandidateId === undefined) throw new Error("Reviewed extraction choice is not bound to its candidates.");
  const chosen = decisionAccepted(decision) && decisionCandidateId === cited.candidateId;
  return { citedCandidateId: cited.candidateId, decisionCandidateId, candidates, chosenOver: chosen ? candidates.filter((candidate) => candidate !== cited).map((candidate) => candidate.candidateId) : [] };
}

/** Survey's per-candidate envelope binding: the proposal a candidate stands for, or undefined when it carries none. */
function candidateProposalIndex(candidate: unknown): number | undefined {
  const producer = isRecord(candidate) && isRecord(candidate.producer) ? candidate.producer[surveyEnvelopeProducer] : undefined;
  return isRecord(producer) && Object.hasOwn(producer, "proposalIndex") ? producer.proposalIndex as number : undefined;
}

function provenanceGaps(input: ReviewedExtractionEvidenceInput, choice?: ReviewedExtractionChoice): ReviewedExtractionProvenanceGap[] {
  const result = input.importRecord.spec.envelope.result;
  const state = result.preparedArtifactState;
  const gaps: ReviewedExtractionProvenanceGap[] = [];
  if (!result.preparedArtifact) gaps.push({ kind: "dropped-provenance", field: "preparedArtifact" });
  if (state?.status === "digest-mismatch") gaps.push({ kind: "digest-mismatch", requestedRef: state.requestedRef, canonicalRef: state.canonicalRef, expectedDigest: result.preparedArtifact!.digest, actualDigest: state.actualDigest, actualContentLength: state.actualContentLength });
  else if (state && state.status !== "available") gaps.push({ kind: "artifact-unavailable", status: state.status, canonicalRef: state.canonicalRef, ...(state.status === "invalid-artifact" ? { reason: state.reason } : { requestedRef: state.requestedRef }) });
  const origin = result.proposals[input.proposalIndex]!.inferenceType ?? "inferred";
  if (origin !== "explicit" && origin !== "inferred") gaps.push({ kind: "unsupported-inference", typeOrigin: origin });
  for (const field of input.droppedProvenance ?? []) gaps.push({ kind: "dropped-provenance", field });
  const structuralTrust = effectiveStructuralTrust(input);
  if (structuralTrust !== "validated") gaps.push({ kind: "structural-trust", status: structuralTrust });
  if (!decisionAccepted(input.reviewDecision)) gaps.push({ kind: "review-not-accepted", disposition: input.reviewDecision?.spec.resolution ?? input.reviewDecision?.spec.status ?? "not-reviewed" });
  if (choice && choice.decisionCandidateId !== choice.citedCandidateId) gaps.push({ kind: "candidate-not-chosen", decisionCandidateId: choice.decisionCandidateId });
  return gaps;
}

function validateInput(value: unknown, profile: ReviewedExtractionEvidenceProfile): asserts value is ReviewedExtractionEvidenceInput {
  assertJsonValue(value, "Reviewed extraction evidence input");
  if (!isRecord(value)) throw new Error("Reviewed extraction evidence input must be an object.");
  nonEmpty(value.evidenceId, "evidenceId"); nonEmpty(value.claimId, "claimId"); stableIdentity(value.collectedBy, "collectedBy");
  if (!Number.isSafeInteger(value.proposalIndex) || (value.proposalIndex as number) < 0) throw new Error("proposalIndex must be a non-negative safe integer.");
  if (!["validated","unvalidated","invalid"].includes(String(value.structuralTrust))) throw new Error("structuralTrust is unsupported.");
  if (value.droppedProvenance !== undefined) strings(value.droppedProvenance, "droppedProvenance");
  const imported = record(value.importRecord, "importRecord"); if (imported.apiVersion !== surveyApiVersion || imported.kind !== "ExtractionEnvelopeImport") throw new Error("importRecord identity is unsupported.");
  const importMetadata = record(imported.metadata, "importRecord.metadata"); stableIdentity(importMetadata.name, "importRecord.metadata.name"); stableIdentity(importMetadata.producerNamespace, "importRecord.metadata.producerNamespace");
  const spec = record(imported.spec, "importRecord.spec"); const envelope = record(spec.envelope, "importRecord.spec.envelope"); if (envelope.format !== "traverse-extraction-result" || envelope.version !== 1) throw new Error("Extraction envelope format is unsupported.");
  const source = record(envelope.source, "envelope.source"); safeReference(source.ref, "source.ref"); if (source.snapshotRef !== undefined) safeReference(source.snapshotRef, "source.snapshotRef");
  const result = record(envelope.result, "envelope.result"); stableIdentity(result.provider, "result.provider"); if (result.model !== undefined) stableIdentity(result.model, "result.model"); stableIdentity(result.runId, "result.runId"); dateTime(result.extractedAt, "result.extractedAt"); if (result.taskDigest !== undefined) prefixedDigest(result.taskDigest, "result.taskDigest"); if (result.exampleDigests !== undefined) { const examples=array(result.exampleDigests,"result.exampleDigests"); examples.forEach((entry,index)=>prefixedDigest(entry,`result.exampleDigests[${index}]`)); }
  const proposals = array(result.proposals, "result.proposals"); const index = value.proposalIndex as number; if (index >= proposals.length) throw new Error("proposalIndex does not identify a proposal."); const { proposal, proposalModel, provenance } = validateProposal(proposals[index], result);
  const artifact = result.preparedArtifact === undefined ? undefined : record(result.preparedArtifact, "preparedArtifact"); if (artifact) validateArtifact(artifact, source.snapshotRef);
  if (result.preparedArtifactState !== undefined) validateArtifactState(record(result.preparedArtifactState, "preparedArtifactState"), artifact);
  const importStatus=record(imported.status,"importRecord.status"); if(!["grounded","unresolved"].includes(String(importStatus.state))||!Array.isArray(importStatus.diagnostics)) throw new Error("importRecord status is invalid."); const artifactState=isRecord(result.preparedArtifactState)?result.preparedArtifactState.status:undefined; if(importStatus.state==="grounded" && artifactState!==undefined && artifactState!=="available") throw new Error("grounded importRecord cannot carry an unresolved artifact state."); if(importStatus.state==="unresolved" && importStatus.diagnostics.length===0) throw new Error("unresolved importRecord requires diagnostics.");
  if ((value.reviewItem === undefined) !== (value.reviewDecision === undefined)) throw new Error("reviewItem and reviewDecision must be supplied together.");
  if (value.reviewItem !== undefined && value.reviewDecision !== undefined) {
    const reviewItem = record(value.reviewItem, "reviewItem");
    if (reviewItem.apiVersion !== surveyApiVersion || reviewItem.kind !== "ReviewItem") throw new Error("reviewItem identity is unsupported.");
    const itemMetadata = record(reviewItem.metadata, "reviewItem.metadata"); nonEmpty(itemMetadata.name, "reviewItem.metadata.name");
    const itemSpec = record(reviewItem.spec, "reviewItem.spec");
    if (itemSpec.target !== proposal.fieldPath || itemSpec.editable !== false) throw new Error("reviewItem does not match the non-editable extraction proposal.");
    const candidates = array(itemSpec.candidates, "reviewItem.spec.candidates");
    const choice = profile === reviewedExtractionEvidenceChoiceProfile;
    if (!choice && candidates.length !== 1) throw new Error("extraction reviewItem must contain exactly one candidate.");
    if (choice) validateChoiceCandidates(candidates, index, itemSpec.target, imported, proposals, result, source, artifact);
    else assertCandidateMatchesProposal(record(candidates[0], "reviewItem candidate"), proposal, provenance, proposalModel, source, result, artifact);
    const decision = record(value.reviewDecision, "reviewDecision");
    if (decision.apiVersion !== surveyApiVersion || decision.kind !== "ReviewDecision") throw new Error("reviewDecision identity is unsupported.");
    const decisionSpec = record(decision.spec, "reviewDecision.spec");
    if (decisionSpec.reviewItemName !== itemMetadata.name) throw new Error("reviewDecision does not reference reviewItem.");
    if (!["verified","assumed","rejected","proposed"].includes(String(decisionSpec.status))) throw new Error("reviewDecision status is unsupported.");
    if (decisionSpec.resolution !== undefined && !["accepted","rejected","held","could_not_confirm"].includes(String(decisionSpec.resolution))) throw new Error("reviewDecision resolution is unsupported.");
    assertDecisionConsistency(decisionSpec);
    if (decisionAccepted(value.reviewDecision as unknown as SurveyExtractionReviewDecision) && (decisionSpec.actor === undefined || decisionSpec.reviewedAt === undefined)) throw new Error("accepted reviewDecision requires actor and reviewedAt.");
    if (decisionSpec.editedValue !== undefined) throw new Error("non-editable extraction reviewDecision cannot carry editedValue.");
    if (decisionSpec.actor !== undefined) stableIdentity(record(decisionSpec.actor, "reviewDecision.spec.actor").id, "reviewDecision.spec.actor.id");
    if (decisionSpec.reviewedAt !== undefined) dateTime(decisionSpec.reviewedAt, "reviewDecision.spec.reviewedAt");
    if (decisionSpec.candidateId !== undefined && !candidates.some((entry) => isRecord(entry) && entry.id === decisionSpec.candidateId)) throw new Error("reviewDecision candidate is absent from reviewItem.");
    if (choice) validateChoiceDecision(decisionSpec, candidates);
  } else if (importStatus.state !== "unresolved" || profile === reviewedExtractionEvidenceChoiceProfile) {
    throw new Error(importStatus.state !== "unresolved" ? "grounded importRecord requires review resources." : "The v3 profile requires review resources.");
  }
}

/** A proposal's own fields, as the cited proposal has always been checked. */
function validateProposal(value: unknown, result: Record<string, unknown>): { proposal: Record<string, unknown>; proposalModel: unknown; provenance: Record<string, unknown> } {
  const proposal = record(value, "proposal"); nonEmpty(proposal.fieldPath, "proposal.fieldPath"); stableIdentity(proposal.extractor, "proposal.extractor"); if (proposal.confidence !== undefined && (typeof proposal.confidence !== "number" || !Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1)) throw new Error("proposal.confidence is invalid.");
  // In a multi-chunk run `result.model` names one chunk's model; a proposal's own `producedBy.model` is the model for its value.
  const proposalModel = proposal.producedBy === undefined ? result.model : record(proposal.producedBy, "proposal.producedBy").model; if (proposal.producedBy !== undefined) stableIdentity(proposalModel, "proposal.producedBy.model");
  const provenance = record(proposal.provenance, "proposal.provenance"); string(provenance.excerpt, "proposal.provenance.excerpt"); const span = locator(provenance.locator, provenance.excerpt as string); const occurrence = record(provenance.occurrence, "proposal.provenance.occurrence"); exactKeys(occurrence,["resolverVersion","count","selected","selection","hintUsed","ambiguous"],"occurrence"); if (occurrence.resolverVersion !== "exact-occurrence-v1") throw new Error("occurrence resolver is unsupported."); if(!Number.isSafeInteger(occurrence.count)||(occurrence.count as number)<1) throw new Error("occurrence count is invalid."); if(!["source-order","occurrence-hint"].includes(String(occurrence.selection))) throw new Error("occurrence selection is invalid."); if(typeof occurrence.hintUsed!=="boolean"||occurrence.hintUsed!==(occurrence.selection==="occurrence-hint")) throw new Error("occurrence hintUsed is inconsistent."); if(typeof occurrence.ambiguous!=="boolean"||occurrence.ambiguous!==((occurrence.count as number)>1)) throw new Error("occurrence ambiguous is inconsistent."); const selected = record(occurrence.selected, "occurrence.selected"); exactKeys(selected,["index","start","end"],"occurrence.selected"); if(!Number.isSafeInteger(selected.index)||(selected.index as number)<0||(selected.index as number)>=(occurrence.count as number)) throw new Error("occurrence selected index is invalid."); if (selected.start !== span.start || selected.end !== span.end) throw new Error("occurrence selection does not match locator.");
  return { proposal, proposalModel, provenance };
}

/** The binding rules every reviewed candidate meets against the proposal it stands for. */
function assertCandidateMatchesProposal(c: Record<string, unknown>, proposal: Record<string, unknown>, provenance: Record<string, unknown>, proposalModel: unknown, source: Record<string, unknown>, result: Record<string, unknown>, artifact: Record<string, unknown> | undefined): void {
  if (canonicalJson(c.value) !== canonicalJson(proposal.candidateValue) || c.confidence !== proposal.confidence) throw new Error("candidate value or confidence does not match proposal.");
  const cSource = record(c.source, "candidate.source");
  if (cSource.sourceRef !== source.ref || cSource.sourceId !== (source.snapshotRef ?? source.ref) || cSource.observedAt !== result.extractedAt || (artifact && cSource.checksum !== artifact.digest)) throw new Error("candidate source does not match import source.");
  const cLocator = record(c.locator, "candidate.locator");
  if (cLocator.locator !== provenance.locator || cLocator.excerpt !== provenance.excerpt) throw new Error("candidate locator does not match proposal.");
  const cExtraction = record(c.extraction, "candidate.extraction");
  if (cExtraction.target !== proposal.fieldPath || cExtraction.extractor !== proposal.extractor || cExtraction.model !== proposalModel) throw new Error("candidate extraction does not match proposal.");
}

/**
 * v3: two or more candidates with unique ids. A candidate carrying Survey's
 * envelope binding is `proposed` and bound to the proposal it names, which
 * must be a distinct proposal of this import for the item's target, and it
 * meets every v1 binding rule against that proposal. A candidate without the
 * binding is a prior value: role `current`, at most one. The cited proposal
 * must be one candidate's.
 */
function validateChoiceCandidates(candidates: unknown[], citedIndex: number, target: unknown, imported: Record<string, unknown>, proposals: unknown[], result: Record<string, unknown>, source: Record<string, unknown>, artifact: Record<string, unknown> | undefined): void {
  if (candidates.length < 2) throw new Error("The v3 profile records a choice between candidates; a single-candidate reviewItem uses v1 or v2.");
  const ids = new Set<string>(); const bound = new Set<number>(); let current = 0;
  const importName = (imported.metadata as Record<string, unknown>).name;
  for (const entry of candidates) {
    const c = record(entry, "reviewItem candidate"); nonEmpty(c.id, "reviewItem candidate id");
    if (ids.has(c.id)) throw new Error("reviewItem candidate ids must be unique.");
    ids.add(c.id);
    const binding = isRecord(c.producer) ? c.producer[surveyEnvelopeProducer] : undefined;
    if (binding === undefined) {
      if (c.role !== "current") throw new Error("A candidate without an envelope binding must be the current (prior) value.");
      if (++current > 1) throw new Error("reviewItem can carry at most one current candidate.");
      continue;
    }
    const b = record(binding, "candidate envelope binding");
    if (c.role !== "proposed") throw new Error("A candidate bound to a proposal must have role proposed.");
    if (b.importName !== importName) throw new Error("candidate envelope binding does not name the import record.");
    const index = b.proposalIndex;
    if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= proposals.length) throw new Error("candidate proposalIndex does not identify a proposal.");
    if (bound.has(index as number)) throw new Error("Two candidates are bound to the same proposal.");
    bound.add(index as number);
    const { proposal, proposalModel, provenance } = validateProposal(proposals[index as number], result);
    if (proposal.fieldPath !== target) throw new Error("reviewItem does not match the non-editable extraction proposal.");
    assertCandidateMatchesProposal(c, proposal, provenance, proposalModel, source, result, artifact);
  }
  if (!bound.has(citedIndex)) throw new Error("The cited proposal is not one of the reviewItem's candidates.");
}

/**
 * v3: the decision names exactly one candidate. When that candidate is one of
 * several proposed values, the decision records the other proposed candidates
 * as passed over, in item order, as Survey's `select-proposed` does; any
 * other decision records none.
 */
function validateChoiceDecision(spec: Record<string, unknown>, candidates: unknown[]): void {
  if (typeof spec.candidateId !== "string") throw new Error("A v3 reviewDecision must name the chosen candidate.");
  const named = candidates.find((entry) => (entry as Record<string, unknown>).id === spec.candidateId) as Record<string, unknown>;
  const proposed = candidates.filter((entry) => (entry as Record<string, unknown>).role === "proposed").map((entry) => (entry as Record<string, unknown>).id);
  const expected = named.role === "proposed" && proposed.length > 1 ? proposed.filter((id) => id !== spec.candidateId) : [];
  if (spec.unselectedCandidateIds !== undefined) strings(spec.unselectedCandidateIds, "reviewDecision.spec.unselectedCandidateIds");
  if (canonicalJson(spec.unselectedCandidateIds ?? []) !== canonicalJson(expected)) throw new Error("reviewDecision must record exactly the proposed candidates it passed over.");
}

function validateArtifact(artifact: Record<string, unknown>, snapshotRef: unknown): void { if (artifact.format !== "traverse-prepared-artifact" || artifact.version !== 1) throw new Error("preparedArtifact identity is unsupported."); rawDigest(artifact.digest, "preparedArtifact.digest"); safeReference(artifact.ref, "preparedArtifact.ref"); nonEmpty(artifact.preparationMode, "preparedArtifact.preparationMode"); nonEmpty(artifact.preparationVersion, "preparedArtifact.preparationVersion"); if (!Number.isSafeInteger(artifact.contentLength) || (artifact.contentLength as number) < 0) throw new Error("preparedArtifact.contentLength is invalid."); if (artifact.sourceSnapshotRef !== undefined && artifact.sourceSnapshotRef !== snapshotRef) throw new Error("preparedArtifact source snapshot does not match source."); const binding = JSON.stringify({ format: artifact.format, version: artifact.version, digest: artifact.digest, preparationMode: artifact.preparationMode, preparationVersion: artifact.preparationVersion, contentLength: artifact.contentLength, sourceSnapshotRef: artifact.sourceSnapshotRef ?? null }); const expected = `traverse-prepared-artifact:v1:sha256:${sha256Hex(binding)}`; if (artifact.ref !== expected) throw new Error("preparedArtifact ref does not match its identity binding."); }
function validateArtifactState(state: Record<string, unknown>, artifact?: Record<string, unknown>): void { if (!artifact) throw new Error("preparedArtifactState requires preparedArtifact."); if (state.canonicalRef !== artifact.ref) throw new Error("preparedArtifactState canonicalRef does not match artifact."); safeReference(state.canonicalRef, "preparedArtifactState.canonicalRef"); if(state.status==="invalid-artifact"){exactKeys(state,["status","reason","canonicalRef"],"preparedArtifactState");nonEmpty(state.reason,"preparedArtifactState.reason");return;} if(state.status==="digest-mismatch"){exactKeys(state,["status","requestedRef","canonicalRef","actualDigest","actualContentLength"],"preparedArtifactState");rawDigest(state.actualDigest,"preparedArtifactState.actualDigest");if(!Number.isSafeInteger(state.actualContentLength)||(state.actualContentLength as number)<0)throw new Error("actualContentLength is invalid.");}else{if(!["available","unavailable","storage-error","identity-mismatch"].includes(String(state.status)))throw new Error("preparedArtifactState status is unsupported.");exactKeys(state,["status","requestedRef","canonicalRef"],"preparedArtifactState");}safeReference(state.requestedRef,"preparedArtifactState.requestedRef");if(state.status==="identity-mismatch"?state.requestedRef===state.canonicalRef:state.requestedRef!==state.canonicalRef)throw new Error("preparedArtifactState requested/canonical relationship is invalid."); }

function withoutMetadata(evidence: Evidence): Omit<Evidence, "metadata"> { const { metadata: _metadata, ...rest } = evidence; return rest; }
function digest(value: unknown): string { return `sha256:${sha256Hex(canonicalJson(value))}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function locator(value: unknown, excerpt: string): { start: number; end: number } { if (typeof value !== "string") throw new Error("proposal locator must be chars:start-end."); const match = /^chars:(0|[1-9]\d*)-(0|[1-9]\d*)$/.exec(value); if (!match) throw new Error("proposal locator must be chars:start-end."); const start=Number(match[1]), end=Number(match[2]); if (end < start || end-start !== excerpt.length) throw new Error("proposal locator and excerpt are incoherent."); return {start,end}; }
function referenceContainsAuthorization(value: string, depth=0): boolean { if (depth>2 || /authorization\s*[:=]|bearer\s+[a-z0-9._~-]+/i.test(value)) return true; let parsed: URL; try { parsed=new URL(value); } catch { return false; } if (parsed.username || parsed.password) return true; for (const [key,nested] of parsed.searchParams) if (/(?:^|[-_])(token|secret|password|passwd|api[-_]?key|authorization|signature|credential)(?:$|[-_])/i.test(key) || referenceContainsAuthorization(nested,depth+1)) return true; return false; }
function safeReference(value: unknown, label: string): asserts value is string { nonEmpty(value,label); if (referenceContainsAuthorization(value)) throw new Error(`${label} contains authorization material.`); }
function stableIdentity(value: unknown, label: string): asserts value is string { nonEmpty(value,label); if (!/^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,255}$/.test(value) || /^(?:gh[pousr]_|sk-[A-Za-z0-9]|AKIA[A-Z0-9]|ASIA[A-Z0-9]|eyJ[A-Za-z0-9_-]+\.eyJ)/.test(value) || /(?:token|secret|password|passwd|api[-_]?key|authorization|credential)[=:]/i.test(value) || referenceContainsAuthorization(value)) throw new Error(`${label} must be a credential-free stable identity.`); }
function rawDigest(value: unknown,label:string): asserts value is string { if (typeof value!=="string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid.`); }
function prefixedDigest(value:unknown,label:string):asserts value is string { if(typeof value!=="string"||!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid.`); }
function isRecord(value: unknown): value is Record<string, unknown> { return value!==null && typeof value==="object" && !Array.isArray(value); }
function record(value: unknown,label:string): Record<string,unknown> { if(!isRecord(value)) throw new Error(`${label} must be an object.`); return value; }
function array(value:unknown,label:string):unknown[] { if(!Array.isArray(value)) throw new Error(`${label} must be an array.`); return value; }
function string(value:unknown,label:string):asserts value is string { if(typeof value!=="string") throw new Error(`${label} must be a string.`); }
function nonEmpty(value:unknown,label:string):asserts value is string { if(typeof value!=="string" || value.length===0) throw new Error(`${label} must be a non-empty string.`); }
function strings(value:unknown,label:string):void { if(!Array.isArray(value)||value.some((item)=>typeof item!=="string"||item.length===0)) throw new Error(`${label} must be an array of non-empty strings.`); }
function dateTime(value:unknown,label:string):void { nonEmpty(value,label); if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO date-time.`); }
function exactKeys(value:Record<string,unknown>,keys:string[],label:string):void { const allowed=new Set(keys); for(const key of keys)if(!Object.hasOwn(value,key))throw new Error(`${label}.${key} is required.`);for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`${label}.${key} is unexpected.`); }
function decisionAccepted(decision:SurveyExtractionReviewDecision|undefined):boolean { return decision?.spec.status==="verified"&&(decision.spec.resolution===undefined||decision.spec.resolution==="accepted"); }
function assertDecisionConsistency(spec:Record<string,unknown>):void { const status=spec.status,resolution=spec.resolution; const allowed=resolution===undefined?true:resolution==="accepted"?(status==="verified"||status==="assumed"):resolution==="rejected"?status==="rejected":resolution==="held"?(status==="verified"||status==="assumed"||status==="proposed"):resolution==="could_not_confirm"?(status==="proposed"||status==="assumed"):false;if(!allowed)throw new Error(`reviewDecision resolution ${String(resolution)} cannot use status ${String(status)}.`);if(resolution==="could_not_confirm"){if(typeof spec.resolutionReason!=="string"||!spec.resolutionReason.trim()||spec.actor===undefined||spec.reviewedAt===undefined)throw new Error("could_not_confirm reviewDecision requires reason, actor, and reviewedAt.");} }
function assertJsonValue(value:unknown,label:string,seen=new Set<object>()):void { if(value===null||typeof value==="string"||typeof value==="boolean")return; if(typeof value==="number"){if(!Number.isFinite(value)||Object.is(value,-0))throw new Error(`${label} contains a non-lossless number.`);return;} if(typeof value!=="object")throw new Error(`${label} contains a non-JSON value.`); if(seen.has(value))throw new Error(`${label} contains a cycle.`); if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${label} contains a non-JSON object.`); seen.add(value); const keys=Reflect.ownKeys(value); if(Array.isArray(value)&&keys.length!==value.length+1)throw new Error(`${label} contains a sparse or extended array.`); for(const key of keys){if(typeof key!=="string"||(Array.isArray(value)&&key!=="length"&&!/^(0|[1-9]\d*)$/.test(key)))throw new Error(`${label} contains a non-JSON property.`);if(key==="length")continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${label}.${key} is not a lossless JSON property.`);assertJsonValue(descriptor.value,`${label}.${key}`,seen);}seen.delete(value); }
