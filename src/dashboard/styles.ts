export const DASHBOARD_CSS = `
/* ============================================================
   SURFACE DASHBOARD — Premium Design System
   Dark-first, brand-aligned, developer-tool aesthetic
   ============================================================ */

/* ── 1. Design Tokens ───────────────────────────────────────── */
:root {
  /* Backgrounds */
  --bg:       #f2efe5;
  --surface:  #fdfaf2;
  --raised:   #f7f4ea;
  --input-bg: #ffffff;

  /* Typography */
  --ink:   #1a2019;
  --ink-2: #445046;
  --muted: #7a8c7c;

  /* Borders & surfaces */
  --line: rgba(26, 52, 30, 0.13);
  --soft: rgba(26, 52, 30, 0.055);

  /* Semantic colours */
  --green:      #0c6b4a;
  --green-bg:   rgba(12, 107, 74, 0.09);
  --amber:      #886600;
  --amber-bg:   rgba(136, 102, 0, 0.09);
  --red:        #9b2b2b;
  --red-bg:     rgba(155, 43, 43, 0.09);
  --blue:       #1c6d8a;
  --blue-bg:    rgba(28, 109, 138, 0.09);
  --orange:     #9b4819;
  --orange-bg:  rgba(155, 72, 25, 0.09);

  /* Shadows */
  --shadow:    0 1px 4px rgba(26, 52, 30, 0.08), 0 4px 16px rgba(26, 52, 30, 0.05);
  --shadow-lg: 0 8px 40px rgba(26, 52, 30, 0.13);
  --shadow-xl: 0 20px 60px rgba(26, 52, 30, 0.18);

  /* Radii */
  --radius-sm: 6px;
  --radius:    10px;
  --radius-lg: 14px;
  --radius-xl: 18px;

  /* Transitions */
  --ease-out: cubic-bezier(0.32, 0.72, 0, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:       #0d1411;
    --surface:  #131c15;
    --raised:   #192018;
    --input-bg: #1a2419;

    --ink:   #dce8d5;
    --ink-2: #9bb09a;
    --muted: #647a65;

    --line: rgba(155, 200, 160, 0.11);
    --soft: rgba(155, 200, 160, 0.055);

    --green:      #52c47e;
    --green-bg:   rgba(82, 196, 126, 0.12);
    --amber:      #d4aa3a;
    --amber-bg:   rgba(212, 170, 58, 0.12);
    --red:        #e06060;
    --red-bg:     rgba(224, 96, 96, 0.12);
    --blue:       #4fb8d6;
    --blue-bg:    rgba(79, 184, 214, 0.12);
    --orange:     #f0835a;
    --orange-bg:  rgba(240, 131, 90, 0.12);

    --shadow:    0 1px 4px rgba(0, 0, 0, 0.28), 0 4px 16px rgba(0, 0, 0, 0.18);
    --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.36);
    --shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.48);
  }
}

/* Legacy aliases — keeps any future JS/CSS that might read these working */
:root {
  --s-bg:       var(--bg);
  --s-ink:      var(--ink);
  --s-muted:    var(--muted);
  --s-line:     var(--line);
  --s-soft:     var(--soft);
  --s-panel:    var(--surface);
  --s-inset:    var(--raised);
  --s-input:    var(--input-bg);
  --s-good:     var(--green);
  --s-good-bg:  var(--green-bg);
  --s-warn:     var(--orange);
  --s-warn-bg:  var(--orange-bg);
  --s-bad:      var(--red);
  --s-bad-bg:   var(--red-bg);
  --s-amber:    var(--amber);
  --s-amber-bg: var(--amber-bg);
  --s-blue:     var(--blue);
  --s-blue-bg:  var(--blue-bg);
  --s-shadow:   var(--shadow);
  --s-shadow-lg:var(--shadow-lg);
}

/* ── 2. Reset & Base ────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  min-height: 100dvh;
}

body.sheet-open { overflow: hidden; }

button {
  appearance: none;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
  padding: 0;
}

/* ── 3. Header ──────────────────────────────────────────────── */
.dash-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  padding: 0.875rem 1.25rem;
  display: grid;
  gap: 0.875rem;
  /* Subtle backdrop blur for premium feel */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

/* Brand section */
.dash-brand {
  min-width: 0;
}

.dash-eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
}

.dash-brand h1 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  font-family: ui-serif, Georgia, "Times New Roman", serif;
  color: var(--ink);
}

/* Metrics row */
.dash-metrics {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

/* Run metadata — compact inline line under project name */
.dash-run-line {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dash-run-meta {
  margin: 0.35rem 0 0;
  font-size: 0.72rem;
  color: var(--muted);
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

/* Run picker (multi-run selector) */
.run-picker {
  margin-top: 0.35rem;
  appearance: none;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0.2rem 1.6rem 0.2rem 0.6rem;
  font-size: 0.72rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  color: var(--ink-2);
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.45rem center;
  transition: border-color 0.12s ease;
}
.run-picker:hover { border-color: var(--blue); }
.run-picker:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 20%, transparent); }

/* ── 4. Metric Chips ────────────────────────────────────────── */
.metric-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.75rem;
  border-radius: 99px;
  border: 1px solid var(--line);
  background: var(--raised);
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.1s ease, border-color 0.15s ease;
}

.metric-chip:hover {
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}

.metric-chip-active {
  box-shadow: var(--shadow);
  border-width: 2px;
  transform: translateY(-1px);
}

.metric-chip.metric-good {
  border-color: color-mix(in srgb, var(--green) 40%, transparent);
  background: var(--green-bg);
  color: var(--green);
}
.metric-chip.metric-warn {
  border-color: color-mix(in srgb, var(--orange) 40%, transparent);
  background: var(--orange-bg);
  color: var(--orange);
}
.metric-chip.metric-bad {
  border-color: color-mix(in srgb, var(--red) 40%, transparent);
  background: var(--red-bg);
  color: var(--red);
}
.metric-chip.metric-blue {
  border-color: color-mix(in srgb, var(--blue) 40%, transparent);
  background: var(--blue-bg);
  color: var(--blue);
}

.mc-value {
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, "Cascadia Code", monospace;
}
.mc-label {
  font-size: 0.67rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  opacity: 0.75;
}
.mc-delta {
  font-size: 0.7rem;
  opacity: 0.65;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

/* ── 5. Layout & Body Container ─────────────────────────────── */
.dash-layout {
  display: flex;
  align-items: stretch;
  min-height: calc(100svh - 90px);
}

.dash-body {
  flex: 1;
  min-width: 0;
  padding: 1rem 1.25rem 5rem;
  max-width: 820px;
  margin: 0 auto;
}

/* ── 6. Toolbar ─────────────────────────────────────────────── */
.dash-toolbar {
  margin-bottom: 1rem;
}

.toolbar-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.625rem;
}

/* Primary button */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0.45rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--blue);
  color: #fff;
  font-weight: 700;
  font-size: 0.86rem;
  letter-spacing: 0.01em;
  transition: filter 0.12s ease, box-shadow 0.12s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

.btn-primary:hover,
.btn-primary:focus-visible {
  filter: brightness(1.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
  outline: 2px solid color-mix(in srgb, var(--blue) 60%, transparent);
  outline-offset: 2px;
}

/* Filter chip strip */
.chip-strip {
  display: flex;
  gap: 0.375rem;
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
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 99px;
  font-size: 0.79rem;
  font-weight: 600;
  background: var(--surface);
  white-space: nowrap;
  transition: background 0.1s ease, border-color 0.1s ease, box-shadow 0.1s ease;
  color: var(--ink-2);
}

.chip:hover {
  background: var(--raised);
  border-color: color-mix(in srgb, var(--ink) 25%, transparent);
}

.chip.chip-active {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
  font-weight: 700;
  box-shadow: var(--shadow);
}

.chip-count {
  opacity: 0.6;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* Search & sort row */
.search-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  margin-top: 0.625rem;
}

.search-row input,
.search-row select {
  height: 40px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--input-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
  padding: 0 0.75rem;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.search-row input:focus,
.search-row select:focus {
  outline: none;
  border-color: var(--blue);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 20%, transparent);
}

.search-row input::placeholder { color: var(--muted); }

/* ── 7. Attention Band ──────────────────────────────────────── */
.attention-band {
  display: flex;
  gap: 0.875rem;
  align-items: flex-start;
  padding: 0.9rem 1rem;
  margin-bottom: 1rem;
  border: 1px solid color-mix(in srgb, var(--orange) 50%, transparent);
  border-left: 3px solid var(--orange);
  border-radius: var(--radius);
  background: var(--orange-bg);
  box-shadow: var(--shadow);
}

.band-icon {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--orange);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 900;
  display: grid;
  place-items: center;
  margin-top: 0.1rem;
}

.band-body { min-width: 0; }
.band-body strong {
  display: block;
  font-size: 0.93rem;
  font-weight: 700;
  color: var(--ink);
}
.band-body p {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.45;
}

/* ── 8. Feed Header ─────────────────────────────────────────── */
.feed-count {
  margin: 0 0 0.6rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

.claim-feed {
  display: grid;
  gap: 0.5rem;
}

/* ── 9. Claim Cards ─────────────────────────────────────────── */
@keyframes card-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.claim-card {
  animation: card-in 0.22s ease both;
  animation-delay: calc(var(--card-i, 0) * 28ms);
  display: grid;
  grid-template-columns: 4px 1fr auto;
  gap: 0 0.85rem;
  align-items: center;
  width: 100%;
  padding: 0.875rem 0.875rem 0.875rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
  text-align: left;
  transition: transform 0.12s var(--ease-out),
              box-shadow 0.12s var(--ease-out),
              background 0.1s ease,
              border-color 0.1s ease;
  position: relative;
  overflow: hidden;
}

.claim-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--muted);
  border-radius: var(--radius) 0 0 var(--radius);
  transition: background 0.15s ease;
}

/* Status left-border via :has() — colour the ::before pseudo */
.claim-card:has(.dot-good)::before   { background: var(--green); }
.claim-card:has(.dot-bad)::before    { background: var(--red); }
.claim-card:has(.dot-warn)::before   { background: var(--orange); }
.claim-card:has(.dot-amber)::before  { background: var(--amber); }
.claim-card:has(.dot-muted)::before  { background: var(--muted); }

/* The dot element itself becomes invisible — the ::before IS the indicator */
.card-dot {
  width: 0;
  height: 0;
  overflow: hidden;
  flex-shrink: 0;
}

/* Dot colour classes retained for :has() selector logic */
.dot-good   { /* colour carried by ::before */ }
.dot-bad    { /* colour carried by ::before */ }
.dot-warn   { /* colour carried by ::before */ }
.dot-amber  { /* colour carried by ::before */ }
.dot-muted  { /* colour carried by ::before */ }

.claim-card:hover,
.claim-card:focus-visible {
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
  border-color: color-mix(in srgb, var(--blue) 30%, transparent);
  background: var(--raised);
  outline: none;
}

/* Attention variant */
.claim-card.card-attention {
  border-color: color-mix(in srgb, var(--red) 35%, transparent);
  background: color-mix(in srgb, var(--red-bg) 70%, var(--surface));
}

.claim-card.card-attention:hover,
.claim-card.card-attention:focus-visible {
  background: var(--red-bg);
  border-color: color-mix(in srgb, var(--red) 55%, transparent);
}

/* Strong / weak modifiers */
.card-strong::before { background: var(--green) !important; }
.card-weak::before   { background: var(--amber) !important; }
.card-weak           { opacity: 0.9; }

/* Card body */
.card-body { min-width: 0; }

.card-title {
  display: block;
  font-size: 0.93rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ink);
  line-height: 1.3;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  align-items: center;
  margin-top: 0.3rem;
}

.card-surface {
  font-size: 0.75rem;
  color: var(--blue);
  font-weight: 600;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

/* Status pill on card */
.card-status-text {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.45rem;
  border-radius: 99px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  background: var(--soft);
  color: var(--muted);
  border: 1px solid var(--line);
}

.status-disputed .card-status-text,
.status-rejected .card-status-text,
.card-status-text.status-disputed,
.card-status-text.status-rejected {
  background: var(--red-bg);
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 35%, transparent);
}

.status-stale .card-status-text,
.card-status-text.status-stale {
  background: var(--orange-bg);
  color: var(--orange);
  border-color: color-mix(in srgb, var(--orange) 35%, transparent);
}

.status-verified .card-status-text,
.card-status-text.status-verified {
  background: var(--green-bg);
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 35%, transparent);
}

.status-proposed .card-status-text,
.card-status-text.status-proposed {
  background: var(--amber-bg);
  color: var(--amber);
  border-color: color-mix(in srgb, var(--amber) 35%, transparent);
}

/* Direct status class on card-status-text element */
.status-disputed { color: var(--red); }
.status-rejected { color: var(--red); }
.status-stale    { color: var(--orange); }
.status-verified { color: var(--green); }
.status-proposed { color: var(--amber); }

/* Fault & divergence badges */
.card-faults {
  display: inline-flex;
  align-items: center;
  font-size: 0.69rem;
  font-weight: 800;
  padding: 0.1rem 0.4rem;
  border-radius: 99px;
  background: var(--red-bg);
  color: var(--red);
  border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
  letter-spacing: 0.02em;
}

.card-divergence {
  display: inline-flex;
  align-items: center;
  font-size: 0.69rem;
  font-weight: 800;
  padding: 0.1rem 0.4rem;
  border-radius: 99px;
  background: var(--amber-bg);
  color: var(--amber);
  border: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
}

.card-value {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.77rem;
  color: var(--muted);
  font-family: ui-monospace, "Cascadia Code", monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.card-chevron {
  font-size: 1.1rem;
  color: var(--muted);
  line-height: 1;
  flex-shrink: 0;
  opacity: 0.55;
  transition: opacity 0.1s ease, transform 0.1s ease;
}

.claim-card:hover .card-chevron {
  opacity: 1;
  transform: translateX(2px);
}

/* Empty state */
.empty-state {
  padding: 2.5rem 1.5rem;
  text-align: center;
  color: var(--muted);
  border: 1px dashed var(--line);
  border-radius: var(--radius-lg);
  font-size: 0.9rem;
  line-height: 1.6;
  background: var(--raised);
}

/* ── 10. Sheet Backdrop ─────────────────────────────────────── */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  z-index: 99;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  animation: fadeIn 0.18s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── 11. Detail Sheet — Mobile: bottom sheet ────────────────── */
.detail-sheet {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 100;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-bottom: none;
  box-shadow: 0 -8px 48px rgba(0, 0, 0, 0.22);
  transform: translateY(100%);
  transition: transform 0.3s var(--ease-out);
}

.detail-sheet:not([hidden]) {
  transform: translateY(0);
  display: flex;
}

/* Drag handle */
.sheet-drag {
  flex-shrink: 0;
  width: 40px;
  height: 4px;
  border-radius: 99px;
  background: var(--line);
  margin: 12px auto 0;
  cursor: grab;
  transition: background 0.15s ease;
}

.sheet-drag:active { cursor: grabbing; }
.detail-sheet:hover .sheet-drag { background: var(--muted); }

/* Close button */
.sheet-close {
  position: absolute;
  top: 0.875rem;
  right: 0.875rem;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--raised);
  border: 1px solid var(--line);
  font-size: 0.82rem;
  display: grid;
  place-items: center;
  color: var(--muted);
  transition: background 0.12s ease, color 0.12s ease;
  line-height: 1;
}

.sheet-close:hover {
  color: var(--ink);
  background: var(--soft);
  border-color: color-mix(in srgb, var(--ink) 20%, transparent);
}

/* Scrollable content area */
.sheet-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem 3rem;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

/* Sheet top meta row */
.sheet-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

/* Status badge (sheet header) */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  background: var(--soft);
  color: var(--muted);
  border: 1px solid var(--line);
}

.badge-good  {
  background: var(--green-bg);
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 35%, transparent);
}
.badge-bad   {
  background: var(--red-bg);
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 35%, transparent);
}
.badge-warn  {
  background: var(--orange-bg);
  color: var(--orange);
  border-color: color-mix(in srgb, var(--orange) 35%, transparent);
}
.badge-amber {
  background: var(--amber-bg);
  color: var(--amber);
  border-color: color-mix(in srgb, var(--amber) 35%, transparent);
}
.badge-muted {
  background: var(--soft);
  color: var(--muted);
}

.sheet-surface {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--blue);
  font-family: ui-monospace, "Cascadia Code", monospace;
}

/* Sheet typography */
.sheet-title {
  margin: 0 0 0.25rem;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--ink);
  font-family: ui-serif, Georgia, "Times New Roman", serif;
}

.sheet-subtitle {
  margin: 0 0 1.1rem;
  font-size: 0.74rem;
  color: var(--muted);
  font-family: ui-monospace, "Cascadia Code", monospace;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

/* Status guidance — "what you need to do" contextual hint */
.detail-guidance {
  margin: 0 0 1rem;
  padding: 0.65rem 0.9rem;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--blue);
  background: var(--blue-bg);
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--ink);
}

/* Sheet action buttons */
.sheet-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.1rem;
}

.sheet-action-btn {
  min-height: 34px;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ink-2);
  transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
}

.sheet-action-btn:hover,
.sheet-action-btn:focus-visible {
  border-color: var(--blue);
  color: var(--blue);
  background: var(--blue-bg);
  outline: none;
}

.sheet-action-btn--danger { color: var(--red); }
.sheet-action-btn--danger:hover,
.sheet-action-btn--danger:focus-visible {
  border-color: var(--red);
  color: var(--red);
  background: var(--red-bg);
}

/* Sheet sections */
.sheet-section { margin-bottom: 1.25rem; }
.sheet-section p { margin: 0; font-size: 0.9rem; line-height: 1.55; color: var(--ink); }

/* Divergence banner */
.divergence-banner {
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--amber);
  background: var(--amber-bg);
  font-size: 0.87rem;
  line-height: 1.5;
  margin-bottom: 1rem;
  border: 1px solid color-mix(in srgb, var(--amber) 30%, transparent);
  border-left: 3px solid var(--amber);
}
.divergence-banner p { margin: 0; color: var(--ink); }

/* Section label */
.section-label {
  margin: 0 0 0.5rem;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

/* ── 12. Contextual Help ─────────────────────────────────────── */
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
  width: 1.1rem;
  height: 1.1rem;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--raised);
  color: var(--muted);
  font: 700 0.68rem/1 system-ui, sans-serif;
  cursor: help;
  transition: border-color 0.1s ease, color 0.1s ease;
}

.help-trigger:hover,
.help-trigger:focus-visible,
.help-wrap.help-open .help-trigger {
  border-color: var(--blue);
  color: var(--blue);
  outline: none;
}

.help-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.5rem);
  left: 50%;
  width: min(18rem, calc(100vw - 2rem));
  transform: translateX(-50%) translateY(-0.25rem);
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-lg);
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.5;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.help-popover::before {
  content: "";
  position: absolute;
  top: -6px;
  left: calc(50% - 5px);
  width: 10px;
  height: 10px;
  border-left: 1px solid var(--line);
  border-top: 1px solid var(--line);
  background: var(--surface);
  transform: rotate(45deg);
}

.help-wrap:hover .help-popover,
.help-wrap:focus-within .help-popover,
.help-wrap.help-open .help-popover {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

/* ── 13. Fault Items ─────────────────────────────────────────── */
.fault-item {
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--red);
  background: var(--red-bg);
  border: 1px solid color-mix(in srgb, var(--red) 22%, transparent);
  border-left: 3px solid var(--red);
  margin-bottom: 0.5rem;
}

.fault-item:last-child { margin-bottom: 0; }

.fault-item.fault-medium,
.fault-item.fault-low {
  border-left-color: var(--orange);
  border-color: color-mix(in srgb, var(--orange) 22%, transparent);
  border-left: 3px solid var(--orange);
  background: var(--orange-bg);
}

.fault-item.fault-kind-setup,
.fault-item.fault-kind-config {
  border-left-color: var(--amber);
  border-color: color-mix(in srgb, var(--amber) 22%, transparent);
  border-left: 3px solid var(--amber);
  background: var(--amber-bg);
}

.fault-item.fault-kind-workflow {
  border-left-color: var(--blue);
  border-color: color-mix(in srgb, var(--blue) 22%, transparent);
  border-left: 3px solid var(--blue);
  background: var(--blue-bg);
}

.fault-item.fault-kind-quality {
  border-left-color: var(--amber);
  border-color: color-mix(in srgb, var(--amber) 22%, transparent);
  border-left: 3px solid var(--amber);
  background: var(--amber-bg);
}

.fault-item.fault-kind-policy {
  border-left-color: var(--red);
  border-color: color-mix(in srgb, var(--red) 22%, transparent);
  border-left: 3px solid var(--red);
  background: var(--red-bg);
}

.fault-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
  flex-wrap: wrap;
}

.fault-kind {
  flex-shrink: 0;
  font-size: 0.63rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.1rem 0.45rem;
  border-radius: 99px;
  background: var(--red-bg);
  color: var(--red);
  border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
  font-family: ui-monospace, "Cascadia Code", monospace;
}

.fault-item.fault-kind-setup .fault-kind,
.fault-item.fault-kind-config .fault-kind,
.fault-item.fault-kind-quality .fault-kind {
  background: var(--amber-bg);
  color: var(--amber);
  border-color: color-mix(in srgb, var(--amber) 30%, transparent);
}

.fault-item.fault-kind-workflow .fault-kind {
  background: var(--blue-bg);
  color: var(--blue);
  border-color: color-mix(in srgb, var(--blue) 30%, transparent);
}

.fault-item.fault-medium .fault-kind,
.fault-item.fault-low .fault-kind {
  background: var(--orange-bg);
  color: var(--orange);
  border-color: color-mix(in srgb, var(--orange) 30%, transparent);
}

.fault-type {
  margin: 0;
  font-size: 0.87rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.3;
}

.nonblocking-pill {
  font-size: 0.63rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.1rem 0.45rem;
  border-radius: 99px;
  background: var(--blue-bg);
  color: var(--blue);
  border: 1px solid color-mix(in srgb, var(--blue) 30%, transparent);
  margin-left: 0.25rem;
}

.fault-msg {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--ink);
}

.fault-hint {
  margin: 0.45rem 0 0;
  font-size: 0.81rem;
  line-height: 1.5;
  color: var(--muted);
  padding-top: 0.45rem;
  border-top: 1px solid var(--line);
}

/* ── 14. Stale dot pulse animation ──────────────────────────── */
@keyframes pulse-stale {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* Applied via JS, but we define it here for completeness */
.dot-warn {
  animation: pulse-stale 2.2s ease-in-out infinite;
}

/* ── 15. Policy Gap Table ───────────────────────────────────── */
.gap-table { display: grid; gap: 0.4rem; }

.gap-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 0.5rem;
  align-items: start;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.84rem;
  border: 1px solid var(--line);
}

.gap-row.gap-missing {
  background: var(--red-bg);
  border-color: color-mix(in srgb, var(--red) 30%, transparent);
}

.gap-row.gap-has {
  background: var(--raised);
}

.gap-label {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  padding-top: 0.15rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

.gap-missing .gap-label { color: var(--red); }

.gap-value { display: flex; flex-wrap: wrap; gap: 0.3rem; }

.gap-value code {
  font-size: 0.77rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  padding: 0.1rem 0.38rem;
  border-radius: 4px;
  background: var(--soft);
  border: 1px solid var(--line);
  color: var(--ink-2);
}

.empty-value {
  color: var(--muted);
  font-style: italic;
  font-size: 0.82rem;
}

.gap-missing .gap-value code {
  background: var(--red-bg);
  border-color: color-mix(in srgb, var(--red) 35%, transparent);
  color: var(--red);
}

/* ── 16. Mono Block ─────────────────────────────────────────── */
.mono-block {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.81rem;
  line-height: 1.55;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--ink);
}

/* ── 17. Observed Result ────────────────────────────────────── */
.observed-result {
  display: grid;
  gap: 0.7rem;
}

.observed-result p {
  margin: 0;
  color: var(--ink);
  line-height: 1.45;
}

.observed-grid { display: grid; gap: 0.4rem; }

.observed-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: start;
  gap: 0.55rem;
}

.observed-row span {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: ui-monospace, "Cascadia Code", monospace;
  padding-top: 0.1rem;
}

.observed-row code,
.observed-output pre {
  font-family: ui-monospace, "Cascadia Code", monospace;
  overflow-wrap: anywhere;
}

.observed-row code { color: var(--ink); font-size: 0.82rem; }

.observed-output {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  overflow: hidden;
}

.observed-output summary {
  cursor: pointer;
  padding: 0.55rem 0.75rem;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
  user-select: none;
  transition: color 0.1s ease;
}

.observed-output summary:hover { color: var(--ink); }

.observed-output pre {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  padding: 0.75rem;
  border-top: 1px solid var(--line);
  color: var(--ink);
  font-size: 0.77rem;
  line-height: 1.5;
  white-space: pre-wrap;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

/* ── 18. Action List ────────────────────────────────────────── */
.action-list { display: grid; gap: 0.45rem; }

.action-item {
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  transition: border-color 0.1s ease;
}

.action-item:hover { border-color: color-mix(in srgb, var(--blue) 30%, transparent); }

.action-type {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--blue);
  margin-bottom: 0.25rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

.action-item p { margin: 0; font-size: 0.87rem; line-height: 1.45; color: var(--ink); }

.action-path {
  display: inline-block;
  margin: 0.35rem 0.3rem 0 0;
  font-size: 0.73rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  padding: 0.1rem 0.42rem;
  background: var(--soft);
  border-radius: 4px;
  color: var(--muted);
  border: 1px solid var(--line);
}

.more-note {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
  font-style: italic;
}

.plugin-attribution {
  font-size: 0.73rem;
  color: var(--muted);
  border-left: 2px solid var(--blue);
  padding-left: 0.55rem;
  margin-top: 0.4rem;
  line-height: 1.45;
}

/* ── 19. File Chips ─────────────────────────────────────────── */
.file-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }

.file-chip {
  font-size: 0.71rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  padding: 0.15rem 0.48rem;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--muted);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.1s ease, border-color 0.1s ease;
}

.file-chip:hover {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--ink) 22%, transparent);
}

/* ── 20. Raw Details Accordion ──────────────────────────────── */
.sheet-raw {
  margin-top: 0.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.sheet-raw summary {
  padding: 0.65rem 0.9rem;
  font-size: 0.79rem;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  background: var(--raised);
  transition: color 0.1s ease;
  list-style: none;
}

.sheet-raw summary::-webkit-details-marker { display: none; }
.sheet-raw summary::before {
  content: "▶ ";
  font-size: 0.6rem;
  vertical-align: middle;
}
details[open] > .sheet-raw summary::before,
.sheet-raw details[open] summary::before { content: "▼ "; }

.sheet-raw summary:hover { color: var(--ink); }

.sheet-raw pre {
  margin: 0;
  padding: 0.9rem;
  font-size: 0.74rem;
  font-family: ui-monospace, "Cascadia Code", monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 400px;
  overflow: auto;
  background: var(--bg);
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  line-height: 1.5;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

/* ── 21. Claim Authoring Modal ──────────────────────────────── */
.claim-modal {
  width: min(560px, 95vw);
  max-height: 88dvh;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-xl);
}

.claim-modal::backdrop {
  background: rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(3px);
}

.claim-modal form { margin: 0; }

.modal-title {
  margin: 0;
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid var(--line);
  font-size: 1.05rem;
  font-weight: 700;
  font-family: ui-serif, Georgia, serif;
  letter-spacing: -0.01em;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  max-height: 65dvh;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.form-field label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.01em;
}

.form-field input,
.form-field select {
  min-height: 38px;
  background: var(--input-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.75rem;
  color: var(--ink);
  font: inherit;
  font-size: 0.875rem;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.form-field input:focus,
.form-field select:focus {
  outline: none;
  border-color: var(--blue);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 20%, transparent);
}

.form-field input::placeholder { color: var(--muted); }

.field-hint {
  margin: 0;
  min-height: 1.1rem;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--line);
  background: var(--raised);
}

.modal-actions button:not(.btn-primary) {
  min-height: 36px;
  padding: 0.45rem 0.875rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-weight: 700;
  font-size: 0.86rem;
  color: var(--ink-2);
  transition: border-color 0.12s ease, background 0.12s ease;
}

.modal-actions button:not(.btn-primary):hover {
  border-color: color-mix(in srgb, var(--ink) 25%, transparent);
  background: var(--raised);
}

/* ── 22. Desktop: 2-column Header + Master-Detail Layout ────── */
@media (min-width: 900px) {
  .dash-header {
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 1rem 1.75rem;
    padding: 1rem 1.75rem;
  }

  .dash-metrics { justify-content: flex-end; }

  /* Master-detail: body + inline panel side by side */
  .dash-layout {
    align-items: flex-start;
  }

  .dash-body {
    max-width: none;
    margin: 0;
    padding: 1rem 1.75rem 5rem;
    transition: none;
  }

  /* Override [hidden] so the panel stays in flow and can animate width */
  .detail-sheet[hidden] {
    display: flex;
    width: 0;
    overflow: hidden;
    pointer-events: none;
  }

  /* Inline sticky panel */
  .detail-sheet {
    position: sticky;
    top: 0;
    align-self: flex-start;
    height: 100svh;
    /* reset mobile positioning */
    left: auto; right: auto; bottom: auto;
    max-height: none;
    border-radius: 0;
    border: none;
    border-left: 1px solid var(--line);
    box-shadow: none;
    /* animate width instead of transform */
    width: 0;
    flex-shrink: 0;
    overflow: hidden;
    transform: none !important;
    transition: width 0.32s var(--ease-out);
  }

  .detail-sheet:not([hidden]) {
    width: min(440px, 42vw);
    overflow: hidden;
    transform: none;
    pointer-events: auto;
  }

  /* Sheet content has min-width so it doesn't reflow during animation */
  .detail-sheet .sheet-scroll {
    min-width: min(440px, 42vw);
  }

  .sheet-drag { display: none; }
  .sheet-backdrop { display: none !important; }

  /* Don't lock body scroll on desktop */
  body.sheet-open { overflow: auto; }
}

/* ── 23. Large desktop: wider padding ───────────────────────── */
@media (min-width: 1200px) {
  .dash-header { padding-left: 2.5rem; padding-right: 2.5rem; }
  .dash-body   { padding-left: 2.5rem; padding-right: 2.5rem; }
}

/* ── 24. Reduced motion ─────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
