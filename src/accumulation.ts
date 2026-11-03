import { accumulationDigest, admitAccumulationObservations, type AccumulationAuthority, type AccumulationClaim, type BundleObservation } from "./accumulation-admission.js";
import { canonicalJson } from "./canonical-digest.js";
import { canonicalClaimKey, type CanonicalClaimTarget } from "./canonical.js";
import { buildIdentityIndex } from "./identity.js";
import { applyDerivation } from "./derivation.js";
import { validateClaim, validateEvent } from "./validation/records.js";
import { mergeBundlesDetailed } from "./merge.js";
import { buildTrustReport } from "./report.js";
import { compareStatusStrength } from "./status-taxonomy.js";
import { sortEventsMostRecentFirstV4 } from "./status.js";
import { findLatestResolutionEvent } from "./status-rules.js";
import { validateTrustBundle } from "./validate.js";
import { compareTimestamps, parseTimestamp } from "./timestamp.js";
import type { TrustBundle, TrustStatus } from "./types.js";

export interface AccumulationSlot extends CanonicalClaimTarget { claimType: string }
export interface AccumulationQuery {
  slot: AccumulationSlot;
  now: string;
  knownAt?: string;
  validAt?: string;
  /** Only this explicitly declared value policy is currently supported. */
  valuePolicy: "single-json-v1";
}
export interface ReplacementTrace {
  claimId: string;
  byClaimId: string;
  kind: "correction" | "succession";
  state: "accepted" | "pending" | "inert" | "withdrawn";
}
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sort = (s: Iterable<string>): string[] => [...s].sort(cmp);
function time(value: string) {
  const parsed = parseTimestamp(value);
  if (!parsed) throw new Error(`invalid timestamp: ${value}`);
  return parsed;
}
function boundContains(claim: AccumulationClaim, at: ReturnType<typeof time>): boolean {
  if (claim.validTime !== undefined && (claim.validTime === null || typeof claim.validTime !== "object" || Array.isArray(claim.validTime) || Object.keys(claim.validTime).some(k => k !== "from" && k !== "until"))) throw new Error(`invalid interval: ${claim.id}`);
  const from = claim.validTime?.from === undefined ? undefined : time(claim.validTime.from);
  const until = claim.validTime?.until === undefined ? undefined : time(claim.validTime.until);
  if (from && until && compareTimestamps(from, until) >= 0) throw new Error(`invalid interval: ${claim.id}`);
  return (!from || compareTimestamps(from, at) <= 0) && (!until || compareTimestamps(at, until) < 0);
}

