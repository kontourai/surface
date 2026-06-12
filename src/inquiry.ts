/**
 * Inquiry resolution — ADR 0003 steps 3 & 4.
 *
 * resolveInquiry: exact-match and rule-based resolution of an Inquiry against
 * a TrustBundle, producing an append-only InquiryRecord.
 *
 * evaluateDerivationRule: pure function that checks whether a DerivationRule
 * is satisfied by the claims in a TrustBundle.
 */
import type {
  Claim,
  DerivationClaimRequirement,
  DerivationRequirement,
  DerivationRule,
  IdentityLink,
  Inquiry,
  InquiryRecord,
  TrustBundle,
  TrustStatus,
  VerificationEvent,
} from "./types.js";
import type { CanonicalClaimTarget } from "./canonical.js";
import { canonicalClaimKey } from "./canonical.js";
import { deriveClaimStatus, statusFunctionVersion } from "./status.js";
import { weakerStatus } from "./derivation.js";

// ---------------------------------------------------------------------------
// Public API — Step 3: exact-match resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an Inquiry against a TrustBundle, returning an immutable
 * InquiryRecord.  The caller is responsible for persisting the record.
 * resolveInquiry never mutates the bundle.
 */
export function resolveInquiry(
  bundle: TrustBundle,
  inquiry: Inquiry,
  options: { now?: Date; rules?: DerivationRule[] } = {},
): InquiryRecord {
  const now = options.now ?? new Date();
  const resolvedAt = now.toISOString();
  const rules = options.rules ?? [];

  // Natural-language-only inquiries (no canonical target) → unsupported.
  if (!inquiry.target) {
    return {
      id: inquiry.id,
      inquiry,
      outcome: "unsupported",
      resolutionPath: { claimIds: [] },
      inputSnapshot: [],
      statusFunctionVersion: statusFunctionVersion,
      resolvedAt,
    };
  }

  const inquiryKey = canonicalClaimKey(inquiry.target);

  // --- Exact match ---
  for (const claim of bundle.claims) {
    const claimKey = canonicalClaimKey(claimToTarget(claim));
    if (claimKey === inquiryKey) {
      const evidence = bundle.evidence.filter((e) => e.claimId === claim.id);
      const { status } = deriveClaimStatus({
        claim,
        evidence,
        events: bundle.events,
        policies: bundle.policies,
        now,
      });
      return {
        id: inquiry.id,
        inquiry,
        outcome: "matched",
        resolutionPath: { claimIds: [claim.id] },
        answer: { value: claim.value, status },
        inputSnapshot: [{ claimId: claim.id, status }],
        statusFunctionVersion: statusFunctionVersion,
        resolvedAt,
      };
    }
  }

  // --- Derivation rules ---
  for (const rule of rules) {
    const ruleKey = canonicalClaimKey(rule.target);
    if (ruleKey !== inquiryKey) continue;

    const result = evaluateDerivationRule(rule, bundle, { now, rules });
    const inputSnapshot: Array<{ claimId: string; status: TrustStatus }> = result.inputs.map(
      (item) => ({ claimId: item.claimId, status: item.status }),
    );
    return {
      id: inquiry.id,
      inquiry,
      outcome: "derived",
      resolutionPath: {
        claimIds: result.inputs.map((item) => item.claimId),
        ruleId: rule.id,
        ruleVersion: rule.version,
        transitiveRuleIds: result.transitiveRuleIds,
      },
      answer: { value: result.satisfied, status: result.satisfied ? "verified" : "proposed" },
      inputSnapshot,
      statusFunctionVersion: statusFunctionVersion,
      resolvedAt,
    };
  }

  // --- Identity-link (mapping) resolution ---
  // Consult identityLinks with relation "equivalent" or "converts" to find a
  // co-referent claim that can answer the inquiry.
  if (Array.isArray(bundle.identityLinks)) {
    const mappingResult = resolveViaIdentityLinks(bundle, inquiry.target, inquiryKey, now);
    if (mappingResult !== null) {
      return {
        id: inquiry.id,
        inquiry,
        outcome: "matched",
        resolutionPath: {
          claimIds: [mappingResult.claimId],
          identityLinkIds: [mappingResult.linkId],
        },
        answer: { value: mappingResult.value, status: mappingResult.status },
        inputSnapshot: [{ claimId: mappingResult.claimId, status: mappingResult.rawStatus }],
        statusFunctionVersion: statusFunctionVersion,
        resolvedAt,
      };
    }
  }

  // --- Unsupported ---
  return {
    id: inquiry.id,
    inquiry,
    outcome: "unsupported",
    resolutionPath: { claimIds: [] },
    inputSnapshot: [],
    statusFunctionVersion: statusFunctionVersion,
    resolvedAt,
  };
}

