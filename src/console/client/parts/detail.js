function showClaimDetail(claim, readModel, cardEl, pushHistory = true) {
  currentDetailClaim = claim;
  document.querySelectorAll(".claim-card.card-selected").forEach(c => c.classList.remove("card-selected"));
  if (cardEl) cardEl.classList.add("card-selected");
  const detail = collectClaimDetailContext(claim, readModel);
  renderDetailHeader(claim, detail.evidence, detail.policy);
  renderDetailSheetActions(claim);
  renderDetailDivergence(claim);
  renderDetailGuidance(claim, detail.evidence, readModel);
  renderDetailGaps(detail.transparencyGaps, detail.claimGaps);
  renderDetailPolicyGap(claim, detail.policy);
  renderDetailValue(claim);
  renderDetailObservedResults(detail.evidence);
  renderDetailActions(claim);
  renderDetailEvidenceSummary(detail.evidence);
  renderDetailFiles(detail.evidence);
  renderDetailIntegrity(claim, detail.evidence);
  el("detailPolicy").textContent = claim.verificationPolicyId ?? "—";
  renderDetailMetadata(claim, detail);

  if (pushHistory) pushUrlState();
  openSheet();
}

function collectClaimDetailContext(claim, readModel) {
  const allEvidence = readModel?.evidence ?? [];
  const allTransparencyGaps = readModel?.transparencyGaps ?? [];
  const allPolicies = readModel?.policies ?? [];
  const allGaps = readModel?.analytics?.evidenceRequirementGaps ?? [];
  return {
    evidence: allEvidence.filter(e => claim.evidenceIds?.includes(e.id)),
    transparencyGaps: allTransparencyGaps.filter(fl =>
      claim.transparencyGapIds?.includes(fl.id) || fl.claimId === claim.id
    ),
    policy: allPolicies.find(p => p.id === claim.verificationPolicyId),
    claimGaps: allGaps.filter(g => g.claimId === claim.id),
  };
}

function renderDetailHeader(claim, evidence, policy) {
  el("detailBadge").textContent = statusLabel(claim.status, evidence.length);
  el("detailBadge").className   = "status-badge badge-" + statusColor(claim.status);
  el("detailSurface").textContent = surfaceLabel(claim.surface);
  el("detailTitle").textContent   = claim.fieldOrBehavior || claim.claimType || "—";
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

function renderDetailGuidance(claim, evidence, readModel) {
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
      (guidance ? `<p class="guidance-text">${esc(guidance)}</p>` : "") +
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

function renderDetailGaps(transparencyGaps, claimGaps) {
  const allGapItems = [
    ...transparencyGaps.map(fl => ({ ...fl })),
    ...claimGaps.filter(g => !transparencyGaps.some(fl => fl.type === g.gapType))
  ];

  if (allGapItems.length) {
    el("detailGaps").innerHTML = allGapItems.map(item => {
      const classified = classifyGap(item.type ?? item.gapType, item.message);
      const kindLabel  = gapKindLabel[classified.kind] ?? classified.kind;
      return `<div class="gap-item gap-${esc(item.severity ?? "medium")} gap-kind-${esc(classified.kind)}">
        <div class="gap-head">
          <span class="gap-kind">${esc(kindLabel)}</span>
          <span class="gap-type">${esc(classified.title)}</span>
          ${item.blocking === false ? `<span class="nonblocking-pill">non-blocking</span>` : ""}
        </div>
        <p class="gap-msg">${esc(item.message ?? "")}</p>
        ${classified.hint ? `<p class="gap-hint">${esc(classified.hint)}</p>` : ""}
      </div>`;
    }).join("");
    show("detailGapBlock");
  } else {
    hide("detailGapBlock");
  }
}

function renderDetailPolicyGap(claim, policy) {
  const gap = policyGapAnalysis(claim, policy);
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

function renderDetailObservedResults(evidence) {
  const observedResults = evidence.map(observedResultForEvidence).filter(Boolean);
  if (observedResults.length) {
    el("detailObserved").innerHTML = observedResults.map(renderObservedResult).join("");
    show("detailObservedBlock");
  } else {
    hide("detailObservedBlock");
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

function renderDetailEvidenceSummary(evidence) {
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
}

function renderDetailFiles(evidence) {
  const files = evidence[0]?.metadata?.files ?? [];
  if (files.length) {
    const shown = files.slice(0, 15);
    el("detailFiles").innerHTML =
      shown.map(f => `<code class="file-chip">${esc(f)}</code>`).join("") +
      (files.length > 15
        ? `<span class="more-note">+${files.length - 15} more</span>`
        : "");
    show("detailFilesBlock");
  } else {
    hide("detailFilesBlock");
  }
}

function renderDetailIntegrity(claim, evidence) {
  const integrityDetails = collectIntegrityDetails(claim, evidence);
  const integrityHtml = renderIntegrityScope(integrityDetails);
  if (integrityHtml) {
    el("detailIntegrity").innerHTML = integrityHtml;
    show("detailIntegrityBlock");
  } else {
    hide("detailIntegrityBlock");
  }
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
