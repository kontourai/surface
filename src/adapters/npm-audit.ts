import type { Claim, Evidence, TrustInput, VerificationEvent, VerificationPolicy } from "../types.js";

export interface NpmAuditVulnerability {
  name?: string;
  severity?: string;
  via?: Array<string | { source?: number; name?: string; title?: string; url?: string; severity?: string; range?: string }>;
  effects?: string[];
  range?: string;
  nodes?: string[];
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
}

export interface NpmAuditReport {
  auditReportVersion?: number;
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
  metadata?: {
    vulnerabilities?: Record<string, number>;
    dependencies?: Record<string, number>;
  };
}

const AUDIT_POLICY: VerificationPolicy = {
  id: "npm-audit.package-version-safety",
  claimType: "package-version-safety",
  requiredEvidence: ["policy_rule"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  requiredProof: ["npm audit --json"],
  reviewAuthority: "package manager audit",
  validityRule: { kind: "duration", durationDays: 1 },
  stalenessTriggers: ["new npm advisory", "dependency version changes", "lockfile changes"],
  conflictRules: ["present vulnerability rejects package-version safety"],
  impactLevel: "high",
};

function nowIso(): string {
  return new Date().toISOString();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "package";
}

function vulnerabilityTitle(vulnerability: NpmAuditVulnerability): string {
  const advisory = vulnerability.via?.find((item) => typeof item === "object") as
    | { title?: string; source?: number; url?: string }
    | undefined;
  if (advisory?.title) return advisory.title;
  if (advisory?.source) return `npm advisory ${advisory.source}`;
  return "npm audit vulnerability";
}

export function adaptNpmAuditReportToTrustInput(report: NpmAuditReport): TrustInput {
  const generatedAt = nowIso();
  const vulnerabilities = Object.entries(report.vulnerabilities ?? {});
  const claims: Claim[] = [];
  const evidence: Evidence[] = [];
  const events: VerificationEvent[] = [];

  for (const [packageName, vulnerability] of vulnerabilities) {
    const packageSlug = slug(packageName);
    const claimId = `claim.npm-audit.${packageSlug}.safe`;
    const evidenceId = `evidence.npm-audit.${packageSlug}`;
    const eventId = `event.npm-audit.${packageSlug}`;
    const installedNodes = vulnerability.nodes ?? [];
    const severity = vulnerability.severity ?? "unknown";

    claims.push({
      id: claimId,
      subjectType: "npm-package",
      subjectId: packageName,
      surface: "npm-audit.dependencies",
      claimType: "package-version-safety",
      fieldOrBehavior: "safeAtInstalledVersion",
      value: false,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      impactLevel: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
      verificationPolicyId: AUDIT_POLICY.id,
      confidenceBasis: {
        sourceQuality: "strong",
        reviewerAuthority: "system",
        proofStrength: "strong",
        impactLevel: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
      },
      metadata: {
        severity,
        range: vulnerability.range ?? null,
        effects: vulnerability.effects ?? [],
        nodes: installedNodes,
        fixAvailable: vulnerability.fixAvailable ?? false,
      },
    });

    evidence.push({
      id: evidenceId,
      claimId,
      evidenceType: "policy_rule",
      method: "validation",
      sourceRef: "npm audit --json",
      sourceLocator: packageName,
      excerptOrSummary: `${packageName}: ${vulnerabilityTitle(vulnerability)}`,
      observedAt: generatedAt,
      collectedBy: "npm audit",
      metadata: {
        vulnerability,
      },
    });

    events.push({
      id: eventId,
      claimId,
      status: "rejected",
      actor: "npm audit",
      method: "validation",
      evidenceIds: [evidenceId],
      createdAt: generatedAt,
      verifiedAt: generatedAt,
      notes: "npm audit reported a vulnerability for this installed package version.",
    });
  }

  return {
    schemaVersion: 3,
    source: "npm-audit",
    claims,
    evidence,
    policies: [AUDIT_POLICY],
    events,
  };
}
