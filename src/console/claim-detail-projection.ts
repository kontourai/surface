/**
 * Claim Detail Projection (issue #4).
 *
 * Precomputes, server-side, the per-claim business derivation the Surface
 * Console detail sheet used to derive inline while rendering DOM: status
 * **guidance** (+ suggested command), **gap labels** (root-cause kind / title /
 * hint), **policy facts** (required-vs-collected evidence and methods), and
 * **integrity scope** (source / file / config anchors). The browser detail
 * script (`client/parts/detail.js`) now renders from these projected fields
 * instead of owning the derivation.
 *
 * The projection is keyed by claim id and shipped inside the existing
 * `SurfaceConsoleProjection` payload (embedded config + `/api/console-model`
 * refresh), so no new server endpoint is introduced. Output is data-only; HTML
 * assembly (integrity rows, requirement chips, observed-result blocks) stays in
 * the browser rendering layer.
 *
 * The per-claim evidence / gap / policy resolution here mirrors the browser's
 * former `collectClaimDetailContext` exactly (including that evidence is matched
 * by `evidenceIds` membership only, with no `claimId` fallback) so the rendered
 * detail sheet is unchanged.
 */

interface DetailClaimLike {
  id?: unknown;
  status?: unknown;
  claimType?: unknown;
  evidenceIds?: unknown;
  transparencyGapIds?: unknown;
  verificationPolicyId?: unknown;
  currentIntegrityRef?: unknown;
  evidenceTypes?: unknown;
  evidenceMethods?: unknown;
  metadata?: unknown;
}

export interface SurfaceConsoleSuggestedCommand {
  command: string;
  note?: string;
}

export interface SurfaceConsoleClaimDetailGap {
  /** Root-cause category: setup | config | workflow | quality | policy. */
  kind: string;
  /** Human label for the kind (e.g. "Setup issue"). */
  kindLabel: string;
  /** Short root-cause title. */
  title: string;
  /** Prescriptive remediation hint, when one applies. */
  hint: string | null;
  severity: string;
  /** Raw blocking flag from the source gap (undefined ⇒ treated as blocking). */
  blocking?: boolean;
  message: string;
}

export interface SurfaceConsoleClaimDetailPolicyGap {
  requiredEvidence: string[];
  requiredMethods: string[];
  hasEvidence: string[];
  hasMethods: string[];
  missingEvidence: string[];
  missingMethods: string[];
}

export interface SurfaceConsoleIntegrityConfigRef {
  kind: string;
  name: string;
  hash: string;
  path?: string;
}

export interface SurfaceConsoleIntegrityFileRef {
  path: string;
  hash?: string;
  status?: string;
  sizeBytes?: number;
}

export interface SurfaceConsoleIntegrityScope {
  sourceRefs: string[];
  configRefs: SurfaceConsoleIntegrityConfigRef[];
  fileRefs: SurfaceConsoleIntegrityFileRef[];
}

export interface SurfaceConsoleClaimDetail {
  /** Status guidance text, or null when the status needs no guidance (verified). */
  guidance: string | null;
  /** Suggested next command to collect/refresh evidence, or null. */
  suggestedCommand: SurfaceConsoleSuggestedCommand | null;
  /** Classified transparency + evidence-requirement gaps, in render order. */
  gaps: SurfaceConsoleClaimDetailGap[];
  /** Policy required-vs-collected facts, or null when the requirement is met / no policy. */
  policyGap: SurfaceConsoleClaimDetailPolicyGap | null;
  /** Integrity anchors in scope for this claim. */
  integrityScope: SurfaceConsoleIntegrityScope;
}

const GAP_KIND_LABEL: Record<string, string> = {
  setup: "Setup issue",
  config: "Configuration issue",
  workflow: "Workflow incomplete",
  quality: "Quality failure",
  policy: "Policy mismatch",
};

/**
 * Build the claim-detail projection map for every claim in the read model.
 * Returns an object keyed by claim id; claims with no id are skipped.
 */
export function buildClaimDetails(
  claims: Array<Record<string, unknown>>,
  readModel: Record<string, unknown>,
): Record<string, SurfaceConsoleClaimDetail> {
  const details: Record<string, SurfaceConsoleClaimDetail> = Object.create(null);
  for (const claim of claims) {
    const id = stringValue((claim as DetailClaimLike).id);
    if (!id) continue;
    details[id] = buildClaimDetail(claim, readModel);
  }
  return details;
}

