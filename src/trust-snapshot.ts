import type {
  Claim,
  ClaimGroupRollup,
  DerivationChangeRecord,
  DerivationCheckpoint,
  DerivedReportClaim,
  Evidence,
  EvidenceRequirement,
  SubjectGroup,
  TransparencyGap,
  TrustBundle,
  TrustStatus,
  VerificationEvent,
  VerificationPolicy,
} from "./types.js";
import { foldClaim } from "./claim-fold.js";
import { deriveClaimGroupRollups } from "./claim-groups.js";
import { deriveConflictTransparencyGaps } from "./conflict-derivation.js";
import { applyDerivation } from "./derivation.js";
import { buildIdentityIndex } from "./identity.js";
import { canonicalJson, sha256Hex } from "./canonical-digest.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import { resolveStatusFunctionVersion, type StatusFunctionVersion } from "./status-function-version.js";
import { deriveWaiverValidity, type WaiverValidity } from "./waiver.js";

export interface TrustSnapshotDerivation {
  claims: DerivedReportClaim[];
  evidenceRequirementsByClaimId: Record<string, EvidenceRequirement>;
  transparencyGaps: TransparencyGap[];
  changeRecords: DerivationChangeRecord[];
  subjectGroups: SubjectGroup[];
  claimGroupRollups: ClaimGroupRollup[];
  /**
   * Per-claim waiver validity verdict, keyed by claim id (mirrors
   * `evidenceRequirementsByClaimId`'s sibling-map shape). Additive TS-only
   * output — not yet declared in the vendored Hachure JSON schema (see
   * `docs/reference/waiver-validity.md`).
   */
  waiverValidityByClaimId: Record<string, WaiverValidity>;
  /** Per-claim checkpoint input digest (see `DerivationCheckpoint.inputDigestByClaimId`). */
  inputDigestByClaimId: Record<string, string>;
  /** Per-claim untimed own status (see `DerivationCheckpoint.untimedOwnStatusByClaimId`). */
  untimedOwnStatusByClaimId: Record<string, TrustStatus>;
}

export interface DeriveTrustSnapshotOptions {
  now?: Date;
  /**
   * Optional checkpoint enabling cost-bounded (tail-only) re-derivation. When
   * supplied, a claim whose status inputs are unchanged since the checkpoint
   * (its `inputDigestByClaimId` entry matches: same claim, evidence, events,
   * resolved policy and authority trace) and that has **no events newer than
   * the checkpoint's per-claim high-water mark** is not event-replayed at all:
   * its untimed own status is taken from the checkpoint, time is re-applied
   * against `now` (earlier or later than the checkpoint), and the derivation
   * ceiling is applied from the current input statuses. Any other claim is fully re-folded, and a
   * checkpoint without input digests replays every claim. The result is
   * identical to a full derivation for the same `now`.
   */
  since?: DerivationCheckpoint;
  /**
   * Which status function version to evaluate. Defaults to the current
   * version; "2" re-derives a bundle as it derived before version "3". A
   * checkpoint produced under another version is not used.
   */
  statusFunctionVersion?: StatusFunctionVersion;
  /**
   * Instrumentation hook (testing/observability). Invoked once per claim with
   * how many of that claim's events were actually folded for the event-driven
   * status fold (the whole ledger for a full derivation; only the tail — often
   * zero — under a matching checkpoint). Lets callers prove tail-only behaviour.
   */
  instrument?: (probe: SnapshotEventProbe) => void;
}

export interface SnapshotEventProbe {
  claimId: string;
  /** Events for this claim folded by the event-driven status function. */
  eventsFolded: number;
  /** Total events for this claim present in the bundle. */
  eventsTotal: number;
  /** True when the checkpoint short-circuited this claim's event fold. */
  fromCheckpoint: boolean;
}

