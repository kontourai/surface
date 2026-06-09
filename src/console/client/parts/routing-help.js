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
  el("consoleMetrics")?.querySelectorAll("[data-metric-filter]").forEach(c => {
    c.classList.toggle("metric-chip-active", filters.status === c.dataset.metricFilter);
  });
  if (state.claimId) {
    const claim = currentData.claims?.find(c => c.id === state.claimId);
    if (claim) {
      const idx = currentData.claims.indexOf(claim);
      const cardEl = document.querySelector(`[data-claim-index="${idx}"]`);
      showClaimDetail(claim, currentData.readModel, cardEl, false);
    } else {
      closeSheet(false);
    }
  } else {
    closeSheet(false);
  }
  if (state.run && state.run !== currentRunId) {
    refreshConsole(state.run, true).catch(() => {});
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
