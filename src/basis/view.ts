import { parseBasisProjection } from "./parser.js";
import type { BasisAssessmentEvidence, BasisGap, BasisProjection, BasisRegionItem, BasisRelationship, BasisStanding } from "./types.js";

/** Stable, renderer-neutral Viewer contract for one parsed Basis projection. */
export const SURFACE_BASIS_PANEL_VIEW_VERSION = "surface.basis-panel-view/v1" as const;

export type BasisPanelTone = "positive" | "caution" | "negative" | "neutral";
export interface BasisPanelStanding {
  code: BasisStanding;
  label: string;
  description: string;
  tone: BasisPanelTone;
  unresolvedReason: string | null;
}
export interface BasisPanelEvidencePartition { label: string; items: readonly BasisAssessmentEvidence[]; }
export interface BasisPanelContextGroup { key: "inputs" | "execution" | "process" | "outcomes" | "sources" | "live"; label: string; items: readonly BasisRegionItem[]; }
export interface BasisPanelRelationship { relationship: BasisRelationship; prose: string; }
export interface BasisPanelTechnicalModel { answerOwner: string; answerState: string; assessmentOwner: string; assessmentState: string; bundleId: string | null; claimId: string | null; }
export interface BasisPanelReadyViewModel {
  version: typeof SURFACE_BASIS_PANEL_VIEW_VERSION;
  state: "ready";
  title: "Basis";
  standing: BasisPanelStanding;
  gaps: readonly BasisGap[];
  assessment: { found: boolean; evidence: readonly BasisPanelEvidencePartition[]; policy: string | null } | null;
  contextNotice: string;
  contextGroups: readonly BasisPanelContextGroup[];
  relationships: readonly BasisPanelRelationship[];
  technical: BasisPanelTechnicalModel;
}
export interface BasisPanelUnavailableViewModel {
  version: typeof SURFACE_BASIS_PANEL_VIEW_VERSION;
  state: "unavailable";
  title: "Basis";
  standing: BasisPanelStanding;
  gaps: readonly BasisGap[];
  assessment: null;
  contextNotice: string;
  contextGroups: readonly [];
  relationships: readonly [];
  technical: null;
}
export type BasisPanelViewModel = BasisPanelReadyViewModel | BasisPanelUnavailableViewModel;

const CONTEXT_NOTICE = "Context records describe surrounding work; they do not establish support without an explicit Surface assessment relationship.";
const GROUPS: ReadonlyArray<{ key: BasisPanelContextGroup["key"]; label: string }> = [
  { key: "inputs", label: "Inputs" }, { key: "execution", label: "Execution" }, { key: "process", label: "Process" },
  { key: "outcomes", label: "Outcomes" }, { key: "sources", label: "Sources" }, { key: "live", label: "Live" },
];

/** Total untrusted-input boundary; rejected values never reach a renderer. */
export function buildBasisPanelViewModel(projection: unknown): BasisPanelViewModel {
  try {
    const parsed = parseBasisProjection(projection);
    return parsed.ok ? ready(parsed.value) : unavailable();
  } catch {
    return unavailable();
  }
}

function ready(projection: BasisProjection): BasisPanelReadyViewModel {
  const assessment = projection.assessment.state === "available" ? projection.assessment.value : null;
  return {
    version: SURFACE_BASIS_PANEL_VIEW_VERSION,
    state: "ready",
    title: "Basis",
    standing: standingFor(projection.standing, projection.unresolvedReason),
    gaps: projection.gaps,
    assessment: assessment ? {
      found: assessment.found,
      policy: assessment.policy ? (assessment.policy.satisfied ? "Policy satisfied" : "Policy not satisfied") : null,
      evidence: [
        { label: "Entailing evidence", items: assessment.evidence.entails },
        { label: "Citations", items: assessment.evidence.cited },
        { label: "Counterevidence", items: assessment.evidence.counterevidence },
      ],
    } : null,
    contextNotice: CONTEXT_NOTICE,
    contextGroups: GROUPS.map(({ key, label }) => ({ key, label, items: projection.regions[key] })),
    relationships: projection.relationships.map((relationship) => ({ relationship, prose: relationshipProse(relationship) })),
    technical: {
      answerOwner: projection.answer.owner.authority,
      answerState: projection.answer.state,
      assessmentOwner: projection.assessment.owner.authority,
      assessmentState: projection.assessment.state,
      bundleId: assessment?.bundle.id ?? null,
      claimId: assessment?.claim?.id ?? null,
    },
  };
}

function unavailable(): BasisPanelUnavailableViewModel {
  return {
    version: SURFACE_BASIS_PANEL_VIEW_VERSION, state: "unavailable", title: "Basis",
    standing: { code: "unresolved", label: "Cannot be read", description: "Basis information is unavailable or invalid.", tone: "negative", unresolvedReason: "invalid-projection" },
    gaps: [{ code: "basis-unavailable", message: "Basis information is unavailable or invalid." }],
    assessment: null, contextNotice: CONTEXT_NOTICE, contextGroups: [], relationships: [], technical: null,
  };
}

function standingFor(code: BasisStanding, reason: string | null): BasisPanelStanding {
  if (code === "policy-met") return { code, label: "Policy met", description: "Surface assessment found the claim verified with its policy conditions met.", tone: "positive", unresolvedReason: null };
  if (code === "assessed-with-gaps") return { code, label: "Assessed with gaps", description: "Surface assessed this answer, but gaps or caution remain.", tone: "caution", unresolvedReason: null };
  if (code === "execution-only") return { code, label: "Unassessed", description: "Context is available, but no Surface assessment was captured.", tone: "neutral", unresolvedReason: null };
  const label = reason?.includes("restricted") ? "Restricted" : reason?.includes("stale") ? "Needs refresh" : reason?.includes("unsupported-version") ? "Unsupported version" : reason?.includes("corrupt") ? "Cannot be read" : reason?.includes("not-captured") ? "Not captured" : "Temporarily unavailable";
  return { code, label, description: `Basis is unresolved${reason ? `: ${reason.replaceAll("-", " ")}` : ""}.`, tone: "negative", unresolvedReason: reason };
}

function relationshipProse(relationship: BasisRelationship): string {
  return relationship.kind === "cites" ? "Claim cites evidence." : relationship.kind === "supports" ? "Evidence supports claim." : relationship.kind === "counterevidence" ? "Evidence counters claim." : "Claim is derived from another claim.";
}
