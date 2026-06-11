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
  DerivationRequirement,
  DerivationRule,
  Inquiry,
  InquiryRecord,
  TrustBundle,
  TrustStatus,
} from "./types.js";
import type { CanonicalClaimTarget } from "./canonical.js";
import { canonicalClaimKey } from "./canonical.js";
import { deriveClaimStatus, STATUS_FUNCTION_VERSION } from "./status.js";

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
      statusFunctionVersion: STATUS_FUNCTION_VERSION,
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
        statusFunctionVersion: STATUS_FUNCTION_VERSION,
        resolvedAt,
      };
    }
  }

  // --- Derivation rules ---
  for (const rule of rules) {
    const ruleKey = canonicalClaimKey(rule.target);
    if (ruleKey !== inquiryKey) continue;

    const result = evaluateDerivationRule(rule, bundle, { now });
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
      },
      answer: { value: result.satisfied, status: result.satisfied ? "verified" : "proposed" },
      inputSnapshot,
      statusFunctionVersion: STATUS_FUNCTION_VERSION,
      resolvedAt,
    };
  }

  // --- Unsupported ---
  return {
    id: inquiry.id,
    inquiry,
    outcome: "unsupported",
    resolutionPath: { claimIds: [] },
    inputSnapshot: [],
    statusFunctionVersion: STATUS_FUNCTION_VERSION,
    resolvedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API — Step 4: derivation rule evaluation
// ---------------------------------------------------------------------------

export interface DerivationRuleResult {
  satisfied: boolean;
  inputs: Array<{ claimId: string; status: TrustStatus; requirementMet: boolean }>;
  missing: CanonicalClaimTarget[];
}

/**
 * Evaluate a DerivationRule against the claims in a TrustBundle.
 * Returns whether the rule is satisfied, the per-requirement inputs, and any
 * missing claims.
 */
export function evaluateDerivationRule(
  rule: DerivationRule,
  bundle: TrustBundle,
  options: { now?: Date } = {},
): DerivationRuleResult {
  const now = options.now ?? new Date();
  const inputs: Array<{ claimId: string; status: TrustStatus; requirementMet: boolean }> = [];
  const missing: CanonicalClaimTarget[] = [];

  const requirementResults: boolean[] = [];

  for (const req of rule.requirements) {
    const reqKey = canonicalClaimKey(req.target);
    const claim = bundle.claims.find((c) => canonicalClaimKey(claimToTarget(c)) === reqKey);

    if (!claim) {
      missing.push(req.target);
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

    const statusOk = req.acceptedStatuses.includes(status);
    const predicateOk = req.predicate ? evaluatePredicate(req.predicate, claim.value) : true;
    const requirementMet = statusOk && predicateOk;

    inputs.push({ claimId: claim.id, status, requirementMet });
    requirementResults.push(requirementMet);
  }

  const satisfied = requirementResults.length === 0
    ? false
    : rule.combinator === "all"
      ? requirementResults.every(Boolean)
      : requirementResults.some(Boolean);

  return { satisfied, inputs, missing };
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

function evaluatePredicate(
  predicate: NonNullable<DerivationRequirement["predicate"]>,
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
