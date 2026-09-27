// Claim basis view (kontourai/ui#87): the one-line answer to "how was this
// claim's status established?", shown after the status chip.
//
// The summary logic lives here, not in renderers, for the same reason
// display-names.ts exists: if each renderer picks its own facets and order,
// the basis line forks per product. Renderers take the returned view as-is.
//
// Rules (docs/reference/claim-basis-view.md):
// - At most 3 facets on the line. Caveats come first, in a fixed order, and
//   are never dropped to meet that limit: when there are more than 3 caveats
//   the line carries all of them and nothing else. A failed check always
//   reaches the line, as "contradicts the claim" or "failed (cited only)" /
//   "failed (not blocking)".
// - After caveats: method, then support counts, then review. Line support
//   counts cover only evidence that did not fail, so one item never reads as
//   both failing and supporting the claim.
// - Only evidence linked to this claim (`claimId === claim.id`) bears on it.
//   Execution-trail tool calls and other claims' evidence never reach the
//   line or its counts.
// - Results come from `passing` / `blocking` only. `execution.isError` and a
//   non-zero `exitCode` mean the check ran and failed (producers set isError
//   from the exit code or the MCP tool result), so they are classified like
//   any other result, as status derivation does. No field says "the check
//   could not run" yet; hachure-org/spec#25 proposes `evidence.inconclusive`,
//   and a "could not run" caveat belongs after Model-derived once it lands.
// - Multiple methods are listed in Surface's enum order (no depth ranking
//   exists), collapsed to "<first> + N more methods".
// - The producer's own `confidenceBasis.evidenceStrength` and the calibrated
//   `conclusionConfidence` appear only in inspector `detail` rows, labelled as
//   producer-supplied. Neither is a facet. `conclusionConfidence` is shown as
//   a probability that the conclusion is correct, never as a value range.
// - Never blank: a claim with nothing to summarize gets a labelled missing
//   state.
//
// Pure and deterministic: no DOM, no clock, no I/O.

import {
  CLAIM_BASIS_MISSING_LABELS,
  DERIVATION_METHOD_LABELS,
  EVIDENCE_METHOD_LABELS,
  EVIDENCE_RESULT_LABELS,
  EVIDENCE_STRENGTH_LABELS,
  REVIEWER_AUTHORITY_LABELS,
  type ClaimBasisMissingState,
  type EvidenceResultState,
  type EvidenceSupportState,
} from "./display-names.js";
import { isStandingCounterevidence } from "./evidence-support.js";
import type { Claim, Evidence } from "./types.js";
import { DERIVATION_METHODS, EVIDENCE_METHODS } from "./validation/constants.js";

/** Maximum facets on the basis line, unless caveats alone exceed it. */
export const CLAIM_BASIS_LINE_MAX_FACETS = 3;

/** Which field a basis facet summarizes. */
export type TrustBasisFacetField =
  | "derivationMethod"
  | "result"
  | "supportStrength"
  | "counterevidence"
  | "method"
  | "reviewerAuthority";

/** One item on the basis line. */
export interface TrustBasisFacet {
  field: TrustBasisFacetField;
  /** Machine-readable value, e.g. a wire enum or a derived state code. */
  code: string;
  /** Reader-facing text, ready to render. */
  label: string;
  /** True for facets that limit how far the status can be relied on. */
  caveat: boolean;
}

/** One labelled inspector row. */
export interface TrustBasisDetailRow {
  label: string;
  value: string;
}

/** A claim whose basis Surface can summarize. */
export interface TrustBasisRecordedView {
  state: "recorded";
  facets: TrustBasisFacet[];
  detail?: TrustBasisDetailRow[];
}

/** A claim whose basis cannot be summarized; `label` is always non-empty. */
export interface TrustBasisMissingView {
  state: ClaimBasisMissingState;
  label: string;
  /** Inspector rows for what is recorded but not part of the basis line (e.g. a producer rating). */
  detail?: TrustBasisDetailRow[];
}

