function el(id) { return document.getElementById(id); }
function show(id) { const e = el(id); if (e) e.removeAttribute("hidden"); }
function hide(id) { const e = el(id); if (e) e.setAttribute("hidden", ""); }
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function surfaceLabel(surface) {
  // `facet` is optional on a claim: a claim without one renders with no facet
  // label rather than breaking the whole feed.
  if (typeof surface !== "string" || surface === "") return "";
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

// `basis` is the read model's evidenceBasisById entry for this item, when the
// item records how it was collected (could not run, collector kind, source of
// record). Its labels are computed server-side from the canonical tables.
function observedResultForEvidence(item, basis) {
  if (!item) return null;
  const hasStructuredResult = Boolean(
    basis ||
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
  // An attempt that could not run reports no result: never "failed".
  const status = basis?.couldNotRun
    ? basis.couldNotRun
    : typeof item.passing === "boolean"
      ? (item.passing ? "passed" : "failed")
      : firstNonEmpty(observed?.status, item.metadata?.status);
  const collectedBy = basis?.collectedBy ?? null;
  const sourceOfRecord = basis?.sourceOfRecord ?? null;
  if (!summary && !stdout && !stderr && !combined && !command && expected == null && status == null && !collectedBy && !sourceOfRecord) return null;
  return { summary, expected, status, command, exitCode, stdout, stderr, combined, collectedBy, sourceOfRecord };
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
    result.sourceOfRecord ? "<div class=\"observed-row\" data-source-of-record=\"" + (result.sourceOfRecord.backed ? "backed" : "not-backed") + "\"><span>Source of record</span><code>" + esc(result.sourceOfRecord.label) + "</code></div>" : "",
  ].filter(Boolean).join("");
  const outputParts = [
    result.stdout ? "stdout\n" + result.stdout : "",
    result.stderr ? "stderr\n" + result.stderr : "",
    !result.stdout && !result.stderr && result.combined ? result.combined : "",
  ].filter(Boolean).join("\n\n");
  return "<div class=\"observed-result\">"
    + (result.summary ? "<p>" + esc(result.summary) + "</p>" : "")
    // The canonical label already reads "Collected by a model", so it is a line, not a labelled row.
    + (result.collectedBy ? "<p class=\"observed-collector\">" + esc(result.collectedBy) + "</p>" : "")
    + (rows ? "<div class=\"observed-grid\">" + rows + "</div>" : "")
    + (outputParts ? "<details class=\"observed-output\"><summary>Command output</summary><pre>" + esc(outputParts) + "</pre></details>" : "")
    + "</div>";
}

// A claim status renders as @kontourai/ui's shared trust-state chip, drawn by
// ui's own renderer (kontourTrustState, bundled ahead of these parts by
// scripts/build-console-assets.mjs). A product's statusLabels override
// replaces the visible label; ui keeps the default as hidden text so
// assistive tech still hears the status. An unrecognized status renders as
// its own text, never coerced into a state.
function trustStateOf(status) {
  return kontourTrustState.trustStateFor(status);
}

function trustChip(status, className) {
  return kontourTrustState.renderTrustStateHtml(status, { label: statusLabel(status), className });
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
