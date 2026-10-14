import type { AuthorityTrace, Claim, Evidence, TrustStatus, VerificationEvent, VerificationPolicy } from "./types.js";
import { type ClaimEvidenceEvaluation, evaluateClaimEvidence } from "./claim-evaluation.js";
import { evidenceEntailsClaim, partitionEvidenceBySupport } from "./evidence-support.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import { resolveStatusFunctionVersion, type StatusFunctionVersion } from "./status-function-version.js";
import { compareTimestamps, instantFromDate, parseTimestamp, type TimestampInstant } from "./timestamp.js";
import {
  claimEventsMostRecentFirst,
  effectivePolicy,
  findLatestResolutionEvent,
  parseInstant,
  TERMINAL_EVENT_STATUSES,
  verifiedBranchEvent,
  verifiedEventStaleReason,
} from "./status-rules.js";

export { claimIntrinsicExpiry, sortEventsMostRecentFirstV4, verifiedBranchEvent } from "./status-rules.js";

export {
  isSupportedStatusFunctionVersion,
  resolveStatusFunctionVersion,
  statusFunctionVersion,
  supportedStatusFunctionVersions,
  type StatusFunctionVersion,
} from "./status-function-version.js";


export function deriveTrustStatus(input: {
  claim: Claim;
  evidence: Evidence[];
  policy?: VerificationPolicy;
  events: VerificationEvent[];
  now?: Date;
  authorityTrace?: AuthorityTrace[];
  /**
   * The shared claim evidence evaluation for this claim, when the caller has
   * already computed it (the snapshot pipeline does, once, in `foldClaim`).
   * Omitted by standalone callers (`deriveClaimStatus`), in which case the
   * verified-path requirement check computes an evaluation on demand from the
   * entailing evidence. Either way the requirement decision is identical.
   */
  evaluation?: ClaimEvidenceEvaluation;
  /**
   * Skip the time-based staleness test on the verified-event branch. The result
   * is the claim's own status with time left out; `applyVerifiedStaleness`
   * re-applies time to it exactly. Used to store checkpoint statuses.
   */
  ignoreVerifiedStaleness?: boolean;
  /** Which status function version to evaluate. Defaults to the current version. */
  statusFunctionVersion?: StatusFunctionVersion;
}): TrustStatus {
  const version = resolveStatusFunctionVersion(input.statusFunctionVersion);
  const v3 = version !== "2";
  const now = input.now ?? new Date();
  if (v3) assertValidNow(now);
  // v3 effective policy: a policy that requires nothing is no policy to the fold.
  const policy = effectivePolicy(input.policy, version);
  const claimEvents = claimEventsMostRecentFirst(input.claim, input.events, version);
  const latestEvent = claimEvents[0];

  // ADR 0003 §8: check for an authority-gated dispute-resolution event.
  // The most-recent resolution event whose actor has an active AuthorityTrace
  // covering the subject supersedes the normal fold — unless newer blocking
  // evidence re-opens the dispute.
  const resolutionEvent = findLatestResolutionEvent(claimEvents, input.authorityTrace ?? [], version);
  if (resolutionEvent !== undefined) {
    const hasNewerBlockingFailure = version === "4"
      ? hasNewerBlockingFailureV4(input.evidence, resolutionEvent)
      : input.evidence.some(
        (ev) =>
          ev.passing === false &&
          ev.blocking !== false &&
          Date.parse(ev.observedAt) > Date.parse(resolutionEvent.createdAt),
      );
    if (hasNewerBlockingFailure) {
      return "disputed";
    }
    // v3: without a policy nothing defines what `verified` requires, so a
    // resolution cannot establish it.
    if (v3 && resolutionEvent.status === "verified" && !policy) {
      return "proposed";
    }
    return resolutionEvent.status;
  }

  // An explicit invalidation event (Hachure schema 4, type: "invalidation") is
  // terminal: it asserts the claim is no longer good. A "revoked" status
  // derives "stale" (event-driven staleness). An invalidation event whose
  // status is not itself a terminal "no-longer-good" status still collapses to
  // "stale". Other terminal statuses pass through unchanged. This is the v3
  // rule; this implementation already applied it under "2".
  if (latestEvent && latestEvent.type === "invalidation") {
    return TERMINAL_EVENT_STATUSES.has(latestEvent.status) && latestEvent.status !== "revoked"
      ? latestEvent.status
      : "stale";
  }
  if (latestEvent && TERMINAL_EVENT_STATUSES.has(latestEvent.status)) {
    return latestEvent.status === "revoked" ? "stale" : latestEvent.status;
  }

  if (latestEvent?.status === "assumed") {
    return "assumed";
  }

  if (latestEvent?.status === "verified") {
    // 4a. Staleness.
    if (!input.ignoreVerifiedStaleness && isVerifiedEventStale(latestEvent, input.claim, input.evidence, policy, now, version)) {
      return "stale";
    }

    const hasBlockingFailure = input.evidence.some((evidence) => evidence.passing === false && evidence.blocking !== false);
    const requirementUnmet = (resolved: VerificationPolicy): boolean => {
      if (input.evaluation !== undefined && input.evaluation.statusFunctionVersion !== version) {
        throw new RangeError(
          `claim evidence evaluation was computed for statusFunctionVersion ${input.evaluation.statusFunctionVersion}, not ${version}`,
        );
      }
      const evaluation = input.evaluation ?? evaluateClaimEvidence({
        entailingEvidence: input.evidence.filter(evidenceEntailsClaim),
        policy: resolved,
        statusFunctionVersion: version,
      });
      return evaluation.requirementUnmet;
    };

    if (v3) {
      // 4b. A blocking failure is evaluated before the requirements, so a failed
      // check that also leaves a requirement unmet derives `disputed`.
      if (hasBlockingFailure) return "disputed";
      // 4c. No effective policy: nothing defines what `verified` requires.
      if (!policy) return "proposed";
      if (requirementUnmet(policy)) return "proposed";
      // 4d.
      return "verified";
    }

    // Version "2": requirements first, skipped when no policy resolved.
    if (policy && requirementUnmet(policy)) {
      return "proposed";
    }
    if (hasBlockingFailure) {
      return "disputed";
    }
    return "verified";
  }

  if (input.claim.status === "proposed") {
    return "proposed";
  }

  if (input.claim.status === "assumed") {
    return "assumed";
  }

  if (!policy) {
    return input.evidence.length > 0 ? "proposed" : "unknown";
  }

  const evidenceTypes = new Set(input.evidence.map((evidence) => evidence.evidenceType));
  const hasRequiredEvidence = policy.requiredEvidence.every((type) => evidenceTypes.has(type));
  return hasRequiredEvidence ? "proposed" : "unknown";
}

