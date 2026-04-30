import type {
  Claim,
  Evidence,
  EvidenceMethod,
  EvidenceType,
  ImpactLevel,
  TrustInput,
  TrustStatus,
  VerificationEvent,
  VerificationPolicy,
} from "../types.js";

export interface VeritasPolicyResult {
  rule_id: string;
  classification: string;
  stage: string;
  message: string;
  owner: string | null;
  rollback_switch?: string | null;
  implemented: boolean;
  passed: boolean | null;
  summary: string;
  findings: unknown[];
}

export interface VeritasEvidenceRecord {
  framework_version: number;
  run_id: string;
  timestamp: string;
  source_ref: string;
  source_kind: string;
  source_scope: string[];
  resolved_phase: string;
  resolved_workstream: string;
  matched_artifacts: string[];
  affected_nodes: string[];
  affected_lanes: string[];
  selected_proof_commands: string[];
  selected_proof_lanes: VeritasSelectedProofLane[];
  proof_resolution_source: string;
  proof_family_results?: VeritasProofFamilyResult[];
  verification_budget?: VeritasVerificationBudget;
  uncovered_path_result: "clear" | "ignore" | "warn" | "fail";
  baseline_ci_fast_passed: boolean | null;
  promotion_allowed: boolean;
  adapter?: {
    name?: string;
    kind?: string;
    proof_lanes?: VeritasSelectedProofLane[];
    required_proof_lane_ids?: string[];
    default_proof_lane_ids?: string[];
    uncovered_path_policy?: string;
  };
  policy_pack?: {
    name?: string;
    version?: number;
    rule_count?: number;
  };
  policy_results: VeritasPolicyResult[];
  files?: string[];
  unresolved_files?: string[];
  surface?: {
    input?: TrustInput;
  };
}

export interface VeritasSelectedProofLane {
  id: string;
  command: string;
  method: EvidenceMethod;
  surface_claim_ids?: string[];
  summary?: string;
}

export interface VeritasProofFamilyResult {
  id: string;
  lane_id: string;
  source_proof_lane_id: string | null;
  manifest_path: string;
  destination: string | null;
  owner: string | null;
  disposition: string;
  blocking_status: string;
  verification_weight: "blocking" | "advisory" | "informational";
  selected: boolean;
  recent_catch_evidence: string;
  regression_severity: string;
  false_positive_risk: string;
  replacement_test_available: string | null;
  review_trigger: string | null;
  last_reviewed: string | null;
  evidence_basis: string;
  freshness_status: "current" | "review-needed" | "stale" | "retiring";
  rationale: string;
}

export interface VeritasVerificationBudget {
  proof_lane_count: number;
  selected_proof_lane_count: number;
  proof_family_count: number;
  required_family_count: number;
  candidate_family_count: number;
  advisory_family_count: number;
  move_to_test_family_count: number;
  retire_family_count: number;
  upstream_candidate_count: number;
  unknown_catch_evidence_family_ids: string[];
  missing_review_trigger_family_ids: string[];
  stale_family_ids: string[];
  stale_or_unknown_family_ids: string[];
  recommendation: string;
}

const SURFACE_POLICY: VerificationPolicy = {
  id: "veritas.surface",
  claimType: "veritas-affected-surface",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["auditability"],
  requiresCorroboration: false,
  requiredProof: ["veritas evidence artifact"],
  reviewAuthority: "veritas",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["source_ref changes", "affected node changes"],
  conflictRules: ["newer evidence for the same node supersedes older evidence"],
  impactLevel: "medium",
};

const PROOF_POLICY: VerificationPolicy = {
  id: "veritas.proof-lane",
  claimType: "software-proof",
  parentType: "developer-claim",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["selected proof command"],
  reviewAuthority: "veritas",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["source_ref changes", "proof command changes", "baseline proof fails"],
  conflictRules: ["failed proof rejects a previously verified proof claim"],
  impactLevel: "high",
};

const POLICY_RESULT_POLICY: VerificationPolicy = {
  id: "veritas.policy-result",
  claimType: "veritas-policy-result",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["policy pack evaluation"],
  reviewAuthority: "veritas policy pack",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["source_ref changes", "policy pack changes", "rule implementation changes"],
  conflictRules: ["blocking failed rules reject the affected policy claim"],
  impactLevel: "high",
};

