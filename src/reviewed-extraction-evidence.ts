import { createHash } from "node:crypto";
import type { Evidence } from "./types.js";

export const reviewedExtractionEvidenceProfile = "surface.reviewed-extraction-evidence/v1";
const surveyApiVersion = "survey.kontourai.io/v1alpha1";

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
          fieldPath: string; candidateValue: unknown; confidence: number; extractor: string;
          provenance: { excerpt: string; locator: string; occurrence: { resolverVersion: "exact-occurrence-v1"; count: number; selected: { index: number; start: number; end: number }; selection: "source-order" | "occurrence-hint"; hintUsed: boolean; ambiguous: boolean } };
          pathIndices?: number[]; inferenceType?: "explicit" | "inferred"; valueType?: string; enumValues?: string[];
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
  status: { state: "grounded" | "unresolved"; diagnostics: Array<Record<string, unknown>> };
}

export interface SurveyExtractionReviewItem {
  apiVersion: typeof surveyApiVersion;
  kind: "ReviewItem";
  metadata: { name: string; producer?: Record<string, unknown> };
  spec: {
    target: string;
    candidates: Array<{
      id: string; value: unknown; confidence?: number;
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
  structuralTrust: "validated" | "unvalidated" | "invalid";
  droppedProvenance?: string[];
}

export type ReviewedExtractionProvenanceGap =
  | { kind: "artifact-unavailable"; status: "unavailable" | "storage-error" | "identity-mismatch" | "invalid-artifact"; requestedRef?: string; canonicalRef: string; reason?: string }
  | { kind: "digest-mismatch"; requestedRef: string; canonicalRef: string; expectedDigest: string; actualDigest: string; actualContentLength: number }
  | { kind: "unsupported-inference"; typeOrigin: string }
  | { kind: "dropped-provenance"; field: string }
  | { kind: "structural-trust"; status: "unvalidated" | "invalid" }
  | { kind: "review-not-accepted"; disposition: string };

export interface ReviewedExtractionEvidenceProjection {
  evidence: Evidence;
  gaps: ReviewedExtractionProvenanceGap[];
  compatibility: { hachureEvidenceSchema: "sufficient"; upstreamSchemaChangeNeeded: false; profile: typeof reviewedExtractionEvidenceProfile };
}

interface ProfileMetadata {
  profile: typeof reviewedExtractionEvidenceProfile;
  profileDigest: string;
  input: ReviewedExtractionEvidenceInput;
  gaps: ReviewedExtractionProvenanceGap[];
}

export function projectReviewedExtractionEvidence(input: ReviewedExtractionEvidenceInput): ReviewedExtractionEvidenceProjection {
  validateInput(input);
  const proposal = input.importRecord.spec.envelope.result.proposals[input.proposalIndex]!;
  const artifact = input.importRecord.spec.envelope.result.preparedArtifact;
  const gaps = provenanceGaps(input);
  const acceptedAndSafe = decisionAccepted(input.reviewDecision) && input.structuralTrust === "validated" && gaps.length === 0;
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
  const profileDigest = digest({ anchors, input: clonedInput, gaps });
  const evidence: Evidence = { ...anchors, metadata: { reviewedExtraction: { profile: reviewedExtractionEvidenceProfile, profileDigest, input: clonedInput, gaps } satisfies ProfileMetadata } };
  return { evidence, gaps, compatibility: { hachureEvidenceSchema: "sufficient", upstreamSchemaChangeNeeded: false, profile: reviewedExtractionEvidenceProfile } };
}

export function restoreReviewedExtractionEvidence(evidence: Evidence): ReviewedExtractionEvidenceInput {
  const metadata = evidence.metadata?.reviewedExtraction;
  if (!isRecord(metadata) || metadata.profile !== reviewedExtractionEvidenceProfile || typeof metadata.profileDigest !== "string" || !isRecord(metadata.input) || !Array.isArray(metadata.gaps)) throw new Error("Evidence does not carry a complete reviewed extraction evidence profile.");
  const input = metadata.input as unknown as ReviewedExtractionEvidenceInput;
  validateInput(input);
  const expected = projectReviewedExtractionEvidence(input);
  const actualDigest = digest({ anchors: withoutMetadata(evidence), input, gaps: metadata.gaps });
  if (actualDigest !== metadata.profileDigest || metadata.profileDigest !== (expected.evidence.metadata!.reviewedExtraction as ProfileMetadata).profileDigest) throw new Error("Reviewed extraction evidence profile integrity binding is invalid.");
  if (canonicalJson(evidence) !== canonicalJson(expected.evidence)) throw new Error("Reviewed extraction evidence fields do not match their bound profile.");
  return clone(input);
}

function provenanceGaps(input: ReviewedExtractionEvidenceInput): ReviewedExtractionProvenanceGap[] {
  const result = input.importRecord.spec.envelope.result;
  const state = result.preparedArtifactState;
  const gaps: ReviewedExtractionProvenanceGap[] = [];
  if (!result.preparedArtifact) gaps.push({ kind: "dropped-provenance", field: "preparedArtifact" });
  if (state?.status === "digest-mismatch") gaps.push({ kind: "digest-mismatch", requestedRef: state.requestedRef, canonicalRef: state.canonicalRef, expectedDigest: result.preparedArtifact!.digest, actualDigest: state.actualDigest, actualContentLength: state.actualContentLength });
  else if (state && state.status !== "available") gaps.push({ kind: "artifact-unavailable", status: state.status, canonicalRef: state.canonicalRef, ...(state.status === "invalid-artifact" ? { reason: state.reason } : { requestedRef: state.requestedRef }) });
  const origin = result.proposals[input.proposalIndex]!.inferenceType ?? "inferred";
  if (origin !== "explicit" && origin !== "inferred") gaps.push({ kind: "unsupported-inference", typeOrigin: origin });
  for (const field of input.droppedProvenance ?? []) gaps.push({ kind: "dropped-provenance", field });
  if (input.structuralTrust !== "validated") gaps.push({ kind: "structural-trust", status: input.structuralTrust });
  if (!decisionAccepted(input.reviewDecision)) gaps.push({ kind: "review-not-accepted", disposition: input.reviewDecision?.spec.resolution ?? input.reviewDecision?.spec.status ?? "not-reviewed" });
  return gaps;
}

function validateInput(value: unknown): asserts value is ReviewedExtractionEvidenceInput {
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
  const proposals = array(result.proposals, "result.proposals"); const index = value.proposalIndex as number; if (index >= proposals.length) throw new Error("proposalIndex does not identify a proposal."); const proposal = record(proposals[index], "proposal"); nonEmpty(proposal.fieldPath, "proposal.fieldPath"); stableIdentity(proposal.extractor, "proposal.extractor"); if (typeof proposal.confidence !== "number" || !Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1) throw new Error("proposal.confidence is invalid.");
  const provenance = record(proposal.provenance, "proposal.provenance"); string(provenance.excerpt, "proposal.provenance.excerpt"); const span = locator(provenance.locator, provenance.excerpt as string); const occurrence = record(provenance.occurrence, "proposal.provenance.occurrence"); exactKeys(occurrence,["resolverVersion","count","selected","selection","hintUsed","ambiguous"],"occurrence"); if (occurrence.resolverVersion !== "exact-occurrence-v1") throw new Error("occurrence resolver is unsupported."); if(!Number.isSafeInteger(occurrence.count)||(occurrence.count as number)<1) throw new Error("occurrence count is invalid."); if(!["source-order","occurrence-hint"].includes(String(occurrence.selection))) throw new Error("occurrence selection is invalid."); if(typeof occurrence.hintUsed!=="boolean"||occurrence.hintUsed!==(occurrence.selection==="occurrence-hint")) throw new Error("occurrence hintUsed is inconsistent."); if(typeof occurrence.ambiguous!=="boolean"||occurrence.ambiguous!==((occurrence.count as number)>1)) throw new Error("occurrence ambiguous is inconsistent."); const selected = record(occurrence.selected, "occurrence.selected"); exactKeys(selected,["index","start","end"],"occurrence.selected"); if(!Number.isSafeInteger(selected.index)||(selected.index as number)<0||(selected.index as number)>=(occurrence.count as number)) throw new Error("occurrence selected index is invalid."); if (selected.start !== span.start || selected.end !== span.end) throw new Error("occurrence selection does not match locator.");
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
    if (candidates.length !== 1) throw new Error("extraction reviewItem must contain exactly one candidate.");
    const c = record(candidates[0], "reviewItem candidate");
    if (canonicalJson(c.value) !== canonicalJson(proposal.candidateValue) || c.confidence !== proposal.confidence) throw new Error("candidate value or confidence does not match proposal.");
    const cSource = record(c.source, "candidate.source");
    if (cSource.sourceRef !== source.ref || cSource.sourceId !== (source.snapshotRef ?? source.ref) || cSource.observedAt !== result.extractedAt || (artifact && cSource.checksum !== artifact.digest)) throw new Error("candidate source does not match import source.");
    const cLocator = record(c.locator, "candidate.locator");
    if (cLocator.locator !== provenance.locator || cLocator.excerpt !== provenance.excerpt) throw new Error("candidate locator does not match proposal.");
    const cExtraction = record(c.extraction, "candidate.extraction");
    if (cExtraction.target !== proposal.fieldPath || cExtraction.extractor !== proposal.extractor || cExtraction.model !== result.model) throw new Error("candidate extraction does not match proposal.");
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
  } else if (importStatus.state !== "unresolved") {
    throw new Error("grounded importRecord requires review resources.");
  }
}

function validateArtifact(artifact: Record<string, unknown>, snapshotRef: unknown): void { if (artifact.format !== "traverse-prepared-artifact" || artifact.version !== 1) throw new Error("preparedArtifact identity is unsupported."); rawDigest(artifact.digest, "preparedArtifact.digest"); safeReference(artifact.ref, "preparedArtifact.ref"); nonEmpty(artifact.preparationMode, "preparedArtifact.preparationMode"); nonEmpty(artifact.preparationVersion, "preparedArtifact.preparationVersion"); if (!Number.isSafeInteger(artifact.contentLength) || (artifact.contentLength as number) < 0) throw new Error("preparedArtifact.contentLength is invalid."); if (artifact.sourceSnapshotRef !== undefined && artifact.sourceSnapshotRef !== snapshotRef) throw new Error("preparedArtifact source snapshot does not match source."); const binding = JSON.stringify({ format: artifact.format, version: artifact.version, digest: artifact.digest, preparationMode: artifact.preparationMode, preparationVersion: artifact.preparationVersion, contentLength: artifact.contentLength, sourceSnapshotRef: artifact.sourceSnapshotRef ?? null }); const expected = `traverse-prepared-artifact:v1:sha256:${createHash("sha256").update(binding).digest("hex")}`; if (artifact.ref !== expected) throw new Error("preparedArtifact ref does not match its identity binding."); }
function validateArtifactState(state: Record<string, unknown>, artifact?: Record<string, unknown>): void { if (!artifact) throw new Error("preparedArtifactState requires preparedArtifact."); if (state.canonicalRef !== artifact.ref) throw new Error("preparedArtifactState canonicalRef does not match artifact."); safeReference(state.canonicalRef, "preparedArtifactState.canonicalRef"); if(state.status==="invalid-artifact"){exactKeys(state,["status","reason","canonicalRef"],"preparedArtifactState");nonEmpty(state.reason,"preparedArtifactState.reason");return;} if(state.status==="digest-mismatch"){exactKeys(state,["status","requestedRef","canonicalRef","actualDigest","actualContentLength"],"preparedArtifactState");rawDigest(state.actualDigest,"preparedArtifactState.actualDigest");if(!Number.isSafeInteger(state.actualContentLength)||(state.actualContentLength as number)<0)throw new Error("actualContentLength is invalid.");}else{if(!["available","unavailable","storage-error","identity-mismatch"].includes(String(state.status)))throw new Error("preparedArtifactState status is unsupported.");exactKeys(state,["status","requestedRef","canonicalRef"],"preparedArtifactState");}safeReference(state.requestedRef,"preparedArtifactState.requestedRef");if(state.status==="identity-mismatch"?state.requestedRef===state.canonicalRef:state.requestedRef!==state.canonicalRef)throw new Error("preparedArtifactState requested/canonical relationship is invalid."); }

function withoutMetadata(evidence: Evidence): Omit<Evidence, "metadata"> { const { metadata: _metadata, ...rest } = evidence; return rest; }
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`; }
function canonicalJson(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`; }
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