export type TrustBasisView = TrustBasisRecordedView | TrustBasisMissingView;

/**
 * Missing-state view for cases a host detects outside the claim record:
 * a permission denial (`restricted`), a failed read (`unavailable`), or a host
 * that cannot or should not say which (`not-available`).
 */
export function missingClaimBasisView(state: ClaimBasisMissingState): TrustBasisMissingView {
  return { state, label: CLAIM_BASIS_MISSING_LABELS[state] };
}

/** Support state of one evidence item as a reader sees it (absent → `unstated`). */
export function evidenceSupportState(evidence: Pick<Evidence, "supportStrength">): EvidenceSupportState {
  const value = evidence.supportStrength;
  return value === "entails" || value === "cited" ? value : "unstated";
}

/** Result state of one evidence item. Absent `passing` is `not-evaluated`, never a pass. */
export function evidenceResultState(evidence: Pick<Evidence, "passing" | "blocking">): EvidenceResultState {
  if (evidence.passing === true) return "passed";
  if (evidence.passing === false) return evidence.blocking === true ? "failed-blocking" : "failed";
  return "not-evaluated";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Count form of a support state, e.g. "2 entail the claim", "1 cited only". */
function supportCountLabel(state: EvidenceSupportState, count: number): string {
  if (state === "entails") return `${count} ${count === 1 ? "entails" : "entail"} the claim`;
  if (state === "cited") return `${count} cited only`;
  return `${count} with support not stated`;
}

function contradictsLabel(count: number): string {
  return `${count} ${count === 1 ? "contradicts" : "contradict"} the claim`;
}

/** Label for a wire value; an unrecognized one is named as such, not shown bare. */
function knownLabel(labels: Record<string, string>, value: string, kind: string): string {
  return Object.hasOwn(labels, value) ? labels[value]! : `Unrecognized ${kind} (${value})`;
}

/** A finite probability in [0, 1], else undefined. */
function probability(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

function countBy<T extends string>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** Known enum members in enum order, then unknown values in first-seen order. */
function enumOrdered(counts: Map<string, number>, order: readonly string[]): string[] {
  const known = order.filter((value) => counts.has(value));
  const unknown = [...counts.keys()].filter((value) => !order.includes(value));
  return [...known, ...unknown];
}

function methodFacet(field: "method" | "derivationMethod", ordered: string[], labels: Record<string, string>): TrustBasisFacet {
  const first = ordered[0]!;
  const firstLabel = knownLabel(labels, first, "method");
  const more = ordered.length - 1;
  return {
    field,
    code: first,
    label: more === 0 ? firstLabel : `${firstLabel} + ${plural(more, "more method", "more methods")}`,
    caveat: false,
  };
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

/**
 * Summarize how a claim's status was established.
 *
 * `evidence` may be the claim's evidence or a whole bundle's; only items whose
 * `claimId` equals `claim.id` are used. A null/undefined claim yields the
 * `not-available` state.
 */
export function claimBasisView(claim: Claim | null | undefined, evidence: readonly Evidence[] = []): TrustBasisView {
  if (!claim) return missingClaimBasisView("not-available");

  const items = evidence.filter((item) => item.claimId === claim.id);
  const edges = claim.derivationEdges ?? [];
  const reviewer = claim.confidenceBasis?.reviewerAuthority;
  const producerStrength = claim.confidenceBasis?.evidenceStrength;
  const confidence = claim.conclusionConfidence;

  // ── Evidence partitions ────────────────────────────────────────────────
  // Counterevidence is exactly Surface's `isStandingCounterevidence`. Every
  // other failure is labelled by why it is not counterevidence, so no failure
  // is left off the line: `supportStrength: "cited"` → "cited only"
  // (checked first: cited evidence never counts, whatever `blocking` says),
  // otherwise `blocking: false` → "not blocking".
  const notEvaluated = items.filter((item) => evidenceResultState(item) === "not-evaluated");
  const counterevidence = items.filter(isStandingCounterevidence).length;
  const otherFailures = items.filter((item) => item.passing === false && !isStandingCounterevidence(item));
  const failedCitedOnly = otherFailures.filter((item) => item.supportStrength === "cited").length;
  const failedNotBlocking = otherFailures.length - failedCitedOnly;
  // Inspector: full partition. Line: only evidence that did not fail, so one
  // item never reads as both contradicting and supporting the claim.
  const support = countBy(items.map(evidenceSupportState));
  const lineSupport = countBy(items.filter((item) => item.passing !== false).map(evidenceSupportState));
  const evidenceMethods = countBy(items.map((item) => String(item.method ?? "")).filter((value) => value !== ""));
  const orderedEvidenceMethods = enumOrdered(evidenceMethods, EVIDENCE_METHODS);

  // ── Derivation partitions ──────────────────────────────────────────────
  const derivationMethods = countBy(edges.map((edge) => String(edge.method ?? "")).filter((value) => value !== ""));
  const modelInputs = derivationMethods.get("model") ?? 0;
  const nonModelDerivation = new Map([...derivationMethods].filter(([method]) => method !== "model"));
  const orderedDerivationMethods = enumOrdered(nonModelDerivation, DERIVATION_METHODS);

  // ── Facets: caveats in fixed order, then method, support, review ────────
  const caveats: TrustBasisFacet[] = [];
  if (modelInputs > 0) caveats.push({ field: "derivationMethod", code: "model", label: DERIVATION_METHOD_LABELS.model, caveat: true });
  if (notEvaluated.length > 0) {
    caveats.push({ field: "result", code: "not-evaluated", label: `${notEvaluated.length} not evaluated`, caveat: true });
  }
  const cited = lineSupport.get("cited") ?? 0;
  if (cited > 0) caveats.push({ field: "supportStrength", code: "cited", label: supportCountLabel("cited", cited), caveat: true });
  if (counterevidence > 0) {
    caveats.push({ field: "counterevidence", code: "counterevidence", label: contradictsLabel(counterevidence), caveat: true });
  }
  if (otherFailures.length > 0) {
    // One slot, labelled by reason: "2 failed (cited only)",
    // "1 failed (not blocking)", or "3 failed (1 not blocking, 2 cited only)".
    const code = failedCitedOnly === 0 ? "failed-not-blocking" : failedNotBlocking === 0 ? "failed-cited-only" : "failed-mixed";
    const reason =
      code === "failed-not-blocking" ? "not blocking" : code === "failed-cited-only" ? "cited only" : `${failedNotBlocking} not blocking, ${failedCitedOnly} cited only`;
    caveats.push({ field: "result", code, label: `${otherFailures.length} failed (${reason})`, caveat: true });
  }

  const rest: TrustBasisFacet[] = [];
  if (orderedEvidenceMethods.length > 0) {
    rest.push(methodFacet("method", orderedEvidenceMethods, EVIDENCE_METHOD_LABELS));
  } else if (orderedDerivationMethods.length > 0) {
    rest.push(methodFacet("derivationMethod", orderedDerivationMethods, DERIVATION_METHOD_LABELS));
  } else if (edges.length > 0 && modelInputs === 0) {
    rest.push({ field: "derivationMethod", code: "unstated", label: `Derived from ${plural(edges.length, "input", "inputs")}`, caveat: false });
  }
  const entails = lineSupport.get("entails") ?? 0;
  if (entails > 0) rest.push({ field: "supportStrength", code: "entails", label: supportCountLabel("entails", entails), caveat: false });
  const unstated = lineSupport.get("unstated") ?? 0;
  if (unstated > 0) rest.push({ field: "supportStrength", code: "unstated", label: supportCountLabel("unstated", unstated), caveat: false });
  if (reviewer !== undefined && reviewer !== "none") {
    rest.push({ field: "reviewerAuthority", code: reviewer, label: knownLabel(REVIEWER_AUTHORITY_LABELS, reviewer, "reviewer"), caveat: false });
  }

  const facets = [...caveats, ...rest.slice(0, Math.max(0, CLAIM_BASIS_LINE_MAX_FACETS - caveats.length))];

  // ── Inspector rows ─────────────────────────────────────────────────────
  const detail: TrustBasisDetailRow[] = [];
  if (orderedEvidenceMethods.length > 0) {
    detail.push({
      label: "How",
      value: orderedEvidenceMethods.map((method) => `${knownLabel(EVIDENCE_METHOD_LABELS, method, "method")} (${evidenceMethods.get(method)})`).join(" · "),
    });
  }
  if (items.length > 0) {
    const parts = (["entails", "cited", "unstated"] as const)
      .filter((state) => (support.get(state) ?? 0) > 0)
      .map((state) => supportCountLabel(state, support.get(state)!));
    if (counterevidence > 0) parts.push(contradictsLabel(counterevidence));
    detail.push({ label: "Support", value: parts.join(" · ") });

    const results = countBy(items.map(evidenceResultState));
    const resultParts = (["passed", "failed", "failed-blocking", "not-evaluated"] as const)
      .filter((state) => (results.get(state) ?? 0) > 0)
      .map((state) => `${results.get(state)} ${EVIDENCE_RESULT_LABELS[state].toLowerCase()}`);
    detail.push({ label: "Results", value: resultParts.join(" · ") });
  }
  if (edges.length > 0) {
    const ordered = enumOrdered(derivationMethods, DERIVATION_METHODS);
    const parts = ordered.map((method) => {
      const label = knownLabel(DERIVATION_METHOD_LABELS, method, "method");
      return `${label} (${plural(derivationMethods.get(method)!, "input", "inputs")})`;
    });
    const unstatedEdges = edges.filter((edge) => !edge.method).length;
    if (unstatedEdges > 0) parts.push(`Method not stated (${plural(unstatedEdges, "input", "inputs")})`);
    detail.push({ label: "Derived", value: parts.join(" · ") });
  }
  if (reviewer !== undefined) {
    detail.push({ label: "Review", value: knownLabel(REVIEWER_AUTHORITY_LABELS, reviewer, "reviewer") });
  }
  if (producerStrength !== undefined) {
    detail.push({
      label: "Producer rating",
      value: Object.hasOwn(EVIDENCE_STRENGTH_LABELS, producerStrength)
        ? EVIDENCE_STRENGTH_LABELS[producerStrength]
        : `Unrecognized rating (${producerStrength}) (producer-rated)`,
    });
  }
  const confidenceValue = probability(confidence?.value);
  if (confidence && confidenceValue !== undefined) {
    // The value and interval bound the probability that the conclusion is
    // correct; they are not a range for the claim's value. Values outside
    // [0, 1] (or non-finite) are not probabilities and are left out.
    const low = probability(confidence.interval?.low);
    const high = probability(confidence.interval?.high);
    const interval = low !== undefined && high !== undefined && low <= high ? `, interval ${formatNumber(low)}–${formatNumber(high)}` : "";
    const method = typeof confidence.method === "string" && confidence.method !== "" ? ` · ${confidence.method}` : "";
    detail.push({
      label: "Calibrated confidence (producer-supplied)",
      value: `${formatNumber(confidenceValue)} probability the conclusion is correct${interval}${method}`,
    });
  }
  if (items.length > 0) {
    const sources = new Set(items.map((item) => item.sourceRef)).size;
    detail.push({ label: "Sources", value: plural(sources, "distinct source", "distinct sources") });
  }

  if (facets.length === 0) {
    const missing = missingClaimBasisView("not-recorded");
    return detail.length > 0 ? { ...missing, detail } : missing;
  }
  return detail.length > 0 ? { state: "recorded", facets, detail } : { state: "recorded", facets };
}
