import { SURFACE_BASIS_VERSION, type BasisCompositionInput, type BasisContribution, type BasisGap, type BasisProjection, type BasisRegionItem, type BasisRelationship, type BasisUnresolvedReason, type OwnerRead, type ThreadAnswerRef } from "./types.js";

/** Pure composition: no reads, I/O, mutation, or owner-policy interpretation. */
export function composeBasisProjection(input: BasisCompositionInput): BasisProjection {
  const regions: { [K in keyof BasisProjection["regions"]]: BasisRegionItem[] } = { inputs: [], execution: [], process: [], outcomes: [], support: [], sources: [], live: [] };
  if (input.answer.state !== "available") return unresolvedAnswer(input, regions);
  const answer = input.answer.value.ref;
  const matching = input.contributions.flatMap((read) => read.state === "available" ? read.value.filter((item) => sameAnswer(item.answer, answer)) : []);
  const normalized = dedupeAndSort(matching);
  for (const contribution of normalized.items) regions[regionFor(contribution.role)].push({ ref: contribution.ref, role: contribution.role, context: contribution.context, gaps: [] });
  const itemGaps = input.contributions.filter((read) => read.state !== "available" && read.state !== "observed-empty").map((read) => ({ code: `owner-${read.state}`, message: `Context from ${read.owner.authority} is ${read.state}.` }));
  const assessmentGaps = input.assessment.state === "available" ? input.assessment.value.gaps : [];
  const standing = standingFor(input, normalized.items.length > 0);
  return { version: SURFACE_BASIS_VERSION, answer: input.answer, standing: standing.standing, unresolvedReason: standing.reason, assessment: input.assessment, regions, relationships: [...assessmentRelationships(input), ...contextRelationships(normalized.items)], gaps: [...assessmentGaps, ...itemGaps, ...normalized.gaps] };
}

function unresolvedAnswer(input: BasisCompositionInput, regions: BasisProjection["regions"]): BasisProjection {
  const state = input.answer.state;
  const reason = state === "observed-empty" ? "answer-observed-empty" : state === "not-captured" ? "answer-not-captured" : state === "restricted" ? "answer-restricted" : state === "stale" ? "answer-stale" : state === "corrupt" ? "answer-corrupt" : state === "unsupported-version" ? "answer-unsupported-version" : "answer-unavailable";
  return { version: SURFACE_BASIS_VERSION, answer: input.answer, standing: "unresolved", unresolvedReason: reason, assessment: input.assessment, regions, relationships: [], gaps: [{ code: `answer-${state}`, message: `Answer observation is ${state}.` }] };
}

function dedupeAndSort(items: readonly BasisContribution[]): { items: BasisContribution[]; gaps: BasisGap[] } {
  const grouped = new Map<string, BasisContribution[]>();
  for (const item of items) { const key = `${refKey(item.ref)}\u0000${item.role}`; grouped.set(key, [...(grouped.get(key) ?? []), item]); }
  const selected: BasisContribution[] = []; const gaps: BasisGap[] = [];
  for (const [key, group] of [...grouped].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    const serializations = [...new Set(group.map(canonical))];
    if (serializations.length === 1) selected.push(group[0]!);
    else gaps.push({ code: "corrupt-duplicate-contribution", message: `Conflicting context copies for ${key}.` });
  }
  return { items: selected.sort((a, b) => `${a.role}\u0000${refKey(a.ref)}`.localeCompare(`${b.role}\u0000${refKey(b.ref)}`, "en")), gaps };
}
function canonical(value: unknown): string { return JSON.stringify(value, (_key, candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate) ? Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, (candidate as Record<string, unknown>)[key]])) : candidate); }
function refKey(ref: BasisContribution["ref"]): string { return Object.keys(ref).sort().map((key) => `${key}=${(ref as Record<string, string>)[key]}`).join("\u0000"); }
function regionFor(role: BasisContribution["role"]): keyof BasisProjection["regions"] { return ({ input: "inputs", execution: "execution", process: "process", outcome: "outcomes", source: "sources", live: "live" } as const)[role]; }
function sameAnswer(left: ThreadAnswerRef, right: ThreadAnswerRef): boolean { return left.authority === right.authority && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.threadId === right.threadId && left.messageId === right.messageId; }

function standingFor(input: BasisCompositionInput, hasContext: boolean): { standing: BasisProjection["standing"]; reason: BasisUnresolvedReason | null } {
  if (input.assessment.state === "available") {
    const assessment = input.assessment.value;
    if (!assessment.found) return { standing: "unresolved", reason: "claim-not-in-assessment" };
    // A valid explicit Surface outcome is necessary, but never enough to waive
    // known bad states, counterevidence, staleness, conflicts, or gaps.
    const policyMet = assessment.policy?.outcome === "satisfied" && assessment.claim?.status === "verified" && !assessment.claim.freshness?.stale && assessment.evidence.counterevidence.length === 0 && assessment.gaps.length === 0;
    return policyMet ? { standing: "policy-met", reason: null } : { standing: "assessed-with-gaps", reason: null };
  }
  if ((input.assessment.state === "not-captured" || input.assessment.state === "observed-empty") && hasContext) return { standing: "execution-only", reason: null };
  const state = input.assessment.state;
  const reason: BasisUnresolvedReason = state === "observed-empty" ? "assessment-observed-empty" : state === "not-captured" ? "assessment-not-captured" : state === "restricted" ? "assessment-restricted" : state === "stale" ? "assessment-stale" : state === "corrupt" ? "assessment-corrupt" : state === "unsupported-version" ? "assessment-unsupported-version" : "assessment-unavailable";
  return { standing: "unresolved", reason };
}

function assessmentRelationships(input: BasisCompositionInput): BasisRelationship[] {
  if (input.assessment.state !== "available" || !input.assessment.value.found || !input.assessment.value.claim) return [];
  const assessment = input.assessment.value; const claim = assessment.claim!;
  return [
    ...assessment.evidence.cited.map((item) => ({ kind: "cites" as const, from: claim.id, to: `evidence:${item.id}`, source: "surface-assessment" as const, gaps: [] })),
    ...assessment.evidence.entails.map((item) => ({ kind: "supports" as const, from: `evidence:${item.id}`, to: claim.id, source: "surface-assessment" as const, gaps: [] })),
    ...assessment.evidence.counterevidence.map((item) => ({ kind: "counterevidence" as const, from: `evidence:${item.id}`, to: claim.id, source: "surface-assessment" as const, gaps: [] })),
    ...assessment.derivation.directInputs.map((item) => ({ kind: "derived-from" as const, from: claim.id, to: `claim:${item.claimId}`, source: "surface-assessment" as const, gaps: [] })),
  ];
}
function contextRelationships(items: readonly BasisContribution[]): BasisRelationship[] { return items.flatMap((item) => item.relationships?.map((relationship) => ({ kind: relationship.kind, from: refKey(relationship.from), to: refKey(relationship.to), source: "owner-context" as const, gaps: [] })) ?? []); }