export function buildClaimDetail(
  claimRecord: Record<string, unknown>,
  readModel: Record<string, unknown>,
): SurfaceConsoleClaimDetail {
  const claim = claimRecord as DetailClaimLike;
  const claimId = stringValue(claim.id);
  const allEvidence = recordArray(readModel.evidence);
  const allTransparencyGaps = recordArray(readModel.transparencyGaps);
  const allPolicies = recordArray(readModel.policies);
  const analytics = isRecord(readModel.analytics) ? readModel.analytics : {};
  const allRequirementGaps = recordArray(analytics.evidenceRequirementGaps);

  const evidenceIds = stringArray(claim.evidenceIds);
  const gapIds = stringArray(claim.transparencyGapIds);

  const evidence = allEvidence.filter((item) => evidenceIds.includes(stringValue(item.id)));
  const transparencyGaps = allTransparencyGaps.filter(
    (gap) => gapIds.includes(stringValue(gap.id)) || stringValue(gap.claimId) === claimId,
  );
  const policy = allPolicies.find((item) => stringValue(item.id) === stringValue(claim.verificationPolicyId));
  const claimGaps = allRequirementGaps.filter((gap) => stringValue(gap.claimId) === claimId);

  const evidenceCount = evidenceIds.length;

  return {
    guidance: statusGuidance(stringValue(claim.status), evidenceCount),
    suggestedCommand: suggestCommand(claim, readModel),
    gaps: buildGaps(transparencyGaps, claimGaps),
    policyGap: policyGapAnalysis(claim, policy),
    integrityScope: collectIntegrityDetails(claim, evidence),
  };
}

// ── guidance ────────────────────────────────────────────────────────────────

function statusGuidance(status: string, evidenceCount: number): string | null {
  if (status === "verified") return null;
  if (status === "unknown") {
    return evidenceCount === 0
      ? "This claim has never been evaluated — no evidence has been collected yet."
      : "Evidence exists but trust status could not be determined from it.";
  }
  const messages: Record<string, string> = {
    assumed: "This claim depends on an explicit assumption. Review the assumption before relying on downstream conclusions.",
    proposed: "Awaiting first evidence collection run.",
    stale: "Evidence is outdated — collected against a different version of the code. Stale claims are refreshed one run at a time.",
    disputed: "Surface derived a different status than the producer declared. Resolve the transparency gaps above.",
    rejected: "Verification failed. Check the transparency gaps above for specific remediation steps.",
  };
  return messages[status] ?? null;
}

function suggestCommand(
  claim: DetailClaimLike,
  readModel: Record<string, unknown>,
): SurfaceConsoleSuggestedCommand | null {
  const producer = isRecord(readModel.producer) ? readModel.producer : {};
  const status = stringValue(claim.status);
  const needsEvidence = ["unknown", "stale", "assumed", "proposed", "rejected"].includes(status);
  if (!needsEvidence) return null;

  const metadata = isRecord(claim.metadata) ? claim.metadata : {};
  const command = stringValue(metadata.command);
  if (command) {
    return { command, note: "Runs the evidence check and captures output as evidence." };
  }

  const claimType = stringValue(claim.claimType);
  const isVeritas = stringValue(producer.name) === "veritas" || claimType.startsWith("veritas");
  if (isVeritas) {
    if (status === "stale") {
      return { command: "veritas checkin", note: "Refreshes this claim’s evidence. Run once per stale claim until all are resolved." };
    }
    return { command: "veritas checkin", note: "Collects evidence and updates trust status for in-scope surfaces." };
  }

  return null;
}

// ── gap labels ────────────────────────────────────────────────────────────────

function buildGaps(
  transparencyGaps: Record<string, unknown>[],
  claimGaps: Record<string, unknown>[],
): SurfaceConsoleClaimDetailGap[] {
  // Mirror the browser merge: transparency gaps first, then evidence-requirement
  // gaps whose gapType isn't already represented by a transparency gap's type.
  const merged: Array<{ record: Record<string, unknown>; typeKey: string }> = [
    ...transparencyGaps.map((gap) => ({ record: gap, typeKey: stringValue(gap.type) })),
    ...claimGaps
      .filter((gap) => !transparencyGaps.some((tg) => stringValue(tg.type) === stringValue(gap.gapType)))
      .map((gap) => ({ record: gap, typeKey: stringValue(gap.gapType) })),
  ];

  return merged.map(({ record, typeKey }) => {
    const message = stringValue(record.message);
    const classified = classifyGap(typeKey, message);
    const gap: SurfaceConsoleClaimDetailGap = {
      kind: classified.kind,
      kindLabel: GAP_KIND_LABEL[classified.kind] ?? classified.kind,
      title: classified.title,
      hint: classified.hint,
      severity: stringValue(record.severity) || "medium",
      message,
    };
    if (typeof record.blocking === "boolean") gap.blocking = record.blocking;
    return gap;
  });
}

