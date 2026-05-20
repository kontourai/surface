# Schemas

Kontour Surface starts with five contract types. Trust inputs and trust reports use `schemaVersion: 2`.

## Claim

A claim records the subject, surface, claim type, field or behavior, value, timestamps, status, policy link, and confidence basis.

Schema: `schemas/claim.schema.json`

## Evidence

Evidence records the source, locator, summary or excerpt, observed time, collector, verification `method`, and optional integrity reference.

The current method vocabulary is `observation`, `extraction`, `validation`, `corroboration`, `attestation`, `auditability`, `anchoring`, and `monitoring`.

Schema: `schemas/evidence.schema.json`

## Verification Policy

Policy defines required evidence, required methods, corroboration needs, proof, review authority, validity, staleness triggers, conflict rules, and impact.

Schema: `schemas/verification-policy.schema.json`

## Verification Event

Events are append-only status transitions for a claim.

Schema: `schemas/verification-event.schema.json`

## Trust Input

A trust input packages claims, evidence, policies, events, and optional collections before Surface generates report-only fields.

Schema: `schemas/trust-input.schema.json`

## Collections

Collections group related claims into a framework, control set, or producer-defined view. A control references concrete claim IDs and can include a validation strategy that describes what evidence, methods, proof, or authority should support those claims. Surface validates the references and derives collection rollups from claim status; the collection definition is not evidence by itself.

## Trust Report

A report packages claims, evidence, policies, events, report-derived proof requirements, typed fault lines, collection rollups, and a derived summary.

Schema: `schemas/trust-report.schema.json`

## Eval Summary

`EvalSummary` is a producer-agnostic record for post-hoc evaluation of a run. Producers such as Veritas write it into the run snapshot after a human reviews a completed run. The dashboard displays it alongside live trust state.

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

Surface should avoid a single opaque confidence score. The API should preserve the reasons confidence exists or does not exist: source quality, extraction confidence, corroboration, reviewer authority, freshness, conflict count, proof strength, and impact.
