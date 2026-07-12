function showClaimDetail(claim, readModel, cardEl, pushHistory = true) {
  currentDetailClaim = claim;
  document.querySelectorAll(".claim-card.card-selected").forEach(c => c.classList.remove("card-selected"));
  if (cardEl) cardEl.classList.add("card-selected");
  const detail = collectClaimDetailContext(claim, readModel);
  // Business derivation (guidance, gap labels, policy facts, integrity scope) is
  // precomputed server-side and shipped in the projection, keyed by claim id
  // (issue #4). The browser renders from these projected fields.
  const projected = currentData?.claimDetails?.[claim.id] ?? emptyClaimDetail();
  renderDetailHeader(claim, detail.evidence, detail.policy);
  renderDetailSheetActions(claim);
  renderDetailDivergence(claim);
  renderDetailGuidance(claim, projected);
  renderDetailGaps(projected.gaps);
  renderDetailPolicyGap(projected.policyGap);
  renderDetailWhatWasChecked(claim, detail.evidence);
  renderDetailActions(claim);
  renderDetailAccordions(claim, detail, projected);

  if (pushHistory) pushUrlState();
  openSheet();
}

// Fallback when a projection predating claim detail is in memory (e.g. an older
// cached /api/console-model response). Keeps the detail sheet resilient.
function emptyClaimDetail() {
  return {
    guidance: null,
    suggestedCommand: null,
    gaps: [],
    policyGap: null,
    integrityScope: { sourceRefs: [], configRefs: [], fileRefs: [] },
  };
}

function collectClaimDetailContext(claim, readModel) {
  const allEvidence = readModel?.evidence ?? [];
  const allTransparencyGaps = readModel?.transparencyGaps ?? [];
  const allPolicies = readModel?.policies ?? [];
  return {
    evidence: allEvidence.filter(e => claim.evidenceIds?.includes(e.id)),
    transparencyGaps: allTransparencyGaps.filter(fl =>
      claim.transparencyGapIds?.includes(fl.id) || fl.claimId === claim.id
    ),
    policy: allPolicies.find(p => p.id === claim.verificationPolicyId),
  };
}

function renderDetailHeader(claim, evidence, policy) {
  el("detailBadge").textContent = statusLabel(claim.status, evidence.length);
  el("detailBadge").className   = "status-badge badge-" + statusColor(claim.status) + " detail-badge-lg";
  el("detailSurface").textContent = surfaceLabel(claim.facet ?? claim.surface);
  el("detailTitle").textContent   = claim.fieldOrBehavior || claim.claimType || "—";
  // Claim ID exposed only as the subtitle (for detail drill-down), not on the card face.
  el("detailSubtitle").textContent = claim.id;

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

  // Freshness framing: "verified at / evidence from" instead of security-jargon labels.
  renderDetailFreshness(claim, evidence);
}

function renderDetailFreshness(claim, evidence) {
  const freshnessEl = el("detailFreshness");
  if (!freshnessEl) return;

  const verifiedAt = evidence[0]?.capturedAt ?? evidence[0]?.metadata?.capturedAt;
  const evidenceFrom = evidence[0]?.metadata?.source ?? evidence[0]?.metadata?.tool ?? null;
  const parts = [];
  if (verifiedAt) {
    try {
      const d = new Date(verifiedAt);
      parts.push("Verified " + d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
    } catch { parts.push("Verified " + verifiedAt); }
  }
  if (evidenceFrom) {
    parts.push("Evidence from " + evidenceFrom);
  }
  if (parts.length) {
    freshnessEl.textContent = parts.join(" · ");
    freshnessEl.removeAttribute("hidden");
  } else {
    freshnessEl.setAttribute("hidden", "");
  }
}

function renderDetailSheetActions(claim) {
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
}

function renderDetailDivergence(claim) {
  if (claim.producerStatus) {
    el("detailDivergenceBanner").textContent =
      "Producer declared " + claim.producerStatus + " but Surface derived " + claim.status +
      " from the evidence.";
    show("detailDivergenceBlock");
  } else {
    hide("detailDivergenceBlock");
  }
}

// ── Item 2: Mobile-friendly guidance layout ────────────────
// Guidance text is clamped to 2 lines with a "more" expander.
// The CLI command gets its own full-width block with the copy button below.
function renderDetailGuidance(claim, projected) {
  const guidance = projected.guidance;
  const suggested = projected.suggestedCommand;
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
      (guidance ? `<details class="guidance-text-details"><summary class="guidance-text guidance-text--clamped">${esc(guidance)}</summary><p class="guidance-text guidance-text--expanded">${esc(guidance)}</p></details>` : "") +
      (suggested ? `<div class="guidance-command">
        <code class="guidance-cmd-text">${esc(suggested.command)}</code>
        <button type="button" class="guidance-copy-btn" data-cmd="${esc(suggested.command)}" aria-label="Copy command">
          <svg class="icon-copy" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="1" y="3" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M3 3V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <svg class="icon-check" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      ${suggested.note ? `<p class="guidance-note">${esc(suggested.note)}</p>` : ""}` : "");
    guidanceEl.removeAttribute("hidden");
  } else if (guidanceEl) {
    guidanceEl.setAttribute("hidden", "");
  }
}

