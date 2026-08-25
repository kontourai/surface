# Basis headless projection

`@kontourai/surface/basis` is the headless, tree-shaken read model for the evidence and bounded owner context behind one observed Thread answer. It is intentionally not exported by the package root and has no UI, network, storage, authentication, or product-runtime dependency.

## One Basis concept, three delivery paths

Surface owns one Viewer meaning for Basis: standing, evidence partitions, mandatory gaps, context ordering, and the rule that context is not support. Products choose one of three delivery paths without changing that meaning:

1. **Headless native rendering.** Import `buildBasisPanelViewModel` from `@kontourai/surface/basis/view` and render the parsed model with product-native primitives.
2. **Zero-framework embedding.** Set `.basisProjection` on the existing `<surface-trust-panel>`, or use `mode="basis"` with `src`; no input-shape sniffing selects Basis mode.
3. **MCP Apps.** A server can import `buildBasisPanelAppToolMeta` and `buildBasisPanelUiResource` from `@kontourai/surface/basis/mcp` to advertise canonical nested `_meta.ui.resourceUri` metadata and serve a self-contained `ui://` resource with `text/html;profile=mcp-app`. The embedded app uses the stable MCP Apps `2026-01-26` handshake implemented by `@modelcontextprotocol/ext-apps@1.7.5` and reads the standard `CallToolResult.structuredContent`; this version is distinct from the host/server MCP core protocol version. The host mediates resources and tool results; Surface never fetches protected owner data in the browser.

A native renderer may control spacing, typography, responsive layout, and focus behavior. It may not relabel standing, repartition evidence, hide gaps, or promote context into support.

```ts
import { buildBasisPanelViewModel } from "@kontourai/surface/basis/view";

const view = buildBasisPanelViewModel(projection); // hostile input becomes generic unavailable state
```

### Delivery-size ratchet

The repository checks gzip level 9 sizes for the browser delivery seams. Baseline at #207 closure: `basis/view` 2,406 bytes, `basis/mcp` 182 bytes, and the bundled Trust Panel element 12,983 bytes. The final increase over the initial #207 ratchet is the explicit Viewer-owned footer, canonical nested MCP Apps tool metadata/protocol constant, claim freshness/status disclosure, relationship-local gaps, and 44px disclosure targets. The larger element remains isolated from the root package. Any increase requires updating the checked budget and explaining the product cost in this section. The ratchet lives in `tests/basis-bundle-budget.test.ts` and measures the built files with Node `gzipSync(..., { level: 9 })`.

```ts
import { buildAnswerAssessmentProjection, composeBasisProjection } from "@kontourai/surface/basis";

const assessment = buildAnswerAssessmentProjection(report, claimId);
const basis = composeBasisProjection({ version: "surface.basis-projection/v1", answer, assessment, contributions: [] });
```

Surface is the only standing authority. An available assessment carries the exact `SurfaceAnswerAssessmentRef`: `@kontourai/surface`, `surface.answer-assessment/v1`, `answer-assessment`, `bundleId`, and `claimId`. Thread and Station can observe or contribute context, but cannot make an answer assessed or policy-met. `buildAnswerAssessmentProjection` reports evidence coverage and intentionally leaves `policy` null: coverage is not a policy verdict. The reserved Surface-owned `SurfacePolicyOutcome` is exactly `{ id, outcome, satisfied }`, where `satisfied` must equal `outcome === "satisfied"`; use `createSurfacePolicyOutcome` for an explicit evaluator result. A policy-met answer also needs a found, verified, nonstale claim with no counterevidence or gaps.

Input begins with `AnswerObservationRead`, not a bare answer reference. Its owner is exactly Thread; `SurfaceAssessmentRead` is exactly Surface; and a `ContributionRead` must match every contributed ref's owner authority. The observation has an exact Thread 1.2.0 ref with `standing: "observed"`, never answer content. Thread IDs and message IDs are opaque bounded Unicode identity tokens—Surface neither NFC-normalizes nor URL/path-filters them. Display strings remain separately inert and strict. `execution-only` follows whenever the answer is available and Surface assessment was not captured or observed empty, including with zero contributions. Restricted reads expose only a non-sensitive owner descriptor and timestamp; every read arm carries `observedAt`.

Context has exact qualified refs, not generic ids: Thread results use `{ threadId, resultId }` at 1.2.0; Station input uses `{ sessionId, eventId }`, task output `{ taskId, outputId }`, and live `{ sessionId, observationId }` at v1; Flow Agents grounded narrative uses `{ narrativeId }` at `grounded-execution-narrative/v1`. Unpublished Flow/Survey versions are read as `unsupported-version` descriptors, never forged refs. Contributions are deduplicated by full ref tuple plus role; conflicting copies produce a deterministic corrupt gap.

The five context projections are bounded owner-attributed facts only: Station input kind/excerpt/count (`input`), Thread result name/status/part counts (`execution`), Station output title/media/length/digest (`outcome`), Station live state/time (`live`), and grounded narrative statement count/source completeness (`execution`). There is no generic display metadata or word blacklist. Display strings are inert data and may contain URL-shaped or HTML-looking text; renderers must escape them. They reject controls and bidi controls. Opaque evidence `sourceRef` values preserve bounded, well-formed Unicode exactly and are never normalized or dereferenced.

`parseBasisComposition` and `parseBasisProjection` validate all nested records, exact keys, UTF-8 budgets, cardinality, depth, nodes, cycles, accessors, and hostile proxies without Node `Buffer`; both are safe for browser bundles. `parseThreadAnswerRef` takes the same safe snapshot path when called directly. Snapshotting uses an ancestor stack, so shared acyclic objects remain valid. The projection parser recomputes standing and validates each relationship against the Surface assessment rather than trusting wire labels. Basis v1 creates only Surface `cites`, `supports`, `derived-from`, and explicit `counterevidence` edges. Claim-level gaps remain on the projection instead of being copied to every edge; contribution gaps remain on their region items. A host that cannot capture a relationship may add a contribution gap such as `relationship-not-captured`, but cannot emit a relationship. `produced`, `observed-during`, `checked-by`, and `kept-in-task` are deferred until their owning products publish exact contracts and kind sets. Relationships never affect standing.
