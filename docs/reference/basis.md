# Basis headless projection

`@kontourai/surface/basis` is the headless, tree-shaken read model for the evidence and bounded owner context behind one observed Thread answer. It is intentionally not exported by the package root and has no UI, network, storage, authentication, or product-runtime dependency.

## One Basis concept, three delivery paths

Surface owns one Viewer meaning for Basis: standing, evidence partitions, mandatory gaps, context ordering, and the rule that context is not support. Products choose one of three delivery paths without changing that meaning:

1. **Headless native rendering.** Import `buildBasisPanelViewModel` from `@kontourai/surface/basis/view` and render the parsed model with product-native primitives.
2. **Zero-framework embedding.** Set `.basisProjection` on the existing `<surface-trust-panel>`, or use `mode="basis"` with `src`; no input-shape sniffing selects Basis mode.
3. **MCP Apps.** A server can import `buildBasisPanelAppToolMeta` and `buildBasisPanelUiResource` from `@kontourai/surface/basis/mcp` to advertise canonical nested `_meta.ui.resourceUri` metadata and serve a self-contained `ui://` resource with `text/html;profile=mcp-app`. The resource inlines the official `@modelcontextprotocol/ext-apps@1.7.5` `App` client, so its stable `2026-01-26` lifecycle and schemas validate host initialization and standard `CallToolResult.structuredContent`; this version is distinct from the host/server MCP core protocol version. Surface does not choose tool visibility, registration, or authorization. The host mediates resources and tool results; Surface never fetches protected owner data in the browser.

`BasisPanelContextItem.ref` preserves the exact validated owner contribution
reference for a product's selection or drill-down routing. It is identity data,
not display text; consumers must not reconstruct it from the panel item's `id`,
label, facts, or ordering.

A native renderer may control spacing, typography, responsive layout, and focus behavior. It may not relabel standing, repartition evidence, hide gaps, or promote context into support.

```ts
import { buildBasisPanelViewModel } from "@kontourai/surface/basis/view";

const view = buildBasisPanelViewModel(projection); // hostile input becomes generic unavailable state
```

### Delivery-size ratchet

The repository checks minified, transitive browser bundles with esbuild plus gzip level 9, not tiny re-export stubs. Assessment v2 budgets are `basis/view` 7,036 bytes, `basis/mcp` 109,082 bytes, and the Trust Panel element 11,851 bytes. Against the same-worktree 2.18 baseline, the increases are 721, 1,660, and 939 bytes respectively: declared-versus-undeclared relationships, policy evaluation facts, evidence results, weak-edge provenance, strict parsing, and rendering. The zero-network MCP bundle includes the official ext-apps 1.7.5 initialization and tool-result schemas. Its cost applies only to the explicit MCP subpath, never the root or native viewer. Any increase requires a measured explanation; reductions must retain equivalent protocol and hostile-input coverage. The ratchet is `tests/basis-bundle-budget.test.ts`.

```ts
import { buildAnswerAssessmentProjection, composeBasisProjection } from "@kontourai/surface/basis";

const assessment = {
  owner: { authority: "@kontourai/surface" as const },
  state: "available" as const,
  observedAt: report.generatedAt,
  value: buildAnswerAssessmentProjection(report, claimId),
};
const basis = composeBasisProjection({ version: "surface.basis-projection/v1", answer, assessment, contributions: [] });
```

Surface is the only standing authority. An available assessment carries the exact `SurfaceAnswerAssessmentRef`: `@kontourai/surface`, `surface.answer-assessment/v2`, `answer-assessment`, `bundleId`, and `claimId`. Thread and products contribute context but do not evaluate semantic support. `buildAnswerAssessmentProjection` invokes Surface's policy evaluator; a missing policy remains `null`. A policy-met answer also requires a found, verified, nonstale claim with no counterevidence or gaps.

Policy results identify `surface.answer-assessment-policy/v1`, the resolved policy, evaluation time, outcome, redundant consistent `satisfied`, and categorical reasons. Positive requirements use explicitly declared entailing evidence and exclude failed evidence, including nonblocking failures. Failed records remain visible; undeclared support never becomes entailment by default. Policy corroboration counts records, not independent actors. Distinct-actor derivation requirements remain their separate owner contract.

## Assessment v2 migration (Surface 3.0)

