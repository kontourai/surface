import type {
  Claim,
  Evidence,
  EvidenceMethod,
  EvidenceType,
  TrustInput,
  TrustStatus,
  VerificationEvent,
  VerificationPolicy,
} from "../../src/types.js";

export interface FieldAttestedRecordsExport {
  source?: string;
  generatedAt: string;
  records: AttestedRecord[];
  fieldAttestations?: FieldAttestation[];
  reviewFlags?: ReviewFlag[];
  crawlRuns?: CrawlRun[];
  proposals?: RecordChangeProposal[];
}

export interface AttestedRecord {
  id: string;
  slug?: string;
  name: string;
  dataConfidence?: "VERIFIED" | "PLACEHOLDER" | "STALE";
  lastVerifiedAt?: string | null;
  lastCrawledAt?: string | null;
  fieldSources?: Record<string, FieldSource> | null;
  [key: string]: unknown;
}

export interface FieldSource {
  excerpt?: string | null;
  sourceUrl: string;
  approvedAt: string;
}

export interface FieldAttestation {
  id: string;
  entityType: "RECORD" | "PROVIDER" | "PERSON";
  entityId: string;
  fieldKey: string;
  valueSnapshot?: unknown;
  excerpt?: string | null;
  sourceUrl?: string | null;
  observedAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  status: "ACTIVE" | "STALE" | "INVALIDATED";
  lastRecheckedAt?: string | null;
  invalidatedAt?: string | null;
  invalidationReason?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface ReviewFlag {
  id: string;
  entityType: "RECORD" | "PROVIDER" | "PERSON";
  entityId: string;
  comment: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdBy: string;
  createdAt: string;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
}

export interface CrawlRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  totalRecords: number;
  processedRecords: number;
  errorCount: number;
  newProposals: number;
  trigger: "MANUAL" | "SCHEDULED";
  triggeredBy: string | null;
  recordIds: string[] | null;
  errorLog?: Array<{ recordId: string; error: string; url: string }>;
}

export interface RecordChangeProposal {
  id: string;
  recordId: string;
  crawlRunId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  sourceUrl: string;
  proposedChanges: Record<string, unknown>;
  overallConfidence: number;
  extractionModel: string;
  reviewerNotes: string | null;
}

const FIELD_POLICY: VerificationPolicy = {
  id: "field-attestation.public-field-source",
  claimType: "public-data-field",
  parentType: "field-attested-record-claim",
  requiredEvidence: ["source_excerpt"],
  requiredMethods: ["observation", "attestation"],
  requiresCorroboration: false,
  requiredProof: ["fieldSources[field].approvedAt"],
  reviewAuthority: "record steward review",
  validityRule: { kind: "duration", durationDays: 30 },
  stalenessTriggers: ["source page changes", "field attestation becomes stale", "review flag opens"],
  conflictRules: ["open review flags dispute current public data"],
  impactLevel: "high",
};

const ATTESTATION_POLICY: VerificationPolicy = {
  id: "field-attestation.approval",
  claimType: "field-attestation",
  parentType: "field-attested-record-claim",
  requiredEvidence: ["human_attestation"],
  requiredMethods: ["attestation"],
  requiresCorroboration: false,
  requiredProof: ["approved field attestation"],
  reviewAuthority: "record steward",
  validityRule: { kind: "duration", durationDays: 90 },
  stalenessTriggers: ["attestation status changes", "source recheck fails"],
  conflictRules: ["invalidated attestations dispute current field trust"],
  impactLevel: "high",
};

const FLAG_POLICY: VerificationPolicy = {
  id: "field-attestation.review-flag",
  claimType: "review-flag",
  parentType: "field-attested-record-claim",
  requiredEvidence: ["human_attestation"],
  requiredMethods: ["attestation"],
  requiresCorroboration: false,
  requiredProof: ["admin flag review"],
  reviewAuthority: "record steward",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["flag status changes"],
  conflictRules: ["open flags dispute the affected entity"],
  impactLevel: "high",
};

const CRAWL_POLICY: VerificationPolicy = {
  id: "field-attestation.crawl-run",
  claimType: "crawl-run",
  parentType: "field-attested-record-claim",
  requiredEvidence: ["crawl_observation"],
  requiredMethods: ["observation"],
  requiresCorroboration: false,
  requiredProof: ["crawl run completed"],
  reviewAuthority: "field-data crawler",
  validityRule: { kind: "duration", durationDays: 14 },
  stalenessTriggers: ["new crawl run", "crawl error appears"],
  conflictRules: ["failed crawl rejects crawl freshness claims"],
  impactLevel: "medium",
};

