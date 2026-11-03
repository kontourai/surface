import { canonicalJson, sha256Hex } from "./canonical-digest.js";
import { compareTimestamps, parseTimestamp } from "./timestamp.js";
import type { Claim, TrustBundle, VerificationEvent } from "./types.js";

/** Surface-local provisional fields; these are not Hachure bundle fields. */
export interface AccumulationClaim extends Claim {
  validTime?: { from?: string; until?: string };
  supersedes?: { claimId: string; kind: "correction" | "succession"; reason: string }[];
}
export type AccumulationBundle = Omit<TrustBundle, "claims"> & { claims: AccumulationClaim[] };

/** A receiver's protected custody record. Publisher is authenticated out of band. */
export interface BundleObservation {
  id: string;
  observedAt: string;
  contentDigest: string;
  authenticatedPublisher: string;
  bundle: AccumulationBundle;
}

/** Decisions are host inputs, bound to exact event content and its publisher. */
export interface EventAdmission {
  eventId: string;
  eventDigest: string;
  publisher: string;
  admitted: boolean;
}
export interface AccumulationAuthority {
  version: "1";
  /** Digest protected by host custody, covering all decisions and bindings. */
  integrityRef: string;
  ownerByClaimId: Readonly<Record<string, string>>;
  eventDecisions: readonly EventAdmission[];
  /** Explicit third-party replacement grants, keyed by successor and predecessor. */
  replacementGrants?: readonly { successorId: string; predecessorId: string }[];
}
export interface RecordProvenance { observationId: string; observedAt: string; publisher: string }
export interface AdmittedObservations {
  observations: BundleObservation[];
  events: VerificationEvent[];
  pendingEvents: VerificationEvent[];
  claimProvenance: Record<string, RecordProvenance[]>;
  eventProvenance: Record<string, RecordProvenance[]>;
}
export function accumulationDigest(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Validate custody before filtering; malformed or contradictory records fail closed. */
export function admitAccumulationObservations(
  observations: readonly BundleObservation[], authority: AccumulationAuthority, knownAt: string,
): AdmittedObservations {
  const cut = parseTimestamp(knownAt);
  const { integrityRef, ...policy } = authority;
  if (!cut || authority.version !== "1" || integrityRef !== accumulationDigest(policy)) throw new Error("invalid accumulation cut or admission policy");
  const seen = new Map<string, string>();
  const admitted: BundleObservation[] = [];
  for (const observation of observations) {
    const at = parseTimestamp(observation.observedAt);
    if (!observation.id || !observation.authenticatedPublisher || !at || observation.contentDigest !== accumulationDigest(observation.bundle)) {
      throw new Error("invalid observation custody");
    }
    const representation = canonicalJson(observation);
    const old = seen.get(observation.id);
    if (old !== undefined && old !== representation) throw new Error(`conflicting observation ${observation.id}`);
    if (old !== undefined) continue;
    seen.set(observation.id, representation);
    if (compareTimestamps(at, cut) <= 0) admitted.push(observation);
  }
  admitted.sort((a, b) => cmp(a.id, b.id));
  const decisions = new Map<string, EventAdmission>();
  for (const decision of authority.eventDecisions) {
    const key = canonicalJson([decision.eventId, decision.publisher]);
    const old = decisions.get(key);
    if (old && canonicalJson(old) !== canonicalJson(decision)) throw new Error(`conflicting admission ${decision.eventId}`);
    decisions.set(key, decision);
  }
  const claimProvenance: Record<string, RecordProvenance[]> = Object.create(null);
  const eventProvenance: Record<string, RecordProvenance[]> = Object.create(null);
  const eventContents = new Map<string, string>();
  const events = new Map<string, VerificationEvent>();
  const pending = new Map<string, VerificationEvent>();
  for (const observation of admitted) {
    const provenance = { observationId: observation.id, observedAt: observation.observedAt, publisher: observation.authenticatedPublisher };
    for (const claim of observation.bundle.claims) (claimProvenance[claim.id] ??= []).push(provenance);
    for (const event of observation.bundle.events) {
      const content = canonicalJson(event);
      const prior = eventContents.get(event.id);
      if (prior !== undefined && prior !== content) throw new Error(`conflicting event ${event.id}`);
      eventContents.set(event.id, content);
      (eventProvenance[event.id] ??= []).push(provenance);
      const decision = decisions.get(canonicalJson([event.id, observation.authenticatedPublisher]));
      if (decision?.admitted && decision.eventDigest === accumulationDigest(event)) events.set(event.id, event);
      else pending.set(event.id, event);
    }
  }
  for (const id of events.keys()) pending.delete(id);
  return { observations: admitted, events: [...events.values()].sort((a, b) => cmp(a.id, b.id)), pendingEvents: [...pending.values()].sort((a, b) => cmp(a.id, b.id)), claimProvenance, eventProvenance };
}
