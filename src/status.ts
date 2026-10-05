import type { AuthorityTrace, Claim, Evidence, TrustStatus, VerificationEvent, VerificationPolicy } from "./types.js";
import { type ClaimEvidenceEvaluation, evaluateClaimEvidence, policyRequiresSomething } from "./claim-evaluation.js";
import { evidenceEntailsClaim, partitionEvidenceBySupport } from "./evidence-support.js";
import { resolvePolicyForClaim } from "./policy-resolver.js";
import { resolveStatusFunctionVersion, type StatusFunctionVersion } from "./status-function-version.js";
import { compareTimestamps, instantFromDate, laterThanWindowEnd, parseTimestamp, type TimestampInstant } from "./timestamp.js";

export {
  isSupportedStatusFunctionVersion,
  resolveStatusFunctionVersion,
  statusFunctionVersion,
  supportedStatusFunctionVersions,
  type StatusFunctionVersion,
} from "./status-function-version.js";

const TERMINAL_EVENT_STATUSES = new Set<TrustStatus>(["rejected", "disputed", "superseded", "stale", "revoked"]);

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
 * The claim's events, most recent first by `createdAt`. Under "4" times are
 * exact instants and an event whose `createdAt` is not a timestamp sorts
 * before (older than) every event whose time is one. Under "3" an unparseable
 * `createdAt` sorts as epoch 0, so the order is defined; under "2" such an
 * event compares as NaN and the order is whatever the sort makes of it. Equal
 * times keep their order in `events` (the sort is stable).
 */
function claimEventsMostRecentFirst(
  claim: Claim,
  events: VerificationEvent[],
  version: StatusFunctionVersion,
): VerificationEvent[] {
  const claimEvents = events.filter((event) => event.claimId === claim.id);
  if (version === "2") {
    return claimEvents.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
  if (version === "4") return sortEventsMostRecentFirstV4(claimEvents);
  return claimEvents.sort((a, b) => (parseInstant(b.createdAt) ?? 0) - (parseInstant(a.createdAt) ?? 0));
}

/** Version "4" event order: exact instants; an unevaluable `createdAt` is the oldest. */
export function sortEventsMostRecentFirstV4<T extends { createdAt: string }>(events: T[]): T[] {
  const at = new Map(events.map((event) => [event, parseTimestamp(event.createdAt)]));
  return events.sort((a, b) => {
    const ta = at.get(a);
    const tb = at.get(b);
    if (ta === undefined || tb === undefined) return Number(ta === undefined) - Number(tb === undefined);
    return compareTimestamps(tb, ta);
  });
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

/** Epoch ms, or undefined when the value is not a parseable instant. */
function parseInstant(value: unknown): number | undefined {
  const time = Date.parse(value as string);
  return Number.isNaN(time) ? undefined : time;
}

/** v3: every freshness comparison needs `now`; a NaN comparison would read as "not stale". */
function assertValidNow(now: Date): void {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError(`invalid now: ${String(now)}`);
  }
}

/**
 * The policy the fold evaluates. Under "3" a resolved policy that requires no
 * evidence type and no method is treated as if no policy had been resolved.
 */
function effectivePolicy(
  policy: VerificationPolicy | undefined,
  version: StatusFunctionVersion,
): VerificationPolicy | undefined {
  if (version === "2" || policy === undefined) return policy;
  return policyRequiresSomething(policy) ? policy : undefined;
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
 * The latest event of the claim when `deriveTrustStatus` decides the claim on
 * its verified-event branch (the only branch that reads `now`): the latest
 * event is a `verified` event that is not an invalidation, and no authorized
 * dispute resolution governs. Undefined otherwise.
 */
export function verifiedBranchEvent(
  claim: Claim,
  events: VerificationEvent[],
  authorityTrace: AuthorityTrace[] = [],
  /** Defaults to the current version. */
  statusFunctionVersion?: StatusFunctionVersion,
): VerificationEvent | undefined {
  const version = resolveStatusFunctionVersion(statusFunctionVersion);
  const claimEvents = claimEventsMostRecentFirst(claim, events, version);
  const latestEvent = claimEvents[0];
  if (
    latestEvent === undefined ||
    latestEvent.status !== "verified" ||
    latestEvent.type === "invalidation" ||
    findLatestResolutionEvent(claimEvents, authorityTrace, version) !== undefined
  ) {
    return undefined;
  }
  return latestEvent;
}

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
  if (version === "4") return isVerifiedEventStaleV4(event, claim, evidence, policy, now);
  if (version !== "2") return isVerifiedEventStaleV3(event, claim, evidence, policy, now);

  // Claim-intrinsic validity window (Hachure schema 4) overrides policy timing
  // when present. expiresAt is canonical; ttlSeconds is the relative fallback,
  // resolved against the governing event's verifiedAt (fallback createdAt).
  const intrinsic = claimIntrinsicExpiry(event, claim);
  if (intrinsic !== undefined) {
    return now.getTime() > intrinsic;
  }

  if (!policy) {
    return false;
  }

  if (policy.validityRule.kind === "commit") {
    if (!claim.currentIntegrityRef) {
      return false;
    }
    const eventEvidenceRefs = new Set(
      evidence
        .filter((item) => event.evidenceIds.includes(item.id))
        .map((item) => item.integrityRef)
        .filter((item): item is string => typeof item === "string" && item.length > 0),
    );
    return !eventEvidenceRefs.has(claim.currentIntegrityRef);
  }

  if (policy.validityRule.kind !== "duration") {
    return false;
  }

  const verifiedAt = event.verifiedAt ?? event.createdAt;
  const verifiedTime = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedTime) || typeof policy.validityRule.durationDays !== "number") {
    return false;
  }

  const expiresAt = verifiedTime + policy.validityRule.durationDays * 24 * 60 * 60 * 1000;
  return expiresAt < now.getTime();
}

