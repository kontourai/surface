import type { TrustStatus } from "./types.js";

// The shared trust-state chip from @kontourai/ui (DESIGN.md "Trust UX"),
// rendered as an HTML string for Surface's framework-free renderers: the
// shadow-DOM Trust Panel, and (through the glyphs injected by
// buildConsoleHtml) the Console client.
//
// @kontourai/ui is a build-time asset source here, never a runtime dependency
// (tests/ui-boundary.test.ts), and it ships the chip as a React primitive and
// a custom element only. Its markup builder, trustStatePresentation, is not
// exported, so this module reproduces that markup and the glyph paths.
// The browser suites (trust-panel-render.spec.ts, console.spec.ts) compare
// each Surface renderer with ui's own <k-trust-state> element and fail when
// the markup, glyphs, or labels differ; tests/trust-state-chip-drift.test.ts
// does the same for the copied trust-state CSS and tokens.

/** Glyph paths per state, copied from @kontourai/ui (16px grid, stroked with currentColor). */
export const TRUST_STATE_GLYPHS: Readonly<Record<TrustStatus, string>> = {
  unknown: "M8 2.75a5.25 5.25 0 1 0 0 10.5a5.25 5.25 0 1 0 0-10.5Z",
  proposed: "M8 2.75a5.25 5.25 0 1 0 0 10.5a5.25 5.25 0 1 0 0-10.5ZM8 5.25V8l2 1.5",
  assumed: "M2.75 9.5c1.5-3 3.5-3 5.25-1.5s3.75 1.5 5.25-1.5",
  verified: "M3.25 8.5l3 3 6.5-7",
  stale: "M12.75 8a4.75 4.75 0 1 1-1.4-3.36M12.75 2.75v3h-3",
  disputed: "M3 6.25h10M3 9.75h10M10.25 3l-4.5 10",
  superseded: "M2.75 8h8M8 5l3 3-3 3M13.25 3.25v9.5",
  rejected: "M4 4l8 8M12 4l-8 8",
  revoked: "M8 2.75a5.25 5.25 0 1 0 0 10.5a5.25 5.25 0 1 0 0-10.5ZM4.3 11.7l7.4-7.4",
};

export interface TrustStateChipOptions {
  /** Visible label; empty or absent falls back to the state's default label. */
  label?: string | null;
  /** Visible detail text next to the chip (ui's detail slot). */
  detail?: string | null;
  /** Extra classes on the root element, after ui's own. */
  className?: string | null;
  /** Extra attributes for the root element, already escaped (e.g. ` part="standing"`). */
  attributes?: string;
}

/**
 * Renders ui's `.trust-state` markup for a claim status. `defaultLabels` is
 * Surface's TRUST_STATUS_LABELS (or a checked inline copy of it). As in ui,
 * an input that is not a trust state renders as its own text with no state
 * class, glyph, or data attribute; it is never coerced into a state.
 */
export function trustStateChipHtml(
  value: unknown,
  defaultLabels: Readonly<Record<string, string>>,
  options: TrustStateChipOptions = {},
): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  const state = Object.prototype.hasOwnProperty.call(TRUST_STATE_GLYPHS, normalized) ? (normalized as TrustStatus) : null;
  const defaultLabel = state ? defaultLabels[state] ?? state : null;
  const override = options.label?.trim();
  const shown = override || defaultLabel || String(value ?? "").trim() || "Unrecognized trust state";
  const hidden = state && defaultLabel && shown.toLowerCase() !== defaultLabel.toLowerCase() ? defaultLabel : null;
  const className = ["trust-state", state && `trust-state--${state}`, options.className].filter(Boolean).join(" ");
  const glyph = state
    ? `<svg class="trust-state__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${TRUST_STATE_GLYPHS[state]}"></path></svg>`
    : "";
  const detail = options.detail?.trim();
  return `<span class="${escapeChipHtml(className)}"${state ? ` data-trust-state="${state}"` : ""}${options.attributes ?? ""}>`
    + `<span class="trust-state__chip">${glyph}<span class="trust-state__label">${escapeChipHtml(shown)}</span>`
    + `${hidden ? `<span class="trust-state__hidden"> (${escapeChipHtml(hidden)})</span>` : ""}</span>`
    + `${detail ? `<span class="trust-state__detail">${escapeChipHtml(detail)}</span>` : ""}</span>`;
}

function escapeChipHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