// ── Item 4: Gap badge + severity tone + clamped description ──
function renderDetailGaps(gaps) {
  if (gaps.length) {
    const hasBlocking = gaps.some(g => g.blocking !== false);
    // Update the section label: "Why this isn't verified" for blocking gaps, otherwise "Gaps"
    const gapLabelEl = el("detailGapLabel");
    if (gapLabelEl) {
      const gapLabelText = hasBlocking ? "Why this isn't verified" : "Non-blocking gaps";
      gapLabelEl.firstChild.textContent = gapLabelText + " ";
    }
    // Gap kind/title/hint labels are precomputed in the claim detail projection.
    el("detailGaps").innerHTML = gaps.map(item => {
      const severity = item.severity ?? "medium";
      // Severity tone class: high/critical → bad, medium → warn, low → info
      const severityTone = (severity === "high" || severity === "critical") ? "gap-severity-high"
        : severity === "low" ? "gap-severity-low" : "gap-severity-medium";
      return `<div class="gap-item gap-${esc(severity)} gap-kind-${esc(item.kind)}">
        <div class="gap-head">
          <span class="gap-kind">${esc(item.kindLabel)}</span>
          <span class="gap-type">${esc(item.title)}</span>
          <span class="gap-severity-badge ${esc(severityTone)}">${esc(severity)}</span>
          ${item.blocking === false ? `<span class="nonblocking-pill">non-blocking</span>` : ""}
        </div>
        <details class="gap-msg-details">
          <summary class="gap-msg gap-msg--clamped">${esc(item.message ?? "")}</summary>
          <p class="gap-msg gap-msg--expanded">${esc(item.message ?? "")}</p>
        </details>
        ${item.hint ? `<p class="gap-hint">${esc(item.hint)}</p>` : ""}
      </div>`;
    }).join("");
    show("detailGapBlock");
  } else {
    hide("detailGapBlock");
  }
}

function renderDetailPolicyGap(gap) {
  if (gap) {
    const gapSummary = gap.hasEvidence.length || gap.hasMethods.length
      ? "Surface compared the collected evidence against this claim's policy. The rows below show which requirement is still unmet."
      : "No matching evidence has been collected for this claim yet. Run the suggested evidence command first; if the claim still fails, check the producer configuration.";
    const rows = [
      `<div class="gap-explainer">${esc(gapSummary)}</div>`,
      gap.missingEvidence.length
        ? `<div class="gap-row gap-missing"><span class="gap-label">Missing evidence</span>
            <span class="gap-value">${gap.missingEvidence.map(e => `<code>${esc(e)}</code>`).join(" ")}</span></div>`
        : "",
      gap.missingMethods.length
        ? `<div class="gap-row gap-missing"><span class="gap-label">Missing method</span>
            <span class="gap-value">${gap.missingMethods.map(m => `<code>${esc(m)}</code>`).join(" ")}</span></div>`
        : "",
      `<div class="gap-row gap-has"><span class="gap-label">Rule requires</span>
          <span class="gap-value">${renderRequirementValues([...gap.requiredEvidence, ...gap.requiredMethods], "No requirements declared")}</span></div>`,
      `<div class="gap-row gap-has"><span class="gap-label">Evidence collected</span>
          <span class="gap-value">${renderRequirementValues([...gap.hasEvidence, ...gap.hasMethods], "No matching evidence collected")}</span></div>`,
      gap.missingMethods.length
        ? `<div class="gap-resolution"><strong>How to fix:</strong> collect evidence with method <code>${esc(gap.missingMethods[0])}</code>. If evidence was collected but listed under a different method, update the producer/adapter mapping so it emits the policy's required method.</div>`
        : `<div class="gap-resolution"><strong>How to fix:</strong> enable the producer check that emits <code>${esc(gap.missingEvidence[0] ?? "evidence")}</code> for this claim, then rerun evidence collection.</div>`,
    ].filter(Boolean).join("");
    el("detailPolicyGap").innerHTML = rows;
    show("detailPolicyGapBlock");
  } else {
    hide("detailPolicyGapBlock");
  }
}