function isVerifiedEventStaleV3(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
): boolean {
  const nowMs = now.getTime();
  const verifiedTime = Date.parse(event.verifiedAt ?? event.createdAt);

  // Claim-intrinsic validity window; `expiresAt` wins over `ttlSeconds`.
  if (claim.expiresAt !== undefined) {
    const expiry = Date.parse(claim.expiresAt);
    return !Number.isFinite(expiry) || nowMs > expiry;
  }
  if (claim.ttlSeconds !== undefined) {
    const ttl: unknown = claim.ttlSeconds;
    if (!Number.isFinite(verifiedTime) || typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 0) return true;
    return nowMs > verifiedTime + ttl * 1000;
  }

  // No effective policy: not stale here; the requirement step caps the result at `proposed`.
  if (!policy) return false;

  const rule = policy.validityRule as { kind?: unknown; durationDays?: unknown } | undefined;
  switch (rule?.kind) {
    case "commit": {
      // Without a current integrity reference there is nothing to compare the
      // verified evidence against.
      if (claim.currentIntegrityRef === undefined) return true;
      const linkedIds = event.evidenceIds ?? [];
      return !evidence.some((item) => linkedIds.includes(item.id) && item.integrityRef === claim.currentIntegrityRef);
    }
    case "duration": {
      const days = rule.durationDays;
      if (typeof days !== "number" || !Number.isFinite(days) || days < 0) return true;
      if (!Number.isFinite(verifiedTime)) return true;
      return nowMs > verifiedTime + days * 86_400_000;
    }
    case "historical":
    case "manual":
      return false;
    default:
      // Absent or unknown kind: the rule cannot be evaluated.
      return true;
  }
}

/**
 * Version "4" Step 4a: the version "3" rule with every time read as a
 * timestamp and every comparison exact. A validity window is the exact decimal
 * product of `ttlSeconds` (or `durationDays`) and its unit, never a
 * floating-point sum.
 */
function isVerifiedEventStaleV4(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
): boolean {
  const nowInstant = instantFromDate(now) as TimestampInstant;
  const verifiedTime = parseTimestamp(event.verifiedAt ?? event.createdAt);
  const evaluable = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

  if (claim.expiresAt !== undefined) {
    const expiry = parseTimestamp(claim.expiresAt);
    return expiry === undefined || compareTimestamps(nowInstant, expiry) > 0;
  }
  if (claim.ttlSeconds !== undefined) {
    if (verifiedTime === undefined || !evaluable(claim.ttlSeconds)) return true;
    return laterThanWindowEnd(nowInstant, verifiedTime, claim.ttlSeconds, 1000);
  }

  if (!policy) return false;

  const rule = policy.validityRule as { kind?: unknown; durationDays?: unknown } | undefined;
  switch (rule?.kind) {
    case "commit": {
      if (claim.currentIntegrityRef === undefined) return true;
      const linkedIds = event.evidenceIds ?? [];
      return !evidence.some((item) => linkedIds.includes(item.id) && item.integrityRef === claim.currentIntegrityRef);
    }
    case "duration": {
      if (!evaluable(rule.durationDays) || verifiedTime === undefined) return true;
      return laterThanWindowEnd(nowInstant, verifiedTime, rule.durationDays, 86_400_000);
    }
    case "historical":
    case "manual":
      return false;
    default:
      return true;
  }
}

/**
 * Resolve the claim-intrinsic validity window to an absolute expiry epoch (ms),
 * or undefined when the claim declares no intrinsic window (Hachure schema 4).
 *
 * Precedence: `expiresAt` (absolute) wins over `ttlSeconds` (relative). When
 * `ttlSeconds` is used, it is resolved against the governing event's
 * `verifiedAt` (fallback `createdAt`), falling back to the claim's `updatedAt`
 * when no event is supplied.
 */
