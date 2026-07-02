function renderConsole() {
  const d = currentData;
  renderProjectChrome(d);
  renderProducerBar(d);
  if (d.claims?.length) renderDonut(d);
  renderMetrics(d);
  renderAttentionChip(d);
  renderCollisions(d);
  renderSurfaceChips(d);
  renderFeed(d);
  buildClaimTypeOptions();
  bindConsoleFilters(d);
}

// ── multi-producer attribution bar ─────────────────────
// Lists the distinct producers whose bundles were merged into this view. Hidden
// for a single-producer read model (d.producers empty).
function renderProducerBar(d) {
  const bar = el("producerBar");
  if (!bar) return;
  const producers = d.producers ?? [];
  if (!producers.length) {
    bar.setAttribute("hidden", "");
    bar.innerHTML = "";
    return;
  }
  bar.removeAttribute("hidden");
  bar.innerHTML = `<span class="producer-bar-label">${producers.length} producer${producers.length !== 1 ? "s" : ""}</span>` +
    producers.map(p => `<span class="producer-chip" data-producer="${esc(p)}">${esc(p)}</span>`).join("");
}

// ── merge collision section ────────────────────────────
// Surfaces same-id/different-content collisions between producers. Losing
// content is reported here, never silently dropped (merge.md §6). Hidden when
// there are no collisions.
function renderCollisions(d) {
  const section = el("collisionSection");
  if (!section) return;
  const collisions = d.collisions ?? [];
  if (!collisions.length) {
    section.setAttribute("hidden", "");
    section.innerHTML = "";
    return;
  }
  section.removeAttribute("hidden");
  const items = collisions.map(c => {
    const producers = c.withinBundle
      ? `within ${esc(c.keptProducer)}`
      : `${esc(c.keptProducer)} <span class="collision-vs">vs</span> ${esc(c.droppedProducer)}`;
    return `<li class="collision-item" data-collision-id="${esc(c.id)}">
      <span class="collision-badge">${esc(c.collection)}</span>
      <code class="collision-id">${esc(c.id)}</code>
      <span class="collision-producers">${producers}</span>
    </li>`;
  }).join("");
  section.innerHTML = `<div class="collision-head">
      <h2 class="collision-title">Merge collisions</h2>
      <span class="collision-count">${collisions.length}</span>
    </div>
    <p class="collision-help">Same id, different content across producers. The lexicographically-first content is kept; every losing record is reported here, never silently dropped.</p>
    <ul class="collision-list">${items}</ul>`;
}

function renderProjectChrome(d) {
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
}

function setStatusFilter(value, d) {
  filters.status = value;
  el("statusFilter").value = filters.status;
  el("consoleMetrics")?.querySelectorAll("[data-metric-filter]").forEach(c => {
    c.classList.toggle("metric-chip-active", filters.status === c.dataset.metricFilter);
  });
  renderFeed(d);
  pushUrlState();
}

function renderMetrics(d) {
  const metricsEl = el("consoleMetrics");
  metricsEl.innerHTML = d.metrics.map(metric => {
    const label = Array.isArray(metric) ? metric[0] : metric.label;
    const value = Array.isArray(metric) ? metric[1] : metric.value;
    const delta = Array.isArray(metric) ? metric[3] : metric.delta;
    const color = Array.isArray(metric) ? metric[4] : metric.color;
    const filterVal = Array.isArray(metric) ? metric[5] : metric.filter;
    return `<button type="button" class="metric-chip metric-${esc(color)}${filters.status === filterVal ? " metric-chip-active" : ""}"
      data-metric-filter="${esc(filterVal ?? "all")}" title="Filter to ${esc(String(label).toLowerCase())}">
      <span class="mc-value" data-count="${esc(value)}">${esc(value)}</span>
      <span class="mc-label">${esc(label)}</span>
      ${delta ? `<span class="mc-delta">${esc(delta)}</span>` : ""}
    </button>`
  }).join("");
  metricsEl.querySelectorAll("[data-metric-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      const f = chip.dataset.metricFilter;
      setStatusFilter(filters.status === f ? "all" : f, d);
    });
  });
  metricsEl.querySelectorAll("[data-count]").forEach(span => animateCount(span, span.dataset.count));
}

// ── attention chip ─────────────────────────────────────
// Compact alert badge injected next to the metrics chips.
// The full narrative is exposed as a tooltip/aria-label for
// screen-reader users and keyboard-hover sighted users.
function renderAttentionChip(d) {
  const metricsEl = el("consoleMetrics");
  if (!metricsEl) return;

  // Remove any previously-rendered chip first so re-renders are idempotent.
  metricsEl.querySelector(".attention-chip")?.remove();

  const attention = (d.claims ?? []).filter(c =>
    ["disputed","stale","rejected","unknown"].includes(c.status)
  );
  if (!attention.length) return;

  const count = attention.length;
  const narrative = d.narrative ?? (count + " claim" + (count !== 1 ? "s" : "") + " need" + (count !== 1 ? "" : "s") + " attention");
  const isActive = filters.status === "attention";

  const chip = document.createElement("button");
  chip.type = "button";
  chip.id = "attentionChip";
  chip.className = "attention-chip" + (isActive ? " attention-chip-active" : "");
  chip.setAttribute("aria-label", narrative);
  chip.title = narrative;
  chip.innerHTML = `<span class="attention-chip-icon" aria-hidden="true">!</span><span class="attention-chip-count">${esc(String(count))}</span>`;

  chip.addEventListener("click", () => {
    setStatusFilter(filters.status === "attention" ? "all" : "attention", d);
    // Update active state in-place.
    chip.classList.toggle("attention-chip-active", filters.status === "attention");
  });

  metricsEl.appendChild(chip);
}