const PROPOSAL_POLICY: VerificationPolicy = {
  id: "field-attestation.change-proposal",
  claimType: "change-proposal",
  parentType: "field-attested-record-claim",
  requiredEvidence: ["crawl_observation"],
  requiredMethods: ["extraction"],
  requiresCorroboration: false,
  requiredProof: ["proposal review"],
  reviewAuthority: "record steward",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["newer proposal supersedes current proposal"],
  conflictRules: ["rejected proposals reject proposed field changes"],
  impactLevel: "medium",
};

export function adaptFieldAttestedRecordsExportToTrustInput(record: unknown): TrustInput {
  const recordsExport = assertFieldAttestedRecordsExport(record);
  const claims: Claim[] = [];
  const evidence: Evidence[] = [];
  const events: VerificationEvent[] = [];
  const recordById = new Map(recordsExport.records.map((attestedRecord) => [attestedRecord.id, attestedRecord]));

  for (const attestedRecord of recordsExport.records) {
    for (const [field, source] of Object.entries(attestedRecord.fieldSources ?? {})) {
      const id = claimId("field", attestedRecord.id, field);
      const evidenceId = `${id}.source`;
      const observedAt = iso(source.approvedAt);
      claims.push({
        id,
        subjectType: "attested-record",
        subjectId: attestedRecord.id,
        surface: "field-attested-records.public-data",
        claimType: "public-data-field",
        fieldOrBehavior: field,
        value: attestedRecord[field],
        createdAt: observedAt,
        updatedAt: observedAt,
        impactLevel: "high",
        currentIntegrityRef: `${attestedRecord.id}:${field}:${observedAt}`,
        verificationPolicyId: FIELD_POLICY.id,
        confidenceBasis: {
          sourceQuality: "moderate",
          reviewerAuthority: "operator",
          proofStrength: "moderate",
          impactLevel: "high",
        },
        metadata: {
          recordName: attestedRecord.name,
          recordSlug: attestedRecord.slug,
          dataConfidence: attestedRecord.dataConfidence,
        },
      });
      evidence.push(buildEvidence({
        id: evidenceId,
        claimId: id,
        type: "source_excerpt",
        method: "observation",
        sourceRef: source.sourceUrl,
        locator: `fieldSources.${field}`,
        summary: source.excerpt ?? `Field-attested record field ${field} was approved from ${source.sourceUrl}.`,
        observedAt,
        collectedBy: "field-attestation-example",
        integrityRef: `${attestedRecord.id}:${field}:${observedAt}`,
      }));
      events.push(buildEvent({
        id: `${id}.verified`,
        claimId: id,
        status: "verified",
        method: "field source approval",
        evidenceIds: [evidenceId],
        createdAt: observedAt,
        actor: "field-attestation-example",
      }));
    }
  }

  for (const attestation of recordsExport.fieldAttestations ?? []) {
    const id = claimId("attestation", attestation.entityId, attestation.fieldKey, attestation.id);
    const evidenceId = `${id}.attestation`;
    const observedAt = iso(attestation.approvedAt ?? attestation.observedAt ?? attestation.createdAt);
    const status = attestationStatus(attestation.status);
    claims.push({
      id,
      subjectType: attestation.entityType.toLowerCase(),
      subjectId: attestation.entityId,
      surface: "field-attested-records.attestations",
      claimType: "field-attestation",
      fieldOrBehavior: attestation.fieldKey,
      value: attestation.valueSnapshot ?? null,
      createdAt: iso(attestation.createdAt),
      updatedAt: observedAt,
      impactLevel: "high",
      verificationPolicyId: ATTESTATION_POLICY.id,
      confidenceBasis: {
        sourceQuality: attestation.sourceUrl ? "moderate" : "unknown",
        reviewerAuthority: "operator",
        proofStrength: status === "verified" ? "strong" : "weak",
        impactLevel: "high",
        conflictCount: status === "disputed" ? 1 : 0,
      },
      metadata: {
        approvedBy: attestation.approvedBy,
        invalidationReason: attestation.invalidationReason,
        notes: attestation.notes,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "human_attestation",
      method: "attestation",
      sourceRef: attestation.sourceUrl ?? attestation.approvedBy ?? attestation.id,
      locator: `fieldAttestations.${attestation.id}`,
      summary: attestation.excerpt ?? attestation.notes ?? `Field-attested records ${attestation.status} attestation for ${attestation.fieldKey}.`,
      observedAt,
      collectedBy: attestation.approvedBy ?? "field-attestation-example",
    }));
    events.push(buildEvent({
      id: `${id}.${status}`,
      claimId: id,
      status,
      method: "field attestation status",
      evidenceIds: [evidenceId],
      createdAt: observedAt,
      actor: attestation.approvedBy ?? "field-attestation-example",
    }));
  }

  for (const flag of recordsExport.reviewFlags ?? []) {
    const id = claimId("flag", flag.entityId, flag.id);
    const evidenceId = `${id}.flag`;
    const status = flagStatus(flag.status);
    claims.push({
      id,
      subjectType: flag.entityType.toLowerCase(),
      subjectId: flag.entityId,
      surface: "field-attestation.review-flags",
      claimType: "review-flag",
      fieldOrBehavior: "entityTrust",
      value: flag.comment,
      createdAt: iso(flag.createdAt),
      updatedAt: iso(flag.resolvedAt ?? flag.createdAt),
      impactLevel: "high",
      verificationPolicyId: FLAG_POLICY.id,
      confidenceBasis: {
        sourceQuality: "moderate",
        reviewerAuthority: "operator",
        proofStrength: status === "disputed" ? "strong" : "moderate",
        impactLevel: "high",
        conflictCount: status === "disputed" ? 1 : 0,
      },
      metadata: {
        flagStatus: flag.status,
        createdBy: flag.createdBy,
        resolvedBy: flag.resolvedBy,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "human_attestation",
      method: "attestation",
      sourceRef: flag.createdBy,
      locator: `reviewFlags.${flag.id}`,
      summary: flag.comment,
      observedAt: iso(flag.createdAt),
      collectedBy: flag.createdBy,
    }));
    events.push(buildEvent({
      id: `${id}.${status}`,
      claimId: id,
      status,
      method: "review flag status",
      evidenceIds: [evidenceId],
      createdAt: iso(flag.resolvedAt ?? flag.createdAt),
      actor: flag.resolvedBy ?? flag.createdBy,
    }));
  }

  for (const run of recordsExport.crawlRuns ?? []) {
    const id = claimId("crawl", run.id);
    const evidenceId = `${id}.observation`;
    const status = crawlStatus(run.status);
    claims.push({
      id,
      subjectType: "crawl-run",
      subjectId: run.id,
      surface: "field-attested-records.crawls",
      claimType: "crawl-run",
      fieldOrBehavior: "crawlFreshness",
      value: {
        totalRecords: run.totalRecords,
        processedRecords: run.processedRecords,
        errorCount: run.errorCount,
        newProposals: run.newProposals,
      },
      createdAt: iso(run.startedAt),
      updatedAt: iso(run.completedAt ?? run.startedAt),
      impactLevel: run.errorCount > 0 ? "high" : "medium",
      verificationPolicyId: CRAWL_POLICY.id,
      confidenceBasis: {
        sourceQuality: "moderate",
        reviewerAuthority: "system",
        proofStrength: status === "verified" ? "moderate" : "weak",
        impactLevel: run.errorCount > 0 ? "high" : "medium",
        conflictCount: run.errorCount,
      },
      metadata: {
        trigger: run.trigger,
        triggeredBy: run.triggeredBy,
        recordIds: run.recordIds,
        errorLog: run.errorLog ?? [],
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "crawl_observation",
      method: "observation",
      sourceRef: run.id,
      locator: "crawlRuns",
      summary: `Field-attested crawl ${run.status}: ${run.processedRecords}/${run.totalRecords} records processed with ${run.errorCount} errors.`,
      observedAt: iso(run.completedAt ?? run.startedAt),
      collectedBy: "field-data crawler",
    }));
    events.push(buildEvent({
      id: `${id}.${status}`,
      claimId: id,
      status,
      method: "crawl run status",
      evidenceIds: [evidenceId],
      createdAt: iso(run.completedAt ?? run.startedAt),
      actor: "field-data crawler",
    }));
  }

  for (const proposal of recordsExport.proposals ?? []) {
    const id = claimId("proposal", proposal.recordId, proposal.id);
    const evidenceId = `${id}.proposal`;
    const status = proposalStatus(proposal.status);
    const attestedRecord = recordById.get(proposal.recordId);
    claims.push({
      id,
      subjectType: "attested-record",
      subjectId: proposal.recordId,
      surface: "field-attested-records.proposals",
      claimType: "change-proposal",
      fieldOrBehavior: "proposedChanges",
      value: proposal.proposedChanges,
      status: proposal.status === "PENDING" ? "proposed" : undefined,
      createdAt: iso(proposal.createdAt),
      updatedAt: iso(proposal.reviewedAt ?? proposal.createdAt),
      impactLevel: "medium",
      verificationPolicyId: PROPOSAL_POLICY.id,
      confidenceBasis: {
        sourceQuality: "moderate",
        extractionConfidence: proposal.overallConfidence,
        reviewerAuthority: proposal.reviewedBy ? "operator" : "none",
        proofStrength: status === "verified" ? "moderate" : "weak",
        impactLevel: "medium",
      },
      metadata: {
        recordName: attestedRecord?.name,
        crawlRunId: proposal.crawlRunId,
        extractionModel: proposal.extractionModel,
        reviewerNotes: proposal.reviewerNotes,
      },
    });
    evidence.push(buildEvidence({
      id: evidenceId,
      claimId: id,
      type: "crawl_observation",
      method: "extraction",
      sourceRef: proposal.sourceUrl,
      locator: `proposals.${proposal.id}`,
      summary: `Field-attested proposal ${proposal.status} with ${Object.keys(proposal.proposedChanges).length} proposed field changes.`,
      observedAt: iso(proposal.createdAt),
      collectedBy: proposal.extractionModel,
    }));
    if (proposal.status !== "PENDING") {
      events.push(buildEvent({
        id: `${id}.${status}`,
        claimId: id,
        status,
        method: "proposal review",
        evidenceIds: [evidenceId],
        createdAt: iso(proposal.reviewedAt ?? proposal.createdAt),
        actor: proposal.reviewedBy ?? "field-attestation-example",
      }));
    }
  }

  return {
    schemaVersion: 2,
    source: recordsExport.source ?? "field-attested-records-export",
    claims,
    evidence,
    policies: [FIELD_POLICY, ATTESTATION_POLICY, FLAG_POLICY, CRAWL_POLICY, PROPOSAL_POLICY],
    events,
  };
}

