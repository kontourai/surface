# Schemas

Kontour Surface starts with core contract types. Trust inputs and trust reports currently accept `schemaVersion: 2` and `schemaVersion: 3`.

## Claim

A claim records the subject, surface, claim type, field or behavior, value, timestamps, status, policy link, confidence basis, and optional derivation links.

Use `derivedFrom` for simple claim-id dependencies. Use `derivationEdges` when the dependency needs method, role, or support-strength metadata:

```typescript
derivationEdges?: Array<{
  inputClaimId: string;
  method?: "sum" | "max" | "min" | "model" | "rule-application" | "copy" | "normalization" | "manual";
  role?: string;
  supportStrength?: "weak" | "moderate" | "strong";
  rationale?: string;
  metadata?: Record<string, unknown>;
}>;
```

Schema: `schemas/claim.schema.json`

## Evidence

Evidence records the source, locator, summary or excerpt, observed time, collector, verification `method`, and optional integrity reference.

The current method vocabulary is `observation`, `extraction`, `validation`, `corroboration`, `attestation`, `auditability`, `anchoring`, and `monitoring`.

Evidence remains linked to a claim with the required `claimId` field. Existing producers that only emit `claimId` are still compatible: omitted `supportStrength` is interpreted as `"entails"`. Producers may set `supportStrength: "cited"` when an evidence record is useful context or a source reference but does not by itself entail the claim. Cited evidence is carried through reports, but it does not satisfy policy evidence or method requirements and can produce an `unsupported_inference` transparency gap.

```typescript
supportStrength?: "cited" | "entails"; // omitted means "entails" for legacy claimId records
```

Survey-produced source-of-authority observations may declare the producer's source authority in `metadata.sourceAuthority`. Surface treats that as evidence metadata, not portable actor or system authority.

The optional `execution` field records provenance for evidence produced by running a command or tool. Producers such as Veritas populate it when an Evidence Check generated the evidence. Surface treats it as opaque metadata — it is carried through to reports and consumers but does not affect trust derivation.

```typescript
execution?: {
  runner: "bash" | "mcp";       // "bash" for shell commands, "mcp" for stdio MCP tool calls
  label: string;                 // human-readable identifier: command string or "tool@server"
  exitCode?: number;             // bash runner: process exit code
  isError?: boolean;             // mcp runner: tool-level error flag from the server
  durationMs?: number;           // wall-clock execution time
  metadata?: Record<string, unknown>; // runner-specific extras
}
```

Schema: `schemas/evidence.schema.json`

## Verification Policy

Policy defines required evidence, required methods, corroboration needs, acceptance criteria, review authority, validity, staleness triggers, conflict rules, and impact.

The optional `collectWhen` field lists the trust statuses that should trigger proactive evidence collection for the claim this policy covers. When a claim's current status appears in this list, producers treat it as a signal to run the associated Evidence Checks automatically rather than waiting for an explicit request. Surface owns this as trust policy; it does not collect evidence itself — producers such as Veritas read `collectWhen` to decide when to schedule evidence collection.

```typescript
collectWhen?: TrustStatus[];  // e.g. ["unknown", "stale", "disputed"]
```

Omitting `collectWhen` means the producer applies its own default evidence collection rules. A claim with status `unknown` is distinct from `stale` — unknown means no evidence has ever been recorded, while stale means evidence existed but has since expired.

Schema: `schemas/verification-policy.schema.json`

## Verification Event

Events are append-only status transitions for a claim.

Schema: `schemas/verification-event.schema.json`

## Trust Input

A trust input packages claims, evidence, policies, events, optional claimGroups, optional identity links, and optional Authority Trace records before Surface generates report-only fields.

Schema: `schemas/trust-input.schema.json`

## Authority Trace

Authority Trace is the first-class producer-neutral way to describe why an actor or system had authority over a claim or evidence record. It avoids relying on producer-specific evidence metadata conventions for role, permission, credential, policy, organization, or system authority.

Do not use `authorityTrace` for Survey's producer-declared source authority unless the producer has a neutral actor or system authority record to emit. Until then, keep that declaration under `Evidence.metadata.sourceAuthority`.

```typescript
interface AuthorityTrace {
  id: string;
  subject: { subjectType: string; subjectId: string };
  actorRef: string;
  authorityType: "role" | "permission" | "credential" | "system" | "organization" | "policy" | "other";
  authorityRef: string;
  sourceRef: string;
  observedAt: string;
  evidenceIds?: string[];
  claimIds?: string[];
  validFrom?: string;
  validUntil?: string;
  revokedAt?: string;
  integrityRef?: string;
  metadata?: Record<string, unknown>;
}
```

`evidenceIds` and `claimIds` must reference records in the same `TrustInput` when present. Surface validates timestamps, enum values, known references, and unknown fields. Producers own the identity provider, directory, credential registry, policy engine, and signature checks behind these references; Surface records and projects the resulting authority context.

## Claim Groups

Claim groups collect related claims into a framework, requirement set, or producer-defined view. The current schema field is `claimGroups`, and the nested field name is `requirements`. A requirement references concrete claim IDs and can include a validation strategy that describes what evidence, methods, or authority should support those claims. Surface validates the references and derives claim group rollups from claim status; the claim group definition is not evidence by itself.

## Trust Report

A report packages claims, evidence, policies, events, preserved Authority Trace records, report-derived evidence requirement fields, typed `transparencyGaps` annotations, derivation `changeRecords`, claim group rollups, and a derived summary.

`changeRecords` are report-derived guidance for claim dependencies. They mark derived claims that need recompute, review, or blocking because an input became stale, superseded, disputed, rejected, assumed, missing, or cyclic.

Schema: `schemas/trust-report.schema.json`

## Eval Summary

`EvalSummary` is a producer-agnostic record for post-hoc evaluation of a run. Producers such as Veritas write it into the run snapshot after a human reviews a completed run. The console displays it alongside live trust state.

```typescript
interface EvalSummary {
  reviewed: boolean;               // always true when present
  reviewedAt?: string;             // ISO timestamp of the review
  confidence?: "low" | "medium" | "high";
  outcome?: "accepted" | "accepted-with-changes" | "rejected";
  falsePositiveCount?: number;     // rules that fired but were overridden
  missedIssueCount?: number;       // issues the run did not surface
  timeToResolutionMinutes?: number;
  notes?: string[];
  metadata?: Record<string, unknown>; // producer-specific extras
}
```

Producers that do not run human eval cycles omit this field. Surface never fabricates it.

## Adapter inputs

Adapter inputs are intentionally separate from the core Surface schema. Product adapters read product artifacts and then emit standard Surface claims, evidence, policies, and events. This keeps domain-specific facts at the edge while preserving one report contract for humans and agents.

## Confidence basis

Surface should avoid a single opaque confidence score. The API should preserve the reasons confidence exists or does not exist: source quality, extraction confidence, corroboration, reviewer authority, freshness, conflict count, evidence strength, and impact.
