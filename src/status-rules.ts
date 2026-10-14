/**
 * Status-function rules shared by `status.ts` and the stale-reason derivation.
 *
 * Internal: `index.ts` does not re-export this module, so only what
 * `status.ts` re-exports from it (`sortEventsMostRecentFirstV4`,
 * `verifiedBranchEvent`, `claimIntrinsicExpiry`) is public API.
 */
import type { AuthorityTrace, Claim, Evidence, StaleReason, TimeStaleReason, TrustStatus, VerificationEvent, VerificationPolicy } from "./types.js";
import { policyRequiresSomething } from "./claim-evaluation.js";
import { resolveStatusFunctionVersion, type StatusFunctionVersion } from "./status-function-version.js";
import { compareTimestamps, instantFromDate, laterThanWindowEnd, parseTimestamp, type TimestampInstant } from "./timestamp.js";

export const TERMINAL_EVENT_STATUSES = new Set<TrustStatus>(["rejected", "disputed", "superseded", "stale", "revoked"]);

/**
 * The claim's events, most recent first by `createdAt`. Under "4" times are
 * exact instants and an event whose `createdAt` is not a timestamp sorts
 * before (older than) every event whose time is one. Under "3" an unparseable
 * `createdAt` sorts as epoch 0, so the order is defined; under "2" such an
 * event compares as NaN and the order is whatever the sort makes of it. Equal
 * times keep their order in `events` (the sort is stable).
 */
export function claimEventsMostRecentFirst(
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


/** Epoch ms, or undefined when the value is not a parseable instant. */
export function parseInstant(value: unknown): number | undefined {
  const time = Date.parse(value as string);
  return Number.isNaN(time) ? undefined : time;
}


/**
 * The policy the fold evaluates. Under "3" a resolved policy that requires no
 * evidence type and no method is treated as if no policy had been resolved.
 */
export function effectivePolicy(
  policy: VerificationPolicy | undefined,
  version: StatusFunctionVersion,
): VerificationPolicy | undefined {
  if (version === "2" || policy === undefined) return policy;
  return policyRequiresSomething(policy) ? policy : undefined;
}


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
 * Step 4a with its cause: why the governing verified event is stale at `now`,
 * or undefined when it is not. This is the staleness test itself, so the
 * reason and the `stale` status cannot disagree.
 */
export function verifiedEventStaleReason(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
  version: StatusFunctionVersion,
): TimeStaleReason | undefined {
  if (version === "4") return verifiedEventStaleReasonV4(event, claim, evidence, policy, now);
  if (version !== "2") return verifiedEventStaleReasonV3(event, claim, evidence, policy, now);

  // Claim-intrinsic validity window (Hachure schema 4) overrides policy timing
  // when present. expiresAt is canonical; ttlSeconds is the relative fallback,
  // resolved against the governing event's verifiedAt (fallback createdAt).
  const intrinsic = claimIntrinsicExpiry(event, claim);
  if (intrinsic !== undefined) {
    if (!(now.getTime() > intrinsic)) return undefined;
    return typeof claim.expiresAt === "string" && claim.expiresAt.length > 0 ? "intrinsic-window" : "ttl";
  }

  if (!policy) {
    return undefined;
  }

  if (policy.validityRule.kind === "commit") {
    if (!claim.currentIntegrityRef) {
      return undefined;
    }
    const eventEvidenceRefs = new Set(
      evidence
        .filter((item) => event.evidenceIds.includes(item.id))
        .map((item) => item.integrityRef)
        .filter((item): item is string => typeof item === "string" && item.length > 0),
    );
    return eventEvidenceRefs.has(claim.currentIntegrityRef) ? undefined : "commit";
  }

  if (policy.validityRule.kind !== "duration") {
    return undefined;
  }

  const verifiedAt = event.verifiedAt ?? event.createdAt;
  const verifiedTime = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedTime) || typeof policy.validityRule.durationDays !== "number") {
    return undefined;
  }

  const expiresAt = verifiedTime + policy.validityRule.durationDays * 24 * 60 * 60 * 1000;
  return expiresAt < now.getTime() ? "duration" : undefined;
}