/** Rebuilds from receiver observations. Hosts must enforce visibility before exposing this raw view. */
export function projectAccumulation(observations: readonly BundleObservation[], authority: AccumulationAuthority, query: AccumulationQuery) {
  if (query.valuePolicy !== "single-json-v1") throw new Error("unsupported value policy");
  if (!query.slot || [query.slot.subjectType, query.slot.subjectId, query.slot.fieldOrBehavior, query.slot.claimType].some(part => typeof part !== "string" || !part.trim()) || query.slot.subjectId !== query.slot.subjectId.trim() || (query.slot.qualifiers !== undefined && (query.slot.qualifiers === null || typeof query.slot.qualifiers !== "object" || Array.isArray(query.slot.qualifiers) || Object.values(query.slot.qualifiers).some(value => typeof value !== "string")))) throw new Error("invalid accumulation slot");
  const now = time(query.now);
  const validAt = time(query.validAt ?? query.now);
  const admitted = admitAccumulationObservations(observations, authority, query.knownAt ?? query.now);
  const claims = new Map<string, AccumulationClaim>();
  for (const observation of admitted.observations) {
    const carried = new Set(observation.bundle.claims.map((claim) => claim.id));
    for (const claim of observation.bundle.claims) {
      boundContains(claim, validAt);
      const old = claims.get(claim.id);
      if (old && canonicalJson(old) !== canonicalJson(claim)) throw new Error(`conflicting claim ${claim.id}`);
      claims.set(claim.id, claim);
      for (const edge of claim.supersedes ?? []) {
        if (!carried.has(edge.claimId) || !edge.reason?.trim() || !["correction", "succession"].includes(edge.kind)) throw new Error(`invalid replacement ${claim.id}`);
      }
    }
  }
  const owner = (id: string): string | undefined => Object.hasOwn(authority.ownerByClaimId, id) ? authority.ownerByClaimId[id] : undefined;
  const statusByClaimId: Record<string, TrustStatus> = Object.create(null);
  const dispositionByClaimId: Record<string, string> = Object.create(null);
  const excluded: Record<string, string> = Object.create(null);
  const gapCodes = new Set<string>();
  const empty = { outcome: "none" as const, reason: "empty", supersessions: [] as ReplacementTrace[], gapCodes: [] as string[], statusByClaimId, dispositionByClaimId, excluded, supportingClaimIds: [] as string[], candidateClaimIds: [] as string[], independentSupportClaimIds: [] as string[], identityLinkIds: [] as string[], inertIdentityLinkIds: [] as string[], derivationEdges: [] as object[], claimProvenance: admitted.claimProvenance, eventProvenance: admitted.eventProvenance, pendingEventIds: admitted.pendingEvents.map(e => e.id) };
  if (admitted.observations.length === 0) return empty;
  const bundles: TrustBundle[] = admitted.observations.map(({ bundle }) => {
    const portable = { ...bundle, claims: bundle.claims.map(({ validTime: _v, supersedes: _s, ...claim }) => claim), events: [] };
    const carried = new Set(portable.claims.map(claim => claim.id));
    for (const claim of portable.claims) validateClaim(claim);
    validateTrustBundle({ ...portable, claims: portable.claims.map(claim => ({ ...claim, derivedFrom: claim.derivedFrom?.filter(id => carried.has(id)), derivationEdges: claim.derivationEdges?.filter(edge => carried.has(edge.inputClaimId)) })) });
    return { ...portable, claims: portable.claims.map(({ subjectAliases: _a, ...claim }) => claim) };
  });
  const merged = mergeBundlesDetailed(bundles);
  if (merged.collisions.length) throw new Error("conflicting duplicate records");
  for (const event of admitted.events) validateEvent(event);
  merged.bundle.events = admitted.events;
  // The first fold cannot assume an identity link is active before its mapping is evaluated.
  const links = merged.bundle.identityLinks ?? [];
  const identities = new Map<string, string>();
  for (const link of links) if (link.id) {
    const content = canonicalJson(link);
    if (identities.has(link.id) && identities.get(link.id) !== content) throw new Error(`conflicting identity link ${link.id}`);
    identities.set(link.id, content);
  }
  const inputTrace = admitted.observations.map(o => ({ observationId: o.id, observedAt: o.observedAt, publisher: o.authenticatedPublisher, contentDigest: o.contentDigest, claims: o.bundle.claims, events: o.bundle.events, evidence: o.bundle.evidence, policies: o.bundle.policies, identityLinks: o.bundle.identityLinks ?? [], authorityTrace: o.bundle.authorityTrace ?? [] }));
  merged.bundle.identityLinks = [];
  const report = buildTrustReport(merged.bundle, { now: new Date(now.epochMilliseconds) });
  const foldStatusByClaimId = new Map(report.claims.map(claim => [claim.id, claim.status]));
  for (const claim of report.claims) statusByClaimId[claim.id] = owner(claim.id) ? claim.status : "unknown";
  const ownStatuses = new Map(Object.entries(statusByClaimId));
  const claimsById = new Map(merged.bundle.claims.map(claim => [claim.id, claim]));
  for (const claim of merged.bundle.claims) statusByClaimId[claim.id] = applyDerivation({ claim, ownStatus: ownStatuses.get(claim.id) ?? "unknown", ownStatusByClaimId: ownStatuses, claimsById, now: new Date(now.epochMilliseconds) }).status;
  const activeLinks = links.filter(link => (link.relation ?? "equivalent") === "equivalent" && link.mappingClaimId && statusByClaimId[link.mappingClaimId] === "verified" && owner(link.mappingClaimId) && admitted.observations.some(observation => (observation.bundle.identityLinks ?? []).some(candidate => canonicalJson(candidate) === canonicalJson(link)) && authority.identityDecisions?.some(decision => decision.admitted === true && decision.mappingClaimId === link.mappingClaimId && decision.linkDigest === accumulationDigest(link) && decision.publisher === observation.authenticatedPublisher)));
  const identity = buildIdentityIndex({ ...merged.bundle, identityLinks: activeLinks });
  const identityLinkIds = sort(new Set(activeLinks.flatMap(link => link.id ? [link.id] : [])));
  const inertIdentityLinkIds = sort(new Set(links.filter(link => (link.relation ?? "equivalent") === "equivalent" && !activeLinks.includes(link)).flatMap(link => link.id ? [link.id] : [])));
  const key = (claim: AccumulationClaim | AccumulationSlot): string => canonicalJson([identity.canonicalKey(claim), claim.claimType, canonicalClaimKey({ ...claim, subjectType: "_", subjectId: "_" })]);
  const queryKey = key(query.slot);
  const relevant = [...claims.values()].filter(claim => key(claim) === queryKey).sort((a, b) => cmp(a.id, b.id));
  const missingLineage = new Set<string>();
  for (const claim of relevant) {
    if (!owner(claim.id)) gapCodes.add("owner-unverified");
    if (report.transparencyGaps.some(g => g.claimId === claim.id && g.metadata?.source === "derivation.cycle")) { statusByClaimId[claim.id] = "unknown"; gapCodes.add("lineage-cycle"); }
    if (report.transparencyGaps.some(g => g.claimId === claim.id && g.metadata?.source === "derivation.missing")) {
      missingLineage.add(claim.id);
      gapCodes.add("lineage-missing");
    }
  }
  const unresolvedAlias = [...claims.values()].some(claim => claim.claimType === query.slot.claimType && canonicalClaimKey({ ...claim, subjectType: "_", subjectId: "_" }) === canonicalClaimKey({ ...query.slot, subjectType: "_", subjectId: "_" }) && (claim.subjectAliases ?? []).some(alias => identity.canonicalKey(alias) === identity.canonicalKey(query.slot) || identity.canonicalKey(claim) === identity.canonicalKey(query.slot)));
  const unresolvedIdentity = unresolvedAlias || links.some(link => (link.relation ?? "equivalent") === "equivalent" && !activeLinks.includes(link) && (!link.mappingClaimId || !["rejected", "revoked"].includes(statusByClaimId[link.mappingClaimId] ?? "unknown")) && link.subjects.some(subject => identity.canonicalKey(subject) === identity.canonicalKey(query.slot)));
  if (unresolvedIdentity) gapCodes.add("identity-unresolved");
  const retracted = new Set<string>();
  for (const claim of claims.values()) {
    const latest = sortEventsMostRecentFirstV4(admitted.events.filter(e => e.claimId === claim.id).sort((a,b) => cmp(a.id,b.id)))[0];
    const resolution = findLatestResolutionEvent(sortEventsMostRecentFirstV4(admitted.events.filter(e => e.claimId === claim.id).sort((a,b) => cmp(a.id,b.id))), merged.bundle.authorityTrace ?? [], "4");
    if (!resolution && latest?.status === "revoked" && foldStatusByClaimId.get(claim.id) === "stale") retracted.add(claim.id);
  }
  const edges: ReplacementTrace[] = [];
  for (const claim of claims.values()) for (const edge of claim.supersedes ?? []) {
    const target = claims.get(edge.claimId);
    if (!target) throw new Error(`missing replacement target ${edge.claimId}`);
    if (key(claim) !== queryKey && key(target) !== queryKey) continue;
    let state: ReplacementTrace["state"] = "pending";
    if (key(claim) !== key(target)) { state = "inert"; gapCodes.add("supersession-cross-slot"); }
    else if (retracted.has(claim.id) || foldStatusByClaimId.get(claim.id) === "rejected") state = "withdrawn";
    else if (statusByClaimId[claim.id] === "verified" && owner(claim.id) && ((owner(claim.id) === owner(target.id) && admitted.claimProvenance[claim.id]?.some(p => p.publisher === owner(claim.id))) || authority.replacementGrants?.some(grant => grant.successorId === claim.id && grant.predecessorId === target.id))) state = "accepted";
    else gapCodes.add("supersession-pending");
    edges.push({ claimId: target.id, byClaimId: claim.id, kind: edge.kind, state });
  }
  edges.sort((a,b) => cmp(a.claimId,b.claimId) || cmp(a.byClaimId,b.byClaimId));
  const successors = new Map<string, string[]>();
  for (const edge of edges.filter(e => e.state !== "inert")) successors.set(edge.byClaimId, [...(successors.get(edge.byClaimId) ?? []), edge.claimId]);
  const visiting = new Set<string>(), visited = new Set<string>();
  function cyclic(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((successors.get(id) ?? []).some(cyclic)) return true;
    visiting.delete(id); visited.add(id); return false;
  }
  if ([...successors.keys()].some(cyclic)) {
    for (const edge of edges) edge.state = "inert";
    gapCodes.add("supersession-cycle");
    return { ...empty, inputTrace, outcome: "invalid" as const, reason: "supersession-cycle", supersessions: edges, gapCodes: sort(gapCodes), identityLinkIds, inertIdentityLinkIds };
  }
  for (const claim of relevant) {
    if (retracted.has(claim.id)) excluded[claim.id] = "retracted";
    else if (foldStatusByClaimId.get(claim.id) === "rejected") excluded[claim.id] = "rejected";
    else if (!boundContains(claim, validAt)) dispositionByClaimId[claim.id] = "not-valid-at";
  }
  for (const edge of edges.filter(e => e.state === "accepted")) {
    const successor = claims.get(edge.byClaimId)!;
    if (boundContains(successor, validAt)) dispositionByClaimId[edge.claimId] = "superseded";
  }
  const candidates = relevant.filter(c => !excluded[c.id] && !dispositionByClaimId[c.id]);
  if (admitted.pendingEvents.some(event => relevant.some(c => c.id === event.claimId))) gapCodes.add("event-authority-pending");
  const values = new Set(candidates.map(c => canonicalJson(c.value)));
  if (values.size > 1) gapCodes.add("contested-value");
  const derivationEdges = candidates.flatMap(c => (c.derivationEdges ?? []).map(e => ({ claimId: c.id, ...e })));
  const dependsOnCandidate = (claim: AccumulationClaim): boolean => {
    const seen = new Set<string>([claim.id]);
    const visit = (id: string): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      if (candidates.some(other => other.id === id)) return true;
      const input = claims.get(id);
      return !!input && [...(input.derivedFrom ?? []), ...(input.derivationEdges ?? []).map(e => e.inputClaimId)].some(visit);
    };
    return [...(claim.derivedFrom ?? []), ...(claim.derivationEdges ?? []).map(e => e.inputClaimId)].some(visit);
  };
  const independentSupportClaimIds = candidates.filter(c => !dependsOnCandidate(c)).map(c => c.id);
  const result = { ...empty, inputTrace, supersessions: edges, gapCodes: sort(gapCodes), identityLinkIds, inertIdentityLinkIds, derivationEdges, independentSupportClaimIds };
  if (unresolvedIdentity) return { ...result, outcome: "invalid" as const, reason: "identity-unresolved", candidateClaimIds: candidates.map(c => c.id) };
  if (candidates.some(claim => owner(claim.id) && missingLineage.has(claim.id))) return { ...result, outcome: "invalid" as const, reason: "lineage-missing", candidateClaimIds: candidates.map(c => c.id) };
  if (values.size > 1) return { ...result, outcome: "contested" as const, reason: undefined, candidateClaimIds: candidates.map(c => c.id) };
  if (!candidates.length) return { ...result, reason: relevant.length === 0 ? "empty" : Object.keys(excluded).length ? "withdrawn" : "not-valid-at" };
  const status = candidates.map(c => statusByClaimId[c.id] ?? "unknown").sort((a,b) => compareStatusStrength(b,a))[0];
  return { ...result, outcome: "current" as const, reason: undefined, value: candidates[0].value, status, supportingClaimIds: candidates.map(c => c.id) };
}

/** Append an observation without mutating prior state. Replaying the state uses the same projection path. */
export function appendAccumulationObservation(state: readonly BundleObservation[], observation: BundleObservation): BundleObservation[] {
  return [...state, observation];
}

/** Incremental input update. Each update replays the immutable set for safety. */
export function advanceAccumulation(state: readonly BundleObservation[], observation: BundleObservation, authority: AccumulationAuthority, query: AccumulationQuery) {
  const observations = appendAccumulationObservation(state, observation);
  return { observations, result: projectAccumulation(observations, authority, query) };
}