This package major deliberately rejects the previous nested assessment wire. The outer `surface.basis-projection/v1` and Hachure status-function version `2` remain unchanged; it does not retire unrelated TrustBundle compatibility behavior.

- Rebuild assessments through `buildAnswerAssessmentProjection`, not by changing a version string on old JSON. Both assessment `version` and reference `schemaVersion` are `surface.answer-assessment/v2`.
- Render all four evidence partitions, including `undeclared`. Preserve each record's locator, declared support strength, result, and blocking fact. Undeclared blocking evidence can also appear in counterevidence without acquiring an entails declaration.
- Preserve direct derivation input source, method, strength, and rationale. Weak direct or transitive edges produce `unsupported_inference` gaps with exact weak-edge metadata; claim status math is unchanged.
- `createSurfacePolicyOutcome` is removed. Use the owner-built assessment or `evaluateAnswerAssessmentPolicy` from the package root. Native panel models expose a policy object (`id`, `outcome`, `evaluatedAt`, `reasons`), not the former display string.
- Build reports with the host's explicit authorized immutable bundle handle: `buildTrustReport(bundle, { id: bundleHandle, now })`. Neither a producer name nor the default clock-generated report ID is an immutable source identity.
- Review remains not captured until a validated review-owner join exists. Do not infer review state from arbitrary metadata.

The package root exports `ordinaryVerificationPolicy` and `createAnswerAssessmentReferenceExtension` as a small authoring-profile example. Products own their concrete vocabulary and policy templates. These are ordinary Surface extensions and verification policies, not another profile package or a claim of universal AI grounding.

Input begins with `AnswerObservationRead`, not a bare answer reference. Its owner is exactly Thread; `SurfaceAssessmentRead` is exactly Surface; and a `ContributionRead` must match every contributed ref's owner authority. The observation has an exact Thread 1.2.0 ref with `standing: "observed"`, never answer content. Thread IDs and message IDs are opaque bounded Unicode identity tokens—Surface neither NFC-normalizes nor URL/path-filters them. Display strings remain separately inert and strict. `execution-only` follows whenever the answer is available and Surface assessment was not captured or observed empty, including with zero contributions. Restricted reads expose only a non-sensitive owner descriptor and timestamp; every read arm carries `observedAt`.

Context has exact qualified refs, not generic ids: Thread results use `{ threadId, resultId }` at 1.2.0; Station input uses `{ sessionId, eventId }`, task output `{ taskId, outputId }`, and live `{ sessionId, observationId }` at v1; Flow Agents grounded narrative uses `{ narrativeId }` at `grounded-execution-narrative/v1`. Unpublished Flow/Survey versions are read as `unsupported-version` descriptors, never forged refs. Contributions are deduplicated by full ref tuple plus role; conflicting copies produce a deterministic corrupt gap.

The five context projections are bounded owner-attributed facts only: Station input kind/excerpt/count (`input`), Thread result name/status/part counts (`execution`), Station output title/media/length/digest (`outcome`), Station live state/time (`live`), and grounded narrative statement count/source completeness (`execution`). There is no generic display metadata or word blacklist. Display strings are inert data and may contain URL-shaped or HTML-looking text; renderers must escape them. They reject controls and bidi controls. Opaque evidence `sourceRef` values preserve bounded, well-formed Unicode exactly and are never normalized or dereferenced.

`parseBasisComposition` and `parseBasisProjection` validate all nested records, exact keys, UTF-8 budgets, cardinality, depth, nodes, cycles, accessors, and hostile proxies without Node `Buffer`; both are safe for browser bundles. `parseThreadAnswerRef` takes the same safe snapshot path when called directly. Snapshotting uses an ancestor stack, so shared acyclic objects remain valid. The projection parser recomputes standing and validates each relationship against the Surface assessment rather than trusting wire labels. Basis v1 creates only Surface `cites`, `supports`, `derived-from`, and explicit `counterevidence` edges. Claim-level gaps remain on the projection instead of being copied to every edge; contribution gaps remain on their region items. A host that cannot capture a relationship may add a contribution gap such as `relationship-not-captured`, but cannot emit a relationship. `produced`, `observed-during`, `checked-by`, and `kept-in-task` are deferred until their owning products publish exact contracts and kind sets. Relationships never affect standing.