function verifiedEventStaleReasonV3(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
): TimeStaleReason | undefined {
  const nowMs = now.getTime();
  const verifiedTime = Date.parse(event.verifiedAt ?? event.createdAt);

  // Claim-intrinsic validity window; `expiresAt` wins over `ttlSeconds`.
  if (claim.expiresAt !== undefined) {
    const expiry = Date.parse(claim.expiresAt);
    if (!Number.isFinite(expiry)) return "unevaluable";
    return nowMs > expiry ? "intrinsic-window" : undefined;
  }
  if (claim.ttlSeconds !== undefined) {
    const ttl: unknown = claim.ttlSeconds;
    if (!Number.isFinite(verifiedTime) || typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 0) return "unevaluable";
    return nowMs > verifiedTime + ttl * 1000 ? "ttl" : undefined;
  }

  // No effective policy: not stale here; the requirement step caps the result at `proposed`.
  if (!policy) return undefined;

  const rule = policy.validityRule as { kind?: unknown; durationDays?: unknown } | undefined;
  switch (rule?.kind) {
    case "commit": {
      // Without a current integrity reference there is nothing to compare the
      // verified evidence against.
      if (claim.currentIntegrityRef === undefined) return "unevaluable";
      const linkedIds = event.evidenceIds ?? [];
      return evidence.some((item) => linkedIds.includes(item.id) && item.integrityRef === claim.currentIntegrityRef)
        ? undefined
        : "commit";
    }
    case "duration": {
      const days = rule.durationDays;
      if (typeof days !== "number" || !Number.isFinite(days) || days < 0) return "unevaluable";
      if (!Number.isFinite(verifiedTime)) return "unevaluable";
      return nowMs > verifiedTime + days * 86_400_000 ? "duration" : undefined;
    }
    case "historical":
    case "manual":
      return undefined;
    default:
      // Absent or unknown kind: the rule cannot be evaluated.
      return "unevaluable";
  }
}

/**
 * Version "4" Step 4a: the version "3" rule with every time read as a
 * timestamp and every comparison exact. A validity window is the exact decimal
 * product of `ttlSeconds` (or `durationDays`) and its unit, never a
 * floating-point sum.
 */
function verifiedEventStaleReasonV4(
  event: VerificationEvent,
  claim: Claim,
  evidence: Evidence[],
  policy: VerificationPolicy | undefined,
  now: Date,
): TimeStaleReason | undefined {
  const nowInstant = instantFromDate(now) as TimestampInstant;
  const verifiedTime = parseTimestamp(event.verifiedAt ?? event.createdAt);
  const evaluable = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

  if (claim.expiresAt !== undefined) {
    const expiry = parseTimestamp(claim.expiresAt);
    if (expiry === undefined) return "unevaluable";
    return compareTimestamps(nowInstant, expiry) > 0 ? "intrinsic-window" : undefined;
  }
  if (claim.ttlSeconds !== undefined) {
    if (verifiedTime === undefined || !evaluable(claim.ttlSeconds)) return "unevaluable";
    return laterThanWindowEnd(nowInstant, verifiedTime, claim.ttlSeconds, 1000) ? "ttl" : undefined;
  }

  if (!policy) return undefined;

  const rule = policy.validityRule as { kind?: unknown; durationDays?: unknown } | undefined;
  switch (rule?.kind) {
    case "commit": {
      if (claim.currentIntegrityRef === undefined) return "unevaluable";
      const linkedIds = event.evidenceIds ?? [];
      return evidence.some((item) => linkedIds.includes(item.id) && item.integrityRef === claim.currentIntegrityRef)
        ? undefined
        : "commit";
    }
    case "duration": {
      if (!evaluable(rule.durationDays) || verifiedTime === undefined) return "unevaluable";
      return laterThanWindowEnd(nowInstant, verifiedTime, rule.durationDays, 86_400_000) ? "duration" : undefined;
    }
    case "historical":
    case "manual":
      return undefined;
    default:
      return "unevaluable";
  }
}

