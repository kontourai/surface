async function refreshConsole(runId, skipHistory = false) {
  currentRunId = runId ?? null;
  const url = runId && runId !== "latest" ? `/api/console-model?run=${encodeURIComponent(runId)}` : "/api/console-model";
  const response = await fetch(url);
  if (!response.ok) {
    currentData = cfg.emptyConsoleModel;
  } else {
    currentData = await response.json();
  }
  renderConsole();
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
    await refreshConsole(urlRun, true).catch(() => {});
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
    return `<button type="button" class="run-option${isActive ? " run-option-active" : ""}"
      role="option" aria-selected="${isActive}" data-run-id="${esc(r.runId)}">
      <span class="run-opt-date">${esc(date || r.runId)}</span>
      <span class="run-opt-stats">${esc(r.verifiedCount + " verified · " + r.claimCount + " total")}</span>
      <span class="run-opt-id">${esc(r.runId)}</span>
    </button>`;
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
      refreshConsole(btn.dataset.runId).catch(err => window.alert(err.message));
    });
  });
}

// ── boot ───────────────────────────────────────────────
const _bootUrl = getUrlState();
applyUrlFilters(_bootUrl);
updateConsoleChromeMetrics();
window.addEventListener("resize", updateConsoleChromeMetrics);

currentRunId = _bootUrl.run ?? null;
currentData = cfg.consoleModel ?? cfg.emptyConsoleModel;
renderConsole();
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
    const _bcard = document.querySelector(`[data-claim-index="${_bi}"]`);
    showClaimDetail(_bc, currentData.readModel, _bcard, false);
  }
}
pushUrlState(true);
loadRunList();