/**
 * Version "4" Step 1: an entailing blocking failure is newer than the
 * resolution when its `observedAt` is later, or when `observedAt` is not a
 * timestamp: a failure that cannot be shown to predate the resolution is not
 * set aside by it. The resolution's own time is always a timestamp here.
 */
function hasNewerBlockingFailureV4(evidence: Evidence[], resolutionEvent: VerificationEvent): boolean {
  const resolutionAt = parseTimestamp(resolutionEvent.createdAt) as TimestampInstant;
  return evidence.some((item) => {
    if (item.passing !== false || item.blocking === false) return false;
    const observedAt = parseTimestamp(item.observedAt);
    return observedAt === undefined || compareTimestamps(observedAt, resolutionAt) > 0;
  });
}

/** v3: every freshness comparison needs `now`; a NaN comparison would read as "not stale". */
function assertValidNow(now: Date): void {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError(`invalid now: ${String(now)}`);
  }
}

/**
 * Re-apply ONLY the time-based staleness of an already-`verified`/`stale` claim
 * against a new `now`, without re-folding the claim's event ledger. Used by the
 * checkpoint (tail-only) derivation path: when a claim has no events newer than
 * the checkpoint high-water mark, its verified/stale boundary is the only status
 * input that can move as the wall clock advances. Returns the re-applied status
 * (`verified` or `stale`); any other prior status passes through unchanged.
 *
 * The governing verified event (anchor for `ttlSeconds` and the policy duration
 * window) is taken from the unchanged ledger. Time is re-applied only when that
 * status came from the latest event being a `verified` event: a `stale` from a
 * revocation or invalidation, or a status set by an authorized dispute
 * resolution, does not move with the clock and passes through unchanged.
 *
 * A prior `stale` can hide a `proposed` or `disputed` outcome that reappears
 * when `now` moves back before the expiry, and a prior `proposed`/`disputed`
 * cannot become `stale` here. Derivation from a checkpoint therefore uses
 * `applyVerifiedStaleness` on an untimed status instead.
 */