function bindConsoleFilters(d) {
  el("claimSearch").addEventListener("input", e => {
    filters.search = e.target.value;
    renderFeed(d);
    pushUrlState();
  });
  el("statusFilter").addEventListener("change", e => {
    setStatusFilter(e.target.value, d);
  });
}

// ── facet chips (rendered into the legacy "surfaceChips" DOM id/CSS hooks —
// UI-level naming only, not the wire field) ────────────────────────────────
function renderSurfaceChips(d) {
  const facets = Object.keys(d.facetCounts ?? {});
  el("surfaceChips").innerHTML = [
    chipBtn("all", "All", d.claims?.length ?? 0),
    ...facets.map(s => chipBtn(s, surfaceLabel(s), d.facetCounts[s]))
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
  return `<button type="button" class="chip${active}" data-surface="${esc(value)}">${esc(label)} <span class="chip-count">${count}</span></button>`;
}

// ── claim feed ─────────────────────────────────────────
function renderFeed(d) {
  const visible = filterClaims(d.claims ?? []);
  el("feedCount").textContent =
    visible.length + " of " + (d.claims?.length ?? 0) + " claims";
  if (visible.length) {
    el("claimFeed").innerHTML = visible.map((c, i) => claimCard(c, d.claims.indexOf(c), i)).join("");
  } else if (d.claims?.length) {
    el("claimFeed").innerHTML = `<p class="empty-state">No claims match the current filters.</p>`;
  } else {
    // Zero-claims empty state — designed with producer command
    el("claimFeed").innerHTML = `<div class="empty-state empty-state--setup" id="emptyStateSetup">
      <p class="empty-setup-title">No claims yet</p>
      <p class="empty-setup-body">The Surface Console shows the trust state of your project — verified claims, stale evidence, and transparency gaps. Run your producer to emit a first claim.</p>
      <div class="empty-setup-cmd-row">
        <code class="empty-setup-cmd" id="emptyStateCmd">npx surface console</code>
        <button type="button" class="empty-setup-copy-btn" data-copy-cmd="npx surface console" aria-label="Copy producer command">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="1" y="3" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M3 3V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>
      <p class="empty-setup-hint">After your producer writes a run snapshot, this console will populate automatically on the next refresh. See the <a class="empty-setup-link" href="https://kontourai.io/surface/docs/guides/getting-started" target="_blank" rel="noopener">getting started guide</a> for producer setup.</p>
    </div>`;
    // wire copy button
    el("claimFeed").querySelector(".empty-setup-copy-btn")?.addEventListener("click", function() {
      const cmd = this.dataset.copyCmd ?? "";
      navigator.clipboard?.writeText(cmd).then(() => {
        this.classList.add("copied");
        setTimeout(() => this.classList.remove("copied"), 2000);
      }).catch(() => {});
    });
  }
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
        ? ["stale","disputed","rejected","unknown","assumed","proposed"].includes(c.status)
        : c.status === filters.status);
    const facetOk = filters.surface === "all" || (c.facet ?? c.surface) === filters.surface;
    const hay = [c.id, c.status, c.facet ?? c.surface, c.claimType, c.fieldOrBehavior,
                 c.verificationPolicyId, c.subjectId].join(" ").toLowerCase();
    return statusOk && facetOk && (!q || hay.includes(q));
  });
}

function claimCard(claim, index, visibleIndex = 0) {
  const isAttention = ["disputed","stale","rejected"].includes(claim.status);
  const label  = claim.fieldOrBehavior || claim.claimType || claim.id;
  const surface = surfaceLabel(claim.facet ?? claim.surface);
  const gaps = claim.transparencyGapIds?.length ?? 0;
  const color  = statusColor(claim.status);
  const impact = claim.impactLevel;
  const showImpact = impact === "medium" || impact === "high" || impact === "critical";

  // claim.id is removed from the card face but preserved for findability via
  // title attribute (tooltip on hover) and aria-label.
  return `<button type="button" class="claim-card${confidenceTier(claim)}${isAttention ? " card-attention" : ""}"
      data-claim-index="${index}" aria-label="${esc(label + " — " + statusLabel(claim.status, claimEvidenceCount(claim)))}"
      title="${esc(claim.id)}" style="--card-i:${Math.min(visibleIndex, 14)}">
    <span class="card-dot dot-${color}" aria-hidden="true"></span>
    <span class="card-body">
      <strong class="card-title">${esc(label)}</strong>
      <span class="card-meta">
        <span class="card-status-text status-${esc(claim.status)}">${esc(statusLabel(claim.status, claimEvidenceCount(claim)))}</span>
        <span class="card-surface card-surface--narrow-hide">${esc(surface)}</span>
        ${(claim.producers && claim.producers.length)
          ? `<span class="card-producers" title="Attributed to ${esc(claim.producers.join(", "))}">${claim.producers.map(p => `<span class="card-producer">${esc(p)}</span>`).join("")}</span>`
          : ""}
        ${showImpact ? `<span class="card-impact card-impact--${esc(impact)}">${esc(impact)}</span>` : ""}
        ${claim.producerStatus
          ? `<span class="card-divergence" title="Producer declared ${esc(claim.producerStatus)}">! was ${esc(claim.producerStatus)}</span>`
          : ""}
        ${gaps ? `<span class="card-gaps">${gaps} gap${gaps !== 1 ? "s" : ""}</span>` : ""}
      </span>
    </span>
    <span class="card-chevron" aria-hidden="true">›</span>
  </button>`;
}

// ── detail sheet ───────────────────────────────────────
