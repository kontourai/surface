# Basis headless projection

`@kontourai/surface/basis` is the headless, tree-shaken read model for the evidence and bounded owner context behind one Thread assistant answer. It is intentionally **not** exported by the package root, and it has no UI, network, storage, authentication, or product-runtime dependency.

```ts
import { buildAnswerAssessmentProjection, composeBasisProjection, SURFACE_BASIS_VERSION } from "@kontourai/surface/basis";

const assessment = buildAnswerAssessmentProjection(report, claimId);
const basis = composeBasisProjection({
  version: SURFACE_BASIS_VERSION,
  answer,
  assessment: { owner: threadResultOwner, state: "available", value: assessment },
  contributions: [],
});
```

Surface owns the parser, canonical projection, assessment projection, semantic labels and ordering, and the relationship contract. Thread, Flow Agents, Flow, Survey, and Station own retrieval, authentication, live state, and their own workflow meanings. `SurfaceExtension` is presentation vocabulary only; it is not a Basis compositor and cannot alter standing.

`ThreadAnswerRef` is exact and structural: authority `@kontourai/thread`, schema version `1.2.0`, kind `assistant-message`, plus `threadId` and `messageId`. No Thread runtime dependency is taken. Owner references are also closed tuples; unknown owner versions parse as typed gaps rather than being coerced into a known record.

`OwnerRead` preserves availability explicitly. `restricted` deliberately has no value, identifier, count, or detail. The parser applies exact keys, UTF-8 and cardinality budgets, and rejects executable URLs, HTML-like text, control characters, and bidi controls. It is suitable for untrusted JSON only for the context envelope; a report assessment remains a typed in-process projection.

Standing is deliberately narrow: `policy-met` only when Surface's existing policy evaluator returns `satisfied` for entailing evidence; `assessed-with-gaps` when a Surface assessment is available but has no satisfied policy; `execution-only` only when assessment was not captured or observed empty and matching, owner-attributed context exists; and `unresolved` otherwise with a typed reason.

Context contributions are inert display material. They cannot make a claim stand, satisfy a policy, turn citations into entailment, or hide Surface gaps. Only the Surface assessment creates `cites`, `supports`, and `derived-from` relationships; owner context never becomes semantic evidence.
