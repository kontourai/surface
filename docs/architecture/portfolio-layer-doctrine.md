# Portfolio Layer Doctrine

> **Scope.** This is the **cross-product** architecture of the Kontour portfolio — how the open
> format, the building-block tools, Surface, and the products stack. It is distinct from
> [Surface's own internal architecture](index.md) (Kernel / Adapters / Trust Snapshots / Console),
> which describes the layers *inside* Surface. When a doc says "four layers," check which it means:
> here it is the portfolio stack; in `index.md` it is Surface's internals.

Kontour is four layers. Dependencies point only downward; there are no cycles.

```text
Layer 4  Products          Surface, Flow, Survey, Veritas, Flow Agents, and the apps built on them
             ▲             depend on Surface.
             │
Layer 3  Surface           The integration surface. Reference implementation of the open trust
             ▲             format; the one place that produces, validates, and re-exports it.
             │
Layer 2  Building-block    forage, traverse, lookout. Trust-format-AWARE in output shape,
             ▲  tools      format-INDEPENDENT in dependencies.
             │
Layer 1  Open trust format hachure / OTF. Dependency-free schemas for TrustBundle, Claim,
                           Evidence, InquiryRecord, plus the versioned status function.
```

## The layers, precisely

### Layer 1 — the open trust format (hachure / OTF)

The normative, dependency-free schemas — `TrustBundle`, `Claim`, `Evidence`, `InquiryRecord` — and
the published, versioned status function every consumer recomputes. Not a Kontour product; the open
standard Kontour is the reference implementation of and is compatible with. Versioned on its own
cadence. Customers never hear this name.

### Layer 2 — the building-block tools (forage, traverse, lookout)

Composable, single-purpose tools. They are **trust-format-aware in output shape** — they emit
hachure-evidence-shaped output (`snapshotRef` / `locator` / `excerpt` / `fieldPath`) — but
**format-independent in dependencies**: they import nothing from the trust layer and pin no hachure
at runtime. Lifting their neutral output into a `TrustBundle` is a consumer/product responsibility,
not the tool's. Each tool states this posture in its own repo:

- **forage** — guarded crawl/fetch; emits pinned snapshots.
- **traverse** — extraction; does not depend on Survey at runtime, only produces output that maps
  onto Survey's types (guarded by a compile-time compat test).
- **lookout** — change/drift detection; depends on nothing in the trust layer — its events are
  already hachure-evidence-shaped, but lifting them into a `TrustBundle` is the consumer's job.

**`datum` is not a layer-2 tool.** datum resolves AI provider/model configuration — orthogonal to
the evidence/provenance chain the building-block tools serve. It composes into products like any
dependency, but it does not emit trust-format-shaped output and is not part of this layer.

### Layer 3 — Surface, the integration surface

Surface is the single integration point with the open format for the whole suite: the **reference
implementation of the OTF, and fully compatible with it.** It produces the format
(`TrustBundleBuilder`, projection), validates it, and re-exports its types, so no product speaks the
raw format itself. Which hachure version sits underneath is an implementation detail of Surface. See
the [Surface Foundation Boundary](surface-foundation.md) for the Surface↔product-layer rule, and
[Surface's internal architecture](index.md) for what lives *inside* Surface.

### Layer 4 — the products

Surface, Flow, Survey, Veritas, Flow Agents, and the apps built on them depend on Surface. They get
OTF compatibility through Surface and never speak the raw format themselves. Each product documents
its own boundary with Surface in-repo — for example `veritas/docs/architecture/surface-veritas-boundary.md`
and `flow/docs/developer-architecture.md`.

## Dependency direction is one-way

- Layer 1 depends on nothing.
- Layer 2 depends on nothing in the trust layer (format-aware *output* only).
- Layer 3 (Surface) depends on Layer 1 (hachure).
- Layer 4 depends on Layer 3 (Surface) only.

No layer reaches past its neighbor. In particular, **products do not reach past Surface into the raw
format.**

## Today vs the target

The one-way rule above is the **doctrine**. The Surface↔product half is already true (see the
[Foundation Boundary](surface-foundation.md)); the format-mediation half is a target, not yet fully
enforced in code:

| | Today | Target |
|---|---|---|
| hachure pin | Surface + several products pin it directly | Surface only |
| Trust-bundle *write* | `Surface.TrustBundleBuilder` | unchanged |
| Trust-bundle *validate* | products resolve hachure schemas directly | `Surface.validateTrustBundle` |
| Types | imported from `hachure` in products | re-exported from Surface |

Moving the remaining direct-hachure dependencies behind Surface — so version drift becomes
structurally impossible — is tracked as the layer-boundary-enforcement work. Until it lands, this
section describes the intended end state.

## Where this is stated for customers

The customer-facing version of this stack lives in the product-line vision and on the marketing
site — outcomes first (Surface / Flow / Survey), with the open format and the building-block tools
named for technical buyers rather than the homepage. This doc is the engineering-canonical source
those surfaces derive from.
