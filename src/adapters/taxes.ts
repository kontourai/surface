import type {
  Claim,
  Evidence,
  EvidenceMethod,
  EvidenceType,
  TrustInput,
  TrustStatus,
  VerificationEvent,
  VerificationPolicy,
} from "../types.js";

export interface TaxesTrustExport {
  source?: string;
  generatedAt: string;
  householdId: string;
  taxYear: number;
  verifiedFacts?: TaxesVerifiedFact[];
  resolvedFacts?: TaxesResolvedFact[];
  returnPackage?: TaxesReturnPackage;
}

export interface TaxesVerifiedFact {
  householdId: string;
  taxYear: number;
  factKey: string;
  label: string;
  value: unknown;
  verifiedBy: string;
  verifiedAt: string;
  rationale: string;
}

export interface TaxesResolvedFact {
  householdId: string;
  taxYear: number;
  factKey: string;
  label: string;
  value: unknown;
  selectedFactId?: string;
  selectedSource: string;
  needsVerification: boolean;
  rationale: string;
  candidates: Array<{
    factId: string;
    sourceType: string;
    confidence: number;
    value: unknown;
  }>;
}

export interface TaxesReturnPackage {
  householdId: string;
  taxYear: number;
  generatedAt: string;
  readiness: "draft" | "generated";
  preparedReturnReferencePath: string;
  federal?: { form1040?: Record<string, TaxesReturnPackageField> };
  colorado?: { dr0104?: Record<string, TaxesReturnPackageField> };
  unresolved?: string[];
  assumptions?: TaxesReturnPackageAssumption[];
  comparisonSummary?: TaxesReturnPackageComparisonField[];
  reviewSignals?: TaxesReturnPackageReviewSignal[];
  citationIndex?: Record<string, string>;
  citations?: string[];
}

export interface TaxesReturnPackageField {
  value: number | string | null;
  source: string;
  citations: string[];
  importedValue?: number | string;
  preparedReturnValue?: number | string;
  notes?: string[];
  trace?: unknown;
}

export interface TaxesReturnPackageAssumption {
  key: string;
  field: string;
  source: string;
  value: number | string;
  reason: string;
  citations: string[];
  impactAmount?: number;
  notes?: string[];
}

export interface TaxesReturnPackageComparisonField {
  field: string;
  generatedValue: number | string | null;
  preparedReturnValue: number | string | null;
  delta?: number;
  severity: "match" | "small" | "medium" | "large" | "informational";
  source: string;
  investigationHint: string;
  citations: string[];
  notes?: string[];
  likelyCauses?: Array<{ category: string; summary: string; citations?: string[] }>;
  missingInformation?: string[];
}

export interface TaxesReturnPackageReviewSignal {
  field: string;
  severity: "info" | "review_required";
  driver: "assumption" | "comparison_gap" | "proxy_model";
  reason: string;
}

const VERIFIED_FACT_POLICY: VerificationPolicy = {
  id: "taxes.verified-fact",
  claimType: "tax-verified-fact",
  requiredEvidence: ["human_attestation"],
  requiredMethods: ["attestation"],
  requiresCorroboration: false,
  requiredProof: ["verified fact record"],
  reviewAuthority: "tax workflow operator",
  validityRule: { kind: "historical" },
  stalenessTriggers: ["corrected source document", "manual override"],
  conflictRules: ["newer verified fact supersedes older fact"],
  impactLevel: "critical",
};

