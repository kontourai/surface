export const DASHBOARD_SCRIPT = `
const cfg = window.__SURFACE_CONFIG__ ?? {};
const vocab = cfg.vocab ?? {};
const claimTypes = cfg.claimTypes ?? [];
const filters = { search: "", status: "all", surface: "all" };
let currentData = null;
let currentDetailClaim = null;
let currentRunId = null;
let allRuns = [];
let pendingDeleteClaimId = null;

function el(id) { return document.getElementById(id); }
function show(id) { const e = el(id); if (e) e.removeAttribute("hidden"); }
function hide(id) { const e = el(id); if (e) e.setAttribute("hidden", ""); }
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function surfaceLabel(surface) {
  if (vocab.surfaceLabels?.[surface]) return vocab.surfaceLabels[surface];
  const name = surface.includes(".") ? surface.split(".").slice(1).join(" ") : surface;
  return name.replace(/[-_.]+/g, " ").replace(/\\b\\w/g, c => c.toUpperCase());
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

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectIntegrityDetails(claim, evidence) {
  const sourceRefs = uniqueBy([
    claim.currentIntegrityRef,
    ...evidence.map(item => item.integrityRef),
    ...evidence.map(item => item.metadata?.integrity?.sourceRef),
  ].filter(Boolean), value => value);

  const configRefs = uniqueBy(evidence.flatMap(item => {
    const refs = item.metadata?.integrity?.configRefs ?? item.metadata?.configIntegrity ?? {};
    return Object.entries(refs)
      .filter(([, ref]) => ref?.hash)
      .map(([kind, ref]) => ({
        kind,
        name: ref.name ?? kind,
        hash: ref.hash,
        path: ref.path,
      }));
  }), item => [item.kind, item.name, item.hash, item.path].filter(Boolean).join(":"));

  const fileRefs = uniqueBy(evidence.flatMap(item => {
    const refs = item.metadata?.integrity?.fileRefs ?? item.metadata?.fileIntegrity ?? [];
    return refs.filter(ref => ref?.path).map(ref => ({
      path: ref.path,
      hash: ref.hash,
      status: ref.status,
      sizeBytes: ref.sizeBytes,
    }));
  }), item => [item.path, item.hash, item.status].filter(Boolean).join(":"));

  return { sourceRefs, configRefs, fileRefs };
}

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
    rows.push("<div class=\\"integrity-group\\"><span>Source anchor</span>" +
      details.sourceRefs.map(ref => \`<code title="\${esc(ref)}">\${esc(shortIntegrityRef(ref))}</code>\`).join("") +
      "</div>");
  }
  if (details.fileRefs.length) {
    const shown = details.fileRefs.slice(0, 8);
    rows.push("<div class=\\"integrity-group\\"><span>File fingerprints</span>" +
      shown.map(ref => \`<code title="\${esc(ref.hash ?? ref.status ?? "")}">\${esc(ref.path)}\${ref.hash ? " · " + esc(shortIntegrityRef(ref.hash)) : ref.status ? " · " + esc(ref.status) : ""}</code>\`).join("") +
      (details.fileRefs.length > shown.length ? \`<em>+\${details.fileRefs.length - shown.length} more</em>\` : "") +
      "</div>");
  }
  if (details.configRefs.length) {
    rows.push("<div class=\\"integrity-group\\"><span>Producer configuration</span>" +
      details.configRefs.map(ref => \`<code title="\${esc([ref.path, ref.hash].filter(Boolean).join(" · "))}">\${esc(ref.name)} · \${esc(shortIntegrityRef(ref.hash))}</code>\`).join("") +
      "</div>");
  }
  return rows.join("");
}

function renderObservedResult(result) {
  const rows = [
    result.expected ? "<div class=\\"observed-row\\"><span>Expected</span><code>" + esc(result.expected) + "</code></div>" : "",
    result.status ? "<div class=\\"observed-row\\"><span>Observed</span><code>" + esc(result.status) + "</code></div>" : "",
    result.exitCode != null ? "<div class=\\"observed-row\\"><span>Exit code</span><code>" + esc(String(result.exitCode)) + "</code></div>" : "",
    result.command ? "<div class=\\"observed-row\\"><span>Command</span><code>" + esc(result.command) + "</code></div>" : "",
  ].filter(Boolean).join("");
  const outputParts = [
    result.stdout ? "stdout\\n" + result.stdout : "",
    result.stderr ? "stderr\\n" + result.stderr : "",
    !result.stdout && !result.stderr && result.combined ? result.combined : "",
  ].filter(Boolean).join("\\n\\n");
  return "<div class=\\"observed-result\\">"
    + (result.summary ? "<p>" + esc(result.summary) + "</p>" : "")
    + (rows ? "<div class=\\"observed-grid\\">" + rows + "</div>" : "")
    + (outputParts ? "<details class=\\"observed-output\\"><summary>Command output</summary><pre>" + esc(outputParts) + "</pre></details>" : "")
    + "</div>";
}

function statusColor(status) {
  const m = { verified:"good", disputed:"bad", rejected:"bad", stale:"warn", proposed:"amber", unknown:"muted" };
  return m[status] ?? "muted";
}

function statusLabel(status, evidenceCount) {
  if (status === "unknown") return evidenceCount === 0 ? "Never run" : "No evidence";
  const m = { verified:"Verified", stale:"Needs refresh", disputed:"Disputed",
               rejected:"Rejected", proposed:"Pending" };
  return m[status] ?? status;
}

function claimEvidenceCount(claim) {
  return claim.evidenceIds?.length ?? 0;
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

function statusGuidance(status, evidenceCount) {
  if (status === "verified") return null;
  if (status === "unknown") {
    return evidenceCount === 0
      ? "This claim has never been evaluated — no evidence has been collected yet."
      : "Evidence exists but trust status could not be determined from it.";
  }
  const m = {
    proposed: "Awaiting first evidence collection run.",
    stale:    "Evidence is outdated — collected against a different version of the code. Stale claims are refreshed one run at a time.",
    disputed: "Surface derived a different status than the producer declared. Resolve the fault lines above.",
    rejected: "Verification failed. Check the fault lines above for specific remediation steps.",
  };
  return m[status] ?? null;
}

function updateDashboardChromeMetrics() {
  const header = document.querySelector(".dash-header");
  const height = header ? Math.ceil(header.getBoundingClientRect().height) : 96;
  document.documentElement.style.setProperty("--dash-header-height", height + "px");
}

function suggestCommand(claim, evidence, readModel) {
  const producer = readModel?.producer ?? {};
  const needsEvidence = ["unknown", "stale", "proposed", "rejected"].includes(claim.status);
  if (!needsEvidence) return null;

  if (claim.claimType === "software-proof") {
    const cmd = claim.metadata?.command ?? claim.fieldOrBehavior;
    if (cmd) return { command: cmd, note: "Runs the proof lane and captures output as evidence." };
  }

  const isVeritas = producer.name === "veritas" || (claim.claimType ?? "").startsWith("veritas");
  if (isVeritas) {
    if (claim.status === "stale") {
      return { command: "veritas checkin", note: "Refreshes this claim’s evidence. Run once per stale claim until all are resolved." };
    }
    return { command: "veritas checkin", note: "Collects evidence and updates trust status for in-scope surfaces." };
  }

  return null;
}

function claimTypeLabel(claimType) {
  return vocab.claimTypeLabels?.[claimType] ??
    claimTypes.find(t => t.id === claimType)?.displayName ??
    claimType;
}

function confidenceTier(claim) {
  if (claim.status !== "verified") return "";
  const hasFaults = (claim.faultLineIds?.length ?? 0) > 0;
  const strength = claim.confidenceBasis?.proofStrength;
  if (!hasFaults && strength === "strong") return " card-strong";
  if (hasFaults || strength === "weak") return " card-weak";
  return "";
}

// ── gap classification ─────────────────────────────────
// Maps fault/gap types to a root-cause category and prescriptive hint.
// Returns { kind, title, hint } where kind is: setup | config | workflow | quality | policy
function classifyGap(gapType, message) {
  if (gapType === "provenance_gap") {
    if ((message ?? "").includes("Missing required evidence")) {
      return {
        kind: "setup",
        title: "Evidence never collected",
        hint: "The producer ran but did not emit the required evidence type for this claim. This is a producer setup or configuration issue — check that the relevant check is enabled and its output is being captured.",
      };
    }
    return {
      kind: "setup",
      title: "Provenance gap",
      hint: "The proof chain for this claim is incomplete. Check that all producer steps ran and emitted evidence.",
    };
  }
  if (gapType === "policy_violation") {
    if ((message ?? "").includes("Missing required verification method")) {
      return {
        kind: "config",
        title: "Required method not collected",
        hint: "Surface expected evidence tagged with this verification method. This can happen because no evidence was emitted, or because the producer emitted evidence with a different method. Run evidence collection first; if evidence appears under the wrong method, fix the producer or adapter mapping.",
      };
    }
    return {
      kind: "policy",
      title: "Policy requirement not met",
      hint: "The claim does not satisfy the requirements of its policy. Check what the policy requires and whether the producer is configured to meet those requirements.",
    };
  }
  if (gapType === "attestation_actor_missing") {
    return {
      kind: "workflow",
      title: "Human review incomplete — no actor",
      hint: "A review record exists but no reviewer identity was recorded. The attestation workflow was started but not completed. Whoever reviewed this needs to sign it properly.",
    };
  }
  if (gapType === "attestation_authority_unverified") {
    return {
      kind: "workflow",
      title: "Human review incomplete — authority not verified",
      hint: "A review record exists but the reviewer's authority cannot be confirmed. Ensure the attestation includes a verifiable authority source.",
    };
  }
  if (gapType === "attestation_identity_unverified") {
    return {
      kind: "workflow",
      title: "Human review incomplete — identity not verified",
      hint: "A review record exists but the reviewer's identity has not been verified. Ensure the attestation includes a valid identity proof reference.",
    };
  }
  // default: tool/quality failure
  return {
    kind: "quality",
    title: "Verification failed",
    hint: null,
  };
}

const gapKindLabel = {
  setup:    "Setup issue",
  config:   "Configuration issue",
  workflow: "Workflow incomplete",
  quality:  "Quality failure",
  policy:   "Policy mismatch",
};

// ── policy gap analysis ────────────────────────────────
// Cross-references policy requirements against what the claim actually has.
function policyGapAnalysis(claim, policy) {
  if (!policy) return null;
  const requiredEvidence = policy.requiredEvidence ?? [];
  const requiredMethods  = policy.requiredMethods  ?? [];
  const hasEvidence = claim.evidenceTypes  ?? [];
  const hasMethods  = claim.evidenceMethods ?? [];
  const missingEvidence = requiredEvidence.filter(r => !hasEvidence.includes(r));
  const missingMethods  = requiredMethods.filter(r => !hasMethods.includes(r));
  if (!missingEvidence.length && !missingMethods.length) return null;
  return { requiredEvidence, requiredMethods, hasEvidence, hasMethods, missingEvidence, missingMethods };
}

function renderRequirementValues(values, emptyLabel) {
  return values.length
    ? values.map(v => \`<code>\${esc(v)}</code>\`).join(" ")
    : \`<span class="empty-value">\${esc(emptyLabel)}</span>\`;
}

// ── status donut chart ─────────────────────────────────
function renderDonut(d) {
  const canvas = el("statusDonut");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const size = 52;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + "px";
  canvas.style.height = size + "px";
  ctx.scale(dpr, dpr);

  const claims = d.claims ?? [];
  const total  = claims.length || 1;
  const counts = { verified: 0, stale: 0, disputed: 0, rejected: 0, unknown: 0, proposed: 0 };
  claims.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++; });

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const palette = isDark
    ? { verified:"#52c47e", stale:"#f0835a", disputed:"#e06060", rejected:"#e06060", unknown:"#3a4e3c", proposed:"#d4aa3a" }
    : { verified:"#0c6b4a", stale:"#9b4819", disputed:"#9b2b2b", rejected:"#9b2b2b", unknown:"#dce8d5", proposed:"#886600" };

  const slices = Object.entries(counts).filter(([, v]) => v > 0);
  const cx = size / 2, cy = size / 2, r = 20, inner = 12;
  let angle = -Math.PI / 2;
  ctx.clearRect(0, 0, size, size);

  slices.forEach(([status, count]) => {
    const sweep = (count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.arc(cx, cy, inner, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = palette[status] ?? "#888";
    ctx.fill();
    angle += sweep;
  });

  // center text: verified count
  const verified = counts.verified;
  ctx.fillStyle = isDark ? "#dce8d5" : "#1a2019";
  ctx.font = \`bold \${verified > 9 ? 9 : 10}px ui-monospace, monospace\`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(verified), cx, cy);
}

// ── main render ────────────────────────────────────────
function renderDashboard() {
  const d = currentData;

  el("projectName").textContent = d.project.name;
  const runLabelEl = el("runLabel");
  if (runLabelEl) {
    if (d.run?.label) {
      runLabelEl.textContent = d.run.label;
      runLabelEl.removeAttribute("hidden");
    } else {
      runLabelEl.setAttribute("hidden", "");
    }
  }
  const runMeta = el("dashRunMeta");
  if (runMeta) runMeta.textContent = d.run?.meta ?? "";

  if (d.claims?.length) renderDonut(d);
  el("dashboardMetrics").innerHTML = d.metrics.map(([label, value,, delta, color, filterVal]) =>
    \`<button type="button" class="metric-chip metric-\${esc(color)}\${filters.status === filterVal ? " metric-chip-active" : ""}"
      data-metric-filter="\${esc(filterVal ?? "all")}" title="Filter to \${esc(label.toLowerCase())}">
      <span class="mc-value" data-count="\${esc(value)}">\${esc(value)}</span>
      <span class="mc-label">\${esc(label)}</span>
      \${delta ? \`<span class="mc-delta">\${esc(delta)}</span>\` : ""}
    </button>\`
  ).join("");
  el("dashboardMetrics").querySelectorAll("[data-metric-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      const f = chip.dataset.metricFilter;
      filters.status = filters.status === f ? "all" : f;
      el("dashboardMetrics").querySelectorAll("[data-metric-filter]").forEach(c => {
        c.classList.toggle("metric-chip-active", filters.status === c.dataset.metricFilter);
      });
      el("statusFilter").value = filters.status;
      renderFeed(d);
      pushUrlState();
    });
  });
  el("dashboardMetrics").querySelectorAll("[data-count]").forEach(span => animateCount(span, span.dataset.count));

  const attention = (d.claims ?? []).filter(c =>
    ["disputed","stale","rejected","unknown"].includes(c.status)
  );
  if (attention.length) {
    const isAttentionActive = filters.status === "attention";
    el("attentionTitle").innerHTML =
      esc(attention.length + " claim" + (attention.length !== 1 ? "s" : "") +
      " need" + (attention.length === 1 ? "s" : "") + " attention") +
      \`<span class="band-action">\${isAttentionActive ? "✓ Filtered" : "Show all →"}</span>\`;
    el("priorityNarrative").textContent = d.narrative;
    const band = el("attentionBand");
    band.onclick = () => {
      filters.status = filters.status === "attention" ? "all" : "attention";
      el("statusFilter").value = filters.status;
      el("dashboardMetrics")?.querySelectorAll("[data-metric-filter]").forEach(c => {
        c.classList.toggle("metric-chip-active", filters.status === c.dataset.metricFilter);
      });
      renderFeed(d);
      pushUrlState();
      const nowActive = filters.status === "attention";
      el("attentionTitle").innerHTML =
        esc(attention.length + " claim" + (attention.length !== 1 ? "s" : "") +
        " need" + (attention.length === 1 ? "s" : "") + " attention") +
        \`<span class="band-action">\${nowActive ? "✓ Filtered" : "Show all →"}</span>\`;
    };
    show("attentionBand");
  } else {
    hide("attentionBand");
  }

  renderSurfaceChips(d);
  renderFeed(d);
  buildClaimTypeOptions();

  el("claimSearch").addEventListener("input", e => {
    filters.search = e.target.value;
    renderFeed(d);
    pushUrlState();
  });
  el("statusFilter").addEventListener("change", e => {
    filters.status = e.target.value;
    el("dashboardMetrics")?.querySelectorAll("[data-metric-filter]").forEach(c => {
      c.classList.toggle("metric-chip-active", filters.status === c.dataset.metricFilter);
    });
    renderFeed(d);
    pushUrlState();
  });
}

// ── surface chips ──────────────────────────────────────
function renderSurfaceChips(d) {
  const surfaces = Object.keys(d.surfaceCounts ?? {});
  el("surfaceChips").innerHTML = [
    chipBtn("all", "All", d.claims?.length ?? 0),
    ...surfaces.map(s => chipBtn(s, surfaceLabel(s), d.surfaceCounts[s]))
  ].join("");
  el("surfaceChips").querySelectorAll("[data-surface]").forEach(btn => {
    btn.addEventListener("click", () => {
      filters.surface = btn.dataset.surface;
      renderSurfaceChips(d);
      renderFeed(d);
      pushUrlState();
    });
  });
}

function chipBtn(value, label, count) {
  const active = filters.surface === value ? " chip-active" : "";
  return \`<button type="button" class="chip\${active}" data-surface="\${esc(value)}">\${esc(label)} <span class="chip-count">\${count}</span></button>\`;
}

// ── claim feed ─────────────────────────────────────────
function renderFeed(d) {
  const visible = filterClaims(d.claims ?? []);
  el("feedCount").textContent =
    visible.length + " of " + (d.claims?.length ?? 0) + " claims";
  el("claimFeed").innerHTML = visible.length
    ? visible.map((c, i) => claimCard(c, d.claims.indexOf(c), i)).join("")
    : (d.claims?.length
        ? \`<p class="empty-state">No claims match the current filters.</p>\`
        : \`<div class="empty-state empty-state--setup">
            <p class="empty-setup-title">No run data yet</p>
            <p>Run the producer to generate a read model, then refresh this dashboard.</p>
            <code class="empty-setup-cmd">veritas run</code>
           </div>\`);
  el("claimFeed").querySelectorAll("[data-claim-index]").forEach(card => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.claimIndex);
      showClaimDetail(d.claims[idx], d.readModel, card);
    });
  });
}

function filterClaims(claims) {
  const q = filters.search.trim().toLowerCase();
  return claims.filter(c => {
    const statusOk =
      filters.status === "all" ||
      (filters.status === "attention"
        ? ["stale","disputed","rejected","unknown","proposed"].includes(c.status)
        : c.status === filters.status);
    const surfaceOk = filters.surface === "all" || c.surface === filters.surface;
    const hay = [c.id, c.status, c.surface, c.claimType, c.fieldOrBehavior,
                 c.verificationPolicyId, c.subjectId].join(" ").toLowerCase();
    return statusOk && surfaceOk && (!q || hay.includes(q));
  });
}

function claimCard(claim, index, visibleIndex = 0) {
  const isAttention = ["disputed","stale","rejected"].includes(claim.status);
  const label  = claim.fieldOrBehavior || claim.claimType || claim.id;
  const val    = formatValue(claim.value);
  const surface = surfaceLabel(claim.surface);
  const faults = claim.faultLineIds?.length ?? 0;
  const color  = statusColor(claim.status);

  return \`<button type="button" class="claim-card\${confidenceTier(claim)}\${isAttention ? " card-attention" : ""}"
      data-claim-index="\${index}" aria-label="\${esc(label)}" style="--card-i:\${Math.min(visibleIndex, 14)}">
    <span class="card-dot dot-\${color}" aria-label="\${esc(claim.status)}"></span>
    <span class="card-body">
      <strong class="card-title">\${esc(label)}</strong>
      <span class="card-meta">
        <span class="card-surface">\${esc(surface)}</span>
        <span class="card-status-text status-\${esc(claim.status)}">\${esc(statusLabel(claim.status, claimEvidenceCount(claim)))}</span>
        \${claim.producerStatus
          ? \`<span class="card-divergence" title="Producer declared \${esc(claim.producerStatus)}">! was \${esc(claim.producerStatus)}</span>\`
          : ""}
        \${faults ? \`<span class="card-faults">\${faults} fault\${faults !== 1 ? "s" : ""}</span>\` : ""}
      </span>
      \${val ? \`<span class="card-value">\${esc(val.length > 70 ? val.slice(0,67) + "\\u2026" : val)}</span>\` : ""}
    </span>
    <span class="card-chevron" aria-hidden="true">\\u203a</span>
  </button>\`;
}

// ── detail sheet ───────────────────────────────────────
function showClaimDetail(claim, readModel, cardEl, pushHistory = true) {
  currentDetailClaim = claim;
  document.querySelectorAll(".claim-card.card-selected").forEach(c => c.classList.remove("card-selected"));
  if (cardEl) cardEl.classList.add("card-selected");
  const allEvidence   = readModel?.evidence   ?? [];
  const allFaultLines = readModel?.faultLines ?? [];
  const allPolicies   = readModel?.policies   ?? [];
  const allGaps       = readModel?.analytics?.proofRequirementGaps ?? [];

  const evidence   = allEvidence.filter(e => claim.evidenceIds?.includes(e.id));
  const faultLines = allFaultLines.filter(fl =>
    claim.faultLineIds?.includes(fl.id) || fl.claimId === claim.id
  );
  const policy = allPolicies.find(p => p.id === claim.verificationPolicyId);
  const claimGaps = allGaps.filter(g => g.claimId === claim.id);

  // header
  el("detailBadge").textContent = statusLabel(claim.status, evidence.length);
  el("detailBadge").className   = "status-badge badge-" + statusColor(claim.status);
  el("detailSurface").textContent = surfaceLabel(claim.surface);
  el("detailTitle").textContent   = claim.fieldOrBehavior || claim.claimType || "—";
  el("detailSubtitle").textContent = claim.id;

  // policy description
  const descEl = el("detailDescription");
  if (descEl) {
    const descText = policy?.explain?.summary ?? policy?.description ?? null;
    if (descText) {
      descEl.textContent = descText;
      descEl.removeAttribute("hidden");
    } else {
      descEl.setAttribute("hidden", "");
    }
  }
  document.getElementById("detailSheetActions")?.remove();
  const sheetActions = document.createElement("div");
  sheetActions.id = "detailSheetActions";
  sheetActions.className = "sheet-top-actions";
  const editBtn = document.createElement("button");
  editBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  editBtn.setAttribute("aria-label", "Edit claim");
  editBtn.title = "Edit claim";
  editBtn.className = "sheet-icon-btn";
  editBtn.type = "button";
  editBtn.onclick = () => openClaimModal(claim);
  const deleteBtn = document.createElement("button");
  deleteBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 3.5v6a.5.5 0 00.5.5h3a.5.5 0 00.5-.5v-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  deleteBtn.setAttribute("aria-label", "Delete claim");
  deleteBtn.title = "Delete claim";
  deleteBtn.className = "sheet-icon-btn sheet-icon-btn--danger";
  deleteBtn.type = "button";
  deleteBtn.onclick = () => openDeleteConfirm(claim.id);
  sheetActions.append(editBtn, deleteBtn);
  document.querySelector(".sheet-top")?.append(sheetActions);

  if (claim.producerStatus) {
    el("detailDivergenceBanner").textContent =
      "Producer declared " + claim.producerStatus + " but Surface derived " + claim.status +
      " from the evidence.";
    show("detailDivergenceBlock");
  } else {
    hide("detailDivergenceBlock");
  }

  const guidance = statusGuidance(claim.status, evidence.length);
  const suggested = suggestCommand(claim, evidence, readModel);
  let guidanceEl = document.getElementById("detailGuidance");
  if (guidance || suggested) {
    if (!guidanceEl) {
      guidanceEl = document.createElement("div");
      guidanceEl.id = "detailGuidance";
      guidanceEl.className = "detail-guidance";
      el("detailDivergenceBlock")?.insertAdjacentElement("afterend", guidanceEl) ??
        el("detailTitle").insertAdjacentElement("beforebegin", guidanceEl);
    }
    guidanceEl.className = "detail-guidance detail-guidance--" + (claim.status === "stale" ? "warn" : claim.status === "rejected" || claim.status === "disputed" ? "bad" : "info");
    guidanceEl.innerHTML =
      (guidance ? \`<p class="guidance-text">\${esc(guidance)}</p>\` : "") +
      (suggested ? \`<div class="guidance-command">
        <code class="guidance-cmd-text">\${esc(suggested.command)}</code>
        <button type="button" class="guidance-copy-btn" data-cmd="\${esc(suggested.command)}" aria-label="Copy command">
          <svg class="icon-copy" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="1" y="3" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M3 3V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <svg class="icon-check" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      \${suggested.note ? \`<p class="guidance-note">\${esc(suggested.note)}</p>\` : ""}\` : "");
    guidanceEl.removeAttribute("hidden");
  } else if (guidanceEl) {
    guidanceEl.setAttribute("hidden", "");
  }

  // ── what went wrong (fault lines + classified gaps) ──
  const allFaultItems = [
    ...faultLines.map(fl => ({ ...fl })),
    ...claimGaps.filter(g => !faultLines.some(fl => fl.type === g.gapType))
  ];

  if (allFaultItems.length) {
    el("detailFaults").innerHTML = allFaultItems.map(item => {
      const classified = classifyGap(item.type ?? item.gapType, item.message);
      const kindLabel  = gapKindLabel[classified.kind] ?? classified.kind;
      return \`<div class="fault-item fault-\${esc(item.severity ?? "medium")} fault-kind-\${esc(classified.kind)}">
        <div class="fault-head">
          <span class="fault-kind">\${esc(kindLabel)}</span>
          <span class="fault-type">\${esc(classified.title)}</span>
          \${item.blocking === false ? \`<span class="nonblocking-pill">non-blocking</span>\` : ""}
        </div>
        <p class="fault-msg">\${esc(item.message ?? "")}</p>
        \${classified.hint ? \`<p class="fault-hint">\${esc(classified.hint)}</p>\` : ""}
      </div>\`;
    }).join("");
    show("detailFaultBlock");
  } else {
    hide("detailFaultBlock");
  }

  // ── policy gap analysis ──────────────────────────────
  const gap = policyGapAnalysis(claim, policy);
  if (gap) {
    const gapSummary = gap.hasEvidence.length || gap.hasMethods.length
      ? "Surface compared the collected evidence against this claim's policy. The rows below show which requirement is still unmet."
      : "No matching evidence has been collected for this claim yet. Run the suggested evidence command first; if the claim still fails, check the producer configuration.";
    const rows = [
      \`<div class="gap-explainer">\${esc(gapSummary)}</div>\`,
      gap.missingEvidence.length
        ? \`<div class="gap-row gap-missing"><span class="gap-label">Missing evidence</span>
            <span class="gap-value">\${gap.missingEvidence.map(e => \`<code>\${esc(e)}</code>\`).join(" ")}</span></div>\`
        : "",
      gap.missingMethods.length
        ? \`<div class="gap-row gap-missing"><span class="gap-label">Missing method</span>
            <span class="gap-value">\${gap.missingMethods.map(m => \`<code>\${esc(m)}</code>\`).join(" ")}</span></div>\`
        : "",
      \`<div class="gap-row gap-has"><span class="gap-label">Rule requires</span>
          <span class="gap-value">\${renderRequirementValues([...gap.requiredEvidence, ...gap.requiredMethods], "No requirements declared")}</span></div>\`,
      \`<div class="gap-row gap-has"><span class="gap-label">Evidence collected</span>
          <span class="gap-value">\${renderRequirementValues([...gap.hasEvidence, ...gap.hasMethods], "No matching evidence collected")}</span></div>\`,
      gap.missingMethods.length
        ? \`<div class="gap-resolution"><strong>How to fix:</strong> collect evidence with method <code>\${esc(gap.missingMethods[0])}</code>. If evidence was collected but listed under a different method, update the producer/adapter mapping so it emits the policy's required method.</div>\`
        : \`<div class="gap-resolution"><strong>How to fix:</strong> enable the producer check that emits <code>\${esc(gap.missingEvidence[0] ?? "evidence")}</code> for this claim, then rerun evidence collection.</div>\`,
    ].filter(Boolean).join("");
    el("detailPolicyGap").innerHTML = rows;
    show("detailPolicyGapBlock");
  } else {
    hide("detailPolicyGapBlock");
  }

  // ── observed value ───────────────────────────────────
  const val = formatValue(claim.value);
  if (val) {
    el("detailValue").textContent = typeof claim.value === "object"
      ? JSON.stringify(claim.value, null, 2) : val;
    show("detailValueBlock");
  } else {
    hide("detailValueBlock");
  }

  // ── observed evidence result ──────────────────────────
  const observedResults = evidence.map(observedResultForEvidence).filter(Boolean);
  if (observedResults.length) {
    el("detailObserved").innerHTML = observedResults.map(renderObservedResult).join("");
    show("detailObservedBlock");
  } else {
    hide("detailObservedBlock");
  }

  // ── suggested actions from metadata ─────────────────
  const actions = claim.metadata?.actions ?? [];
  if (actions.length) {
    el("detailActions").innerHTML = actions.slice(0, 10).map(a => \`
      <div class="action-item">
        <span class="action-type">\${esc((a.type ?? "").replace(/-/g, " "))}</span>
        <p>\${esc(a.description ?? "")}</p>
        \${(a.paths ?? []).map(p =>
          \`<code class="action-path">\${esc(p)}</code>\`
        ).join("")}
      </div>
    \`).join("");
    if (actions.length > 10) {
      el("detailActions").innerHTML +=
        \`<p class="more-note">+\${actions.length - 10} more actions</p>\`;
    }
    show("detailActionsBlock");
  } else {
    hide("detailActionsBlock");
  }

  // ── evidence summary ─────────────────────────────────
  el("detailEvidence").textContent =
    evidence[0]?.excerptOrSummary ?? "No evidence summary available.";
  const plugin = evidence.find(item => item.metadata?._plugin)?.metadata?._plugin;
  if (plugin) {
    el("detailPluginAttribution").textContent =
      "Evidence collected via " + plugin.name + " by " + (plugin.author?.name ?? "unknown author") + ".";
    show("detailPluginAttribution");
  } else {
    hide("detailPluginAttribution");
  }

  // ── files in scope ───────────────────────────────────
  const files = evidence[0]?.metadata?.files ?? [];
  if (files.length) {
    const shown = files.slice(0, 15);
    el("detailFiles").innerHTML =
      shown.map(f => \`<code class="file-chip">\${esc(f)}</code>\`).join("") +
      (files.length > 15
        ? \`<span class="more-note">+\${files.length - 15} more</span>\`
        : "");
    show("detailFilesBlock");
  } else {
    hide("detailFilesBlock");
  }

  // ── integrity scope ─────────────────────────────────
  const integrityDetails = collectIntegrityDetails(claim, evidence);
  const integrityHtml = renderIntegrityScope(integrityDetails);
  if (integrityHtml) {
    el("detailIntegrity").innerHTML = integrityHtml;
    show("detailIntegrityBlock");
  } else {
    hide("detailIntegrityBlock");
  }

  // ── policy ───────────────────────────────────────────
  el("detailPolicy").textContent = claim.verificationPolicyId ?? "—";

  // ── raw metadata ─────────────────────────────────────
  el("detailMetadata").textContent =
    JSON.stringify({ claim, evidence, faultLines, policy: policy ?? null }, null, 2);

  if (pushHistory) pushUrlState();
  openSheet();
}

function openSheet() {
  show("detailSheet");
  show("sheetBackdrop");
  document.body.classList.add("sheet-open");
  el("detailSheet")?.querySelector(".sheet-scroll")?.scrollTo({ top: 0 });
  requestAnimationFrame(() => el("sheetClose")?.focus());
}
function closeSheet(pushHistory = true) {
  hide("detailSheet");
  hide("sheetBackdrop");
  document.body.classList.remove("sheet-open");
  currentDetailClaim = null;
  document.querySelectorAll(".claim-card.card-selected").forEach(c => c.classList.remove("card-selected"));
  if (pushHistory) pushUrlState();
}
el("sheetClose")?.addEventListener("click", closeSheet);
el("sheetBackdrop")?.addEventListener("click", closeSheet);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

// ── URL routing / history ──────────────────────────────
function getUrlState() {
  const p = new URLSearchParams(location.search);
  return {
    claimId: p.get("claim"),
    status:  p.get("status") ?? "all",
    surface: p.get("surface") ?? "all",
    search:  p.get("search") ?? "",
    run:     p.get("run"),
  };
}

function pushUrlState(replace) {
  const p = new URLSearchParams();
  if (filters.status !== "all")  p.set("status",  filters.status);
  if (filters.surface !== "all") p.set("surface", filters.surface);
  if (filters.search)            p.set("search",  filters.search);
  if (currentDetailClaim)        p.set("claim",   currentDetailClaim.id);
  if (currentRunId)              p.set("run",     currentRunId);
  const qs = p.toString();
  const url = qs ? "?" + qs : location.pathname;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

function applyUrlFilters(state) {
  filters.status  = state.status;
  filters.surface = state.surface;
  filters.search  = state.search;
  const searchInput = el("claimSearch");
  if (searchInput) searchInput.value = state.search;
  const statusSel = el("statusFilter");
  if (statusSel) statusSel.value = state.status;
}

window.addEventListener("popstate", () => {
  const state = getUrlState();
  applyUrlFilters(state);
  if (!currentData) return;
  renderSurfaceChips(currentData);
  renderFeed(currentData);
  el("dashboardMetrics")?.querySelectorAll("[data-metric-filter]").forEach(c => {
    c.classList.toggle("metric-chip-active", filters.status === c.dataset.metricFilter);
  });
  if (state.claimId) {
    const claim = currentData.claims?.find(c => c.id === state.claimId);
    if (claim) {
      const idx = currentData.claims.indexOf(claim);
      const cardEl = document.querySelector(\`[data-claim-index="\${idx}"]\`);
      showClaimDetail(claim, currentData.readModel, cardEl, false);
    } else {
      closeSheet(false);
    }
  } else {
    closeSheet(false);
  }
  if (state.run && state.run !== currentRunId) {
    refreshDashboard(state.run, true).catch(() => {});
  }
});

document.addEventListener("click", e => {
  // Copy command button
  const copyBtn = e.target.closest?.(".guidance-copy-btn");
  if (copyBtn) {
    const cmd = copyBtn.dataset.cmd ?? "";
    navigator.clipboard?.writeText(cmd).then(() => {
      copyBtn.classList.add("copied");
      setTimeout(() => copyBtn.classList.remove("copied"), 2000);
    }).catch(() => {});
    return;
  }

  // Help popover
  const trigger = e.target.closest?.(".help-trigger");
  document.querySelectorAll(".help-wrap.help-open").forEach(wrap => {
    if (!trigger || !wrap.contains(trigger)) {
      wrap.classList.remove("help-open");
      wrap.querySelector(".help-trigger")?.setAttribute("aria-expanded", "false");
      resetHelpPopover(wrap);
    }
  });
  if (!trigger) return;
  e.preventDefault();
  e.stopPropagation();
  const wrap = trigger.closest(".help-wrap");
  const isOpen = wrap.classList.toggle("help-open");
  trigger.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) positionHelpPopover(trigger);
  else resetHelpPopover(wrap);
});

function positionHelpPopover(trigger) {
  const wrap = trigger?.closest?.(".help-wrap");
  const popover = wrap?.querySelector?.(".help-popover");
  if (!trigger || !popover) return;

  const triggerRect = trigger.getBoundingClientRect();
  const margin = 12;
  const maxWidth = Math.min(288, window.innerWidth - margin * 2);
  popover.style.setProperty("--help-popover-width", maxWidth + "px");
  popover.dataset.floating = "true";

  const popoverRect = popover.getBoundingClientRect();
  const width = popoverRect.width || maxWidth;
  const height = popoverRect.height || 80;
  const centeredLeft = triggerRect.left + triggerRect.width / 2 - width / 2;
  const left = Math.max(margin, Math.min(centeredLeft, window.innerWidth - width - margin));
  const belowTop = triggerRect.bottom + 8;
  const aboveTop = triggerRect.top - height - 8;
  const placeAbove = belowTop + height > window.innerHeight - margin && aboveTop >= margin;
  const top = placeAbove ? aboveTop : Math.min(belowTop, window.innerHeight - height - margin);
  const arrowLeft = triggerRect.left + triggerRect.width / 2 - left;

  popover.style.left = left + "px";
  popover.style.top = Math.max(margin, top) + "px";
  popover.style.setProperty("--help-arrow-left", Math.max(12, Math.min(arrowLeft, width - 12)) + "px");
  popover.dataset.placement = placeAbove ? "top" : "bottom";
}

function resetHelpPopover(wrap) {
  const popover = wrap?.querySelector?.(".help-popover");
  if (!popover) return;
  popover.dataset.floating = "false";
  popover.dataset.placement = "";
  popover.style.left = "";
  popover.style.top = "";
  popover.style.removeProperty("--help-popover-width");
  popover.style.removeProperty("--help-arrow-left");
}

document.addEventListener("pointerover", e => {
  const trigger = e.target.closest?.(".help-trigger");
  if (trigger) positionHelpPopover(trigger);
});

document.addEventListener("focusin", e => {
  const trigger = e.target.closest?.(".help-trigger");
  if (trigger) positionHelpPopover(trigger);
});

document.addEventListener("pointerout", e => {
  const wrap = e.target.closest?.(".help-wrap");
  if (!wrap || wrap.classList.contains("help-open")) return;
  if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
  resetHelpPopover(wrap);
});

document.addEventListener("focusout", e => {
  const wrap = e.target.closest?.(".help-wrap");
  if (!wrap || wrap.classList.contains("help-open")) return;
  if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
  resetHelpPopover(wrap);
});

function repositionOpenHelpPopovers() {
  document.querySelectorAll(".help-wrap.help-open .help-trigger").forEach(positionHelpPopover);
}

window.addEventListener("resize", repositionOpenHelpPopovers);
document.addEventListener("scroll", repositionOpenHelpPopovers, true);

// ── claim authoring ───────────────────────────────────
function buildClaimTypeOptions() {
  const select = el("claimTypeSelect");
  if (!select) return;
  if (select.dataset.ready === "true") return;
  const options = claimTypes.length
    ? claimTypes.map(t => \`<option value="\${esc(t.id)}">\${esc(t.displayName ?? t.id)}</option>\`).join("")
    : \`<option value="software-proof">Software proof</option>
       <option value="veritas-governance-artifact">Governance artifact</option>
       <option value="veritas-external-tool-result">External tool result</option>\`;
  select.innerHTML = options;
  select.dataset.ready = "true";
  select.addEventListener("change", syncClaimTypeFields);
  syncClaimTypeFields();
}

function selectedClaimType() {
  const id = el("claimTypeSelect")?.value;
  return claimTypes.find(t => t.id === id) ?? null;
}

function syncClaimTypeFields() {
  const type = selectedClaimType();
  if (type) {
    el("claimTypeHint").textContent = type.description ?? "";
    if (!el("claimSurfaceInput").value && type.defaultSurface) el("claimSurfaceInput").value = type.defaultSurface;
    if (type.defaultImpact) el("claimImpactSelect").value = type.defaultImpact;
    if (!el("claimPolicyInput").value && type.policyTemplateId) el("claimPolicyInput").value = type.policyTemplateId;
  } else {
    el("claimTypeHint").textContent = "";
  }
  renderMetadataFields(type?.metadataFields ?? []);
}

function renderMetadataFields(fields) {
  const container = el("claimMetadataFields");
  if (!container) return;
  container.innerHTML = fields.map(field => \`
    <div class="form-field">
      <label for="metadata-\${esc(field.key)}">\${esc(field.label)}</label>
      <input id="metadata-\${esc(field.key)}" data-metadata-key="\${esc(field.key)}" data-metadata-type="\${esc(field.type)}"
        type="\${field.type === "number" ? "number" : field.type === "boolean" ? "checkbox" : "text"}"
        \${field.required ? "required" : ""} autocomplete="off">
      \${field.hint ? \`<p class="field-hint">\${esc(field.hint)}</p>\` : ""}
    </div>\`).join("");
}

function openClaimModal(existing) {
  buildClaimTypeOptions();
  el("claimModalTitle").textContent = existing ? "Edit claim" : "Add claim";
  el("claimIdInput").value = existing?.id ?? "";
  el("claimTypeSelect").value = existing?.claimType ?? el("claimTypeSelect").value;
  el("claimSurfaceInput").value = existing?.surface ?? "";
  el("claimFieldInput").value = existing?.fieldOrBehavior ?? "";
  el("claimSubjectTypeInput").value = existing?.subjectType ?? "";
  el("claimSubjectIdInput").value = existing?.subjectId ?? "";
  el("claimImpactSelect").value = existing?.impactLevel ?? selectedClaimType()?.defaultImpact ?? "medium";
  el("claimPolicyInput").value = existing?.verificationPolicyId ?? selectedClaimType()?.policyTemplateId ?? "";
  syncClaimTypeFields();
  for (const input of document.querySelectorAll("[data-metadata-key]")) {
    const key = input.dataset.metadataKey;
    const value = existing?.metadata?.[key];
    if (input.type === "checkbox") input.checked = value === true;
    else if (value !== undefined) input.value = String(value);
  }
  el("claimModal").showModal();
}

function closeClaimModal() {
  el("claimModal")?.close();
  el("claimForm")?.reset();
}

async function submitClaimForm(event) {
  event.preventDefault();
  const editingId = el("claimIdInput").value;
  const metadata = {};
  for (const input of document.querySelectorAll("[data-metadata-key]")) {
    const key = input.dataset.metadataKey;
    const type = input.dataset.metadataType;
    if (type === "boolean") {
      metadata[key] = input.checked;
    } else if (input.value !== "") {
      metadata[key] = type === "number" ? Number(input.value) : input.value;
    }
  }
  const body = {
    claimType: el("claimTypeSelect").value,
    surface: el("claimSurfaceInput").value,
    fieldOrBehavior: el("claimFieldInput").value,
    subjectType: el("claimSubjectTypeInput").value,
    subjectId: el("claimSubjectIdInput").value,
    impactLevel: el("claimImpactSelect").value,
    verificationPolicyId: el("claimPolicyInput").value || undefined,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
  const response = await fetch(editingId ? \`/api/claims/\${encodeURIComponent(editingId)}\` : "/api/claims", {
    method: editingId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Claim save failed");
  }
  closeClaimModal();
  closeSheet();
  await refreshDashboard(null);
}

async function deleteCurrentClaim(claimId) {
  if (!claimId) return;
  const response = await fetch(\`/api/claims/\${encodeURIComponent(claimId)}\`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Claim delete failed");
  }
  closeSheet();
  await refreshDashboard(null);
}

function openDeleteConfirm(claimId) {
  if (!claimId) return;
  pendingDeleteClaimId = claimId;
  const idEl = el("deleteConfirmClaimId");
  const errorEl = el("deleteConfirmError");
  if (idEl) idEl.textContent = claimId;
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.setAttribute("hidden", "");
  }
  el("deleteConfirmModal")?.showModal();
}

function closeDeleteConfirm() {
  pendingDeleteClaimId = null;
  el("deleteConfirmModal")?.close();
}

async function confirmDeleteClaim() {
  if (!pendingDeleteClaimId) return;
  const submit = el("deleteConfirmSubmit");
  const errorEl = el("deleteConfirmError");
  if (submit) submit.disabled = true;
  try {
    await deleteCurrentClaim(pendingDeleteClaimId);
    closeDeleteConfirm();
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error?.message ?? "Claim delete failed";
      errorEl.removeAttribute("hidden");
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function refreshDashboard(runId, skipHistory = false) {
  currentRunId = runId ?? null;
  const url = runId && runId !== "latest" ? \`/api/read-model?run=\${encodeURIComponent(runId)}\` : "/api/read-model";
  const response = await fetch(url);
  if (!response.ok) {
    currentData = emptyDashboard();
  } else {
    currentData = dashboardFromReadModel(await response.json());
  }
  renderDashboard();
  renderRunPicker();
  if (!skipHistory) pushUrlState();
}

async function loadRunList() {
  try {
    const res = await fetch("/api/runs");
    if (res.ok) allRuns = await res.json();
  } catch {}
  const urlRun = getUrlState().run;
  if (urlRun && urlRun !== currentRunId) {
    await refreshDashboard(urlRun, true).catch(() => {});
  } else {
    renderRunPicker();
  }
}

function runOptionDate(r) {
  return r.generatedAt
    ? new Date(r.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
}

function closeRunDropdown() {
  const dropdown = el("runDropdown");
  const trigger = el("runTrigger");
  if (dropdown) dropdown.classList.remove("open");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

function renderRunPicker() {
  const container = el("runSelect");
  if (!container) return;
  if (allRuns.length <= 1) { container.hidden = true; return; }

  const activeRunId = currentRunId ?? currentData?.run?.id;
  const trigger = el("runTrigger");
  const triggerLabel = el("runTriggerLabel");
  const dropdown = el("runDropdown");

  const currentRun = allRuns.find(r => r.runId === activeRunId) ?? allRuns[0];
  if (triggerLabel) {
    const date = runOptionDate(currentRun);
    const stats = currentRun.verifiedCount + "/" + currentRun.claimCount + " verified";
    triggerLabel.textContent = date ? date + " · " + stats : stats;
  }

  dropdown.innerHTML = allRuns.map(r => {
    const date = r.generatedAt
      ? new Date(r.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "";
    const isActive = r.runId === activeRunId;
    return \`<button type="button" class="run-option\${isActive ? " run-option-active" : ""}"
      role="option" aria-selected="\${isActive}" data-run-id="\${esc(r.runId)}">
      <span class="run-opt-date">\${esc(date || r.runId)}</span>
      <span class="run-opt-stats">\${esc(r.verifiedCount + " verified · " + r.claimCount + " total")}</span>
      <span class="run-opt-id">\${esc(r.runId)}</span>
    </button>\`;
  }).join("");

  container.hidden = false;

  if (!trigger.dataset.bound) {
    trigger.dataset.bound = "true";
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains("open");
      if (!isOpen) {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + "px";
        dropdown.style.left = rect.left + "px";
        dropdown.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
      } else {
        closeRunDropdown();
      }
    });
    document.addEventListener("click", () => closeRunDropdown());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dropdown.classList.contains("open")) {
        closeRunDropdown();
        trigger.focus();
      }
    });
  }

  dropdown.querySelectorAll("[data-run-id]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeRunDropdown();
      refreshDashboard(btn.dataset.runId).catch(err => window.alert(err.message));
    });
  });
}

// ── run meta formatting ────────────────────────────────
function formatSourceSummary(producer) {
  const kind = producer.sourceKind;
  const scope = Array.isArray(producer.sourceScope)
    ? producer.sourceScope
    : producer.sourceScope ? [producer.sourceScope] : [];

  let kindLabel = null;
  if (kind === "working-tree")   kindLabel = "Working tree";
  else if (kind === "branch-diff")    kindLabel = "Branch diff";
  else if (kind === "explicit-files") kindLabel = "Explicit files";
  else if (kind)                      kindLabel = kind.replace(/-/g, " ");

  const allLocal = ["staged", "unstaged", "untracked"];
  let scopeLabel = null;
  if (scope.length && allLocal.every(s => scope.includes(s)) && scope.length === allLocal.length) {
    scopeLabel = "all local changes";
  } else if (scope.length === 1) {
    scopeLabel = scope[0] + " only";
  } else if (scope.length) {
    scopeLabel = scope.join(" + ");
  }

  if (!kindLabel && !scopeLabel) return null;
  if (!scopeLabel || scopeLabel === kindLabel) return kindLabel;
  return kindLabel + " · " + scopeLabel;
}

// ── data ───────────────────────────────────────────────
function deriveProjectName(claims) {
  if (!claims?.length) return null;
  const roots = {};
  claims.forEach(c => {
    const raw = (c.subjectId ?? "").split(":")[0].trim();
    if (raw) roots[raw] = (roots[raw] ?? 0) + 1;
  });
  const top = Object.entries(roots).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top) return null;
  return top.replace(/[-_]+/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
}

function dashboardFromReadModel(readModel) {
  const producer   = readModel.producer ?? {};
  const claims     = readModel.claims ?? [];
  const sourceSummary = formatSourceSummary(producer);
  const runDate = producer.timestamp
    ? new Date(producer.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const runMeta = [sourceSummary, runDate].filter(Boolean).join(" · ");
  const verified  = readModel.summary.statusCounts?.verified ?? 0;
  const attention = claims.filter(c =>
    ["stale","disputed","rejected","unknown"].includes(c.status)
  );
  const total = Math.max(readModel.summary.claimCount ?? claims.length, 1);

  const folderName = cfg.folderName
    ? cfg.folderName.replace(/[-_]+/g, " ").replace(/\b\w/g, ch => ch.toUpperCase())
    : null;
  const projectName = vocab.projectName ?? cfg.theme?.brandName ?? deriveProjectName(claims) ?? folderName ?? "Dashboard";
  return {
    project: { name: projectName },
    run: { id: producer.runId ?? "unknown", meta: runMeta, label: producer.runId ?? null },
    narrative: buildNarrative(readModel, attention),
    metrics: [
      ["Claims",    String(readModel.summary.claimCount), "", "", "blue", "all"],
      ["Verified",  String(verified), "", Math.round((verified / total) * 100) + "%", "good", "verified"],
      ["Attention", String(attention.length), "", readModel.summary.faultLineCount + " faults",
       attention.length ? "bad" : "good", "attention"],
    ],
    claims,
    surfaceCounts: readModel.summary.surfaceCounts ?? {},
    readModel,
  };
}

function emptyDashboard() {
  return {
    project: { name: vocab.projectName ?? cfg.theme?.brandName ?? "No data yet" },
    run:     { id: "", meta: "No runs found — run the producer to generate a read model" },
    narrative: "",
    metrics: [
      ["Claims",    "0", "", "", "blue", "all"],
      ["Verified",  "0", "", "", "good", "verified"],
      ["Attention", "0", "", "", "bad",  "attention"],
    ],
    claims:        [],
    surfaceCounts: {},
    readModel:     null,
  };
}

function buildNarrative(readModel, attention) {
  const verified = readModel.summary.statusCounts?.verified ?? 0;
  const total    = readModel.summary.claimCount ?? 0;
  if (!attention.length) {
    return "All " + verified + " of " + total + " claims are verified.";
  }
  const first = attention[0];
  return attention.length + " claim" + (attention.length !== 1 ? "s" : "") +
    " need attention. Start with \\u201c" +
    (first.fieldOrBehavior || first.claimType) +
    "\\u201d on surface " + surfaceLabel(first.surface) + ".";
}

// ── boot ───────────────────────────────────────────────
const _bootUrl = getUrlState();
applyUrlFilters(_bootUrl);
updateDashboardChromeMetrics();
window.addEventListener("resize", updateDashboardChromeMetrics);

currentRunId = _bootUrl.run ?? null;
currentData = cfg.readModel
  ? dashboardFromReadModel(cfg.readModel)
  : emptyDashboard();
renderDashboard();
el("addClaimBtn")?.addEventListener("click", () => openClaimModal());
el("claimModalCancel")?.addEventListener("click", closeClaimModal);
el("deleteConfirmCancel")?.addEventListener("click", closeDeleteConfirm);
el("deleteConfirmSubmit")?.addEventListener("click", confirmDeleteClaim);
el("claimForm")?.addEventListener("submit", event => {
  submitClaimForm(event).catch(error => window.alert(error.message));
});
if (_bootUrl.claimId && currentData?.claims?.length) {
  const _bc = currentData.claims.find(c => c.id === _bootUrl.claimId);
  if (_bc) {
    const _bi = currentData.claims.indexOf(_bc);
    const _bcard = document.querySelector(\`[data-claim-index="\${_bi}"]\`);
    showClaimDetail(_bc, currentData.readModel, _bcard, false);
  }
}
pushUrlState(true);
loadRunList();
`;