export function claimIntrinsicExpiry(
  event: VerificationEvent | undefined,
  claim: Claim,
): number | undefined {
  if (typeof claim.expiresAt === "string" && claim.expiresAt.length > 0) {
    const t = Date.parse(claim.expiresAt);
    return Number.isFinite(t) ? t : undefined;
  }
  if (typeof claim.ttlSeconds === "number" && Number.isFinite(claim.ttlSeconds)) {
    const anchorIso = event?.verifiedAt ?? event?.createdAt ?? claim.updatedAt;
    const anchor = Date.parse(anchorIso);
    if (!Number.isFinite(anchor)) return undefined;
    return anchor + claim.ttlSeconds * 1000;
  }
  return undefined;
}


// ---------------------------------------------------------------------------
// ADR 0003 §8 — authority-gated dispute resolution helper
// ---------------------------------------------------------------------------

/**
 * Returns the most-recent dispute-resolution event whose actor has an active
 * AuthorityTrace covering the claim's subject at the given instant.
 * Returns undefined if no such event exists.
 */
function findLatestResolutionEvent(
  claimEventsMostRecentFirst: VerificationEvent[],
  authorityTrace: AuthorityTrace[],
  version: StatusFunctionVersion,
): VerificationEvent | undefined {
  for (const event of claimEventsMostRecentFirst) {
    if (event.resolvesDispute !== true) continue;
    if (isResolutionAuthorized(event, authorityTrace, version)) return event;
  }
  return undefined;
}

/**
 * Version "4" Step 1: a resolution needs a `createdAt` that is a timestamp,
 * and an actor with a trace active at that instant. Each trace bound that is
 * present must be a timestamp and must hold; a trace that is not active
 * neither authorises the resolution nor vetoes it.
 */
function isResolutionAuthorizedV4(event: VerificationEvent, authorityTrace: AuthorityTrace[]): boolean {
  const at = parseTimestamp(event.createdAt);
  if (at === undefined) return false;
  const holds = (bound: string | undefined, test: (order: number) => boolean): boolean => {
    if (bound === undefined) return true;
    const time = parseTimestamp(bound);
    return time !== undefined && test(compareTimestamps(time, at));
  };
  return authorityTrace.some((trace) =>
    trace.actorRef === event.actor &&
    (event.authorityRef === undefined || trace.authorityRef === event.authorityRef) &&
    holds(trace.revokedAt, (order) => order > 0) &&
    holds(trace.validFrom, (order) => order <= 0) &&
    holds(trace.validUntil, (order) => order >= 0)
  );
}

function isResolutionAuthorized(
  event: VerificationEvent,
  authorityTrace: AuthorityTrace[],
  version: StatusFunctionVersion,
): boolean {
  if (authorityTrace.length === 0) return false;
  if (version === "4") return isResolutionAuthorizedV4(event, authorityTrace);
  if (version !== "2") {
    // "3": the trace window is compared as instants, so two spellings of the
    // same instant (`...00Z` / `...00.000Z`, or another UTC offset) agree. A
    // bound that is present but unparseable never excludes the trace; that is
    // the specification's reference behaviour, kept so results match it.
    const at = parseInstant(event.createdAt) as number;
    return authorityTrace.some((trace) => {
      if (trace.actorRef !== event.actor) return false;
      if (trace.revokedAt !== undefined && (parseInstant(trace.revokedAt) as number) <= at) return false;
      if (trace.validFrom !== undefined && (parseInstant(trace.validFrom) as number) > at) return false;
      if (trace.validUntil !== undefined && (parseInstant(trace.validUntil) as number) < at) return false;
      if (event.authorityRef !== undefined && trace.authorityRef !== event.authorityRef) return false;
      return true;
    });
  }
  // "2" compares the ISO strings, which misorders instants spelled differently.
  return authorityTrace.some((trace) => {
    // Actor must match
    if (trace.actorRef !== event.actor) return false;
    // The trace must be active at the time of the decision (use event.createdAt as the moment)
    const atDecision = event.createdAt;
    if (trace.revokedAt && trace.revokedAt <= atDecision) return false;
    if (trace.validFrom && trace.validFrom > atDecision) return false;
    if (trace.validUntil && trace.validUntil < atDecision) return false;
    // AuthorityRef must match if the event specifies one
    if (event.authorityRef !== undefined && trace.authorityRef !== event.authorityRef) return false;
    return true;
  });
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
 */
export function checkAuthorityActive(
  actorRef: string,
  authorityTrace: AuthorityTrace[],
  now: Date,
): AuthorityCheckResult {
  const actorTraces = authorityTrace.filter((t) => t.actorRef === actorRef);
  if (actorTraces.length === 0) return "no-trace";

  const nowIso = now.toISOString();
  let sawRevoked = false;
  let sawExpired = false;

  for (const trace of actorTraces) {
    if (trace.revokedAt && trace.revokedAt <= nowIso) {
      sawRevoked = true;
      continue;
    }
    if (trace.validUntil && trace.validUntil < nowIso) {
      sawExpired = true;
      continue;
    }
    if (trace.validFrom && trace.validFrom > nowIso) {
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