/**
 * Re-apply time to a status derived with `ignoreVerifiedStaleness`. On the
 * verified-event branch the staleness test precedes every other outcome, so the
 * result is `stale` when the governing event is stale at `now` and the untimed
 * status otherwise. Off that branch the status does not depend on `now`. The
 * result equals `deriveTrustStatus` for the same inputs and `now`.
 */
export function applyVerifiedStaleness(input: {
  untimedStatus: TrustStatus;
  claim: Claim;
  evidence: Evidence[];
  events: VerificationEvent[];
  policy?: VerificationPolicy;
  now: Date;
  authorityTrace?: AuthorityTrace[];
  /** Must be the version the untimed status was derived with. Defaults to the current version. */
  statusFunctionVersion?: StatusFunctionVersion;
}): TrustStatus {
  const version = resolveStatusFunctionVersion(input.statusFunctionVersion);
  if (version !== "2") assertValidNow(input.now);
  const governing = verifiedBranchEvent(input.claim, input.events, input.authorityTrace, version);
  if (governing === undefined) return input.untimedStatus;
  return isVerifiedEventStale(governing, input.claim, input.evidence, effectivePolicy(input.policy, version), input.now, version)
    ? "stale"
    : input.untimedStatus;
}

export function reapplyVerifiedFreshness(input: {
  priorStatus: TrustStatus;
  claim: Claim;
  evidence: Evidence[];
  events: VerificationEvent[];
  policy?: VerificationPolicy;
  now: Date;
  /** Needed to recognise an authorized dispute resolution, which takes precedence over time. */
  authorityTrace?: AuthorityTrace[];
  /** Must be the version the prior status was derived with. Defaults to the current version. */
  statusFunctionVersion?: StatusFunctionVersion;
}): TrustStatus {
  const version = resolveStatusFunctionVersion(input.statusFunctionVersion);
  if (version !== "2") assertValidNow(input.now);
  if (input.priorStatus !== "verified" && input.priorStatus !== "stale") return input.priorStatus;
  const governing = verifiedBranchEvent(input.claim, input.events, input.authorityTrace, version);
  if (governing === undefined) return input.priorStatus;
  return isVerifiedEventStale(governing, input.claim, input.evidence, effectivePolicy(input.policy, version), input.now, version)
    ? "stale"
    : "verified";
}

/**
 * Step 4a. `policy` is the effective policy and `evidence` the entailing
 * evidence. Under "3" every input the check needs must be present and
 * evaluable; an unevaluable window or rule is stale.
 */
function isVerifiedEventStale(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
  version: StatusFunctionVersion,
): boolean {
  return verifiedEventStaleReason(event, claim, evidence, policy, now, version) !== undefined;
}

// ---------------------------------------------------------------------------
// requiresActiveAuthority helper — exported for use in inquiry evaluation
// ---------------------------------------------------------------------------

/**
 * Outcome of an active-authority check for a single actor.
 * - "active": at least one AuthorityTrace covers the actor and is currently valid.
 * - "no-trace": no AuthorityTrace record exists for this actor.
 * - "expired": a trace was found but validUntil is in the past at `now`.
 * - "revoked": a trace was found but revokedAt is before or at `now`.
 */
export type AuthorityCheckResult = "active" | "no-trace" | "expired" | "revoked";

/**
 * Check whether `actorRef` has at least one AuthorityTrace that is active at
 * `now`.  Returns the first problem encountered when no trace is valid.
 *
 * Precedence of failure reasons: revoked > expired > no-trace.
 *
 * Trace bounds are compared with `now` as instants, never as strings (#320).
 * How a bound is read follows the status function version, as in Step 1:
 * under "4" (the default) a bound must be an RFC 3339 timestamp, and one that
 * is present but is not makes the trace not active (an unreadable `revokedAt`
 * counts as revoked, an unreadable `validUntil` / `validFrom` as expired);
 * under "3" and "2" a bound is read with `Date.parse`, and one that cannot be
 * parsed excludes nothing.
 */