const RESOLVED_FACT_POLICY: VerificationPolicy = {
  id: "taxes.resolved-fact",
  claimType: "tax-resolved-fact",
  requiredEvidence: ["calculation_trace"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["fact resolution rationale"],
  reviewAuthority: "tax workflow",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["new candidate fact", "user correction"],
  conflictRules: ["candidate conflicts require verification"],
  impactLevel: "high",
};

const RETURN_FIELD_POLICY: VerificationPolicy = {
  id: "taxes.return-package-field",
  claimType: "tax-return-field",
  requiredEvidence: ["document_citation"],
  requiredMethods: ["corroboration"],
  requiresCorroboration: false,
  requiredProof: ["return package citation"],
  reviewAuthority: "tax return package",
  validityRule: { kind: "historical" },
  stalenessTriggers: ["return package regenerated", "prepared return reference changes"],
  conflictRules: ["material comparison gaps dispute generated values"],
  impactLevel: "critical",
};

const REVIEW_POLICY: VerificationPolicy = {
  id: "taxes.review-signal",
  claimType: "tax-review-signal",
  requiredEvidence: ["calculation_trace"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["return package review signal"],
  reviewAuthority: "tax return package",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["review signal resolved", "return package regenerated"],
  conflictRules: ["review_required signals dispute readiness"],
  impactLevel: "critical",
};

export function adaptTaxesTrustExportToTrustInput(record: unknown): TrustInput {
  const taxes = assertTaxesTrustExport(record);
  const claims: Claim[] = [];
  const evidence: Evidence[] = [];
  const events: VerificationEvent[] = [];
  const generatedAt = iso(taxes.generatedAt);
  const verifiedKeys = new Set((taxes.verifiedFacts ?? []).map((fact) => fact.factKey));

  for (const fact of taxes.verifiedFacts ?? []) {
    const id = claimId("verified", fact.factKey);
    const evidenceId = `${id}.attestation`;
    claims.push({
      id,
      subjectType: "tax-fact",
      subjectId: `${fact.householdId}:${fact.taxYear}:${fact.factKey}`,
      surface: "taxes.verified-facts",
      claimType: "tax-verified-fact",
      fieldOrBehavior: fact.factKey,
      value: fact.value,
      createdAt: iso(fact.verifiedAt),
      updatedAt: iso(fact.verifiedAt),
      impactLevel: "critical",
      verificationPolicyId: VERIFIED_FACT_POLICY.id,
      confidenceBasis: {
        sourceQuality: "strong",
        reviewerAuthority: "operator",
        proofStrength: "strong",
        impactLevel: "critical",
      },
      metadata: {
        label: fact.label,
        rationale: fact.rationale,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "human_attestation",
      method: "attestation",
      sourceRef: fact.verifiedBy,
      locator: `verifiedFacts.${fact.factKey}`,
      summary: fact.rationale,
      observedAt: iso(fact.verifiedAt),
      collectedBy: fact.verifiedBy,
    }));
    events.push(buildEvent({
      id: `${id}.verified`,
      claimId: id,
      status: "verified",
      actor: fact.verifiedBy,
      method: "verified fact",
      evidenceIds: [evidenceId],
      createdAt: iso(fact.verifiedAt),
    }));
  }

  for (const fact of taxes.resolvedFacts ?? []) {
    if (verifiedKeys.has(fact.factKey)) continue;
    const id = claimId("resolved", fact.factKey);
    const evidenceId = `${id}.resolution`;
    claims.push({
      id,
      subjectType: "tax-fact",
      subjectId: `${fact.householdId}:${fact.taxYear}:${fact.factKey}`,
      surface: "taxes.resolved-facts",
      claimType: "tax-resolved-fact",
      fieldOrBehavior: fact.factKey,
      value: fact.value,
      status: "proposed",
      createdAt: generatedAt,
      updatedAt: generatedAt,
      impactLevel: "high",
      verificationPolicyId: RESOLVED_FACT_POLICY.id,
      confidenceBasis: {
        sourceQuality: fact.selectedSource.includes("document") ? "moderate" : "weak",
        extractionConfidence: Math.max(0, ...fact.candidates.map((candidate) => candidate.confidence)),
        reviewerAuthority: "none",
        proofStrength: fact.needsVerification ? "weak" : "moderate",
        impactLevel: "high",
        conflictCount: fact.candidates.length > 1 ? fact.candidates.length - 1 : 0,
      },
      metadata: {
        label: fact.label,
        selectedFactId: fact.selectedFactId,
        selectedSource: fact.selectedSource,
        needsVerification: fact.needsVerification,
        rationale: fact.rationale,
        candidates: fact.candidates,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "calculation_trace",
      method: "validation",
      sourceRef: fact.selectedFactId ?? fact.selectedSource,
      locator: `resolvedFacts.${fact.factKey}`,
      summary: fact.rationale,
      observedAt: generatedAt,
      collectedBy: "tax fact resolver",
    }));
  }

  const returnPackage = taxes.returnPackage;
  if (returnPackage) {
    addReturnFields({
      prefix: "federal.form1040",
      fields: returnPackage.federal?.form1040 ?? {},
      returnPackage,
      claims,
      evidence,
      events,
    });
    addReturnFields({
      prefix: "colorado.dr0104",
      fields: returnPackage.colorado?.dr0104 ?? {},
      returnPackage,
      claims,
      evidence,
      events,
    });

    for (const field of returnPackage.unresolved ?? []) {
      claims.push({
        id: claimId("unresolved", field),
        subjectType: "tax-return-field",
        subjectId: `${returnPackage.householdId}:${returnPackage.taxYear}:${field}`,
        surface: "taxes.return-package",
        claimType: "tax-return-field",
        fieldOrBehavior: field,
        value: null,
        status: "unknown",
        createdAt: iso(returnPackage.generatedAt),
        updatedAt: iso(returnPackage.generatedAt),
        impactLevel: "critical",
        verificationPolicyId: RETURN_FIELD_POLICY.id,
        confidenceBasis: {
          sourceQuality: "unknown",
          reviewerAuthority: "none",
          proofStrength: "none",
          impactLevel: "critical",
        },
        metadata: {
          readiness: returnPackage.readiness,
          preparedReturnReferencePath: returnPackage.preparedReturnReferencePath,
        },
      });
    }

    for (const assumption of returnPackage.assumptions ?? []) {
      const id = claimId("assumption", assumption.key);
      const evidenceId = `${id}.evidence`;
      claims.push({
        id,
        subjectType: "tax-assumption",
        subjectId: `${returnPackage.householdId}:${returnPackage.taxYear}:${assumption.key}`,
        surface: "taxes.assumptions",
        claimType: "tax-review-signal",
        fieldOrBehavior: assumption.field,
        value: assumption.value,
        createdAt: iso(returnPackage.generatedAt),
        updatedAt: iso(returnPackage.generatedAt),
        impactLevel: "critical",
        verificationPolicyId: REVIEW_POLICY.id,
        confidenceBasis: {
          sourceQuality: assumption.citations.length > 0 ? "moderate" : "weak",
          reviewerAuthority: "none",
          proofStrength: "weak",
          impactLevel: "critical",
          conflictCount: 1,
        },
        metadata: {
          assumptionSource: assumption.source,
          reason: assumption.reason,
          citations: assumption.citations,
          impactAmount: assumption.impactAmount,
          notes: assumption.notes,
        },
      });
      evidence.push(buildEvidence({
        id: evidenceId,
        claimId: id,
        type: assumption.citations.length > 0 ? "document_citation" : "calculation_trace",
        method: assumption.citations.length > 0 ? "corroboration" : "validation",
        sourceRef: assumption.citations[0] ?? assumption.key,
        locator: `assumptions.${assumption.key}`,
        summary: assumption.reason,
        observedAt: iso(returnPackage.generatedAt),
        collectedBy: "tax return package",
        metadata: { citations: assumption.citations },
      }));
      events.push(buildEvent({
        id: `${id}.disputed`,
        claimId: id,
        status: "disputed",
        actor: "tax return package",
        method: "assumption requires review",
        evidenceIds: [evidenceId],
        createdAt: iso(returnPackage.generatedAt),
      }));
    }

    for (const comparison of returnPackage.comparisonSummary ?? []) {
      const id = claimId("comparison", comparison.field);
      const evidenceId = `${id}.evidence`;
      const status = comparisonStatus(comparison.severity);
      claims.push({
        id,
        subjectType: "tax-comparison",
        subjectId: `${returnPackage.householdId}:${returnPackage.taxYear}:${comparison.field}`,
        surface: "taxes.comparison-summary",
        claimType: "tax-review-signal",
        fieldOrBehavior: comparison.field,
        value: {
          generatedValue: comparison.generatedValue,
          preparedReturnValue: comparison.preparedReturnValue,
          delta: comparison.delta,
          severity: comparison.severity,
        },
        status: status === "proposed" ? "proposed" : undefined,
        createdAt: iso(returnPackage.generatedAt),
        updatedAt: iso(returnPackage.generatedAt),
        impactLevel: comparison.severity === "large" ? "critical" : "high",
        verificationPolicyId: REVIEW_POLICY.id,
        confidenceBasis: {
          sourceQuality: comparison.citations.length > 0 ? "moderate" : "unknown",
          reviewerAuthority: "none",
          proofStrength: status === "verified" ? "moderate" : "weak",
          impactLevel: comparison.severity === "large" ? "critical" : "high",
          conflictCount: status === "disputed" ? 1 : 0,
        },
        metadata: {
          source: comparison.source,
          investigationHint: comparison.investigationHint,
          notes: comparison.notes,
          likelyCauses: comparison.likelyCauses ?? [],
          missingInformation: comparison.missingInformation ?? [],
          citations: comparison.citations,
        },
      });
      evidence.push(buildEvidence({
        id: evidenceId,
        claimId: id,
        type: comparison.citations.length > 0 ? "document_citation" : "calculation_trace",
        method: comparison.citations.length > 0 ? "corroboration" : "validation",
        sourceRef: comparison.citations[0] ?? returnPackage.preparedReturnReferencePath,
        locator: `comparisonSummary.${comparison.field}`,
        summary: comparison.investigationHint,
        observedAt: iso(returnPackage.generatedAt),
        collectedBy: "tax return package",
        metadata: { citations: comparison.citations },
      }));
      if (status !== "proposed") {
        events.push(buildEvent({
          id: `${id}.${status}`,
          claimId: id,
          status,
          actor: "tax return package",
          method: "prepared return comparison",
          evidenceIds: [evidenceId],
          createdAt: iso(returnPackage.generatedAt),
        }));
      }
    }

    for (const signal of returnPackage.reviewSignals ?? []) {
      const id = claimId("review-signal", signal.field, signal.driver);
      const evidenceId = `${id}.evidence`;
      const status: TrustStatus = signal.severity === "review_required" ? "disputed" : "proposed";
      claims.push({
        id,
        subjectType: "tax-review-signal",
        subjectId: `${returnPackage.householdId}:${returnPackage.taxYear}:${signal.field}:${signal.driver}`,
        surface: "taxes.review-signals",
        claimType: "tax-review-signal",
        fieldOrBehavior: signal.field,
        value: signal.reason,
        status: status === "proposed" ? "proposed" : undefined,
        createdAt: iso(returnPackage.generatedAt),
        updatedAt: iso(returnPackage.generatedAt),
        impactLevel: "critical",
        verificationPolicyId: REVIEW_POLICY.id,
        confidenceBasis: {
          sourceQuality: "moderate",
          reviewerAuthority: "none",
          proofStrength: "weak",
          impactLevel: "critical",
          conflictCount: status === "disputed" ? 1 : 0,
        },
        metadata: {
          severity: signal.severity,
          driver: signal.driver,
        },
      });
      evidence.push(buildEvidence({
        id: evidenceId,
        claimId: id,
        type: "calculation_trace",
        method: "validation",
        sourceRef: signal.driver,
        locator: `reviewSignals.${signal.field}`,
        summary: signal.reason,
        observedAt: iso(returnPackage.generatedAt),
        collectedBy: "tax return package",
      }));
      if (status === "disputed") {
        events.push(buildEvent({
          id: `${id}.disputed`,
          claimId: id,
          status,
          actor: "tax return package",
          method: "review signal",
          evidenceIds: [evidenceId],
          createdAt: iso(returnPackage.generatedAt),
        }));
      }
    }
  }

  return {
    schemaVersion: 2,
    source: taxes.source ?? `taxes:${taxes.householdId}:${taxes.taxYear}`,
    claims,
    evidence,
    policies: [VERIFIED_FACT_POLICY, RESOLVED_FACT_POLICY, RETURN_FIELD_POLICY, REVIEW_POLICY],
    events,
  };
}

function addReturnFields(input: {
  prefix: string;
  fields: Record<string, TaxesReturnPackageField>;
  returnPackage: TaxesReturnPackage;
  claims: Claim[];
  evidence: Evidence[];
  events: VerificationEvent[];
}): void {
  for (const [field, value] of Object.entries(input.fields)) {
    const fullField = `${input.prefix}.${field}`;
    const id = claimId("return-field", fullField);
    const evidenceId = `${id}.citation`;
    const hasCitation = value.citations.length > 0;
    const status: TrustStatus = hasCitation && input.returnPackage.readiness === "generated" ? "verified" : "proposed";
    input.claims.push({
      id,
      subjectType: "tax-return-field",
      subjectId: `${input.returnPackage.householdId}:${input.returnPackage.taxYear}:${fullField}`,
      surface: "taxes.return-package",
      claimType: "tax-return-field",
      fieldOrBehavior: fullField,
      value: value.value,
      status: status === "proposed" ? "proposed" : undefined,
      createdAt: iso(input.returnPackage.generatedAt),
      updatedAt: iso(input.returnPackage.generatedAt),
      impactLevel: "critical",
      verificationPolicyId: RETURN_FIELD_POLICY.id,
      confidenceBasis: {
        sourceQuality: hasCitation ? "moderate" : "unknown",
        reviewerAuthority: "system",
        proofStrength: hasCitation ? "moderate" : "weak",
        impactLevel: "critical",
      },
      metadata: {
        source: value.source,
        citations: value.citations,
        importedValue: value.importedValue,
        preparedReturnValue: value.preparedReturnValue,
        notes: value.notes,
        trace: value.trace,
      },
    });
    if (hasCitation) {
      input.evidence.push(buildEvidence({
        id: evidenceId,
        claimId: id,
        type: "document_citation",
        method: "corroboration",
        sourceRef: value.citations[0],
        locator: fullField,
        summary: `${fullField} is supported by ${value.citations.join(", ")}.`,
        observedAt: iso(input.returnPackage.generatedAt),
        collectedBy: "tax return package",
        metadata: { citations: value.citations },
      }));
    }
    if (status === "verified") {
      input.events.push(buildEvent({
        id: `${id}.verified`,
        claimId: id,
        status,
        actor: "tax return package",
        method: "return package citation",
        evidenceIds: [evidenceId],
        createdAt: iso(input.returnPackage.generatedAt),
      }));
    }
  }
}

function assertTaxesTrustExport(value: unknown): TaxesTrustExport {
  if (!isObject(value)) throw new Error("Taxes trust export must be an object");
  requireString(value, "generatedAt");
  requireString(value, "householdId");
  if (typeof value.taxYear !== "number") throw new Error("Taxes trust export taxYear must be a number");
  for (const fact of optionalArray(value, "verifiedFacts")) assertObject(fact, "Taxes verified fact");
  for (const fact of optionalArray(value, "resolvedFacts")) assertObject(fact, "Taxes resolved fact");
  if (value.returnPackage !== undefined) assertObject(value.returnPackage, "Taxes return package");
  return value as unknown as TaxesTrustExport;
}

function buildEvidence(input: {
  id: string;
  claimId: string;
  type: EvidenceType;
  method: EvidenceMethod;
  sourceRef: string;
  locator: string;
  summary: string;
  observedAt: string;
  collectedBy: string;
  metadata?: Record<string, unknown>;
}): Evidence {
  return {
    id: input.id,
    claimId: input.claimId,
    evidenceType: input.type,
    method: input.method,
    sourceRef: input.sourceRef,
    sourceLocator: input.locator,
    excerptOrSummary: input.summary,
    observedAt: input.observedAt,
    collectedBy: input.collectedBy,
    metadata: input.metadata,
  };
}

function buildEvent(input: {
  id: string;
  claimId: string;
  status: TrustStatus;
  actor: string;
  method: string;
  evidenceIds: string[];
  createdAt: string;
}): VerificationEvent {
  return {
    id: input.id,
    claimId: input.claimId,
    status: input.status,
    actor: input.actor,
    method: input.method,
    evidenceIds: input.evidenceIds,
    createdAt: input.createdAt,
    verifiedAt: input.status === "verified" ? input.createdAt : undefined,
  };
}

function comparisonStatus(severity: TaxesReturnPackageComparisonField["severity"]): TrustStatus {
  if (severity === "match") return "verified";
  if (severity === "medium" || severity === "large") return "disputed";
  return "proposed";
}

function claimId(...parts: string[]): string {
  return `taxes.${parts.map(safeId).join(".")}`;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function iso(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`Invalid taxes timestamp: ${value}`);
  return new Date(time).toISOString();
}

function requireString(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Taxes trust export missing string field: ${field}`);
  return value;
}

function optionalArray(object: Record<string, unknown>, field: string): unknown[] {
  const value = object[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Taxes trust export ${field} must be an array`);
  return value;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
