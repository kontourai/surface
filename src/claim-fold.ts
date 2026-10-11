import type {
  Claim,
  ClaimFreshness,
  Evidence,
  EvidenceRequirement,
  TransparencyGap,
  TransparencyGapType,
  TrustStatus,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";
import {
  CHECK_EVIDENCE_TYPES,
  type ClaimEvidenceEvaluation,
  evaluateClaimEvidence,
  evidenceRequirementFromPolicy,
  policyRequiresSomething,
} from "./claim-evaluation.js";
import { partitionEvidenceBySupport } from "./evidence-support.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import { parseTimestamp } from "./timestamp.js";
import { applyVerifiedStaleness, claimIntrinsicExpiry, sortEventsMostRecentFirstV4, deriveTrustStatus, verifiedBranchEvent } from "./status.js";
import { resolveStatusFunctionVersion, type StatusFunctionVersion } from "./status-function-version.js";

const TRANSPARENCY_GAP_TYPES: TransparencyGapType[] = [
  "contradiction",
  "provenance_gap",
  "policy_violation",
  "freshness_breach",
  "corroboration_absent",
  "unsupported_inference",
];

export interface ClaimFoldInput {
  claim: Claim;
  evidence: Evidence[];
  policies: VerificationPolicy[];
  events: VerificationEvent[];
  allEvents: VerificationEvent[];
  authorityTrace?: import("./types.js").AuthorityTrace[];
  now: Date;
  /**
   * The claim's untimed own status from a checkpoint (`untimedOwnStatus` of an
   * earlier fold over the same inputs). Time is re-applied to it for `now`.
   */
  checkpointStatus?: TrustStatus;
  checkpointUsable: boolean;
  checkpointSeenClaim: boolean;
  checkpointMark?: number;
  /** Which status function version to evaluate. Defaults to the current version. */
  statusFunctionVersion?: StatusFunctionVersion;
}

export interface ClaimFoldResult {
  claim: Claim;
  ownStatus: TrustStatus;
  /**
   * `ownStatus` without the verified-event staleness test: the value a
   * checkpoint stores, so that re-applying time for any later or earlier `now`
   * reproduces a full derivation.
   */
  untimedOwnStatus: TrustStatus;
  producerStatus?: TrustStatus;
  policy?: VerificationPolicy;
  evidence: Evidence[];
  entailingEvidence: Evidence[];
  evidenceRequirement?: EvidenceRequirement;
  transparencyGaps: TransparencyGap[];
  eventsFolded: number;
  eventsTotal: number;
  fromCheckpoint: boolean;
  freshnessForStatus(status: TrustStatus): ClaimFreshness;
}

export function foldClaim(input: ClaimFoldInput): ClaimFoldResult {
  const { entailingEvidence } = partitionEvidenceBySupport(input.evidence);
  const statusFunctionVersion = resolveStatusFunctionVersion(input.statusFunctionVersion);
  const policy = resolvePolicyForClaim(input.claim, input.policies, { statusFunctionVersion });
  // Compute the shared evidence/policy satisfaction facts ONCE here, then thread
  // the same evaluation into both the status decision and gap derivation so they
  // cannot drift (issue #1). Standalone status callers recompute on demand.
  const evaluation = policy ? evaluateClaimEvidence({ entailingEvidence, policy, statusFunctionVersion }) : undefined;
  const danglingPolicyReference = Boolean(input.claim.verificationPolicyId) &&
    !input.policies.some((candidate) => candidate.id === input.claim.verificationPolicyId);
  const checkpointMark = input.checkpointMark;
  const tailEvents = !input.checkpointUsable || checkpointMark === undefined
    ? input.events
    : input.events.filter((event) => Date.parse(event.createdAt) > checkpointMark);
  const canShortCircuit =
    input.checkpointUsable &&
    input.checkpointSeenClaim &&
    tailEvents.length === 0 &&
    input.checkpointStatus !== undefined;

  let ownStatus: TrustStatus;
  let untimedOwnStatus: TrustStatus;
  let eventsFolded: number;
  if (canShortCircuit) {
    untimedOwnStatus = input.checkpointStatus as TrustStatus;
    ownStatus = applyVerifiedStaleness({
      untimedStatus: untimedOwnStatus,
      claim: input.claim,
      evidence: entailingEvidence,
      events: input.events,
      policy,
      now: input.now,
      authorityTrace: input.authorityTrace,
      statusFunctionVersion,
    });
    eventsFolded = 0;
  } else {
    const statusInput = {
      claim: input.claim,
      evidence: entailingEvidence,
      policy,
      events: input.events,
      now: input.now,
      authorityTrace: input.authorityTrace,
      evaluation,
      statusFunctionVersion,
    };
    ownStatus = deriveTrustStatus(statusInput);
    // Only the verified-event branch reads `now`; elsewhere the untimed status is the status.
    untimedOwnStatus = verifiedBranchEvent(input.claim, input.events, input.authorityTrace, statusFunctionVersion) === undefined
      ? ownStatus
      : deriveTrustStatus({ ...statusInput, ignoreVerifiedStaleness: true });
    eventsFolded = input.events.length;
  }

  return {
    claim: input.claim,
    ownStatus,
    untimedOwnStatus,
    producerStatus: input.claim.status,
    policy,
    evidence: input.evidence,
    entailingEvidence,
    evidenceRequirement: policy ? evidenceRequirementFromPolicy(policy) : undefined,
    transparencyGaps: [
      ...(policy && evaluation
        ? deriveTransparencyGaps({
          claim: input.claim,
          evidence: input.evidence,
          entailingEvidence,
          events: input.events,
          policy,
          evaluation,
          status: ownStatus,
          now: input.now,
          statusFunctionVersion,
        })
        // Under "3" a dangling `verificationPolicyId` is why no policy resolved;
        // the unresolved-reference gap below reports that cause once.
        : input.evidence.length === 0
          ? [noPolicyEvidenceGap(input.claim, input.now)]
          : danglingPolicyReference && statusFunctionVersion !== "2"
            ? []
            : [noPolicyGap(input.claim, input.now)]),
      ...(statusFunctionVersion !== "2" && policy && !policyRequiresSomething(policy)
        ? [policyRequiresNothingGap(input.claim, policy, input.now)]
        : []),
      ...(danglingPolicyReference ? [danglingPolicyReferenceGap(input.claim, input.now)] : []),
    ],
    eventsFolded,
    eventsTotal: input.events.length,
    fromCheckpoint: canShortCircuit,
    freshnessForStatus: (status) => freshnessForClaim(input.claim, input.allEvents, status, input.now, statusFunctionVersion),
  };
}

/**
 * The latest `verified` event, in the event order of the status function
 * version: under "4" exact instants with an unevaluable `createdAt` oldest.
 */
function governingVerifiedEvent(claimId: string, events: VerificationEvent[], version: StatusFunctionVersion): VerificationEvent | undefined {
  const verified = events.filter((event) => event.claimId === claimId && event.status === "verified");
  if (version === "4") return sortEventsMostRecentFirstV4(verified)[0];
  return verified.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

/**
 * Version "4": the claim-intrinsic expiry for display, read with the v4
 * timestamp reader, so a time the status function cannot evaluate (and so
 * derives `stale`) is never shown as a future expiry. Whole milliseconds.
 */
function claimIntrinsicExpiryV4(event: VerificationEvent | undefined, claim: Claim): number | undefined {
  if (typeof claim.expiresAt === "string" && claim.expiresAt.length > 0) {
    return parseTimestamp(claim.expiresAt)?.epochMilliseconds;
  }
  if (typeof claim.ttlSeconds === "number" && Number.isFinite(claim.ttlSeconds)) {
    const anchor = parseTimestamp(event?.verifiedAt ?? event?.createdAt ?? claim.updatedAt);
    return anchor === undefined ? undefined : anchor.epochMilliseconds + claim.ttlSeconds * 1000;
  }
  return undefined;
}

function freshnessForClaim(claim: Claim, events: VerificationEvent[], status: TrustStatus, now: Date, version: StatusFunctionVersion): ClaimFreshness {
  const governing = governingVerifiedEvent(claim.id, events, version);
  const intrinsic = version === "4" ? claimIntrinsicExpiryV4(governing, claim) : claimIntrinsicExpiry(governing, claim);
  const freshness: ClaimFreshness = {
    asOf: now.toISOString(),
    stale: status === "stale",
  };
  if (intrinsic !== undefined) {
    freshness.expiresAt = new Date(intrinsic).toISOString();
  }
  return freshness;
}

function noPolicyEvidenceGap(claim: Claim, now: Date): TransparencyGap {
  return {
    id: `${claim.id}.gap.provenance-gap`,
    claimId: claim.id,
    type: "provenance_gap",
    severity: claim.impactLevel ?? "medium",
    ...materialityFromClaim(claim),
    message: `Claim ${claim.id} has no evidence and no verification policy.`,
    blocking: true,
    createdAt: now.toISOString(),
  };
}

/**
 * A claim with evidence but no resolved verification policy cannot present as
 * healthy. Status function "3" derives at most `proposed` for it; "2" may still
 * derive `verified`, so this blocking gap is what gap-gated consumers refuse on.
 */
function noPolicyGap(claim: Claim, now: Date): TransparencyGap {
  return {
    id: `${claim.id}.gap.no-verification-policy`,
    claimId: claim.id,
    type: "policy_violation",
    severity: claim.impactLevel ?? "medium",
    ...materialityFromClaim(claim),
    message: `Claim ${claim.id} has no resolved verification policy.`,
    blocking: true,
    createdAt: now.toISOString(),
    metadata: { source: "policy.unresolved" },
  };
}

/**
 * Status function "3" treats a policy that names no required evidence type and
 * no required method as no policy, so the claim derives at most `proposed`.
 * This gap states why.
 */
function policyRequiresNothingGap(claim: Claim, policy: VerificationPolicy, now: Date): TransparencyGap {
  return {
    id: `${claim.id}.gap.verification-policy-requires-nothing`,
    claimId: claim.id,
    type: "policy_violation",
    severity: claim.impactLevel ?? policy.impactLevel,
    ...materialityFromClaim(claim),
    message: `Verification policy ${policy.id} requires no evidence type and no method, so it cannot establish verified.`,
    policyId: policy.id,
    blocking: true,
    createdAt: now.toISOString(),
    metadata: { source: "policy.requiresNothing" },
  };
}

/**
 * A claim that names a `verificationPolicyId` absent from the bundle's policies.
 * Under status function "3" no policy resolves; under "2" resolution falls back
 * to the claim type (or no policy), which is not the policy the producer asked
 * for.
 */
function danglingPolicyReferenceGap(claim: Claim, now: Date): TransparencyGap {
  return {
    id: `${claim.id}.gap.unresolved-verification-policy`,
    claimId: claim.id,
    type: "policy_violation",
    severity: claim.impactLevel ?? "medium",
    ...materialityFromClaim(claim),
    message: `Claim ${claim.id} names verification policy ${claim.verificationPolicyId}, which is not present.`,
    blocking: true,
    createdAt: now.toISOString(),
    metadata: { source: "policy.unresolvedReference", verificationPolicyId: claim.verificationPolicyId },
  };
}

function deriveTransparencyGaps(input: {
  claim: Claim;
  evidence: Evidence[];
  entailingEvidence: Evidence[];
  events: VerificationEvent[];
  policy: VerificationPolicy;
  evaluation: ClaimEvidenceEvaluation;
  status: TrustStatus;
  now: Date;
  statusFunctionVersion: StatusFunctionVersion;
}): TransparencyGap[] {
  const transparencyGaps: TransparencyGap[] = [];
  const createdAt = input.now.toISOString();
  // Shared satisfaction facts — computed once in `foldClaim` and threaded in, so
  // the gaps emitted here always agree with the status decision (issue #1).
  // A required type can be unmet because no entailing evidence of that type
  // exists, or (status function "3") because the check evidence present reports
  // no passing result. Only the first is "missing"; the second is reported by
  // the check-result gap below.
  const presentTypes = new Set(input.entailingEvidence.map((item) => item.evidenceType));
  const missingEvidence = input.evaluation.missingEvidenceTypes.filter((type) => !presentTypes.has(type));
  // Likewise a required method can be unmet because no entailing evidence
  // carries it, or ("3") because only check evidence without a passing result does.
  const presentMethods = new Set(input.entailingEvidence.map((item) => item.method));
  const missingMethods = input.evaluation.missingMethods.filter((method) => !presentMethods.has(method));
  const unqualifiedMethods = input.evaluation.missingMethods.filter((method) => presentMethods.has(method));
  // An inconclusive attempt (schemaVersion 9) never reached its source: it
  // cites nothing, so it is not an unsupported inference. The unmet
  // requirement it leaves is reported by the requirement gaps above and below.
  const citedEvidenceIds = input.evidence
    .filter((item) => item.inconclusive === undefined && !input.entailingEvidence.some((entailing) => entailing.id === item.id))
    .map((item) => item.id);

  if (missingEvidence.length > 0) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.provenance-gap`,
      claimId: input.claim.id,
      type: "provenance_gap",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: `Missing required evidence: ${missingEvidence.join(", ")}.`,
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (missingMethods.length > 0 || unqualifiedMethods.length > 0) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.policy-violation`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: [
        ...(missingMethods.length > 0 ? [`Missing required verification method: ${missingMethods.join(", ")}.`] : []),
        ...(unqualifiedMethods.length > 0
          ? [`Required verification method carried only by check evidence without a passing result: ${unqualifiedMethods.join(", ")}.`]
          : []),
      ].join(" "),
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (input.evaluation.corroborationMissing) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.corroboration-absent`,
      claimId: input.claim.id,
      type: "corroboration_absent",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: "Policy requires corroboration from at least two evidence records.",
      evidenceIds: input.entailingEvidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (
    input.evidence.length > 0 &&
    citedEvidenceIds.length > 0 &&
    input.evaluation.requirementUnmet
  ) {
    const hasProducerUnsupportedInferenceHint = input.evidence.some((item) => {
      const hints = item.metadata?.transparencyGapHints;
      return Array.isArray(hints) && hints.some((hint) => (
        typeof hint === "object" &&
        hint !== null &&
        "type" in hint &&
        hint.type === "unsupported_inference"
      ));
    });

    if (!hasProducerUnsupportedInferenceHint) {
      transparencyGaps.push({
        id: `${input.claim.id}.gap.unsupported-inference`,
        claimId: input.claim.id,
        type: "unsupported_inference",
        severity: input.claim.impactLevel ?? input.policy.impactLevel,
        ...materialityFromClaim(input.claim),
        message: "Linked evidence cites or references the claim but does not entail enough support under policy.",
        evidenceIds: citedEvidenceIds,
        policyId: input.policy.id,
        blocking: true,
        createdAt,
      });
    }
  }

  const unevaluableValidityGap = deriveUnevaluableValidityGap(input);
  if (input.status === "stale") {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.freshness-breach`,
      claimId: input.claim.id,
      type: "freshness_breach",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      // Under "4" say why when the window could not be evaluated; "3" and "2"
      // keep their message.
      message: input.statusFunctionVersion === "4" && unevaluableValidityGap
        ? "Claim verification is treated as stale because its validity could not be evaluated."
        : "Claim verification is stale under its verification policy.",
      evidenceIds: input.entailingEvidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
    });
  }

  if (unevaluableValidityGap) transparencyGaps.push(unevaluableValidityGap);

  // Check-type evidence satisfies a policy requirement only by reporting a
  // passing result. Under status function "3" that is the status rule
  // (qualifying evidence); under "2" status follows type presence and this gap
  // keeps a result-less check from reading as satisfied support. Under "2" a
  // reported failure is not flagged here: it has its own gap below, blocking or
  // not as the producer marked it. Under "3" the requirement is unmet even when
  // every check of the type failed without blocking, so that case is flagged too.
  for (const evidenceType of input.policy.requiredEvidence) {
    if (!CHECK_EVIDENCE_TYPES.has(evidenceType) || missingEvidence.includes(evidenceType)) continue;
    const checks = input.entailingEvidence.filter((item) => item.evidenceType === evidenceType);
    if (checks.some((item) => item.passing === true)) continue;
    const resultLess = checks.filter((item) => typeof item.passing !== "boolean");
    if (resultLess.length === 0 && input.statusFunctionVersion === "2") continue;
    transparencyGaps.push({
      id: `${input.claim.id}.gap.check-result-missing-${evidenceType}`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: resultLess.length > 0
        ? `Required ${evidenceType} evidence reports no result (passing is not set).`
        : `Required ${evidenceType} evidence reports no passing result.`,
      evidenceIds: (resultLess.length > 0 ? resultLess : checks).map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt,
      metadata: { source: "policy.checkResultMissing", evidenceType },
    });
  }

  // Every explicitly failed item stays visible, whatever its support label. A
  // cited failure still does not count as support or counterevidence for status.
  for (const item of input.evidence.filter((evidence) => evidence.passing === false)) {
    transparencyGaps.push({
      id: `${input.claim.id}.gap.evidence-${item.id}`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message: "Evidence explicitly reported a non-passing result.",
      evidenceIds: [item.id],
      policyId: input.policy.id,
      blocking: item.blocking !== false,
      createdAt,
    });
  }

  for (const hint of input.evidence.flatMap((item) => transparencyGapHintsFromEvidence(item, input.claim, input.policy.id, createdAt))) {
    transparencyGaps.push(hint);
  }

  return transparencyGaps;
}

