import type { SurfaceDashboardRuntimeConfig } from "./types.js";

export function buildDashboardHtml(config: SurfaceDashboardRuntimeConfig = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Surface Dashboard</title>
  <link rel="stylesheet" href="/dashboard.css">
</head>
<body class="dashboard-page">
  <header class="dash-header">
    <div class="dash-brand">
      <p class="dash-eyebrow">Surface dashboard</p>
      <h1 id="projectName">Loading…</h1>
    </div>
    <div id="dashboardMetrics" class="dash-metrics"></div>
    <dl class="dash-run">
      <div><dt>Run</dt><dd id="runId">—</dd></div>
      <div><dt>Source</dt><dd id="runSource">—</dd></div>
      <div><dt>Scope</dt><dd id="runScope">—</dd></div>
    </dl>
  </header>

  <div class="dash-body">
    <div class="dash-toolbar">
      <div id="surfaceChips" class="chip-strip" role="group" aria-label="Filter by surface"></div>
      <div class="search-row">
        <input id="claimSearch" type="search" placeholder="Search claims…" autocomplete="off" aria-label="Search claims">
        <select id="statusFilter" aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="attention">Needs attention</option>
          <option value="verified">Verified</option>
          <option value="disputed">Disputed</option>
          <option value="stale">Stale</option>
          <option value="proposed">Proposed</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      <div class="toolbar-actions">
        <button class="btn-primary" id="addClaimBtn" type="button">Add claim</button>
      </div>
    </div>

    <div class="attention-band" id="attentionBand" hidden>
      <div class="band-icon" aria-hidden="true">!</div>
      <div class="band-body">
        <strong id="attentionTitle"></strong>
        <p id="priorityNarrative"></p>
      </div>
    </div>

    <p class="feed-count" id="feedCount" aria-live="polite"></p>
    <div id="claimFeed" class="claim-feed"></div>
  </div>

  <div class="sheet-backdrop" id="sheetBackdrop" hidden></div>
  <aside class="detail-sheet" id="detailSheet" hidden aria-label="Claim detail" aria-live="polite">
    <div class="sheet-drag" role="presentation" id="sheetDrag"></div>
    <button class="sheet-close" id="sheetClose" aria-label="Close detail">✕</button>
    <div class="sheet-scroll">
      <div class="sheet-top">
        <span class="status-badge" id="detailBadge">—</span>
        <span class="sheet-surface" id="detailSurface"></span>
      </div>
      <div id="detailDivergenceBlock" class="sheet-section divergence-banner" hidden>
        <p id="detailDivergenceBanner"></p>
      </div>
      <h2 id="detailTitle" class="sheet-title">Claim detail</h2>
      <p id="detailSubtitle" class="sheet-subtitle"></p>

      <div id="detailFaultBlock" class="sheet-section" hidden>
        <p class="section-label">What went wrong ${helpHint("What went wrong", "Fault lines are the reasons this claim needs attention. They explain what prevented the claim from being cleanly verified, such as missing provenance, stale proof, a conflict, or an unmet policy requirement.")}</p>
        <div id="detailFaults"></div>
      </div>

      <div id="detailPolicyGapBlock" class="sheet-section" hidden>
        <p class="section-label">Verification requirements vs collected evidence ${helpHint("Verification requirements vs collected evidence", "This compares what the verification rule requires with the evidence collected for this claim. Missing rows usually mean the producer or plugin did not emit the evidence Surface needs to evaluate the claim.")}</p>
        <div id="detailPolicyGap" class="gap-table"></div>
      </div>

      <div id="detailValueBlock" class="sheet-section" hidden>
        <p class="section-label">Expected value ${helpHint("Expected value", "This is the value being asserted by the claim. For proof lanes, it should describe the desired outcome, not the command used to collect evidence.")}</p>
        <code id="detailValue" class="mono-block"></code>
      </div>

      <div id="detailObservedBlock" class="sheet-section" hidden>
        <p class="section-label">Observed result ${helpHint("Observed result", "This is what the evidence collector observed when it ran. For proof lanes, it includes the pass/fail summary and command output when the producer captured it.")}</p>
        <div id="detailObserved"></div>
      </div>

      <div id="detailActionsBlock" class="sheet-section" hidden>
        <p class="section-label">Suggested actions ${helpHint("Suggested actions", "Actions are producer-supplied remediation hints. They are not automatic fixes; they help reviewers decide whether to refresh evidence, change code, improve configuration, or intentionally accept the finding.")}</p>
        <div id="detailActions" class="action-list"></div>
      </div>

      <div class="sheet-section">
        <p class="section-label">Evidence ${helpHint("Evidence", "Evidence is the artifact behind this claim. It proves the dashboard is showing an observed result, not a placeholder or guess. Use it to trace where the claim came from, when it was collected, and what source state it applies to.")}</p>
        <p id="detailEvidence">—</p>
        <div id="detailPluginAttribution" class="plugin-attribution" hidden></div>
      </div>

      <div id="detailFilesBlock" class="sheet-section" hidden>
        <p class="section-label">Files in scope ${helpHint("Files in scope", "These files were part of the producer run or evidence artifact. They help you understand the blast radius of the claim and whether the evidence applies to the work you are reviewing.")}</p>
        <div id="detailFiles" class="file-chips"></div>
      </div>

      <div class="sheet-section">
        <p class="section-label">Verification rule ${helpHint("Verification rule", "This is the Surface rule used to judge the claim. Producers such as Veritas can map this to higher-level concepts like proof lanes, governance gates, or plugin-owned checks.")}</p>
        <code id="detailPolicy">—</code>
      </div>

      <details class="sheet-raw">
        <summary>Raw metadata ${helpHint("Raw metadata", "Raw metadata is the complete audit trail for this detail view. Start with the readable sections above; use the raw JSON when debugging, building automations, or checking the exact source fields.")}</summary>
        <pre id="detailMetadata">{}</pre>
      </details>
    </div>
  </aside>

  <dialog class="claim-modal" id="claimModal" aria-label="Add or edit claim">
    <form id="claimForm" method="dialog">
      <h2 class="modal-title" id="claimModalTitle">Add claim</h2>
      <div class="modal-body">
        <input id="claimIdInput" type="hidden">
        <div class="form-field">
          <label for="claimTypeSelect">Claim type</label>
          <select id="claimTypeSelect" required></select>
          <p class="field-hint" id="claimTypeHint"></p>
        </div>
        <div class="form-field">
          <label for="claimSurfaceInput">Surface</label>
          <input id="claimSurfaceInput" type="text" required autocomplete="off">
        </div>
        <div class="form-field">
          <label for="claimFieldInput">Field or behavior</label>
          <input id="claimFieldInput" type="text" required autocomplete="off" placeholder="e.g. unit test coverage">
        </div>
        <div class="form-field">
          <label for="claimSubjectTypeInput">Subject type</label>
          <input id="claimSubjectTypeInput" type="text" required autocomplete="off" placeholder="e.g. repository">
        </div>
        <div class="form-field">
          <label for="claimSubjectIdInput">Subject ID</label>
          <input id="claimSubjectIdInput" type="text" required autocomplete="off">
        </div>
        <div class="form-field">
          <label for="claimImpactSelect">Impact level</label>
          <select id="claimImpactSelect">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="form-field">
          <label for="claimPolicyInput">Policy ID</label>
          <input id="claimPolicyInput" type="text" autocomplete="off">
        </div>
        <div id="claimMetadataFields"></div>
      </div>
      <div class="modal-actions">
        <button type="button" id="claimModalCancel">Cancel</button>
        <button type="submit" class="btn-primary" id="claimModalSave">Save claim</button>
      </div>
    </form>
  </dialog>

  <script>window.__SURFACE_CONFIG__ = ${JSON.stringify(config).replace(/</g, "\\u003c")};</script>
  <script src="/dashboard.js"></script>
</body>
</html>`;
}

function helpHint(label: string, text: string): string {
  return `<span class="help-wrap"><button type="button" class="help-trigger" aria-label="Help: ${escapeHtml(label)}" aria-expanded="false">?</button><span class="help-popover" role="tooltip">${escapeHtml(text)}</span></span>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
