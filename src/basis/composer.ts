import {
  SURFACE_BASIS_VERSION,
  type BasisCompositionInput,
  type BasisContribution,
  type BasisGap,
  type BasisProjection,
  type BasisRegionItem,
  type BasisRelationship,
  type BasisUnresolvedReason,
  type OwnerRead,
  type ThreadAnswerRef,
} from "./types.js";

/** Pure composition: no reads, I/O, mutation, or owner-policy interpretation. */
export function composeBasisProjection(input: BasisCompositionInput): BasisProjection {
  const regions: { [K in keyof BasisProjection["regions"]]: BasisRegionItem[] } = {
    inputs: [], execution: [], process: [], outcomes: [], support: [], sources: [], live: [],
  };
  const itemGaps: BasisGap[] = [];
  const matching = contributionsForAnswer(input.contributions, input.answer);
  for (const contribution of dedupeAndSort(matching)) {
    const region = regionFor(contribution.role);
    regions[region].push({ id: contribution.id, owner: contribution.owner, role: contribution.role, display: contribution.display, gaps: [] });
  }
  for (const read of input.contributions) {
    if (read.state !== "available" && read.state !== "observed-empty") {
      itemGaps.push({ code: `owner-${read.state}`, message: `Context from ${read.owner.authority} is ${read.state}.` });
    }
  }
  const assessmentGaps = input.assessment.state === "available" ? input.assessment.value.gaps : [];
  const standing = standingFor(input, matching.length > 0);
  const relationships = assessmentRelationships(input);
  return {
    version: SURFACE_BASIS_VERSION,
    answer: input.answer,
    standing: standing.standing,
    unresolvedReason: standing.reason,
    assessment: input.assessment,
    regions,
    relationships,
    gaps: [...assessmentGaps, ...itemGaps],
  };
}

function contributionsForAnswer(reads: readonly OwnerRead<readonly BasisContribution[]>[], answer: ThreadAnswerRef): BasisContribution[] {
  return reads.flatMap((read) => read.state === "available"
    ? read.value.filter((item) => sameAnswer(item.answer, answer) && sameOwner(item.owner, read.owner))
    : []);
}

function dedupeAndSort(items: readonly BasisContribution[]): BasisContribution[] {
  const seen = new Set<string>();
  return [...items].sort(compareContribution).filter((item) => {
    const key = `${item.owner.authority}\u0000${item.owner.schemaVersion}\u0000${item.owner.kind}\u0000${item.owner.component}\u0000${item.role}\u0000${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareContribution(left: BasisContribution, right: BasisContribution): number {
  return [left.role, left.owner.authority, left.owner.kind, left.id].join("\u0000").localeCompare([right.role, right.owner.authority, right.owner.kind, right.id].join("\u0000"), "en");
}

function regionFor(role: BasisContribution["role"]): keyof BasisProjection["regions"] {
  return ({ input: "inputs", execution: "execution", process: "process", outcome: "outcomes", source: "sources", live: "live" } as const)[role];
}

function sameAnswer(left: ThreadAnswerRef, right: ThreadAnswerRef): boolean {
  return left.authority === right.authority && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.threadId === right.threadId && left.messageId === right.messageId;
}

function sameOwner(left: BasisContribution["owner"], right: BasisContribution["owner"]): boolean {
  return left.authority === right.authority && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.component === right.component;
}

function standingFor(input: BasisCompositionInput, hasContext: boolean): { standing: BasisProjection["standing"]; reason: BasisUnresolvedReason | null } {
  if (input.assessment.state === "available") {
    if (!input.assessment.value.found) return { standing: "unresolved", reason: "claim-not-in-assessment" };
    return input.assessment.value.policy?.outcome === "satisfied"
      ? { standing: "policy-met", reason: null }
      : { standing: "assessed-with-gaps", reason: null };
  }
  if ((input.assessment.state === "not-captured" || input.assessment.state === "observed-empty") && hasContext) {
    return { standing: "execution-only", reason: null };
  }
  const reason: BasisUnresolvedReason = input.assessment.state === "observed-empty"
    ? "assessment-observed-empty"
    : input.assessment.state === "not-captured"
      ? "assessment-not-captured"
      : input.assessment.state === "restricted"
        ? "assessment-restricted"
        : input.assessment.state === "stale"
          ? "assessment-stale"
          : input.assessment.state === "corrupt"
            ? "assessment-corrupt"
            : input.assessment.state === "unsupported-version"
              ? "assessment-unsupported-version"
              : input.assessment.state === "unavailable"
                ? "assessment-unavailable"
                : "no-matching-context";
  return { standing: "unresolved", reason };
}

function assessmentRelationships(input: BasisCompositionInput): BasisRelationship[] {
  if (input.assessment.state !== "available" || !input.assessment.value.found || !input.assessment.value.claim) return [];
  const claim = input.assessment.value.claim;
  const gaps = input.assessment.value.gaps;
  return [
    ...input.assessment.value.evidence.cited.map((item) => ({ kind: "cites" as const, from: claim.id, to: `evidence:${item.id}`, source: "surface-assessment" as const, gaps })),
    ...input.assessment.value.evidence.entails.map((item) => ({ kind: "supports" as const, from: `evidence:${item.id}`, to: claim.id, source: "surface-assessment" as const, gaps })),
    ...input.assessment.value.derivation.directInputs.map((item) => ({ kind: "derived-from" as const, from: claim.id, to: `claim:${item.claimId}`, source: "surface-assessment" as const, gaps })),
  ];
}
