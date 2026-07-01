import type {
  Claim,
  ClaimGroupRollup,
  DerivationChangeRecord,
  DerivationCheckpoint,
  DerivedReportClaim,
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
import { statusFunctionVersion } from "./status.js";

export interface TrustSnapshotDerivation {
  claims: DerivedReportClaim[];
  evidenceRequirementsByClaimId: Record<string, EvidenceRequirement>;
  transparencyGaps: TransparencyGap[];
  changeRecords: DerivationChangeRecord[];
  subjectGroups: SubjectGroup[];
  claimGroupRollups: ClaimGroupRollup[];
}

export interface DeriveTrustSnapshotOptions {
  now?: Date;
  /**
   * Optional checkpoint enabling cost-bounded (tail-only) re-derivation. When
   * supplied, a claim with **no events newer than the checkpoint's high-water
   * mark** (`throughEventCreatedAt`) is not event-replayed at all: its
   * event-driven status is taken from the checkpoint (which already folded that
   * claim's full ledger), and only time-based freshness is re-applied against
   * `now`. A claim that DOES have tail events is fully re-folded. The status
   * function is pure, so the result is byte-identical to a full derivation for
   * the same `now`; the win is that the event fold only touches the tail.
   */
  since?: DerivationCheckpoint;
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
  const evidenceRequirementsByClaimId: Record<string, EvidenceRequirement> = {};
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
  const checkpointUsable =
    checkpoint !== undefined &&
    checkpoint.statusFunctionVersion === statusFunctionVersion &&
    perClaimMark !== undefined;

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
    const claimSeenByCheckpoint = checkpointUsable && perClaimMark ? claim.id in perClaimMark : false;

    const folded = foldClaim({
      claim,
      evidence,
      policies: input.policies,
      events: claimEvents,
      allEvents: input.events,
      authorityTrace: input.authorityTrace,
      now,
      checkpointStatus: checkpoint?.statusByClaimId[claim.id],
      checkpointUsable,
      checkpointSeenClaim: claimSeenByCheckpoint,
      checkpointMark: claimMark,
    });

    options.instrument?.({
      claimId: claim.id,
      eventsFolded: folded.eventsFolded,
      eventsTotal: folded.eventsTotal,
      fromCheckpoint: folded.fromCheckpoint,
    });
    ownStatusByClaimId.set(claim.id, folded.ownStatus);
    if (folded.policy) policyByClaimId.set(claim.id, folded.policy);
    if (folded.evidenceRequirement) evidenceRequirementsByClaimId[claim.id] = folded.evidenceRequirement;
    transparencyGaps.push(...folded.transparencyGaps);
    return folded;
  });

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
  };
}
