# Schemas

Kontour Surface starts with core contract types. Trust inputs are read at `schemaVersion` 2 through 9 and written at the lowest version their content needs; trust reports declare 5. See [Schema Versioning](schema-versioning.md).

## Claim

A claim records the subject, surface, claim type, field or behavior, value, timestamps, status, policy link, confidence basis, optional materiality, and optional derivation links.

`materiality?: "low" | "medium" | "high"` is a portable ordinal for prioritizing inspection. It is not a trust score and it is not a replacement for `impactLevel`, status, or confidence basis. Surface validates only the domain-neutral ordinals; producers and vertical extensions own any calibration of those labels in their own docs, metadata, or extension policy.

Use `derivedFrom` for simple claim-id dependencies. Use `derivationEdges` when the dependency needs method, role, or support-strength metadata:

```typescript
derivationEdges?: Array<{
  inputClaimId: string;
  method?: "sum" | "max" | "min" | "model" | "rule-application" | "copy" | "normalization" | "manual";
  role?: string;
  supportStrength?: "weak" | "moderate" | "strong";
  rationale?: string;
  sensitivity?: { low: number; high: number; basis: string };
  metadata?: Record<string, unknown>;
}>;
```

`sensitivity` is an optional, domain-neutral range describing how much the derived value would move if this input moved — the quantitative companion to the qualitative derivation ceiling. Surface validates the range shape; producers own its calibration.

Derived claims remain ordinary claims in `TrustReport.claims`: consumers can keep reading their `status`, `value`, evidence, events, policy, and transparency gaps without using a special claim type. Consumers that need a compact, consumer-ready explanation can call `explainClaim(report, claimId)`. It returns the claim's status and string value, projected evidence and policy, filtered transparency gaps and change records, plus fail-soft derivation inputs, leaves, and diagnostics. Use `buildDerivationDrilldown(report, claimId)` when the full derivation context is needed, or inspect the `surface get` projection. The drilldown preserves the target claim, direct inputs, nested inputs, leaf claims, leaf evidence, and derivation diagnostics while leaving the underlying claims unchanged.

`conclusionConfidence` (optional, Hachure 0.14) carries a **calibrated** confidence on the conclusion — distinct from `confidenceBasis`, which carries the raw signals that fed an assessment:

```typescript
conclusionConfidence?: {
  value?: number;                       // calibrated P(conclusion correct), [0,1]
  method?: string;                      // provenance label, free-form
  interval?: { low: number; high: number };
  comfortZone?: { within: boolean; reason?: string };
};
```

It is **carried, not produced**: Surface passes it through unchanged and never derives or consults it during status derivation. It is orthogonal to `confidenceBasis.reviewerAuthority` (an expert-reviewed claim may carry low `value`; an unreviewed one high). `method` and `comfortZone.reason` are free-form producer-owned vocabulary — the producer (e.g. Survey) populates and owns them, they are never enumerated in the schema.

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

Two optional fields arrive at `schemaVersion: 9` (Hachure 0.17). Neither
affects trust derivation; a bundle that uses either must declare version 9.

```typescript
collectedByKind?: "human" | "deterministic" | "model"; // absent means not declared
inconclusive?: {                 // the attempt could not run or could not reach its source
  reason: "unreachable" | "tool_error" | "permission_denied" | "timeout" | "other";
  detail?: string;               // required when reason is "other"
};                               // requires supportStrength "cited" and no passing
```

