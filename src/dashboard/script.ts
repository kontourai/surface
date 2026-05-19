export const DASHBOARD_SCRIPT = `
const cfg = window.__SURFACE_CONFIG__ ?? {};
const vocab = cfg.vocab ?? {};
const claimTypes = cfg.claimTypes ?? [];
const filters = { search: "", status: "all", surface: "all" };
let currentData = null;
let currentDetailClaim = null;
let allRuns = [];

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

function statusLabel(status) {
  const m = { verified:"Verified", stale:"Needs refresh", disputed:"Disputed",
               rejected:"Rejected", unknown:"No evidence", proposed:"Pending" };
  return m[status] ?? status;
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

function statusGuidance(status) {
  const m = {
    verified: null,
    unknown:  "No evidence has been collected for this claim yet. Run the producer to gather evidence.",
    proposed: "This claim is awaiting its first evidence collection run.",
    stale:    "Evidence exists but is outdated. Re-run the producer to refresh it.",
    disputed: "Surface derived a different status than the producer declared. Resolve the fault lines above.",
    rejected: "Verification failed. Check ‘What went wrong’ above for specific remediation steps.",
  };
  return m[status] ?? null;
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
        title: "Wrong verification method",
        hint: "Evidence was collected but used the wrong method. The producer adapter may not be mapping evidence to the method this policy requires. Check the adapter configuration.",
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

// ── main render ────────────────────────────────────────
function renderDashboard() {
  const d = currentData;

  el("projectName").textContent = d.project.name;
  const runMeta = el("dashRunMeta");
  if (runMeta) runMeta.textContent = d.run?.meta ?? "";

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
      renderFeed(d);
    });
  });
  el("dashboardMetrics").querySelectorAll("[data-count]").forEach(span => animateCount(span, span.dataset.count));

  const attention = (d.claims ?? []).filter(c =>
    ["disputed","stale","rejected","unknown"].includes(c.status)
  );
  if (attention.length) {
    el("attentionTitle").textContent = attention.length + " claim" +
      (attention.length !== 1 ? "s" : "") + " need" +
      (attention.length === 1 ? "s" : "") + " attention";
    el("priorityNarrative").textContent = d.narrative;
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
  });
  el("statusFilter").addEventListener("change", e => {
    filters.status = e.target.value;
    renderFeed(d);
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
    : \`<p class="empty-state">No claims match the current filters.</p>\`;
  el("claimFeed").querySelectorAll("[data-claim-index]").forEach(card => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.claimIndex);
      showClaimDetail(d.claims[idx], d.readModel);
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
        <span class="card-status-text status-\${esc(claim.status)}">\${esc(statusLabel(claim.status))}</span>
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
function showClaimDetail(claim, readModel) {
  currentDetailClaim = claim;
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
  el("detailBadge").textContent = claim.status;
  el("detailBadge").className   = "status-badge badge-" + statusColor(claim.status);
  el("detailSurface").textContent = surfaceLabel(claim.surface);
  el("detailTitle").textContent   = claim.fieldOrBehavior || claim.claimType || "—";
  el("detailSubtitle").textContent = claim.id;
  document.getElementById("detailSheetActions")?.remove();
  const sheetActions = document.createElement("div");
  sheetActions.id = "detailSheetActions";
  sheetActions.className = "sheet-actions";
  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit claim";
  editBtn.className = "sheet-action-btn";
  editBtn.type = "button";
  editBtn.onclick = () => openClaimModal(claim);
  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete claim";
  deleteBtn.className = "sheet-action-btn sheet-action-btn--danger";
  deleteBtn.type = "button";
  deleteBtn.onclick = () => deleteCurrentClaim(claim.id);
  sheetActions.append(editBtn, deleteBtn);
  el("detailSubtitle").insertAdjacentElement("afterend", sheetActions);

  if (claim.producerStatus) {
    el("detailDivergenceBanner").textContent =
      "Producer declared " + claim.producerStatus + " but Surface derived " + claim.status +
      " from the evidence.";
    show("detailDivergenceBlock");
  } else {
    hide("detailDivergenceBlock");
  }

  const guidance = statusGuidance(claim.status);
  let guidanceEl = document.getElementById("detailGuidance");
  if (guidance) {
    if (!guidanceEl) {
      guidanceEl = document.createElement("p");
      guidanceEl.id = "detailGuidance";
      guidanceEl.className = "detail-guidance";
      el("detailDivergenceBlock")?.insertAdjacentElement("afterend", guidanceEl) ??
        el("detailTitle").insertAdjacentElement("beforebegin", guidanceEl);
    }
    guidanceEl.textContent = guidance;
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
    const rows = [
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

  // ── policy ───────────────────────────────────────────
  el("detailPolicy").textContent = claim.verificationPolicyId ?? "—";

  // ── raw metadata ─────────────────────────────────────
  el("detailMetadata").textContent =
    JSON.stringify({ claim, evidence, faultLines, policy: policy ?? null }, null, 2);

  openSheet();
}

function openSheet() {
  show("detailSheet");
  show("sheetBackdrop");
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => el("sheetClose")?.focus());
}
function closeSheet() {
  hide("detailSheet");
  hide("sheetBackdrop");
  document.body.classList.remove("sheet-open");
  currentDetailClaim = null;
}
el("sheetClose")?.addEventListener("click", closeSheet);
el("sheetBackdrop")?.addEventListener("click", closeSheet);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
document.addEventListener("click", e => {
  const trigger = e.target.closest?.(".help-trigger");
  document.querySelectorAll(".help-wrap.help-open").forEach(wrap => {
    if (!trigger || !wrap.contains(trigger)) {
      wrap.classList.remove("help-open");
      wrap.querySelector(".help-trigger")?.setAttribute("aria-expanded", "false");
    }
  });
  if (!trigger) return;
  e.preventDefault();
  e.stopPropagation();
  const wrap = trigger.closest(".help-wrap");
  const isOpen = wrap.classList.toggle("help-open");
  trigger.setAttribute("aria-expanded", String(isOpen));
});

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

async function refreshDashboard(runId) {
  const url = runId && runId !== "latest" ? \`/api/read-model?run=\${encodeURIComponent(runId)}\` : "/api/read-model";
  const response = await fetch(url);
  if (!response.ok) {
    currentData = emptyDashboard();
  } else {
    currentData = dashboardFromReadModel(await response.json());
  }
  renderDashboard();
  renderRunPicker();
}

async function loadRunList() {
  try {
    const res = await fetch("/api/runs");
    if (res.ok) allRuns = await res.json();
  } catch {}
  renderRunPicker();
}

function renderRunPicker() {
  const picker = el("runPicker");
  if (!picker) return;
  if (allRuns.length <= 1) { picker.hidden = true; return; }
  const currentRunId = currentData?.run?.id;
  picker.innerHTML = allRuns.map(r => {
    const date = r.generatedAt
      ? new Date(r.generatedAt).toLocaleDateString(undefined, { month:"short", day:"numeric" })
      : "";
    const label = [r.runId, date, r.verifiedCount + "/" + r.claimCount + " verified"].filter(Boolean).join(" · ");
    return \`<option value="\${esc(r.runId)}" \${r.runId === currentRunId ? "selected" : ""}>\${esc(label)}</option>\`;
  }).join("");
  picker.hidden = false;
  if (!picker.dataset.bound) {
    picker.dataset.bound = "true";
    picker.addEventListener("change", () => {
      refreshDashboard(picker.value).catch(err => window.alert(err.message));
    });
  }
}

// ── data ───────────────────────────────────────────────
function dashboardFromReadModel(readModel) {
  const producer   = readModel.producer ?? {};
  const claims     = readModel.claims ?? [];
  const sourceScope = Array.isArray(producer.sourceScope)
    ? producer.sourceScope.join(" + ")
    : (producer.sourceScope ? String(producer.sourceScope) : null);
  const sourceKind = producer.sourceKind ? producer.sourceKind.replace(/-/g, " ") : null;
  const runDate = producer.timestamp
    ? new Date(producer.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const runMeta = [producer.runId, sourceKind, sourceScope, runDate].filter(Boolean).join(" · ");
  const verified  = readModel.summary.statusCounts?.verified ?? 0;
  const attention = claims.filter(c =>
    ["stale","disputed","rejected","unknown"].includes(c.status)
  );
  const total = Math.max(readModel.summary.claimCount ?? claims.length, 1);

  return {
    project: {
      name: vocab.projectName ?? cfg.theme?.brandName ?? "Surface dashboard",
    },
    run: { id: producer.runId ?? "unknown", meta: runMeta },
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
    project: { name: vocab.projectName ?? cfg.theme?.brandName ?? "Surface dashboard" },
    run:     { id: "missing", meta: "" },
    narrative: "No producer read model found. Run the producer to generate a read model.",
    metrics: [
      ["Claims",    "0", "", "missing", "warn"],
      ["Verified",  "0", "", "0%",      "warn"],
      ["Attention", "0", "", "0 faults","warn"],
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
currentData = cfg.readModel
  ? dashboardFromReadModel(cfg.readModel)
  : emptyDashboard();
renderDashboard();
el("addClaimBtn")?.addEventListener("click", () => openClaimModal());
el("claimModalCancel")?.addEventListener("click", closeClaimModal);
el("claimForm")?.addEventListener("submit", event => {
  submitClaimForm(event).catch(error => window.alert(error.message));
});
loadRunList();
`;