const PROOF_FAMILY_POLICY: VerificationPolicy = {
  id: "veritas.proof-family",
  claimType: "veritas-proof-family",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["proof-family manifest"],
  reviewAuthority: "veritas proof family owner",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["review trigger changes", "freshness status changes", "catch evidence changes"],
  conflictRules: ["stale or unknown proof families dispute promotion readiness"],
  impactLevel: "medium",
};

const VERIFICATION_BUDGET_POLICY: VerificationPolicy = {
  id: "veritas.verification-budget",
  claimType: "veritas-verification-budget",
  parentType: "developer-claim",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["auditability"],
  requiresCorroboration: false,
  requiredProof: ["verification budget"],
  reviewAuthority: "veritas",
  validityRule: { kind: "commit" },
  stalenessTriggers: ["proof family inventory changes", "proof lane inventory changes"],
  conflictRules: ["unknown or stale proof families dispute budget readiness"],
  impactLevel: "medium",
};

export function adaptVeritasEvidenceToTrustInput(record: unknown): TrustInput {
  const veritas = assertVeritasEvidenceRecord(record);
  if (isObject(veritas.surface) && isObject(veritas.surface.input)) {
    return veritas.surface.input as unknown as TrustInput;
  }
  const claims: Claim[] = [];
  const evidence: Evidence[] = [];
  const events: VerificationEvent[] = [];
  const adapterName = veritas.adapter?.name ?? "veritas";
  const source = `veritas:${veritas.run_id}`;

  for (const node of veritas.affected_nodes) {
    const id = claimId(veritas.run_id, "surface", node);
    const evidenceId = `${id}.evidence`;
    claims.push({
      id,
      subjectType: "repo-surface",
      subjectId: `${adapterName}:${node}`,
      surface: "veritas.affected-surface",
      claimType: "veritas-affected-surface",
      fieldOrBehavior: "affectedNode",
      value: node,
      createdAt: veritas.timestamp,
      updatedAt: veritas.timestamp,
      impactLevel: "medium",
      currentIntegrityRef: veritas.source_ref,
      verificationPolicyId: SURFACE_POLICY.id,
      confidenceBasis: {
        sourceQuality: "strong",
        reviewerAuthority: "system",
        proofStrength: veritas.selected_proof_lanes.length > 0 ? "moderate" : "weak",
        impactLevel: "medium",
      },
      metadata: {
        resolvedPhase: veritas.resolved_phase,
        resolvedWorkstream: veritas.resolved_workstream,
        affectedLanes: veritas.affected_lanes,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "policy_rule",
      method: "auditability",
      record: veritas,
      locator: "affected_nodes",
      summary: `Veritas marked ${node} as an affected repo surface for ${veritas.resolved_workstream}.`,
    }));
    events.push(buildEvent({
      id: `${id}.verified`,
      claimId: id,
      status: "verified",
      method: "affected surface resolution",
      evidenceIds: [evidenceId],
      record: veritas,
    }));
  }

  const selectedProofLanes = resolveSelectedProofLanes(veritas);
  for (const lane of selectedProofLanes) {
    const command = lane.command;
    const id = claimId(veritas.run_id, "proof", lane.id);
    const evidenceId = `${id}.evidence`;
    claims.push({
      id,
      subjectType: "repo-proof-lane",
      subjectId: `${adapterName}:${command}`,
      surface: "veritas.proof-lanes",
      claimType: "software-proof",
      fieldOrBehavior: "selectedProofCommand",
      value: command,
      createdAt: veritas.timestamp,
      updatedAt: veritas.timestamp,
      impactLevel: "high",
      currentIntegrityRef: veritas.source_ref,
      verificationPolicyId: PROOF_POLICY.id,
      confidenceBasis: {
        sourceQuality: "strong",
        reviewerAuthority: "system",
        proofStrength: veritas.baseline_ci_fast_passed === true ? "strong" : "weak",
        impactLevel: "high",
      },
      metadata: {
        proofResolutionSource: veritas.proof_resolution_source,
        baselineCiFastPassed: veritas.baseline_ci_fast_passed,
        proofLaneId: lane.id,
        surfaceClaimIds: lane.surface_claim_ids ?? [],
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "test_output",
      method: lane.method,
      record: veritas,
      locator: "selected_proof_lanes",
      summary: lane.summary ?? `Selected proof lane ${lane.id}: ${command}`,
    }));
    if (veritas.baseline_ci_fast_passed !== null) {
      events.push(buildEvent({
        id: `${id}.${veritas.baseline_ci_fast_passed ? "verified" : "rejected"}`,
        claimId: id,
        status: veritas.baseline_ci_fast_passed ? "verified" : "rejected",
        method: command,
        evidenceIds: [evidenceId],
        record: veritas,
      }));
    }
  }

  for (const result of veritas.policy_results) {
    const id = claimId(veritas.run_id, "policy", result.rule_id);
    const evidenceId = `${id}.evidence`;
    const status = policyResultStatus(result);
    claims.push({
      id,
      subjectType: "veritas-policy-rule",
      subjectId: `${veritas.policy_pack?.name ?? "policy-pack"}:${result.rule_id}`,
      surface: "veritas.policy-results",
      claimType: "veritas-policy-result",
      fieldOrBehavior: "policyResult",
      value: {
        ruleId: result.rule_id,
        classification: result.classification,
        stage: result.stage,
        implemented: result.implemented,
        passed: result.passed,
      },
      createdAt: veritas.timestamp,
      updatedAt: veritas.timestamp,
      impactLevel: policyImpact(result),
      currentIntegrityRef: veritas.source_ref,
      verificationPolicyId: POLICY_RESULT_POLICY.id,
      confidenceBasis: {
        sourceQuality: "strong",
        reviewerAuthority: "system",
        proofStrength: result.passed === true ? "strong" : "weak",
        impactLevel: policyImpact(result),
        conflictCount: result.passed === false ? 1 : 0,
      },
      metadata: {
        message: result.message,
        owner: result.owner,
        findings: result.findings,
        policyPack: veritas.policy_pack,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "policy_rule",
      method: "validation",
      record: veritas,
      locator: `policy_results.${result.rule_id}`,
      summary: result.summary,
      metadata: {
        stage: result.stage,
        classification: result.classification,
        implemented: result.implemented,
        passed: result.passed,
        faultLineHints: result.passed === false ? [{
          type: "policy_violation",
          severity: policyImpact(result),
          message: result.message,
        }] : [],
      },
    }));
    if (status !== "proposed") {
      events.push(buildEvent({
        id: `${id}.${status}`,
        claimId: id,
        status,
        method: "policy pack evaluation",
        evidenceIds: [evidenceId],
        record: veritas,
        notes: result.message,
      }));
    }
  }

  for (const family of veritas.proof_family_results ?? []) {
    const id = claimId(veritas.run_id, "proof-family", family.id);
    const evidenceId = `${id}.evidence`;
    const status = proofFamilyStatus(family);
    const impactLevel = proofFamilyImpact(family);
    claims.push({
      id,
      subjectType: "repo-proof-family",
      subjectId: `${adapterName}:${family.lane_id}:${family.id}`,
      surface: "veritas.proof-families",
      claimType: "veritas-proof-family",
      fieldOrBehavior: "proofFamilyDisposition",
      value: {
        id: family.id,
        destination: family.destination,
        disposition: family.disposition,
      },
      status: status === "verified" ? undefined : status,
      createdAt: veritas.timestamp,
      updatedAt: veritas.timestamp,
      impactLevel,
      currentIntegrityRef: veritas.source_ref,
      verificationPolicyId: PROOF_FAMILY_POLICY.id,
      confidenceBasis: {
        sourceQuality: family.recent_catch_evidence === "unknown" || family.evidence_basis === "unknown" ? "weak" : "moderate",
        reviewerAuthority: family.owner ? "operator" : "none",
        proofStrength: proofFamilyStrength(family),
        conflictCount: family.false_positive_risk === "high" || family.false_positive_risk === "unknown" ? 1 : 0,
        impactLevel,
      },
      metadata: {
        laneId: family.lane_id,
        sourceProofLaneId: family.source_proof_lane_id,
        manifestPath: family.manifest_path,
        owner: family.owner,
        blockingStatus: family.blocking_status,
        verificationWeight: family.verification_weight,
        selected: family.selected,
        regressionSeverity: family.regression_severity,
        falsePositiveRisk: family.false_positive_risk,
        replacementTestAvailable: family.replacement_test_available,
        reviewTrigger: family.review_trigger,
        lastReviewed: family.last_reviewed,
        evidenceBasis: family.evidence_basis,
        freshnessStatus: family.freshness_status,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "policy_rule",
      method: "validation",
      record: veritas,
      locator: family.manifest_path,
      summary: proofFamilySummary(family),
      metadata: {
        familyId: family.id,
        laneId: family.lane_id,
        owner: family.owner,
        selected: family.selected,
        recentCatchEvidence: family.recent_catch_evidence,
        evidenceBasis: family.evidence_basis,
        freshnessStatus: family.freshness_status,
        faultLineHints: proofFamilyFaultLineHints(family),
      },
    }));
    events.push(buildEvent({
      id: `${id}.${status}`,
      claimId: id,
      status,
      method: "proof family inventory",
      evidenceIds: [evidenceId],
      record: veritas,
      verifiedAt: isoDateTimeOrUndefined(family.last_reviewed),
      notes: family.rationale,
    }));
  }

  if (veritas.verification_budget) {
    const id = claimId(veritas.run_id, "budget", "verification");
    const evidenceId = `${id}.evidence`;
    const status: TrustStatus = veritas.verification_budget.stale_or_unknown_family_ids.length > 0 ? "disputed" : "verified";
    claims.push({
      id,
      subjectType: "repo-verification-budget",
      subjectId: `${adapterName}:verification-budget`,
      surface: "veritas.verification-budget",
      claimType: "veritas-verification-budget",
      fieldOrBehavior: "verificationBudget",
      value: {
        proofFamilyCount: veritas.verification_budget.proof_family_count,
        selectedProofLaneCount: veritas.verification_budget.selected_proof_lane_count,
        staleOrUnknownFamilyIds: veritas.verification_budget.stale_or_unknown_family_ids,
      },
      status,
      createdAt: veritas.timestamp,
      updatedAt: veritas.timestamp,
      impactLevel: veritas.verification_budget.stale_or_unknown_family_ids.length > 0 ? "high" : "medium",
      currentIntegrityRef: veritas.source_ref,
      verificationPolicyId: VERIFICATION_BUDGET_POLICY.id,
      confidenceBasis: {
        sourceQuality: "strong",
        reviewerAuthority: "system",
        proofStrength: veritas.verification_budget.stale_or_unknown_family_ids.length > 0 ? "weak" : "moderate",
        conflictCount: veritas.verification_budget.stale_or_unknown_family_ids.length,
        impactLevel: veritas.verification_budget.stale_or_unknown_family_ids.length > 0 ? "high" : "medium",
      },
      metadata: {
        verificationBudget: veritas.verification_budget,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "policy_rule",
      method: "auditability",
      record: veritas,
      locator: "verification_budget",
      summary: veritas.verification_budget.recommendation,
      metadata: {
        verificationBudget: veritas.verification_budget,
        faultLineHints: veritas.verification_budget.stale_or_unknown_family_ids.length > 0 ? [{
          type: "freshness_breach",
          severity: "high",
          message: veritas.verification_budget.recommendation,
        }] : [],
      },
    }));
    events.push(buildEvent({
      id: `${id}.${status}`,
      claimId: id,
      status,
      method: "verification budget",
      evidenceIds: [evidenceId],
      record: veritas,
      notes: veritas.verification_budget.recommendation,
    }));
  }

  return {
    schemaVersion: 2,
    source,
    claims,
    evidence,
    policies: [SURFACE_POLICY, PROOF_POLICY, POLICY_RESULT_POLICY, PROOF_FAMILY_POLICY, VERIFICATION_BUDGET_POLICY],
    events,
  };
}