/**
 * Why a claim whose own status is `stale` is stale, or undefined when the
 * branch `deriveTrustStatus` decides the claim on does not derive `stale` for
 * these inputs. The derivation ceiling is not applied: a claim capped at
 * `stale` by a stale input is `derived-input`, which the snapshot assigns.
 *
 * - On the verified-event branch the cause is the Step 4a test that failed:
 *   `commit`, `duration`, `ttl`, `intrinsic-window` or `unevaluable`.
 * - Otherwise an event decided the status (a revocation, an invalidation, a
 *   recorded `stale` status, or an authorized dispute resolution), and the
 *   cause is `external:<method>`, from the deciding event's `method`.
 *
 * Off the verified-event branch this reads only the deciding event, so it
 * does not see a newer blocking failure that turns an authorized `stale`
 * resolution into `disputed`. The caller passes a claim it derived `stale`.
 *
 * Internal: `index.ts` does not re-export this module. Consumers read the
 * reason from the report (`summary.staleReasonByClaimId`).
 */
export function deriveOwnStaleReason(input: {
  claim: Claim;
  /** The entailing evidence, as `deriveTrustStatus` takes it. */
  evidence: Evidence[];
  /** The resolved policy, as `deriveTrustStatus` takes it. */
  policy?: VerificationPolicy;
  events: VerificationEvent[];
  now: Date;
  authorityTrace?: AuthorityTrace[];
  /** Must be the version the `stale` status was derived with. Defaults to the current version. */
  statusFunctionVersion?: StatusFunctionVersion;
}): StaleReason | undefined {
  const version = resolveStatusFunctionVersion(input.statusFunctionVersion);
  const governing = verifiedBranchEvent(input.claim, input.events, input.authorityTrace, version);
  if (governing !== undefined) {
    return verifiedEventStaleReason(governing, input.claim, input.evidence, effectivePolicy(input.policy, version), input.now, version);
  }
  const claimEvents = claimEventsMostRecentFirst(input.claim, input.events, version);
  const resolution = findLatestResolutionEvent(claimEvents, input.authorityTrace ?? [], version);
  if (resolution !== undefined) return resolution.status === "stale" ? externalStaleReason(resolution) : undefined;
  const latest = claimEvents[0];
  if (latest === undefined) return undefined;
  // The rules `deriveTrustStatus` applies to the latest event, restricted to
  // the outcomes that are `stale`: an invalidation is stale unless it records
  // another terminal status, and a recorded `stale` or `revoked` is stale.
  const stale = latest.type === "invalidation"
    ? !TERMINAL_EVENT_STATUSES.has(latest.status) || latest.status === "stale" || latest.status === "revoked"
    : latest.status === "stale" || latest.status === "revoked";
  return stale ? externalStaleReason(latest) : undefined;
}

/** `external:<method>` for the event that decided a claim stale. */
function externalStaleReason(event: VerificationEvent): `external:${string}` {
  const method = typeof event.method === "string" ? event.method.trim() : "";
  return `external:${method.length > 0 ? method : "unspecified"}`;
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
export function findLatestResolutionEvent(
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
  // "3" and "2": the trace window is compared as instants read with
  // `Date.parse`, so two spellings of the same instant (`...00Z` /
  // `...00.000Z`, or another UTC offset) agree. A bound that is present but
  // unparseable never excludes the trace (every comparison with NaN is false);
  // that is the specification's reference behaviour for both versions, kept so
  // results match it. Before 6.0.1, "2" compared the ISO strings, which
  // misordered instants spelled differently (#320).
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