// ── unified "What was checked" section ────────────────────
// Merges Evidence summary + Observed result into one section so the
// same information never appears twice.
// Item 6: when >8 evidence entries show first 5 + "show all (N)" expander.
function renderDetailWhatWasChecked(claim, evidence) {
  const checked = el("detailWhatWasChecked");
  if (!checked) return;

  const parts = [];

  // Evidence summary (excerpt or summary from first evidence item)
  const summaryText = evidence[0]?.excerptOrSummary ?? null;
  if (summaryText) {
    parts.push(`<p class="checked-summary">${esc(summaryText)}</p>`);
  }

  // Observed result rows (structured metadata when available)
  // Item 6: cap at 5 visible by default when there are more than 8 total.
  const EVIDENCE_SHOW_LIMIT = 5;
  const EVIDENCE_COLLAPSE_THRESHOLD = 8;
  const observedResults = evidence.map(observedResultForEvidence).filter(Boolean);
  if (observedResults.length) {
    const showExpander = observedResults.length > EVIDENCE_COLLAPSE_THRESHOLD;
    const visibleResults = showExpander ? observedResults.slice(0, EVIDENCE_SHOW_LIMIT) : observedResults;
    parts.push(...visibleResults.map(renderObservedResult));
    if (showExpander) {
      parts.push(
        `<details class="evidence-expander">` +
        `<summary class="evidence-expander-btn">Show all ${observedResults.length} evidence entries</summary>` +
        observedResults.slice(EVIDENCE_SHOW_LIMIT).map(renderObservedResult).join("") +
        `</details>`
      );
    }
  }

  // Plugin attribution inline with evidence
  const plugin = evidence.find(item => item.metadata?._plugin)?.metadata?._plugin;
  if (plugin) {
    parts.push(`<p class="plugin-attribution">Evidence collected via ${esc(plugin.name)} by ${esc(plugin.author?.name ?? "unknown author")}.</p>`);
  }

  if (parts.length) {
    checked.innerHTML = parts.join("");
    show("detailWhatWasCheckedBlock");
  } else {
    // Fallback: no evidence at all
    checked.innerHTML = `<p class="checked-empty">No evidence summary available.</p>`;
    show("detailWhatWasCheckedBlock");
  }
}

function renderDetailActions(claim) {
  const actions = claim.metadata?.actions ?? [];
  if (actions.length) {
    el("detailActions").innerHTML = actions.slice(0, 10).map(a => `
      <div class="action-item">
        <span class="action-type">${esc((a.type ?? "").replace(/-/g, " "))}</span>
        <p>${esc(a.description ?? "")}</p>
        ${(a.paths ?? []).map(p =>
          `<code class="action-path">${esc(p)}</code>`
        ).join("")}
      </div>
    `).join("");
    if (actions.length > 10) {
      el("detailActions").innerHTML +=
        `<p class="more-note">+${actions.length - 10} more actions</p>`;
    }
    show("detailActionsBlock");
  } else {
    hide("detailActionsBlock");
  }
}

// ── collapsed accordion sections ─────────────────────────
// Verification rule/policy, files in scope, integrity anchors, and raw
// metadata are all secondary detail moved into <details> accordions.
function renderDetailAccordions(claim, detail, projected) {
  renderDetailValue(claim);
  renderDetailFilesAccordion(detail.evidence);
  renderDetailIntegrityAccordion(projected.integrityScope);
  renderDetailPolicyAccordion(claim);
  renderDetailMetadata(claim, detail);
}

function renderDetailValue(claim) {
  const val = formatValue(claim.value);
  if (val) {
    el("detailValue").textContent = typeof claim.value === "object"
      ? JSON.stringify(claim.value, null, 2) : val;
    show("detailValueBlock");
  } else {
    hide("detailValueBlock");
  }
}

function renderDetailFilesAccordion(evidence) {
  const files = evidence[0]?.metadata?.files ?? [];
  if (files.length) {
    const shown = files.slice(0, 15);
    el("detailFiles").innerHTML =
      shown.map(f => `<code class="file-chip">${esc(f)}</code>`).join("") +
      (files.length > 15
        ? `<span class="more-note">+${files.length - 15} more</span>`
        : "");
    show("detailFilesAccordion");
  } else {
    hide("detailFilesAccordion");
  }
}

function renderDetailIntegrityAccordion(integrityScope) {
  const integrityHtml = renderIntegrityScope(integrityScope);
  if (integrityHtml) {
    el("detailIntegrity").innerHTML = integrityHtml;
    show("detailIntegrityAccordion");
  } else {
    hide("detailIntegrityAccordion");
  }
}

function renderDetailPolicyAccordion(claim) {
  const policyEl = el("detailPolicy");
  if (policyEl) policyEl.textContent = claim.verificationPolicyId ?? "—";
}

function renderDetailMetadata(claim, detail) {
  el("detailMetadata").textContent =
    JSON.stringify({
      claim,
      evidence: detail.evidence,
      transparencyGaps: detail.transparencyGaps,
      policy: detail.policy ?? null,
    }, null, 2);
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