export function deriveTrustSnapshot(input: TrustBundle, options: DeriveTrustSnapshotOptions = {}): TrustSnapshotDerivation {
  const now = options.now ?? new Date();
  const statusFunctionVersion = resolveStatusFunctionVersion(options.statusFunctionVersion);
  if (statusFunctionVersion !== "2" && !Number.isFinite(now.getTime())) {
    // Status function "3": no freshness comparison is possible with an invalid `now`.
    throw new RangeError(`invalid now: ${String(now)}`);
  }
  // Null-prototype map: a claim id of `__proto__`, `toString`, or `constructor`
  // must become an ordinary own key, never resolve through the prototype chain
  // (mirrors `waiverValidityByClaimId` below; #127).
  const evidenceRequirementsByClaimId: Record<string, EvidenceRequirement> = Object.create(null);
  const transparencyGaps: TransparencyGap[] = [];
  const changeRecords: DerivationChangeRecord[] = [];
  const identityIndex = buildIdentityIndex(input);
  const policyByClaimId = new Map<string, VerificationPolicy>();

  // Index events by claim once so a single claim's fold (and the cheap
  // "does this claim have any tail events?" check) is O(events for that claim),
  // not O(whole ledger) per claim.
  const eventsByClaimId = new Map<string, VerificationEvent[]>();
  for (const event of input.events) {
    const list = eventsByClaimId.get(event.claimId);
    if (list) list.push(event);
    else eventsByClaimId.set(event.claimId, [event]);
  }

  const checkpoint = options.since;
  // A checkpoint is only usable for a tail-only fold when (a) it was produced by
  // the same status-function version (else the recorded statuses may not be
  // re-derivable under current semantics) AND (b) it carries the PER-CLAIM
  // high-water marks. A global mark alone is unsafe: an event can land for one
  // claim with a createdAt older than the global max but newer than that claim's
  // own last folded event, and would be silently dropped from the tail. Legacy
  // checkpoints without the per-claim map fall back to full replay.
  const perClaimMark = checkpoint?.throughEventCreatedAtByClaimId;
  const checkpointDigests = checkpoint?.inputDigestByClaimId;
  const checkpointOwnStatuses = checkpoint?.untimedOwnStatusByClaimId;
  // (c) A checkpoint must also carry per-claim input digests and own statuses:
  // without them an evidence, policy or input-claim change since the checkpoint
  // is invisible, so such checkpoints replay in full.
  const checkpointUsable =
    checkpoint !== undefined &&
    checkpoint.statusFunctionVersion === statusFunctionVersion &&
    perClaimMark !== undefined &&
    checkpointDigests !== undefined &&
    checkpointOwnStatuses !== undefined;
  const authorityTraceDigest = sha256Hex(canonicalJson(input.authorityTrace ?? []));
  const inputDigestByClaimId: Record<string, string> = Object.create(null);
  const untimedOwnStatusByClaimId: Record<string, TrustStatus> = Object.create(null);

  const ownStatusByClaimId = new Map<string, TrustStatus>();
  const claimsById = new Map<string, Claim>();
  const foldedClaims = input.claims.map((claim) => {
    claimsById.set(claim.id, claim);
    const evidence = input.evidence.filter((item) => item.claimId === claim.id);
    const claimEvents = eventsByClaimId.get(claim.id) ?? [];
    const claimMarkIso = checkpointUsable && perClaimMark
      ? (claim.id in perClaimMark ? perClaimMark[claim.id] : undefined)
      : undefined;
    const claimMark = typeof claimMarkIso === "string" ? Date.parse(claimMarkIso) : undefined;
    const inputDigest = claimInputDigest(claim, evidence, claimEvents, resolvePolicyForClaim(claim, input.policies, { statusFunctionVersion }), authorityTraceDigest);
    inputDigestByClaimId[claim.id] = inputDigest;
    const claimSeenByCheckpoint = checkpointUsable && perClaimMark
      ? Object.hasOwn(perClaimMark, claim.id) &&
        Object.hasOwn(checkpointDigests!, claim.id) &&
        checkpointDigests![claim.id] === inputDigest
      : false;

    const folded = foldClaim({
      claim,
      evidence,
      policies: input.policies,
      events: claimEvents,
      allEvents: input.events,
      authorityTrace: input.authorityTrace,
      now,
      checkpointStatus: claimSeenByCheckpoint && Object.hasOwn(checkpointOwnStatuses!, claim.id)
        ? checkpointOwnStatuses![claim.id]
        : undefined,
      checkpointUsable,
      checkpointSeenClaim: claimSeenByCheckpoint,
      checkpointMark: claimMark,
      statusFunctionVersion,
    });

    options.instrument?.({
      claimId: claim.id,
      eventsFolded: folded.eventsFolded,
      eventsTotal: folded.eventsTotal,
      fromCheckpoint: folded.fromCheckpoint,
    });
    ownStatusByClaimId.set(claim.id, folded.ownStatus);
    untimedOwnStatusByClaimId[claim.id] = folded.untimedOwnStatus;
    if (folded.policy) policyByClaimId.set(claim.id, folded.policy);
    if (folded.evidenceRequirement) evidenceRequirementsByClaimId[claim.id] = folded.evidenceRequirement;
    transparencyGaps.push(...folded.transparencyGaps);
    return folded;
  });

  // Null-prototype map: a claim id of `__proto__`, `toString`, or
  // `constructor` must become an ordinary own key, never resolve through the
  // prototype chain. (`evidenceRequirementsByClaimId` above uses the same
  // guard — #127.)
  const waiverValidityByClaimId: Record<string, WaiverValidity> = Object.create(null);
  const claims = foldedClaims.map((folded) => {
    const outcome = applyDerivation({
      claim: folded.claim,
      ownStatus: folded.ownStatus,
      ownStatusByClaimId,
      claimsById,
      now,
    });
    transparencyGaps.push(...outcome.transparencyGaps);
    changeRecords.push(...outcome.changeRecords);
    const derived = outcome.status;
    const output: DerivedReportClaim = {
      ...folded.claim,
      status: derived,
      freshness: folded.freshnessForStatus(derived),
    };
    if (folded.producerStatus !== undefined && folded.producerStatus !== derived) {
      output.producerStatus = folded.producerStatus;
    }
    waiverValidityByClaimId[folded.claim.id] = deriveWaiverValidity({
      claim: folded.claim,
      status: derived,
      evidence: folded.evidence,
    });
    return output;
  });

  transparencyGaps.push(...deriveConflictTransparencyGaps({
    claims,
    policyByClaimId,
    canonicalKeyForClaim: (claim) => identityIndex.canonicalKeyForClaim(claim),
    now,
  }));

  return {
    claims,
    evidenceRequirementsByClaimId,
    transparencyGaps,
    changeRecords,
    subjectGroups: identityIndex.groups,
    claimGroupRollups: deriveClaimGroupRollups({ claimGroups: input.claimGroups, claims }),
    waiverValidityByClaimId,
    inputDigestByClaimId,
    untimedOwnStatusByClaimId,
  };
}

/**
 * Digest of every input a claim's own status is folded from. Evidence and
 * events keep their bundle order: a reorder only costs a re-fold.
 */
function claimInputDigest(
  claim: Claim,
  evidence: Evidence[],
  events: VerificationEvent[],
  policy: VerificationPolicy | undefined,
  authorityTraceDigest: string,
): string {
  return `sha256:${sha256Hex(canonicalJson({ claim, evidence, events, policy: policy ?? null, authorityTraceDigest }))}`;
}