function classifyGap(gapType: string, message: string): { kind: string; title: string; hint: string | null } {
  if (gapType === "provenance_gap") {
    if (message.includes("Missing required evidence")) {
      return {
        kind: "setup",
        title: "Evidence never collected",
        hint: "The producer ran but did not emit the required evidence type for this claim. This is a producer setup or configuration issue — check that the relevant check is enabled and its output is being captured.",
      };
    }
    return {
      kind: "setup",
      title: "Provenance gap",
      hint: "The evidence trace for this claim is incomplete. Check that all producer steps ran and emitted evidence.",
    };
  }
  if (gapType === "policy_violation") {
    if (message.includes("Missing required verification method")) {
      return {
        kind: "config",
        title: "Required method not collected",
        hint: "Surface expected evidence tagged with this verification method. This can happen because no evidence was emitted, or because the producer emitted evidence with a different method. Run evidence collection first; if evidence appears under the wrong method, fix the producer or adapter mapping.",
      };
    }
    return {
      kind: "policy",
      title: "Policy requirement not met",
      hint: "The claim does not satisfy the requirements of its policy. Check what the policy requires and whether the producer is configured to meet those requirements.",
    };
  }
  if (gapType === "attestation_actor_missing") {
    return {
      kind: "workflow",
      title: "Human review incomplete — no actor",
      hint: "A review record exists but no reviewer identity was recorded. The attestation workflow was started but not completed. Whoever reviewed this needs to sign it properly.",
    };
  }
  if (gapType === "attestation_authority_unverified") {
    return {
      kind: "workflow",
      title: "Human review incomplete — authority not verified",
      hint: "A review record exists but the reviewer's authority cannot be confirmed. Ensure the attestation includes a verifiable authority source.",
    };
  }
  if (gapType === "attestation_identity_unverified") {
    return {
      kind: "workflow",
      title: "Human review incomplete — identity not verified",
      hint: "A review record exists but the reviewer's identity has not been verified. Ensure the attestation includes a valid identity evidence reference.",
    };
  }
  return {
    kind: "quality",
    title: "Verification failed",
    hint: null,
  };
}

// ── policy facts ────────────────────────────────────────────────────────────────

function policyGapAnalysis(
  claim: DetailClaimLike,
  policy: Record<string, unknown> | undefined,
): SurfaceConsoleClaimDetailPolicyGap | null {
  if (!policy) return null;
  const requiredEvidence = stringArray(policy.requiredEvidence);
  const requiredMethods = stringArray(policy.requiredMethods);
  const hasEvidence = stringArray(claim.evidenceTypes);
  const hasMethods = stringArray(claim.evidenceMethods);
  const missingEvidence = requiredEvidence.filter((item) => !hasEvidence.includes(item));
  const missingMethods = requiredMethods.filter((item) => !hasMethods.includes(item));
  if (!missingEvidence.length && !missingMethods.length) return null;
  return { requiredEvidence, requiredMethods, hasEvidence, hasMethods, missingEvidence, missingMethods };
}

// ── integrity scope ────────────────────────────────────────────────────────────────

function collectIntegrityDetails(
  claim: DetailClaimLike,
  evidence: Record<string, unknown>[],
): SurfaceConsoleIntegrityScope {
  const sourceRefs = uniqueBy(
    [
      stringOrNull(claim.currentIntegrityRef),
      ...evidence.map((item) => stringOrNull(item.integrityRef)),
      ...evidence.map((item) => stringOrNull(integrityRecord(item).sourceRef)),
    ].filter((value): value is string => Boolean(value)),
    (value) => value,
  );

  const configRefs = uniqueBy(
    evidence.flatMap((item) => {
      const meta = isRecord(item.metadata) ? item.metadata : {};
      const refs = isRecord(integrityRecord(item).configRefs)
        ? (integrityRecord(item).configRefs as Record<string, unknown>)
        : isRecord(meta.configIntegrity)
          ? (meta.configIntegrity as Record<string, unknown>)
          : {};
      return Object.entries(refs)
        .filter(([, ref]) => isRecord(ref) && stringValue(ref.hash))
        .map(([kind, ref]) => {
          const record = ref as Record<string, unknown>;
          const configRef: SurfaceConsoleIntegrityConfigRef = {
            kind,
            name: stringValue(record.name) || kind,
            hash: stringValue(record.hash),
          };
          const path = stringValue(record.path);
          if (path) configRef.path = path;
          return configRef;
        });
    }),
    (item) => [item.kind, item.name, item.hash, item.path].filter(Boolean).join(":"),
  );

  const fileRefs = uniqueBy(
    evidence.flatMap((item) => {
      const meta = isRecord(item.metadata) ? item.metadata : {};
      const refs = Array.isArray(integrityRecord(item).fileRefs)
        ? (integrityRecord(item).fileRefs as unknown[])
        : Array.isArray(meta.fileIntegrity)
          ? (meta.fileIntegrity as unknown[])
          : [];
      return refs
        .filter((ref): ref is Record<string, unknown> => isRecord(ref) && Boolean(stringValue(ref.path)))
        .map((ref) => {
          const fileRef: SurfaceConsoleIntegrityFileRef = { path: stringValue(ref.path) };
          const hash = stringValue(ref.hash);
          if (hash) fileRef.hash = hash;
          const status = stringValue(ref.status);
          if (status) fileRef.status = status;
          if (typeof ref.sizeBytes === "number") fileRef.sizeBytes = ref.sizeBytes;
          return fileRef;
        });
    }),
    (item) => [item.path, item.hash, item.status].filter(Boolean).join(":"),
  );

  return { sourceRefs, configRefs, fileRefs };
}

function integrityRecord(item: Record<string, unknown>): Record<string, unknown> {
  const meta = isRecord(item.metadata) ? item.metadata : {};
  return isRecord(meta.integrity) ? meta.integrity : {};
}

// ── shared helpers ────────────────────────────────────────────────────────────────

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