function assertFieldAttestedRecordsExport(value: unknown): FieldAttestedRecordsExport {
  if (!isObject(value)) throw new Error("Field-attested records export must be an object");
  requireString(value, "generatedAt");
  for (const attestedRecord of requireArray(value, "records")) assertAttestedRecord(attestedRecord);
  for (const attestation of optionalArray(value, "fieldAttestations")) assertObject(attestation, "Field-attested record field attestation");
  for (const flag of optionalArray(value, "reviewFlags")) assertObject(flag, "Review flag");
  for (const run of optionalArray(value, "crawlRuns")) assertObject(run, "Field-attested crawl run");
  for (const proposal of optionalArray(value, "proposals")) assertObject(proposal, "Field-attested proposal");
  return value as unknown as FieldAttestedRecordsExport;
}

function assertAttestedRecord(value: unknown): void {
  assertObject(value, "Attested record");
  requireString(value, "id");
  requireString(value, "name");
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
  integrityRef?: string;
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
    integrityRef: input.integrityRef,
  };
}

function buildEvent(input: {
  id: string;
  claimId: string;
  status: TrustStatus;
  method: string;
  evidenceIds: string[];
  createdAt: string;
  actor: string;
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

function attestationStatus(status: FieldAttestation["status"]): TrustStatus {
  if (status === "ACTIVE") return "verified";
  if (status === "STALE") return "stale";
  return "disputed";
}

function flagStatus(status: ReviewFlag["status"]): TrustStatus {
  if (status === "OPEN") return "disputed";
  if (status === "RESOLVED") return "verified";
  return "rejected";
}

function crawlStatus(status: CrawlRun["status"]): TrustStatus {
  if (status === "COMPLETED") return "verified";
  if (status === "FAILED") return "rejected";
  return "proposed";
}

function proposalStatus(status: RecordChangeProposal["status"]): TrustStatus {
  if (status === "APPROVED") return "verified";
  if (status === "REJECTED") return "rejected";
  if (status === "SKIPPED") return "superseded";
  return "proposed";
}

function claimId(...parts: string[]): string {
  return `field-attested-records.${parts.map(safeId).join(".")}`;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function iso(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`Invalid Field-attested records timestamp: ${value}`);
  return new Date(time).toISOString();
}

function requireString(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Field-attested records export missing string field: ${field}`);
  return value;
}

function requireArray(object: Record<string, unknown>, field: string): unknown[] {
  const value = object[field];
  if (!Array.isArray(value)) throw new Error(`Field-attested records export missing array field: ${field}`);
  return value;
}

function optionalArray(object: Record<string, unknown>, field: string): unknown[] {
  const value = object[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Field-attested records export ${field} must be an array`);
  return value;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