export function checkAuthorityActive(
  actorRef: string,
  authorityTrace: AuthorityTrace[],
  now: Date,
  options: { statusFunctionVersion?: StatusFunctionVersion } = {},
): AuthorityCheckResult {
  const version = resolveStatusFunctionVersion(options.statusFunctionVersion);
  const actorTraces = authorityTrace.filter((t) => t.actorRef === actorRef);
  if (actorTraces.length === 0) return "no-trace";

  // order(bound): negative when the bound is earlier than `now`, positive when
  // later, 0 when equal; undefined when the bound cannot be read.
  let order: (bound: string) => number | undefined;
  if (version === "4") {
    const nowInstant = instantFromDate(now) as TimestampInstant;
    order = (bound) => {
      const time = parseTimestamp(bound);
      return time === undefined ? undefined : compareTimestamps(time, nowInstant);
    };
  } else {
    const nowMs = now.getTime();
    order = (bound) => {
      const time = parseInstant(bound);
      return time === undefined || !Number.isFinite(nowMs) ? undefined : Math.sign(time - nowMs);
    };
  }
  // Under "4" an unreadable bound fails closed; under "3" and "2" it excludes nothing.
  const fails = (bound: string | undefined, failing: (o: number) => boolean): boolean => {
    // Absent is no bound. A present but empty string is unreadable: under "4"
    // it fails closed, under "3" and "2" Date.parse("") is NaN and excludes
    // nothing, as Step 1 reads it.
    if (bound === undefined) return false;
    const o = order(bound);
    return o === undefined ? version === "4" : failing(o);
  };

  let sawRevoked = false;
  let sawExpired = false;

  for (const trace of actorTraces) {
    if (fails(trace.revokedAt, (o) => o <= 0)) {
      sawRevoked = true;
      continue;
    }
    if (fails(trace.validUntil, (o) => o < 0)) {
      sawExpired = true;
      continue;
    }
    if (fails(trace.validFrom, (o) => o > 0)) {
      // Not yet valid — treat as expired for UI purposes
      sawExpired = true;
      continue;
    }
    // This trace is active
    return "active";
  }

  if (sawRevoked) return "revoked";
  if (sawExpired) return "expired";
  return "no-trace";
}

// ---------------------------------------------------------------------------
// ADR 0003 step 2 — versioned pure status function
// ---------------------------------------------------------------------------

/**
 * The result shape returned by deriveClaimStatus.
 */
export interface ClaimStatusResult {
  status: TrustStatus;
  policyId: string | undefined;
}

/**
 * Pure, versioned function: given a claim and the surrounding bundle data,
 * return the derived status.  This is the canonical implementation of
 *   status = f(claim, events, policy, now)
 * as specified in ADR 0003 §7.
 *
 * This is the claim's own status: the derivation ceiling needs the whole
 * bundle and is applied by `deriveTrustSnapshot` / `buildTrustReport`.
 *
 * Unlike deriveTrustStatus (which takes a pre-resolved single policy),
 * deriveClaimStatus accepts the full policies array and resolves the policy
 * internally — making it self-contained and usable outside the snapshot pipeline.
 */
export function deriveClaimStatus(args: {
  claim: Claim;
  evidence: Evidence[];
  events: VerificationEvent[];
  policies: VerificationPolicy[];
  now?: Date;
  authorityTrace?: AuthorityTrace[];
  /** Which status function version to evaluate. Defaults to the current version. */
  statusFunctionVersion?: StatusFunctionVersion;
}): ClaimStatusResult {
  const version = resolveStatusFunctionVersion(args.statusFunctionVersion);
  const now = args.now ?? new Date();
  const policy = resolvePolicyForClaim(args.claim, args.policies, { statusFunctionVersion: version });
  const { entailingEvidence } = partitionEvidenceBySupport(args.evidence);
  const status = deriveTrustStatus({
    claim: args.claim,
    evidence: entailingEvidence,
    policy,
    events: args.events,
    now,
    authorityTrace: args.authorityTrace,
    statusFunctionVersion: version,
  });
  return { status, policyId: policy?.id };
}
