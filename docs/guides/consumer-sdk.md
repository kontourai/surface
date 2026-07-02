# Consumer SDK

Use the consumer SDK when a producer needs to emit Surface input without hand-assembling every top-level array.

```ts
import {
  TrustBundleBuilder,
  buildTrustReport,
} from "@kontourai/surface";

const claimId = "myproduct.run-1.policy";
const evidenceId = `${claimId}.evidence`;

const builder = new TrustBundleBuilder({ source: "myproduct:run-1" });

builder.addClaim({
  id: claimId,
  subjectType: "policy",
  subjectId: "release-gate",
  facet: "myproduct.governance",
  claimType: "release-policy",
  fieldOrBehavior: "gate",
  value: "passed",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  verificationPolicyId: "release.policy",
});

builder.addEvidence({
  id: evidenceId,
  evidenceType: "test_output",
  method: "validation",
  sourceRef: "ci:123",
  excerptOrSummary: "release checks passed",
  observedAt: "2026-05-01T00:00:00.000Z",
  collectedBy: "ci",
}).linkTo(claimId);

builder.addPolicy({
  id: "release.policy",
  claimType: "release-policy",
  requiredEvidence: ["test_output"],
  requiredMethods: ["validation"],
  requiresCorroboration: false,
  acceptanceCriteria: ["release check output"],
  reviewAuthority: "release system",
  validityRule: { kind: "manual" },
  stalenessTriggers: ["release check changes"],
  conflictRules: ["failed release checks reject the claim"],
  impactLevel: "high",
});

builder.addEvent({
  id: `${claimId}.verified`,
  claimId,
  status: "verified",
  actor: "ci",
  method: "release check",
  evidenceIds: [evidenceId],
  createdAt: "2026-05-01T00:00:00.000Z",
  verifiedAt: "2026-05-01T00:00:00.000Z",
});

builder.addClaimGroup({
  id: "framework.release-readiness",
  title: "Release readiness",
  kind: "framework",
  requirements: [{
    id: "requirement.release-policy",
    title: "Release policy",
    claimIds: [claimId],
    validationStrategy: {
      requiredEvidence: ["test_output"],
      requiredMethods: ["validation"],
      acceptanceCriteria: ["release check output"],
    },
  }],
});

const input = builder.build();
const report = buildTrustReport(input);
```

`build()` calls `validateTrustBundle` before returning, so malformed timestamps, broken references, unsupported enum values, and missing required fields fail before the product stores or publishes the input.

Claim groups are optional. The current API calls them `claimGroups`; use them when your product has a broader domain framework, compliance map, repo standards, checklist, or requirement set and you want users to start at the broader assertion while still drilling down to the exact claim and evidence.

## What the derived report looks like

The code above builds a release-gate claim, attaches test-output evidence, adds a policy that requires `test_output` evidence with a `validation` method, records a verification event, and wraps it in a claim group. Running `buildTrustReport(input)` produces a derived `TrustReport` with:

```text
{
  summary: {
    totalClaims: 1,
    byStatus: { verified: 1, ... },
    staleClaims: [],
    disputedClaims: [],
    highImpactUnsupported: [],
    transparencyGapsByType: {}
  },
  claims: [{
    id: "myproduct.run-1.policy",
    status: "verified",
    fieldOrBehavior: "gate",
    value: "passed",
    ...
  }],
  transparencyGaps: [],
  claimGroupRollups: [{
    title: "Release readiness",
    status: "verified",
    requirements: [{ status: "verified", ... }]
  }]
}
```

The claim is `verified` because the event records a `verified` status and the evidence satisfies the policy: it is `test_output` evidence collected via the `validation` method. If the evidence were missing, the claim would derive as `unknown` with a `provenance_gap` transparency gap. If the evidence method did not match the policy, a `policy_violation` transparency gap would appear. If the verification had aged past the policy's validity window, the claim would derive as `stale`.

## Veritas Mapping

Veritas is the reference vertical product built with Surface. It maps a repo change run into:

- claims for affected repo surfaces, selected evidence checks, policy results, evidence inventories, readiness coverages, and external tool results
- evidence for each claim using the Veritas readiness id as `sourceRef`
- policies that describe what evidence is required for each claim type
- events that verify, dispute, reject, stale, or propose those claims
- claim groups that project repo standards into requirement frameworks

Veritas validates the builder output, calls `buildTrustReport`, and consumes derived `stale` and `disputed` statuses as lint feedback.

## Smaller Adapter

The external adapter example under `examples/external-adapter` shows the minimum producer pattern: register an adapter, use `TrustBundleBuilder` in `adapt(record)`, call `builder.build()`, then pass the result to `buildTrustReport`.
