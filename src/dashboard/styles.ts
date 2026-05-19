export const DASHBOARD_CSS = `
/* token layer */
:root {
  --s-bg: #f4f2e9;
  --s-ink: #17211d;
  --s-muted: #66716c;
  --s-line: rgba(34, 47, 41, 0.16);
  --s-soft: rgba(34, 47, 41, 0.055);
  --s-panel: #fffdf6;
  --s-inset: #f5f3ea;
  --s-input: #ffffff;
  --s-good: #0f6b52;
  --s-good-bg: rgba(15, 107, 82, 0.1);
  --s-warn: #c45d34;
  --s-warn-bg: rgba(196, 93, 52, 0.1);
  --s-bad: #a83232;
  --s-bad-bg: rgba(168, 50, 50, 0.1);
  --s-amber: #8a6a00;
  --s-amber-bg: rgba(138, 106, 0, 0.1);
  --s-blue: #246f8f;
  --s-blue-bg: rgba(36, 111, 143, 0.1);
  --s-shadow: 0 2px 8px rgba(21, 27, 23, 0.07);
  --s-shadow-lg: 0 8px 32px rgba(21, 27, 23, 0.12);
}
@media (prefers-color-scheme: dark) {
  :root {
    --s-bg: #0e1310;
    --s-ink: #dde3d8;
    --s-muted: #8a9489;
    --s-line: rgba(218, 226, 211, 0.14);
    --s-soft: rgba(218, 226, 211, 0.06);
    --s-panel: #161d18;
    --s-inset: #111712;
    --s-input: #1c2520;
    --s-good: #4ec99a;
    --s-good-bg: rgba(78, 201, 154, 0.12);
    --s-warn: #f0835a;
    --s-warn-bg: rgba(240, 131, 90, 0.12);
    --s-bad: #e06060;
    --s-bad-bg: rgba(224, 96, 96, 0.12);
    --s-amber: #d4aa3a;
    --s-amber-bg: rgba(212, 170, 58, 0.12);
    --s-blue: #4fb8d6;
    --s-blue-bg: rgba(79, 184, 214, 0.12);
    --s-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
    --s-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.36);
  }
}

/* reset */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--s-bg);
  color: var(--s-ink);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100dvh;
}
body.sheet-open { overflow: hidden; }
button { appearance: none; background: none; border: none; cursor: pointer; font: inherit; color: inherit; padding: 0; }

/* header */
.dash-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--s-panel);
  border-bottom: 1px solid var(--s-line);
  padding: 0.75rem 1rem;
  display: grid;
  gap: 0.75rem;
}
.dash-eyebrow {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-muted);
}
.dash-brand h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}
.dash-metrics {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.metric-chip {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--s-line);
  background: var(--s-inset);
}
.metric-chip.metric-good { border-color: var(--s-good); background: var(--s-good-bg); }
.metric-chip.metric-warn { border-color: var(--s-warn); background: var(--s-warn-bg); }
.metric-chip.metric-bad  { border-color: var(--s-bad);  background: var(--s-bad-bg); }
.metric-chip.metric-blue { border-color: var(--s-blue); background: var(--s-blue-bg); }
.mc-value { font-size: 1.1rem; font-weight: 800; line-height: 1; }
.mc-label { font-size: 0.7rem; font-weight: 700; color: var(--s-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.mc-delta { font-size: 0.72rem; color: var(--s-muted); margin-left: auto; }
.dash-run {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin: 0;
  padding-top: 0.5rem;
  border-top: 1px solid var(--s-line);
}
.dash-run div { display: flex; gap: 0.4rem; align-items: baseline; }
.dash-run dt { font-size: 0.68rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--s-muted); }
.dash-run dd { margin: 0; font-size: 0.82rem; font-weight: 600; overflow-wrap: anywhere; }

/* body */
.dash-body {
  padding: 0.85rem 1rem 5rem;
  max-width: 800px;
  margin: 0 auto;
}

/* toolbar */
.dash-toolbar { margin-bottom: 0.85rem; }
.toolbar-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.5rem;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  background: var(--s-blue);
  color: white;
  font-weight: 800;
  font-size: 0.86rem;
}
.btn-primary:hover,
.btn-primary:focus-visible {
  filter: brightness(1.06);
  outline: 2px solid var(--s-blue);
  outline-offset: 2px;
}
.chip-strip {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.chip-strip::-webkit-scrollbar { display: none; }
.chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--s-line);
  border-radius: 99px;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--s-panel);
  white-space: nowrap;
  transition: background 0.12s, border-color 0.12s;
}
.chip:hover { background: var(--s-inset); }
.chip.chip-active { background: var(--s-ink); color: var(--s-bg); border-color: var(--s-ink); }
.chip-count { opacity: 0.65; font-weight: 600; }
.search-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.search-row input,
.search-row select {
  height: 40px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-input);
  color: var(--s-ink);
  font: inherit;
  font-size: 0.9rem;
  padding: 0 0.75rem;
}
.search-row input:focus,
.search-row select:focus {
  outline: 2px solid var(--s-blue);
  outline-offset: 1px;
}

/* attention band */
.attention-band {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  padding: 0.9rem 1rem;
  margin-bottom: 0.85rem;
  border: 1px solid var(--s-warn);
  border-left: 4px solid var(--s-warn);
  border-radius: 8px;
  background: var(--s-warn-bg);
}
.band-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--s-warn);
  color: white;
  font-size: 0.9rem;
  font-weight: 900;
  display: grid;
  place-items: center;
}
.band-body { min-width: 0; }
.band-body strong { display: block; font-size: 0.95rem; }
.band-body p { margin: 0.2rem 0 0; font-size: 0.88rem; color: var(--s-muted); line-height: 1.4; }

/* feed */
.feed-count {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--s-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.claim-feed {
  display: grid;
  gap: 0.45rem;
}
.claim-card {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  gap: 0 0.75rem;
  align-items: center;
  width: 100%;
  padding: 0.8rem 0.85rem;
  border: 1px solid var(--s-line);
  border-radius: 10px;
  background: var(--s-panel);
  box-shadow: var(--s-shadow);
  text-align: left;
  transition: background 0.1s;
}
.claim-card:hover,
.claim-card:focus-visible {
  background: var(--s-inset);
  outline: 2px solid var(--s-blue);
  outline-offset: 2px;
}
.claim-card.card-attention {
  border-color: var(--s-bad);
  background: var(--s-bad-bg);
}
.claim-card.card-attention:hover,
.claim-card.card-attention:focus-visible {
  background: var(--s-bad-bg);
}
.card-strong { border-left: 3px solid var(--s-good); }
.card-weak { border-left: 3px solid var(--s-amber); opacity: 0.92; }
.card-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--s-muted);
}
.dot-good   { background: var(--s-good); }
.dot-bad    { background: var(--s-bad); box-shadow: 0 0 0 3px var(--s-bad-bg); }
.dot-warn   { background: var(--s-warn); box-shadow: 0 0 0 3px var(--s-warn-bg); }
.dot-amber  { background: var(--s-amber); }
.dot-muted  { background: var(--s-muted); }
.card-body { min-width: 0; }
.card-title {
  display: block;
  font-size: 0.95rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.6rem;
  align-items: center;
  margin-top: 0.1rem;
}
.card-surface {
  font-size: 0.78rem;
  color: var(--s-blue);
  font-weight: 700;
}
.card-status-text {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--s-muted);
}
.status-disputed, .status-rejected { color: var(--s-bad); }
.status-stale { color: var(--s-warn); }
.status-verified { color: var(--s-good); }
.status-proposed { color: var(--s-amber); }
.card-faults {
  font-size: 0.73rem;
  font-weight: 800;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  background: var(--s-bad-bg);
  color: var(--s-bad);
}
.card-divergence {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--s-amber);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--s-amber-bg);
  border: 1px solid var(--s-amber);
}
.card-value {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--s-muted);
  font-family: ui-monospace, "Cascadia Code", monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-chevron {
  font-size: 1.2rem;
  color: var(--s-muted);
  line-height: 1;
  flex-shrink: 0;
}
.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--s-muted);
  border: 1px dashed var(--s-line);
  border-radius: 10px;
  font-size: 0.9rem;
}

/* sheet backdrop */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.38);
  z-index: 99;
  backdrop-filter: blur(1px);
}

/* detail sheet — mobile: bottom sheet */
.detail-sheet {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 100;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  border-radius: 16px 16px 0 0;
  background: var(--s-panel);
  border-top: 1px solid var(--s-line);
  box-shadow: 0 -4px 40px rgba(0, 0, 0, 0.18);
  transform: translateY(100%);
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}
.detail-sheet:not([hidden]) {
  transform: translateY(0);
  display: flex;
}
.sheet-drag {
  flex-shrink: 0;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--s-line);
  margin: 10px auto 0;
}
.sheet-close {
  position: absolute;
  top: 0.75rem;
  right: 0.85rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--s-inset);
  border: 1px solid var(--s-line);
  font-size: 0.9rem;
  display: grid;
  place-items: center;
  color: var(--s-muted);
}
.sheet-close:hover { color: var(--s-ink); background: var(--s-soft); }
.sheet-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.1rem 2.5rem;
  overscroll-behavior: contain;
}
.sheet-top {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}
.status-badge {
  padding: 0.2rem 0.55rem;
  border-radius: 5px;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: var(--s-soft);
  color: var(--s-muted);
}
.badge-good  { background: var(--s-good-bg); color: var(--s-good); }
.badge-bad   { background: var(--s-bad-bg);  color: var(--s-bad); }
.badge-warn  { background: var(--s-warn-bg); color: var(--s-warn); }
.badge-amber { background: var(--s-amber-bg); color: var(--s-amber); }
.badge-muted { background: var(--s-soft); color: var(--s-muted); }
.sheet-surface {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--s-blue);
}
.sheet-title {
  margin: 0 0 0.2rem;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.25;
}
.sheet-subtitle {
  margin: 0 0 1rem;
  font-size: 0.75rem;
  color: var(--s-muted);
  font-family: ui-monospace, "Cascadia Code", monospace;
  overflow-wrap: anywhere;
}
.sheet-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.sheet-action-btn {
  min-height: 34px;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-inset);
  font-size: 0.82rem;
  font-weight: 800;
}
.sheet-action-btn:hover,
.sheet-action-btn:focus-visible {
  border-color: var(--s-blue);
  color: var(--s-blue);
  outline: none;
}
.sheet-action-btn--danger {
  color: var(--s-bad);
}
.sheet-action-btn--danger:hover,
.sheet-action-btn--danger:focus-visible {
  border-color: var(--s-bad);
  color: var(--s-bad);
}
.sheet-section {
  margin-bottom: 1.1rem;
}
.divergence-banner {
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border-left: 3px solid var(--s-amber);
  background: var(--s-amber-bg);
  font-size: 0.88rem;
  line-height: 1.45;
  margin-bottom: 0.9rem;
}
.divergence-banner p { margin: 0; color: var(--s-ink); }
.section-label {
  margin: 0 0 0.4rem;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-muted);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.sheet-section p { margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--s-ink); }

/* contextual help */
.help-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  letter-spacing: 0;
  text-transform: none;
}
.help-trigger {
  display: inline-grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  border: 1px solid var(--s-line);
  border-radius: 50%;
  background: var(--s-inset);
  color: var(--s-muted);
  font: 900 0.72rem/1 system-ui, sans-serif;
  cursor: help;
}
.help-trigger:hover,
.help-trigger:focus-visible,
.help-wrap.help-open .help-trigger {
  border-color: var(--s-blue);
  color: var(--s-blue);
  outline: none;
}
.help-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.45rem);
  left: 50%;
  width: min(18rem, calc(100vw - 2rem));
  transform: translateX(-50%) translateY(-0.2rem);
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel);
  color: var(--s-ink);
  box-shadow: var(--s-shadow);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.45;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease, transform 120ms ease;
}
.help-popover::before {
  content: "";
  position: absolute;
  top: -6px;
  left: calc(50% - 6px);
  width: 10px;
  height: 10px;
  border-left: 1px solid var(--s-line);
  border-top: 1px solid var(--s-line);
  background: var(--s-panel);
  transform: rotate(45deg);
}
.help-wrap:hover .help-popover,
.help-wrap:focus-within .help-popover,
.help-wrap.help-open .help-popover {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

/* fault items */
.fault-item {
  padding: 0.7rem 0.85rem;
  border-radius: 8px;
  border-left: 3px solid var(--s-bad);
  background: var(--s-bad-bg);
  margin-bottom: 0.5rem;
}
.fault-item:last-child { margin-bottom: 0; }
.fault-item.fault-medium,
.fault-item.fault-low { border-left-color: var(--s-warn); background: var(--s-warn-bg); }
.fault-item.fault-kind-setup,
.fault-item.fault-kind-config { border-left-color: var(--s-amber); background: var(--s-amber-bg); }
.fault-item.fault-kind-workflow { border-left-color: var(--s-blue); background: var(--s-blue-bg); }
.fault-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.fault-kind {
  font-size: 0.65rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--s-bad-bg);
  color: var(--s-bad);
  flex-shrink: 0;
}
.fault-item.fault-kind-setup .fault-kind,
.fault-item.fault-kind-config .fault-kind { background: var(--s-amber-bg); color: var(--s-amber); }
.fault-item.fault-kind-workflow .fault-kind { background: var(--s-blue-bg); color: var(--s-blue); }
.fault-type {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--s-ink);
}
.nonblocking-pill {
  font-size: 0.65rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--s-blue-bg);
  color: var(--s-blue);
  border: 1px solid var(--s-blue);
  margin-left: 0.4rem;
}
.fault-msg { margin: 0.2rem 0 0; font-size: 0.85rem; line-height: 1.4; color: var(--s-ink); }
.fault-hint {
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--s-muted);
  padding-top: 0.4rem;
  border-top: 1px solid var(--s-line);
}

/* policy gap table */
.gap-table { display: grid; gap: 0.4rem; }
.gap-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 0.5rem;
  align-items: start;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  font-size: 0.84rem;
}
.gap-row.gap-missing {
  background: var(--s-bad-bg);
  border: 1px solid var(--s-bad);
}
.gap-row.gap-has {
  background: var(--s-inset);
  border: 1px solid var(--s-line);
}
.gap-label {
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--s-muted);
  padding-top: 0.15rem;
}
.gap-missing .gap-label { color: var(--s-bad); }
.gap-value { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.gap-value code {
  font-size: 0.78rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--s-soft);
  border: 1px solid var(--s-line);
}
.empty-value {
  color: var(--s-muted);
  font-style: italic;
}
.gap-missing .gap-value code { background: var(--s-bad-bg); border-color: var(--s-bad); color: var(--s-bad); }

/* mono value */
.mono-block {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.82rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-inset);
  color: var(--s-ink);
}

.observed-result {
  display: grid;
  gap: 0.65rem;
}
.observed-result p {
  margin: 0;
  color: var(--s-ink);
  line-height: 1.4;
}
.observed-grid {
  display: grid;
  gap: 0.35rem;
}
.observed-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: start;
  gap: 0.55rem;
}
.observed-row span {
  color: var(--s-muted);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}
.observed-row code,
.observed-output pre {
  font-family: ui-monospace, "Cascadia Code", monospace;
  overflow-wrap: anywhere;
}
.observed-row code {
  color: var(--s-ink);
}
.observed-output {
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-inset);
}
.observed-output summary {
  cursor: pointer;
  padding: 0.55rem 0.75rem;
  color: var(--s-muted);
  font-weight: 800;
}
.observed-output pre {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  padding: 0.75rem;
  border-top: 1px solid var(--s-line);
  color: var(--s-ink);
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
}

/* action list */
.action-list { display: grid; gap: 0.45rem; }
.action-item {
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-inset);
}
.action-type {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--s-blue);
  margin-bottom: 0.25rem;
}
.action-item p { margin: 0; font-size: 0.88rem; line-height: 1.4; }
.action-path {
  display: inline-block;
  margin: 0.35rem 0.3rem 0 0;
  font-size: 0.75rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  padding: 0.1rem 0.4rem;
  background: var(--s-soft);
  border-radius: 4px;
  color: var(--s-muted);
}
.more-note { margin: 0.5rem 0 0; font-size: 0.82rem; color: var(--s-muted); }
.plugin-attribution {
  font-size: 0.75rem;
  color: var(--s-muted);
  border-left: 2px solid var(--s-blue);
  padding-left: 0.5rem;
  margin-top: 0.35rem;
}

/* file chips */
.file-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.file-chip {
  font-size: 0.73rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  padding: 0.15rem 0.45rem;
  background: var(--s-inset);
  border: 1px solid var(--s-line);
  border-radius: 4px;
  color: var(--s-muted);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* raw details */
.sheet-raw {
  margin-top: 0.5rem;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  overflow: hidden;
}
.sheet-raw summary {
  padding: 0.6rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--s-muted);
  cursor: pointer;
  user-select: none;
  background: var(--s-inset);
}
.sheet-raw summary:hover { color: var(--s-ink); }
.sheet-raw pre {
  margin: 0;
  padding: 0.85rem;
  font-size: 0.75rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 400px;
  overflow: auto;
  background: var(--s-bg);
  border-top: 1px solid var(--s-line);
}

/* claim authoring modal */
.claim-modal {
  width: min(560px, 95vw);
  max-height: 88dvh;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: var(--s-panel);
  color: var(--s-ink);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.claim-modal::backdrop {
  background: rgba(0, 0, 0, 0.42);
}
.claim-modal form {
  margin: 0;
}
.modal-title {
  margin: 0;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--s-line);
  font-size: 1.05rem;
  font-weight: 800;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  max-height: 65dvh;
  overflow: auto;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.form-field label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--s-muted);
}
.form-field input,
.form-field select {
  min-height: 38px;
  background: var(--s-input);
  border: 1px solid var(--s-line);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: var(--s-ink);
  font: inherit;
  font-size: 0.875rem;
}
.form-field input:focus,
.form-field select:focus {
  outline: 2px solid var(--s-blue);
  outline-offset: 1px;
}
.field-hint {
  margin: 0;
  min-height: 1.1rem;
  color: var(--s-muted);
  font-size: 0.78rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--s-line);
}
.modal-actions button:not(.btn-primary) {
  min-height: 36px;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-inset);
  font-weight: 800;
}

/* desktop: right panel */
@media (min-width: 900px) {
  .dash-header {
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: 1rem 1.5rem;
  }
  .dash-run {
    border-top: 0;
    padding-top: 0;
    border-left: 1px solid var(--s-line);
    padding-left: 1.25rem;
    flex-direction: column;
    gap: 0.35rem;
  }
  .detail-sheet {
    left: auto; right: 0; top: 0; bottom: 0;
    width: min(440px, 45vw);
    max-height: none;
    border-radius: 0;
    border-top: 0;
    border-left: 1px solid var(--s-line);
    box-shadow: -4px 0 40px rgba(0, 0, 0, 0.12);
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .detail-sheet:not([hidden]) {
    transform: translateX(0);
  }
  .sheet-drag { display: none; }
  .sheet-close { top: 0.85rem; right: 0.85rem; }
  body.sheet-open .dash-body {
    padding-right: min(440px, 45vw);
  }
}
`;