An `inconclusive` item is shown as "Could not run", never as failed.
`execution.isError` alone still means the check ran and failed. See
[v8 to v9 migration](schema-versioning.md#v8-to-v9-migration), which also
covers the basis-annotations profile (`metadata.sourceOfRecord`,
`metadata.estimate`).

Schema: `schemas/evidence.schema.json`

## Verification Policy

Policy defines required evidence, required methods, corroboration needs, acceptance criteria, review authority, validity, staleness triggers, conflict rules, and impact.

The optional `collectWhen` field lists the trust statuses that should trigger proactive evidence collection for the claim this policy covers. When a claim's current status appears in this list, producers treat it as a signal to run the associated Evidence Checks automatically rather than waiting for an explicit request. Surface owns this as trust policy; it does not collect evidence itself — producers such as Veritas read `collectWhen` to decide when to schedule evidence collection.

```typescript
collectWhen?: TrustStatus[];  // e.g. ["unknown", "stale", "disputed"]
```

Omitting `collectWhen` means the producer applies its own default evidence collection rules. A claim with status `unknown` is distinct from `stale` — unknown means no evidence has ever been recorded, while stale means evidence existed but has since expired.

Schema: `schemas/verification-policy.schema.json`

### Validity-rule evaluation

`statusFunctionVersion` is `"3"` (Hachure 0.16) by default; `"4"` (Hachure
0.18) and `"2"` are selectable. See
[Status function version 3](schema-versioning.md#status-function-version-3) and
[Status function version 4](schema-versioning.md#status-function-version-4) for
every difference. Under `"3"` a verified claim whose validity rule cannot be
evaluated derives `stale`. Trust Snapshot derivation also emits a blocking
`policy_violation` transparency gap
(`<claim>.gap.unevaluable-validity-rule`) naming the rule, under either version;
under `"2"` that gap is what keeps a still-`verified` status from presenting an
unevaluable rule as healthy.

- A `commit` rule requires the resolved claim to carry `currentIntegrityRef`.
- A `duration` rule requires a finite, non-negative `durationDays` value and a
  parseable verified-event timestamp. (Under `"2"` a negative duration is a
  valid window that has already ended.)
- A rule kind not understood by this Surface version is unevaluable.

`validateTrustBundle` rejects a `duration` rule without a finite `durationDays`,
an unknown rule kind, and an unparseable timestamp. The status rule and the
gap remain necessary for typed or in-memory inputs that reach
`deriveTrustSnapshot` without prior validation. `validateTrustBundle` accepts a
`commit` rule on a claim without `currentIntegrityRef`; that claim derives
`stale`. Called with `{ statusFunctionVersion: "2" }` it refuses the claim when
`"2"` would derive `verified`, as it did before version `"3"`.

`verificationPolicyId` remains optional for authored claims. When no policy
resolves, Surface does not invent a validity window or a validity-rule gap.

A claim with no resolved policy cannot present as healthy. Under `"3"` it
derives at most `proposed`, because nothing defines what `verified` requires.
The snapshot also adds a blocking gap, under either version: the existing
`provenance_gap` (`<claim>.gap.provenance-gap`) when the claim has no evidence,
otherwise a `policy_violation` (`<claim>.gap.no-verification-policy`,
`metadata.source: "policy.unresolved"`). A claim whose `verificationPolicyId`
names a policy absent from the bundle resolves no policy under `"3"` (there is
no fallback to a claim-type policy) and gets one blocking `policy_violation`
(`<claim>.gap.unresolved-verification-policy`) in place of the
no-verification-policy gap; under `"2"` it gets that gap in addition to
whatever the fallback policy produces. A resolved policy that names no
required evidence type and no required method is treated as no policy under
`"3"`; the claim gets a blocking `policy_violation`
(`<claim>.gap.verification-policy-requires-nothing`,
`metadata.source: "policy.requiresNothing"`). Consumers that gate on blocking
gaps (answer assessment, Basis) refuse these claims.

### Check results

`test_output`, `calculation_trace` and `runtime_observation` evidence reports
its result through `passing`. Every item with `passing: false` produces a
`policy_violation` gap (`<claim>.gap.evidence-<evidence id>`), blocking unless
the item says `blocking: false`, whatever its `supportStrength`: a `cited`
failure still does not count as support or as counterevidence for status, but it
is no longer invisible. When a policy requires one of these types and no
entailing item of that type reports `passing: true`, the requirement is unmet
under status function `"3"` and the claim derives `proposed` (or `disputed` when
a failure is blocking). The snapshot reports it with a blocking
`policy_violation` gap (`<claim>.gap.check-result-missing-<type>`) naming the
result-less items (`passing` unset), or the failed items when every one of them
reported a failure. Under `"2"` status follows type presence, and the gap is
emitted only for result-less items.

## Verification Event

Events are append-only status transitions for a claim.

Schema: `schemas/verification-event.schema.json`

## Trust Input

A trust input packages claims, evidence, policies, events, optional claimGroups, optional identity links, and optional Authority Trace records before Surface generates report-only fields.

Schema: `schemas/trust-bundle.schema.json`

## Authority Trace

Authority Trace is the first-class producer-neutral way to describe why an actor or system had authority over a claim or evidence record. It avoids relying on producer-specific evidence metadata conventions for role, permission, credential, policy, organization, or system authority.

Do not use `authorityTrace` for Survey's producer-declared source authority unless the producer has a neutral actor or system authority record to emit. Until then, keep that declaration under `Evidence.metadata.sourceAuthority`.

Reviewed extraction provenance can use the versioned
`Evidence.metadata.reviewedExtraction` profile while retaining its generic
source, exact locator, and prepared-artifact integrity anchors in `sourceRef`,
`sourceLocator`, and `integrityRef`. See
[Reviewed Extraction Evidence](../guides/reviewed-extraction-evidence.md).

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

`evidenceIds` and `claimIds` must reference records in the same `TrustBundle` when present. Surface validates timestamps, enum values, known references, and unknown fields. Producers own the identity provider, directory, credential registry, policy engine, and signature checks behind these references; Surface records and projects the resulting authority context.

## Claim Groups

Claim groups collect related claims into a framework, requirement set, or producer-defined view. The current schema field is `claimGroups`, and the nested field name is `requirements`. A requirement references concrete claim IDs and can include a validation strategy that describes what evidence, methods, or authority should support those claims. Surface validates the references and derives claim group rollups from claim status; the claim group definition is not evidence by itself.

## Trust Report

A report packages claims, evidence, policies, events, preserved Authority Trace records, report-derived evidence requirement fields, typed `transparencyGaps` annotations, derivation `changeRecords`, claim group rollups, and a derived summary.

`changeRecords` are report-derived guidance for claim dependencies. They mark derived claims that need recompute, review, or blocking because an input became stale, superseded, disputed, rejected, assumed, missing, or cyclic.

Derivation drilldowns are read models over existing report fields. They normalize `derivedFrom` and `derivationEdges`, keep inspectable edge metadata such as `method`, `role`, `supportStrength`, `rationale`, and `sensitivity`, and attach each input or leaf claim's evidence, events, Authority Trace records, policy, requirement, transparency gaps, and derivation change records. The drilldown itself does not add numeric trust scoring or recompute execution records; forward impact analysis is provided separately by [counterfactual traversal](../architecture/derivation-and-counterfactual-algorithms.md) (`traceDependents`, `analyzeCounterfactual`), which is also a pure read model over the report.

Generated transparency gaps preserve claim `materiality` when present. Analytics and review queue projections can then sort or filter by `materiality` while keeping severity/impact and trust status separate.

Type: `TrustReport`, exported from the package. The report is a surface read-model with no separate shipped JSON Schema — the `schemas/` directory mirrors the canonical Hachure trust-format schemas (synced from the `hachure` dependency via `npm run sync:schemas`).

`buildAnswerCardProjection(report, claimId)` is likewise a report-only
TypeScript projection, not a new portable record or schema. It copies the
derived report facts supplied by its caller and does not validate, derive, or
recompute time. See [Answer Card Projection](answer-card-projection.md).

`waiverValidityByClaimId` (and its companion `waiverValidityFunctionVersion`) is an additive `TrustReport` field populated by `buildTrustReport` (and round-tripped through `surface report` CLI JSON) when the [waivers profile](https://github.com/hachure-org/spec/blob/main/waivers.md) is in use. It is declared in the vendored **`trust-report-waivers.schema.json`** extension schema (Hachure ≥ 0.12.0, synced via `npm run sync:schemas`): a strict consumer that expects waiver-validity validates a report against that extension, while the neutral core `trust-report.schema.json` stays field-minimal and does not carry these keys. Core report validation is unchanged — the core schema exposes its field set as an open `$defs/core` block that the extension references, so validating a report against the core alone remains exactly as strict as before. See [Waiver Validity](waiver-validity.md) for the field's shape.

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