function assertVeritasEvidenceRecord(value: unknown): VeritasEvidenceRecord {
  if (!isObject(value)) throw new Error("Veritas evidence must be an object");
  for (const field of [
    "run_id",
    "timestamp",
    "source_ref",
    "source_kind",
    "resolved_phase",
    "resolved_workstream",
    "proof_resolution_source",
    "uncovered_path_result",
  ]) {
    requireString(value, field);
  }
  for (const field of ["source_scope", "matched_artifacts", "affected_nodes", "affected_lanes", "selected_proof_commands", "policy_results"]) {
    requireArray(value, field);
  }
  if (typeof value.framework_version !== "number") throw new Error("Veritas evidence framework_version must be a number");
  if (typeof value.promotion_allowed !== "boolean") throw new Error("Veritas evidence promotion_allowed must be a boolean");
  if (typeof value.baseline_ci_fast_passed !== "boolean" && value.baseline_ci_fast_passed !== null) {
    throw new Error("Veritas evidence baseline_ci_fast_passed must be boolean or null");
  }
  for (const field of ["source_scope", "matched_artifacts", "affected_nodes", "affected_lanes", "selected_proof_commands"]) {
    requireStringArray(value, field);
  }
  for (const lane of requireArray(value, "selected_proof_lanes")) {
    assertSelectedProofLane(lane);
  }
  for (const result of requireArray(value, "policy_results")) {
    assertVeritasPolicyResult(result);
  }
  if (value.proof_family_results !== undefined) {
    for (const family of requireArray(value, "proof_family_results")) {
      assertVeritasProofFamilyResult(family);
    }
  }
  if (value.verification_budget !== undefined) assertVeritasVerificationBudget(value.verification_budget);
  return value as unknown as VeritasEvidenceRecord;
}