/**
 * Version "4": why the claim's own validity window (`expiresAt`, else
 * `ttlSeconds`) cannot be evaluated, or undefined when it can or is absent.
 * Mirrors Step 4a: `expiresAt` must be a timestamp; `ttlSeconds` must be a
 * finite non-negative number counted from a verification time that is one.
 */
function unevaluableIntrinsicWindowV4(claim: Claim, events: VerificationEvent[]): string | undefined {
  if (claim.expiresAt !== undefined) {
    return parseTimestamp(claim.expiresAt) === undefined
      ? `Claim validity cannot be evaluated because expiresAt (${JSON.stringify(claim.expiresAt)}) is not an RFC 3339 timestamp with an offset.`
      : undefined;
  }
  if (claim.ttlSeconds === undefined) return undefined;
  const ttl: unknown = claim.ttlSeconds;
  if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 0) {
    return "Claim validity cannot be evaluated because ttlSeconds is missing or invalid.";
  }
  const latest = sortEventsMostRecentFirstV4(events.filter((event) => event.claimId === claim.id))[0];
  if (latest?.status !== "verified") return undefined;
  const verifiedAt = latest.verifiedAt ?? latest.createdAt;
  return parseTimestamp(verifiedAt) === undefined
    ? `Claim validity cannot be evaluated because the verification time (${JSON.stringify(verifiedAt)}) is not an RFC 3339 timestamp with an offset.`
    : undefined;
}

