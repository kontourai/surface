/** Browser-safe authentication of the reviewed-extraction evidence profile.
 *
 * This deliberately has no Node, storage, network, or product-runtime edge.
 * The synchronous Node projector/restorer remains the compatibility API; Basis
 * uses this Web Crypto verifier when it must authenticate evidence in a browser
 * delivery graph.
 */
import type { Evidence } from "./types.js";

const profile = "surface.reviewed-extraction-evidence/v1";
const encoder = new TextEncoder();

export async function restoreReviewedExtractionEvidenceBrowser(evidence: Evidence): Promise<Evidence> {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("Reviewed extraction evidence is invalid.");
  const metadata = evidence.metadata?.reviewedExtraction as Record<string, unknown> | undefined;
  if (!metadata || metadata.profile !== profile || typeof metadata.profileDigest !== "string" || !isRecord(metadata.input) || !Array.isArray(metadata.gaps)) throw new Error("Evidence does not carry a complete reviewed extraction evidence profile.");
  const input = metadata.input as Record<string, unknown>;
  // These binding fields are sufficient to reject profile substitution before
  // any protected profile detail can be projected into Basis.
  if (!nonEmpty(input.evidenceId) || !nonEmpty(input.claimId) || input.evidenceId !== evidence.id || input.claimId !== evidence.claimId || !Number.isSafeInteger(input.proposalIndex) || (input.proposalIndex as number) < 0 || !isRecord(input.importRecord)) throw new Error("Reviewed extraction evidence profile is structurally invalid.");
  const anchors = withoutMetadata(evidence);
  const actual = await digest({ anchors, input, gaps: metadata.gaps });
  if (actual !== metadata.profileDigest) throw new Error("Reviewed extraction evidence profile integrity binding is invalid.");
  // Reconstruct the portable anchors from the reviewed profile. This is the
  // important second half of restoration: a valid digest over caller-chosen
  // fields is not sufficient if those fields are not the profile's projection.
  const expected = expectedAnchors(input, metadata.gaps);
  if (!expected || canonicalJson(anchors) !== canonicalJson(expected)) throw new Error("Reviewed extraction evidence fields do not match their bound profile.");
  // Return a JSON clone so caller-owned getters/prototypes cannot cross the
  // semantic adapter boundary after authentication.
  return JSON.parse(JSON.stringify(evidence)) as Evidence;
}

function withoutMetadata(evidence: Evidence): Omit<Evidence, "metadata"> { const { metadata: _metadata, ...rest } = evidence; return rest; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function expectedAnchors(input: Record<string, unknown>, gaps: unknown[]): Omit<Evidence, "metadata"> | null {
  const imported = record(input.importRecord); const spec = record(imported?.spec); const envelope = record(spec?.envelope); const result = record(envelope?.result); const source = record(envelope?.source);
  const index = input.proposalIndex; const proposals = result?.proposals;
  if (!imported || imported.apiVersion !== "survey.kontourai.io/v1alpha1" || imported.kind !== "ExtractionEnvelopeImport" || !result || !source || !Array.isArray(proposals) || typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= proposals.length) return null;
  const proposalIndex = index as number;
  const proposal = record(proposals[proposalIndex]); const provenance = record(proposal?.provenance);
  if (!proposal || !provenance || !nonEmpty(input.evidenceId) || !nonEmpty(input.claimId) || !nonEmpty(source.ref) || !nonEmpty(provenance.locator) || typeof provenance.excerpt !== "string" || !nonEmpty(result.extractedAt) || !nonEmpty(input.collectedBy)) return null;
  const decision = record(input.reviewDecision)?.spec as Record<string, unknown> | undefined;
  const accepted = decision?.status === "verified" && (decision.resolution === undefined || decision.resolution === "accepted") && input.structuralTrust === "validated" && gaps.length === 0;
  const artifact = record(result.preparedArtifact); const artifactDigest = artifact?.digest;
  if (artifact && (artifact.format !== "traverse-prepared-artifact" || artifact.version !== 1 || typeof artifactDigest !== "string" || !/^[a-f0-9]{64}$/.test(artifactDigest))) return null;
  return { id: input.evidenceId, claimId: input.claimId, evidenceType: "source_excerpt", method: "extraction", sourceRef: source.ref, sourceLocator: provenance.locator, excerptOrSummary: provenance.excerpt, observedAt: result.extractedAt, collectedBy: input.collectedBy, ...(artifact ? { integrityRef: `sha256:${artifactDigest}` } : {}), supportStrength: accepted ? "entails" : "cited", passing: accepted, blocking: !accepted };
}
function record(value: unknown): Record<string, unknown> | undefined { return isRecord(value) ? value : undefined; }
async function digest(value: unknown): Promise<string> { const bytes = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(canonicalJson(value))); return `sha256:${[...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`; }
function canonicalJson(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`; }