function assertSelectedProofLane(value: unknown): void {
  if (!isObject(value)) throw new Error("Veritas selected proof lane must be an object");
  for (const field of ["id", "command", "method"]) requireString(value, field);
  if (typeof value.method !== "string" || !["observation", "extraction", "validation", "corroboration", "attestation", "auditability", "anchoring", "monitoring"].includes(value.method)) {
    throw new Error(`Veritas selected proof lane method contains unsupported value: ${String(value.method)}`);
  }
  if (value.surface_claim_ids !== undefined) requireStringArray(value, "surface_claim_ids");
  if (value.summary !== undefined) requireString(value, "summary");
}

function resolveSelectedProofLanes(record: VeritasEvidenceRecord): VeritasSelectedProofLane[] {
  return record.selected_proof_lanes;
}

function assertVeritasPolicyResult(value: unknown): void {
  if (!isObject(value)) throw new Error("Veritas policy result must be an object");
  for (const field of ["rule_id", "classification", "stage", "message", "summary"]) {
    requireString(value, field);
  }
  if (typeof value.owner !== "string" && value.owner !== null) throw new Error("Veritas policy result owner must be string or null");
  if (typeof value.implemented !== "boolean") throw new Error("Veritas policy result implemented must be boolean");
  if (typeof value.passed !== "boolean" && value.passed !== null) throw new Error("Veritas policy result passed must be boolean or null");
  if (!Array.isArray(value.findings)) throw new Error("Veritas policy result findings must be an array");
}

