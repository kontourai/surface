# Consumer SDK

Use the consumer SDK when a product needs to emit Surface input without hand-assembling every top-level array.

```ts
import {
  TrustInputBuilder,
  buildTrustReport,
} from "@kontourai/surface";

const claimId = "myproduct.run-1.policy";
const evidenceId = `${claimId}.evidence`;

const builder = new TrustInputBuilder({ source: "myproduct:run-1" });

builder.addClaim({
  id: claimId,
  subjectType: "policy",
  subjectId: "release-gate",
  surface: "myproduct.governance",
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
  requiredProof: ["release check output"],
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

const input = builder.build();
const report = buildTrustReport(input);
```

`build()` calls `validateTrustInput` before returning, so malformed timestamps, broken references, unsupported enum values, and missing required fields fail before the product stores or publishes the input.

## Veritas Mapping

Veritas is the reference consumer. It maps a repo change run into:

- claims for affected repo surfaces, selected proof lanes, policy results, proof families, verification budgets, and external tool results
- evidence for each claim using the Veritas run id as `sourceRef`
- policies that describe what proof is required for each claim type
- events that verify, dispute, reject, stale, or propose those claims

Veritas validates the builder output, calls `buildTrustReport`, and consumes derived `stale` and `disputed` statuses as lint feedback.

## Smaller Adapter

The external adapter example under `examples/external-adapter` shows the minimum consumer pattern: register an adapter, use `TrustInputBuilder` in `adapt(record)`, call `builder.build()`, then pass the result to `buildTrustReport`.
