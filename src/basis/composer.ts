import { parseBasisComposition } from "./parser.js";
import { deriveBasisStanding } from "./standing.js";
import { SURFACE_BASIS_VERSION, type BasisCompositionInput, type BasisContribution, type BasisGap, type BasisProjection, type BasisRegionItem, type BasisRelationship, type ThreadAnswerRef } from "./types.js";

/**
 * Pure composition after fail-closed normalization.  This is intentional even
 * for typed callers: casts and in-process objects do not get to bypass owner
 * authority, exact ref arms, or placement rules.
 */
export function composeBasisProjection(input: BasisCompositionInput): BasisProjection {
  const parsed = parseBasisComposition(input);
  if (!parsed.ok) return invalidComposition(parsed.gap);
  const normalized = parsed.value;
  const regions: { [K in keyof BasisProjection["regions"]]: BasisRegionItem[] } = { inputs: [], execution: [], process: [], outcomes: [], support: [], sources: [], live: [] };
  if (normalized.answer.state === "available") {
    const answer = normalized.answer.value.ref;
    const matching = normalized.contributions.flatMap((read) => read.state === "available" ? read.value.filter((item) => sameAnswer(item.answer, answer)) : []);
    const deduped = dedupeAndSort(matching);
    for (const contribution of deduped.items) regions[regionFor(contribution.role)].push({ ref: contribution.ref, role: contribution.role, context: contribution.context, gaps: contribution.gaps ?? [] });
    const ownerGaps = normalized.contributions.filter((read) => read.state !== "available" && read.state !== "observed-empty").map((read) => ({ code: `owner-${read.state}`, message: `Context from ${read.owner.authority} is ${read.state}.` }));
    return projection(normalized, regions, [...ownerGaps, ...deduped.gaps]);
  }
  return projection(normalized, regions, []);
}
function projection(input: BasisCompositionInput, regions: BasisProjection["regions"], extraGaps: readonly BasisGap[]): BasisProjection {
  const derived = deriveBasisStanding(input.answer, input.assessment);
  const answerGaps = input.answer.state === "available" ? [] : [{ code: `answer-${input.answer.state}`, message: `Answer observation is ${input.answer.state}.` }];
  const assessmentGaps = input.assessment.state === "available" ? input.assessment.value.gaps : [];
  return { version: SURFACE_BASIS_VERSION, answer: input.answer, standing: derived.standing, unresolvedReason: derived.reason, assessment: input.assessment, regions, relationships: assessmentRelationships(input), gaps: [...answerGaps, ...assessmentGaps, ...extraGaps] };
}
function invalidComposition(gap: BasisGap): BasisProjection {
  return { version: SURFACE_BASIS_VERSION, answer: { owner: { authority: "@kontourai/thread" }, state: "unavailable", observedAt: "1970-01-01T00:00:00.000Z" }, standing: "unresolved", unresolvedReason: "answer-unavailable", assessment: { owner: { authority: "@kontourai/surface" }, state: "unavailable", observedAt: "1970-01-01T00:00:00.000Z" }, regions: { inputs: [], execution: [], process: [], outcomes: [], support: [], sources: [], live: [] }, relationships: [], gaps: [gap] };
}
function dedupeAndSort(items: readonly BasisContribution[]): { items: BasisContribution[]; gaps: BasisGap[] } { const grouped = new Map<string, BasisContribution[]>(); for (const item of items) { const key = `${refKey(item.ref)}\u0000${item.role}`; grouped.set(key, [...(grouped.get(key) ?? []), item]); } const selected: BasisContribution[] = []; const gaps: BasisGap[] = []; for (const [key, group] of [...grouped].sort(([a], [b]) => a.localeCompare(b, "en"))) { const serializations = [...new Set(group.map(canonical))]; if (serializations.length === 1) selected.push(group[0]!); else gaps.push({ code: "corrupt-duplicate-contribution", message: `Conflicting context copies for ${key}.` }); } return { items: selected.sort((a, b) => `${a.role}\u0000${refKey(a.ref)}`.localeCompare(`${b.role}\u0000${refKey(b.ref)}`, "en")), gaps }; }
function canonical(value: unknown): string { return JSON.stringify(value, (_key, candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate) ? Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, (candidate as Record<string, unknown>)[key]])) : candidate); }
function refKey(ref: BasisContribution["ref"]): string { return Object.keys(ref).sort().map((key) => `${key}=${(ref as Record<string, string>)[key]}`).join("\u0000"); }
function regionFor(role: BasisContribution["role"]): keyof BasisProjection["regions"] { return ({ input: "inputs", execution: "execution", process: "process", outcome: "outcomes", source: "sources", live: "live" } as const)[role]; }
function sameAnswer(left: ThreadAnswerRef, right: ThreadAnswerRef): boolean { return left.authority === right.authority && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.standing === right.standing && left.threadId === right.threadId && left.messageId === right.messageId; }
function assessmentRelationships(input: BasisCompositionInput): BasisRelationship[] { if (input.assessment.state !== "available" || !input.assessment.value.found || !input.assessment.value.claim) return []; const assessment = input.assessment.value; const claim = assessment.claim!.id; return [...assessment.evidence.cited.map((item) => ({ kind: "cites" as const, from: claim, to: `evidence:${item.id}`, source: "surface-assessment" as const, gaps: [] })), ...assessment.evidence.entails.map((item) => ({ kind: "supports" as const, from: `evidence:${item.id}`, to: claim, source: "surface-assessment" as const, gaps: [] })), ...assessment.evidence.counterevidence.map((item) => ({ kind: "counterevidence" as const, from: `evidence:${item.id}`, to: claim, source: "surface-assessment" as const, gaps: [] })), ...assessment.derivation.directInputs.map((item) => ({ kind: "derived-from" as const, from: claim, to: `claim:${item.claimId}`, source: "surface-assessment" as const, gaps: [] }))]; }