function assertVeritasProofFamilyResult(value: unknown): void {
  if (!isObject(value)) throw new Error("Veritas proof family result must be an object");
  for (const field of [
    "id",
    "lane_id",
    "manifest_path",
    "disposition",
    "blocking_status",
    "verification_weight",
    "recent_catch_evidence",
    "regression_severity",
    "false_positive_risk",
    "evidence_basis",
    "freshness_status",
    "rationale",
  ]) {
    requireString(value, field);
  }
  for (const field of ["source_proof_lane_id", "destination", "owner", "replacement_test_available", "review_trigger", "last_reviewed"]) {
    if (typeof value[field] !== "string" && value[field] !== null) {
      throw new Error(`Veritas proof family result ${field} must be string or null`);
    }
  }
  if (typeof value.selected !== "boolean") throw new Error("Veritas proof family result selected must be boolean");
}

function assertVeritasVerificationBudget(value: unknown): void {
  if (!isObject(value)) throw new Error("Veritas verification budget must be an object");
  for (const field of [
    "proof_lane_count",
    "selected_proof_lane_count",
    "proof_family_count",
    "required_family_count",
    "candidate_family_count",
    "advisory_family_count",
    "move_to_test_family_count",
    "retire_family_count",
    "upstream_candidate_count",
  ]) {
    if (typeof value[field] !== "number") throw new Error(`Veritas verification budget ${field} must be a number`);
  }
  for (const field of [
    "unknown_catch_evidence_family_ids",
    "missing_review_trigger_family_ids",
    "stale_family_ids",
    "stale_or_unknown_family_ids",
  ]) {
    requireStringArray(value, field);
  }
  requireString(value, "recommendation");
}

function buildEvidence(input: {
  id: string;
  claimId: string;
  type: EvidenceType;
  method: EvidenceMethod;
  record: VeritasEvidenceRecord;
  locator: string;
  summary: string;
  metadata?: Record<string, unknown>;
}): Evidence {
  return {
    id: input.id,
    claimId: input.claimId,
    evidenceType: input.type,
    method: input.method,
    sourceRef: input.record.run_id,
    sourceLocator: input.locator,
    excerptOrSummary: input.summary,
    observedAt: input.record.timestamp,
    collectedBy: "veritas",
    integrityRef: input.record.source_ref,
    metadata: {
      sourceKind: input.record.source_kind,
      sourceScope: input.record.source_scope,
      files: input.record.files ?? [],
      unresolvedFiles: input.record.unresolved_files ?? [],
      ...input.metadata,
    },
  };
}