// ---------------------------------------------------------------------------
// Mapping resolution helpers
// ---------------------------------------------------------------------------

interface MappingResolution {
  claimId: string;
  linkId: string;
  value: unknown;
  /** The (possibly capped) answer status. */
  status: TrustStatus;
  /** The raw claim status before mapping-claim capping. */
  rawStatus: TrustStatus;
}

/**
 * Walk identityLinks to find a claim that co-refers to the inquiry target.
 * Handles "equivalent" (direct value forwarding) and "converts" (numeric
 * factor/offset transformation).  The mapping claim's status is applied as a
 * weakest-link ceiling when mappingClaimId is set.
 */
function resolveViaIdentityLinks(
  bundle: TrustBundle,
  target: CanonicalClaimTarget,
  inquiryKey: string,
  now: Date,
): MappingResolution | null {
  const links = bundle.identityLinks ?? [];

  for (const link of links) {
    // Only process equivalent and converts relations (subsumes is asymmetric).
    const relation = link.relation ?? "equivalent";
    if (relation !== "equivalent" && relation !== "converts") continue;

    if (!Array.isArray(link.subjects) || link.subjects.length < 2) continue;

    // Check whether any subject in this link matches the inquiry target
    // (same subjectType + subjectId).
    const matchIdx = link.subjects.findIndex(
      (s) => s.subjectType === target.subjectType && s.subjectId === target.subjectId,
    );
    if (matchIdx === -1) continue;

    // The co-referent subjects are the other members of the link.
    for (let i = 0; i < link.subjects.length; i++) {
      if (i === matchIdx) continue;
      const coRef = link.subjects[i];

      // Look for a claim matching the co-referent subject with the same field.
      const coRefKey = canonicalClaimKey({
        subjectType: coRef.subjectType,
        subjectId: coRef.subjectId,
        fieldOrBehavior: target.fieldOrBehavior,
        qualifiers: target.qualifiers,
      });

      for (const claim of bundle.claims) {
        const claimKey = canonicalClaimKey(claimToTarget(claim));
        if (claimKey !== coRefKey) continue;

        // Found a co-referent claim.
        const evidence = bundle.evidence.filter((e) => e.claimId === claim.id);
        const { status: rawStatus } = deriveClaimStatus({
          claim,
          evidence,
          events: bundle.events,
          policies: bundle.policies,
          now,
        });

        // Compute the answer value (apply conversion if needed).
        let value: unknown = claim.value;
        if (relation === "converts" && link.conversion) {
          const num = toNumber(claim.value);
          if (num !== null) {
            const factor = link.conversion.factor ?? 1;
            const offset = link.conversion.offset ?? 0;
            value = num * factor + offset;
          }
        }

        // Apply weakest-link: if the link cites a mapping claim, cap by its status.
        let answerStatus: TrustStatus = rawStatus;
        if (link.mappingClaimId) {
          const mappingClaim = bundle.claims.find((c) => c.id === link.mappingClaimId);
          if (mappingClaim) {
            const mappingEvidence = bundle.evidence.filter((e) => e.claimId === mappingClaim.id);
            const { status: mappingStatus } = deriveClaimStatus({
              claim: mappingClaim,
              evidence: mappingEvidence,
              events: bundle.events,
              policies: bundle.policies,
              now,
            });
            answerStatus = weakerStatus(rawStatus, mappingStatus);
          }
        }

        return {
          claimId: claim.id,
          linkId: link.id ?? `link:${link.subjects.map((s) => `${s.subjectType}::${s.subjectId}`).join(",")}`,
          value,
          status: answerStatus,
          rawStatus,
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API — Step 4: derivation rule evaluation
// ---------------------------------------------------------------------------

export interface DerivationRuleResult {
  satisfied: boolean;
  inputs: Array<{ claimId: string; status: TrustStatus; requirementMet: boolean }>;
  missing: CanonicalClaimTarget[];
  /**
   * Rule ids of all transitively-referenced rules that contributed (via ruleRef
   * requirements) to this result, in evaluation order.  Undefined when no ruleRef
   * requirements were used.
   */
  transitiveRuleIds?: string[];
}

/**
 * Evaluate a DerivationRule against the claims in a TrustBundle.
 * Returns whether the rule is satisfied, the per-requirement inputs, and any
 * missing claims.
 */
export function evaluateDerivationRule(
  rule: DerivationRule,
  bundle: TrustBundle,
  options: { now?: Date; rules?: DerivationRule[] } = {},
): DerivationRuleResult {
  return evaluateDerivationRuleInternal(rule, bundle, options, new Set<string>());
}

/**
 * Internal recursive implementation with cycle detection.
 * visitedRuleIds tracks the chain of rule ids currently being evaluated to
 * detect and break cycles.
 */
function evaluateDerivationRuleInternal(
  rule: DerivationRule,
  bundle: TrustBundle,
  options: { now?: Date; rules?: DerivationRule[] },
  visitedRuleIds: Set<string>,
): DerivationRuleResult {
  const now = options.now ?? new Date();
  const rules = options.rules ?? [];
  const inputs: Array<{ claimId: string; status: TrustStatus; requirementMet: boolean }> = [];
  const missing: CanonicalClaimTarget[] = [];
  const transitiveRuleIds: string[] = [];

  const requirementResults: boolean[] = [];

  // Track this rule as being evaluated (for cycle detection in recursive calls)
  // nextVisited includes the current rule so that self-references are caught.
  const nextVisited = new Set(visitedRuleIds);
  nextVisited.add(rule.id);

  for (const req of rule.requirements) {
    // --- Rule-reference requirement ---
    if (isRuleRefRequirement(req)) {
      if (nextVisited.has(req.ruleRef)) {
        // Cycle detected — fail the requirement
        requirementResults.push(false);
        // We push a sentinel: no claimId, but the caller can see requirementMet=false
        // We use the missing array to signal the cycle via a synthetic target
        missing.push({
          subjectType: "_cycle_",
          subjectId: req.ruleRef,
          fieldOrBehavior: "_ruleRef_",
        });
        continue;
      }
      const refRule = rules.find((r) => r.id === req.ruleRef);
      if (!refRule) {
        missing.push({
          subjectType: "_missing_rule_",
          subjectId: req.ruleRef,
          fieldOrBehavior: "_ruleRef_",
        });
        requirementResults.push(false);
        continue;
      }
      const refResult = evaluateDerivationRuleInternal(refRule, bundle, options, nextVisited);
      // Absorb transitive claim and rule ids
      for (const inp of refResult.inputs) {
        if (!inputs.some((i) => i.claimId === inp.claimId)) {
          inputs.push(inp);
        }
      }
      transitiveRuleIds.push(req.ruleRef);
      if (Array.isArray(refResult.transitiveRuleIds)) {
        for (const rid of refResult.transitiveRuleIds) {
          if (!transitiveRuleIds.includes(rid)) transitiveRuleIds.push(rid);
        }
      }
      requirementResults.push(refResult.satisfied);
      continue;
    }

    // --- Claim-based requirement ---
    const claimReq = req as DerivationClaimRequirement;
    const reqKey = canonicalClaimKey(claimReq.target);
    const claim = bundle.claims.find((c) => canonicalClaimKey(claimToTarget(c)) === reqKey);

    if (!claim) {
      missing.push(claimReq.target);
      requirementResults.push(false);
      continue;
    }

    const evidence = bundle.evidence.filter((e) => e.claimId === claim.id);
    const { status } = deriveClaimStatus({
      claim,
      evidence,
      events: bundle.events,
      policies: bundle.policies,
      now,
    });

    const statusOk = claimReq.acceptedStatuses.includes(status);
    const predicateOk = claimReq.predicate ? evaluatePredicate(claimReq.predicate, claim.value) : true;
    const freshnessOk = claimReq.fresherThan
      ? evaluateFresherThan(claim, bundle.events, claimReq.fresherThan.days, now)
      : true;
    const requirementMet = statusOk && predicateOk && freshnessOk;

    inputs.push({ claimId: claim.id, status, requirementMet });
    requirementResults.push(requirementMet);
  }

  const satisfied = requirementResults.length === 0
    ? false
    : rule.combinator === "all"
      ? requirementResults.every(Boolean)
      : requirementResults.some(Boolean);

  return { satisfied, inputs, missing, transitiveRuleIds: transitiveRuleIds.length > 0 ? transitiveRuleIds : undefined };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function claimToTarget(claim: Claim): CanonicalClaimTarget {
  return {
    subjectType: claim.subjectType,
    subjectId: claim.subjectId,
    fieldOrBehavior: claim.fieldOrBehavior,
    qualifiers: claim.qualifiers,
  };
}

/**
 * Type-guard: returns true when a DerivationRequirement is a ruleRef requirement.
 */
function isRuleRefRequirement(req: DerivationRequirement): req is { ruleRef: string } {
  return typeof (req as { ruleRef?: unknown }).ruleRef === "string";
}

/**
 * Evaluate the fresherThan constraint for a claim-based requirement.
 * The authoritative verification timestamp is:
 *   latest verifying event's verifiedAt ?? createdAt  →  fallback to claim.updatedAt
 */
function evaluateFresherThan(
  claim: Claim,
  events: VerificationEvent[],
  days: number,
  now: Date,
): boolean {
  // Find the most recent event that marks the claim as verified (or a positive verifying status)
  const verifyingStatuses = new Set(["verified", "assumed"]);
  const claimEvents = events
    .filter((e) => e.claimId === claim.id && verifyingStatuses.has(e.status))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  let authTimestamp: number;
  if (claimEvents.length > 0) {
    const latestEvent = claimEvents[0];
    const ts = latestEvent.verifiedAt ?? latestEvent.createdAt;
    authTimestamp = Date.parse(ts);
  } else {
    authTimestamp = Date.parse(claim.updatedAt);
  }

  if (!Number.isFinite(authTimestamp)) return false;

  const windowMs = days * 24 * 60 * 60 * 1000;
  return now.getTime() - authTimestamp <= windowMs;
}

function evaluatePredicate(
  predicate: NonNullable<DerivationClaimRequirement["predicate"]>,
  value: unknown,
): boolean {
  const { op, value: operand } = predicate;

  if (op === "exists") {
    return value !== undefined && value !== null;
  }

  if (op === "in") {
    if (!Array.isArray(operand)) return false;
    return operand.some((item) => item === value);
  }

  // Numeric comparisons — coerce numeric strings
  const num = toNumber(value);
  const opNum = toNumber(operand);

  if (op === "eq") return value === operand || (num !== null && opNum !== null && num === opNum);
  if (op === "neq") return value !== operand && !(num !== null && opNum !== null && num === opNum);

  if (num === null || opNum === null) return false;
  if (op === "gt") return num > opNum;
  if (op === "gte") return num >= opNum;
  if (op === "lt") return num < opNum;
  if (op === "lte") return num <= opNum;

  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