/**
 * Status function "3" derives `stale` for a verified claim whose validity rule
 * cannot be evaluated; "2" leaves such rules outside its output contract. This
 * snapshot projection names the unevaluable rule and blocks on it under either
 * version, without changing the status result.
 */
function deriveUnevaluableValidityGap(input: {
  claim: Claim;
  evidence: Evidence[];
  events: VerificationEvent[];
  policy: VerificationPolicy;
  now: Date;
  statusFunctionVersion: StatusFunctionVersion;
}): TransparencyGap | undefined {
  const rule = input.policy.validityRule as { kind?: unknown; durationDays?: unknown };
  let message: string | undefined;

  // Version "4": the claim's own validity window comes first (Step 4a), and a
  // time it cannot read makes the claim stale. Name that cause, so the claim
  // is not explained as outdated or failed. Gated on "4": the "3" and "2"
  // projections are unchanged.
  const intrinsic = input.statusFunctionVersion === "4" ? unevaluableIntrinsicWindowV4(input.claim, input.events) : undefined;
  if (intrinsic !== undefined) {
    message = intrinsic;
  } else if (input.statusFunctionVersion === "4" && (input.claim.expiresAt !== undefined || input.claim.ttlSeconds !== undefined)) {
    // An evaluable intrinsic window overrides the policy rule, which is then not read.
    return undefined;
  } else if (rule.kind === "commit") {
    if (typeof input.claim.currentIntegrityRef !== "string" || input.claim.currentIntegrityRef.length === 0) {
      message = "Commit validity cannot be evaluated because currentIntegrityRef is missing.";
    }
  } else if (rule.kind === "duration") {
    if (
      typeof rule.durationDays !== "number" ||
      !Number.isFinite(rule.durationDays) ||
      // A negative window is a valid (immediately stale) "2" input and unevaluable under "3".
      (input.statusFunctionVersion !== "2" && rule.durationDays < 0)
    ) {
      message = "Duration validity cannot be evaluated because durationDays is missing or invalid.";
    } else {
      const verifiedEvent = governingVerifiedEvent(input.claim.id, input.events, input.statusFunctionVersion);
      const verifiedAt = verifiedEvent?.verifiedAt ?? verifiedEvent?.createdAt;
      // Version "4" reads the time as an RFC 3339 timestamp, as Step 4a does.
      const evaluable = (value: string): boolean =>
        input.statusFunctionVersion === "4" ? parseTimestamp(value) !== undefined : Number.isFinite(Date.parse(value));
      if (verifiedEvent !== undefined && (verifiedAt === undefined || !evaluable(verifiedAt))) {
        message = "Duration validity cannot be evaluated because the verification timestamp is invalid.";
      }
    }
  } else if (rule.kind !== "historical" && rule.kind !== "manual") {
    message = "Validity rule cannot be evaluated because its kind is not understood by this Surface version.";
  }

  if (!message) return undefined;
  if (intrinsic !== undefined) {
    return {
      id: `${input.claim.id}.gap.unevaluable-validity-rule`,
      claimId: input.claim.id,
      type: "policy_violation",
      severity: input.claim.impactLevel ?? input.policy.impactLevel,
      ...materialityFromClaim(input.claim),
      message,
      evidenceIds: input.evidence.map((item) => item.id),
      policyId: input.policy.id,
      blocking: true,
      createdAt: input.now.toISOString(),
      metadata: { source: "validity.unevaluable", validityWindow: input.claim.expiresAt !== undefined ? "expiresAt" : "ttlSeconds" },
    };
  }
  return {
    id: `${input.claim.id}.gap.unevaluable-validity-rule`,
    claimId: input.claim.id,
    type: "policy_violation",
    severity: input.claim.impactLevel ?? input.policy.impactLevel,
    ...materialityFromClaim(input.claim),
    message,
    evidenceIds: input.evidence.map((item) => item.id),
    policyId: input.policy.id,
    blocking: true,
    createdAt: input.now.toISOString(),
    metadata: {
      validityRuleKind: rule.kind,
    },
  };
}

