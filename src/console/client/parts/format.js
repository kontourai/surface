function el(id) { return document.getElementById(id); }
function show(id) { const e = el(id); if (e) e.removeAttribute("hidden"); }
function hide(id) { const e = el(id); if (e) e.setAttribute("hidden", ""); }
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function surfaceLabel(surface) {
  if (vocab.surfaceLabels?.[surface]) return vocab.surfaceLabels[surface];
  const name = surface.includes(".") ? surface.split(".").slice(1).join(" ") : surface;
  return name.replace(/[-_.]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(value) {
  if (value == null) return null;
  if (typeof value === "object") {
    if (value.verdict != null) return (value.tool ? value.tool + ": " : "") + value.verdict;
    return JSON.stringify(value);
  }
  return String(value);
}

function firstNonEmpty(...values) {
  return values.find(value => typeof value === "string" && value.length > 0) ?? null;
}

function observedResultForEvidence(item) {
  if (!item) return null;
  const hasStructuredResult = Boolean(
    item.metadata?.observedResult ||
    item.metadata?.commandOutput ||
    item.metadata?.stdout ||
    item.metadata?.stderr ||
    item.metadata?.output ||
    item.metadata?.command ||
    (item.metadata?.exitCode !== undefined) ||
    typeof item.passing === "boolean"
  );
  if (!hasStructuredResult) return null;
  const observed = item.metadata?.observedResult;
  const output = item.metadata?.commandOutput;
  const stdout = firstNonEmpty(output?.stdout, item.metadata?.stdout);
  const stderr = firstNonEmpty(output?.stderr, item.metadata?.stderr);
  const combined = firstNonEmpty(output?.combined, item.metadata?.output);
  const command = firstNonEmpty(output?.command, item.metadata?.command);
  const exitCode = output?.exitCode ?? item.metadata?.exitCode;
  const summary = firstNonEmpty(
    observed?.summary,
    item.metadata?.observedSummary,
    item.excerptOrSummary
  );
  const expected = firstNonEmpty(observed?.expected, item.metadata?.expectedResult);
  const status = typeof item.passing === "boolean"
    ? (item.passing ? "passed" : "failed")
    : firstNonEmpty(observed?.status, item.metadata?.status);
  if (!summary && !stdout && !stderr && !combined && !command && expected == null && status == null) return null;
  return { summary, expected, status, command, exitCode, stdout, stderr, combined };
}

// Integrity scope (source/config/file anchors) is derived server-side in the
// claim detail projection; this browser layer only renders the projected data
// via renderIntegrityScope (issue #4).
function shortIntegrityRef(value) {
  const text = String(value ?? "");
  if (text.startsWith("sha256:") && text.length > 24) return text.slice(0, 19) + "…" + text.slice(-8);
  if (text.startsWith("working-tree:") && text.length > 32) return "working-tree:" + text.slice(-12);
  if (/^[a-f0-9]{40,64}$/i.test(text)) return text.slice(0, 12);
  return text.length > 44 ? text.slice(0, 32) + "…" + text.slice(-8) : text;
}

function renderIntegrityScope(details) {
  const rows = [];
  if (details.sourceRefs.length) {
    rows.push("<div class=\"integrity-group\"><span>Source anchor</span>" +
      details.sourceRefs.map(ref => `<code title="${esc(ref)}">${esc(shortIntegrityRef(ref))}</code>`).join("") +
      "</div>");
  }
  if (details.fileRefs.length) {
    const shown = details.fileRefs.slice(0, 8);
    rows.push("<div class=\"integrity-group\"><span>File fingerprints</span>" +
      shown.map(ref => `<code title="${esc(ref.hash ?? ref.status ?? "")}">${esc(ref.path)}${ref.hash ? " · " + esc(shortIntegrityRef(ref.hash)) : ref.status ? " · " + esc(ref.status) : ""}</code>`).join("") +
      (details.fileRefs.length > shown.length ? `<em>+${details.fileRefs.length - shown.length} more</em>` : "") +
      "</div>");
  }
  if (details.configRefs.length) {
    rows.push("<div class=\"integrity-group\"><span>Producer configuration</span>" +
      details.configRefs.map(ref => `<code title="${esc([ref.path, ref.hash].filter(Boolean).join(" · "))}">${esc(ref.name)} · ${esc(shortIntegrityRef(ref.hash))}</code>`).join("") +
      "</div>");
  }
  return rows.join("");
}

function renderObservedResult(result) {
  const rows = [
    result.expected ? "<div class=\"observed-row\"><span>Expected</span><code>" + esc(result.expected) + "</code></div>" : "",
    result.status ? "<div class=\"observed-row\"><span>Observed</span><code>" + esc(result.status) + "</code></div>" : "",
    result.exitCode != null ? "<div class=\"observed-row\"><span>Exit code</span><code>" + esc(String(result.exitCode)) + "</code></div>" : "",
    result.command ? "<div class=\"observed-row\"><span>Command</span><code>" + esc(result.command) + "</code></div>" : "",
  ].filter(Boolean).join("");
  const outputParts = [
    result.stdout ? "stdout\n" + result.stdout : "",
    result.stderr ? "stderr\n" + result.stderr : "",
    !result.stdout && !result.stderr && result.combined ? result.combined : "",
  ].filter(Boolean).join("\n\n");
  return "<div class=\"observed-result\">"
    + (result.summary ? "<p>" + esc(result.summary) + "</p>" : "")
    + (rows ? "<div class=\"observed-grid\">" + rows + "</div>" : "")
    + (outputParts ? "<details class=\"observed-output\"><summary>Command output</summary><pre>" + esc(outputParts) + "</pre></details>" : "")
    + "</div>";
}

// A claim status renders as @kontourai/ui's shared trust-state chip. This
// mirrors src/trust-state-chip.ts (the Trust Panel's renderer); the glyphs and
// the default labels are injected by buildConsoleHtml from that module and
// src/display-names.ts, and tests/browser/console.spec.ts holds this renderer
// to ui's own <k-trust-state> element. A product's statusLabels
// override replaces the visible label; the default stays as hidden text so
// assistive tech still hears the status.
function trustStateOf(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(trustChipAssets.glyphs, normalized) ? normalized : null;
}

function trustChip(status, className) {
  const state = trustStateOf(status);
  const defaultLabel = state ? (trustChipAssets.defaultLabels[state] ?? state) : null;
  const override = String(statusLabel(status) ?? "").trim();
  const shown = override || defaultLabel || String(status ?? "").trim() || "Unrecognized trust state";
  const hidden = state && defaultLabel && shown.toLowerCase() !== defaultLabel.toLowerCase() ? defaultLabel : null;
  const classes = ["trust-state", state && "trust-state--" + state, className].filter(Boolean).join(" ");
  const glyph = state
    ? `<svg class="trust-state__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${esc(trustChipAssets.glyphs[state])}"></path></svg>`
    : "";
  return `<span class="${esc(classes)}"${state ? ` data-trust-state="${state}"` : ""}>`
    + `<span class="trust-state__chip">${glyph}<span class="trust-state__label">${esc(shown)}</span>`
    + `${hidden ? `<span class="trust-state__hidden"> (${esc(hidden)})</span>` : ""}</span></span>`;
}

// Display labels come from the injected vocab, whose defaults are the
// canonical tables in src/display-names.ts (merged in by buildConsoleHtml,
// product overrides win). The client never mints its own synonyms (#224) —
// an unmapped value falls back to the raw wire enum, not to an invented name.
function statusLabel(status) {
  return vocab.statusLabels?.[status] ?? status;
}

function evidenceTypeLabel(evidenceType) {
  return vocab.evidenceTypeLabels?.[evidenceType] ?? evidenceType;
}

function methodLabel(method) {
  return vocab.methodLabels?.[method] ?? method;
}

function animateCount(el, target) {
  const n = parseInt(target, 10);
  if (!Number.isFinite(n) || n < 3) { el.textContent = target; return; }
  const duration = 700;
  const startTime = performance.now();
  const tick = (now) => {
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(n * eased));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  };
  requestAnimationFrame(tick);
}

function updateConsoleChromeMetrics() {
  const header = document.querySelector(".dash-header");
  const height = header ? Math.ceil(header.getBoundingClientRect().height) : 96;
  document.documentElement.style.setProperty("--dash-header-height", height + "px");
}

function claimTypeLabel(claimType) {
  return vocab.claimTypeLabels?.[claimType] ??
    claimTypes.find(t => t.id === claimType)?.displayName ??
    claimType;
}

function confidenceTier(claim) {
  if (claim.status !== "verified") return "";
  const hasGaps = (claim.transparencyGapIds?.length ?? 0) > 0;
  const strength = claim.confidenceBasis?.evidenceStrength;
  if (!hasGaps && strength === "strong") return " card-strong";
  if (hasGaps || strength === "weak") return " card-weak";
  return "";
}
