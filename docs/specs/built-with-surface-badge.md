# Built with Surface Badge

**Built with Surface** is an inspectability signal. It tells a user one thing: this product exposes inspectable trust state in the Surface format — claims, evidence, freshness, conflicts, and transparency gaps that the user can open and read.

It is deliberately not a certification. The badge does not mean Kontour audited the product, vouches for its claims, or guarantees that any claim is true. A product showing weak, stale, or disputed claims honestly is using the badge correctly; a product hiding them behind it is not.

## Requirements for using the badge

A product may show the badge when all of the following hold:

1. **Inspectable trust state exists.** The product exposes derived Surface trust state — a Trust Panel, an embedded [`<surface-trust-panel>`](../reference/trust-panel.md), a Surface Console, or an exported report a user can open in the [Snapshot Viewer](https://kontourai.github.io/surface/viewer.html).
2. **The badge is an entry point.** Activating the badge opens that trust state for the output the user is looking at, meeting the [Minimum Trust Panel](minimum-trust-panel.md) disclosure baseline.
3. **Material claims are disclosed.** The view behind the badge discloses material claims and their gaps per the [Disclosure Requirements](disclosure-requirements.md) — including stale, disputed, missing, and private support.
4. **Core semantics are intact.** The product has not redefined core statuses or derivation behavior; see [Producer Extension Limits](producer-extension-limits.md). Implementations other than the reference kernel should pass the [conformance suite](conformance.md).

## The asset

The badge ships as an SVG on the docs site at `built-with-surface.svg`:

```html
<a href="https://kontourai.github.io/surface/">
  <img src="https://kontourai.github.io/surface/built-with-surface.svg"
       alt="Built with Surface" height="36">
</a>
```

Self-host a copy in production rather than hot-linking. Keep the accessible name "Built with Surface", keep the badge legible at its rendered size, and link it to the product's own trust state (preferred) or to the Surface site.

## Language to avoid

Pair the badge with transparency language, not certainty language. "Inspect the claims behind this answer" is right. "Verified by Surface", "Surface certified", or using the badge as a trust score are wrong — they claim exactly what Surface refuses to claim.