function buildEvent(input: {
  id: string;
  claimId: string;
  status: TrustStatus;
  method: string;
  evidenceIds: string[];
  record: VeritasEvidenceRecord;
  notes?: string;
  verifiedAt?: string;
}): VerificationEvent {
  return {
    id: input.id,
    claimId: input.claimId,
    status: input.status,
    actor: "veritas",
    method: input.method,
    evidenceIds: input.evidenceIds,
    createdAt: input.record.timestamp,
    verifiedAt: input.status === "verified" ? (input.verifiedAt ?? input.record.timestamp) : undefined,
    notes: input.notes,
  };
}

function proofFamilyStatus(family: VeritasProofFamilyResult): TrustStatus {
  if (family.freshness_status === "stale" || family.freshness_status === "review-needed") return "stale";
  if (family.freshness_status === "retiring" || family.disposition === "retire") return "superseded";
  if (family.blocking_status === "rejected") return "rejected";
  if (family.blocking_status === "disputed") return "disputed";
  if (family.disposition === "required" && family.recent_catch_evidence !== "unknown") return "verified";
  return "proposed";
}

function proofFamilyImpact(family: VeritasProofFamilyResult): ImpactLevel {
  if (family.regression_severity === "critical") return "critical";
  if (family.regression_severity === "high" || family.verification_weight === "blocking" || family.blocking_status === "required") return "high";
  if (family.regression_severity === "low" || family.verification_weight === "informational") return "low";
  return "medium";
}

function proofFamilyStrength(family: VeritasProofFamilyResult): "none" | "weak" | "moderate" | "strong" {
  if (family.recent_catch_evidence === "unknown" || family.evidence_basis === "unknown") return "weak";
  if (family.disposition === "required" && family.freshness_status === "current") return "strong";
  return "moderate";
}

function proofFamilySummary(family: VeritasProofFamilyResult): string {
  const rationale = family.rationale ? ` ${family.rationale}` : "";
  return `Proof family ${family.id} is ${family.disposition} / ${family.blocking_status}; freshness ${family.freshness_status}; evidence ${family.evidence_basis}.${rationale}`;
}

function proofFamilyFaultLineHints(family: VeritasProofFamilyResult): Array<Record<string, unknown>> {
  const hints: Array<Record<string, unknown>> = [];
  if (family.freshness_status === "stale" || family.freshness_status === "review-needed" || family.freshness_status === "retiring") {
    hints.push({
      type: "freshness_breach",
      severity: proofFamilyImpact(family),
      message: `Proof family ${family.id} freshness is ${family.freshness_status}.`,
    });
  }
  if (family.recent_catch_evidence === "unknown" || family.evidence_basis === "unknown") {
    hints.push({
      type: "provenance_gap",
      severity: proofFamilyImpact(family),
      message: `Proof family ${family.id} has weak or unknown catch evidence.`,
    });
  }
  return hints;
}

function isoDateTimeOrUndefined(value: string | null): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return value;
  return undefined;
}

function policyResultStatus(result: VeritasPolicyResult): TrustStatus {
  if (result.passed === true) return "verified";
  if (result.passed === false && result.stage === "block") return "rejected";
  if (result.passed === false) return "disputed";
  return "proposed";
}

function policyImpact(result: VeritasPolicyResult): ImpactLevel {
  if (result.stage === "block" || result.classification === "hard-invariant") return "high";
  if (result.stage === "warn") return "medium";
  return "low";
}

function claimId(runId: string, group: string, value: string): string {
  return `veritas.${safeId(runId)}.${group}.${safeId(value)}`;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function requireString(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Veritas evidence missing string field: ${field}`);
  return value;
}

function requireArray(object: Record<string, unknown>, field: string): unknown[] {
  const value = object[field];
  if (!Array.isArray(value)) throw new Error(`Veritas evidence missing array field: ${field}`);
  return value;
}

function requireStringArray(object: Record<string, unknown>, field: string): void {
  const values = requireArray(object, field);
  if (!values.every((item) => typeof item === "string")) {
    throw new Error(`Veritas evidence ${field} must contain only strings`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
