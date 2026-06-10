# Trust Panel Embed

`<surface-trust-panel>` is a dependency-free, read-only web component that renders a derived trust report so a viewer can inspect claims, evidence, freshness, and transparency gaps before relying on them. It is the reference implementation of the [Minimum Trust Panel](../specs/minimum-trust-panel.md) disclosure baseline for derived reports.

Try it without installing anything in the hosted [Trust Snapshot Viewer](https://kontourai.github.io/surface/viewer.html) — reports are parsed entirely in the browser and never leave the page.

## Embed it

The component is a single file with no dependencies and no build step: [`src/trust-panel/surface-trust-panel.js`](../../src/trust-panel/surface-trust-panel.js). Copy it into your product and load a derived report:

```html
<script src="surface-trust-panel.js"></script>

<!-- Fetch a report by URL -->
<surface-trust-panel src="./report.json"></surface-trust-panel>

<!-- Or assign the report object directly -->
<surface-trust-panel id="panel"></surface-trust-panel>
<script>
  document.getElementById("panel").report = myTrustReport;
</script>
```

The input is the output of `surface report` or `buildTrustReport` — a derived `TrustReport`, not a raw `TrustInput`. If the JSON has claims but no derived statuses, the panel says so instead of guessing.

## What it renders

- A summary header with the report source and generation time.
- Status chips with plain-language labels (`verified` → "Verified", `stale` → "Needs refresh", `unknown` → "No evidence").
- One expandable row per claim: subject, asserted field and value, impact, policy, the evidence items behind it, and any transparency gaps, color-coded by severity.

## Theming

The panel inherits the host page through CSS custom properties with built-in fallbacks: `--k-text`, `--k-text-muted`, `--k-panel`, `--k-panel-raised`, `--k-line`, `--k-positive`, `--k-caution`, `--k-negative`, and `--k-font-ui`. Pages already using Kontour design tokens get a native look with no extra work; any other page can set those properties on the element.

## Boundaries

The panel displays derived trust state; it never re-derives, scores, or mutates it. Producer-specific vocabulary and actions belong to the product embedding the panel — see [Producer Extension Limits](../specs/producer-extension-limits.md). For an operator workspace rather than a viewer surface, use the [Surface Console](console.md).
