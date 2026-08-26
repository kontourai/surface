# Authoring a product profile

A product profile is an ordinary `SurfaceExtension` plus the claims, policies,
and evidence receipts its product already owns. It is not a Surface runtime,
derivation hook, schema field, or new package. Start in the product repository;
extract a package only after a second independent consumer proves that it needs
the same stable vocabulary and policy templates.

`examples/answer-provenance.json` is the reference bundle. Its
`answer-provenance` facet has three product-owned claim types:

- `product.answer.llm-answer` — the answer claim that may carry semantic support.
- `product.answer.routing-receipt` — request-routing context.
- `product.answer.tool-use` — tool invocation context.

Routing and tool claims do not entail an answer merely because they share a
request, model, metadata key, or facet. Add declared entailing evidence against
the exact answer claim only when the receipt establishes that answer; otherwise
keep it as context or separate cited evidence.

## Register the profile

Use the existing reference factory and registry; metadata is for authoring and
inspection, never status derivation.

```ts
import {
  createAnswerAssessmentReferenceExtension,
  registerExtension,
} from "@kontourai/surface";

const reference = createAnswerAssessmentReferenceExtension({
  name: "my-answer-product",
  displayName: "My Answer Product",
  vocab: {},
  theme: { brandName: "My Answer Product" },
});

registerExtension({
  ...reference,
  claimTypes: [
    {
      id: "product.answer.llm-answer",
      displayName: "LLM answer receipt",
      description: "An observed response with product-owned provenance facts.",
      defaultImpact: "medium",
      defaultFacet: "answer-provenance",
      policyTemplateId: "product.answer.llm-answer-policy/v1",
      metadataFields: [
        { key: "conversationId", label: "Conversation ID", type: "string" },
        { key: "messageId", label: "Message ID", type: "string" },
        { key: "model", label: "Model", type: "string" },
      ],
    },
    {
      id: "product.answer.routing-receipt",
      displayName: "Routing receipt",
      description: "Request context; it is not answer support.",
      defaultImpact: "low",
      defaultFacet: "answer-provenance",
    },
  ],
});
```

`registerExtension` is an authoring/presentation registry only. It cannot make
a claim verified, infer review, or create a semantic relationship.

## Positive answer assessment

The owner-built Basis assessment needs a resolved product policy, a verified
nonstale answer, and explicitly declared, non-failed
`supportStrength: "entails"` evidence for that exact answer. Required evidence
types/methods must be met; blocking evidence or gaps prevent success. Cited-only
receipts and failed nonblocking records remain visible but are not positive
support. Rebuild via `buildAnswerAssessmentProjection(report, claimId)`; do not
construct a policy verdict or supply a caller boolean.

```ts
const report = buildTrustReport(bundle, {
  id: authorizedImmutableBundleHandle,
  now,
});
const assessment = buildAnswerAssessmentProjection(report, "answer.supported");
```

The explicit `id` is an authorized immutable bundle handle. A producer name,
source string, or generated clock value is not an immutable identity.

## Interoperability and packaging

Claim types are product vocabulary. Similar answer, routing, or tool claims
from different products do not merge automatically because their metadata or
facets resemble one another. Keep them distinct until a real shared consumer
needs a common contract, then propose an Ops vocabulary convention with
examples from both products. Do not silently promote one product's type into
suite-wide meaning.

`requiresCorroboration` counts eligible evidence records. A product derivation
condition such as `minActors` is separate: record count never proves distinct
actors. Keep profile code beside the product's receipt and authorization
boundary. A second consumer sharing stable IDs, policy semantics, and authoring
fields is the evidence needed to extract a profile package.