function transparencyGapHintsFromEvidence(evidence: Evidence, claim: Claim, policyId: string, createdAt: string): TransparencyGap[] {
  const hints = evidence.metadata?.transparencyGapHints;
  if (!Array.isArray(hints)) return [];

  return hints
    .filter((hint): hint is Record<string, unknown> => typeof hint === "object" && hint !== null)
    .map((hint, index) => ({
      id: typeof hint.id === "string" ? hint.id : `${evidence.claimId}.gap.hint-${index + 1}`,
      claimId: evidence.claimId,
      type: isTransparencyGapType(hint.type) ? hint.type : "unsupported_inference",
      severity: isImpactLevel(hint.severity) ? hint.severity : "medium",
      ...materialityFromClaim(claim),
      message: typeof hint.message === "string" ? hint.message : "Evidence contains a transparency-gap hint.",
      evidenceIds: [evidence.id],
      policyId,
      blocking: typeof hint.blocking === "boolean" ? hint.blocking : true,
      createdAt,
      metadata: {
        source: "evidence.metadata.transparencyGapHints",
      },
    }));
}

function isTransparencyGapType(value: unknown): value is TransparencyGapType {
  return typeof value === "string" && TRANSPARENCY_GAP_TYPES.includes(value as TransparencyGapType);
}

function isImpactLevel(value: unknown): value is TransparencyGap["severity"] {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}

function materialityFromClaim(claim: Claim): Pick<TransparencyGap, "materiality"> | Record<string, never> {
  return claim.materiality === undefined ? {} : { materiality: claim.materiality };
}
