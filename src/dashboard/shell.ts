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
      <p class="dash-eyebrow">Surface</p>
      <div class="dash-title-row">
        <h1 id="projectName">Loading…</h1>
        <span class="run-label" id="runLabel" hidden></span>
      </div>
      <div class="dash-run-line">
        <p class="dash-run-meta" id="dashRunMeta"></p>
        <div class="run-select" id="runSelect" hidden>
          <button type="button" class="run-trigger" id="runTrigger" aria-haspopup="listbox" aria-expanded="false">
            <span class="run-trigger-label" id="runTriggerLabel"></span>
            <svg class="run-chevron" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="run-dropdown" id="runDropdown" role="listbox" aria-label="Select run"></div>
        </div>
      </div>
    </div>
    <div class="dash-metrics-row">
      <canvas id="statusDonut" class="status-donut" width="52" height="52" aria-hidden="true"></canvas>
      <div id="dashboardMetrics" class="dash-metrics"></div>
    </div>
  </header>

  <div class="dash-layout">
  <div class="dash-body">
    <div class="dash-toolbar">
      <div class="toolbar-top">
        <div id="surfaceChips" class="chip-strip" role="group" aria-label="Filter by surface"></div>
        <button class="btn-add-claim" id="addClaimBtn" type="button">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Claim
        </button>
      </div>
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
      <p id="detailDescription" class="sheet-description" hidden></p>
      <p id="detailSubtitle" class="sheet-subtitle"></p>

      <div id="detailFaultBlock" class="sheet-section" hidden>
        <p class="section-label">What went wrong ${helpHint("What went wrong", "Fault lines are the reasons this claim needs attention. They explain what prevented the claim from being cleanly verified, such as missing provenance, stale proof, a conflict, or an unmet policy requirement.")}</p>
        <div id="detailFaults"></div>
      </div>

      <div id="detailPolicyGapBlock" class="sheet-section" hidden>
        <p class="section-label">Verification gap ${helpHint("Verification gap", "Compares what the policy requires against what was actually collected. Missing rows mean the producer did not emit the evidence Surface needs to evaluate this claim.")}</p>
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
        <p class="section-label">Evidence summary ${helpHint("Evidence summary", "The excerpt or summary from the evidence artifact for this claim. Use it to understand what the producer observed and whether the evidence is still applicable to the current state.")}</p>
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
  </div><!-- /.dash-layout -->

  <div class="sheet-backdrop" id="sheetBackdrop" hidden></div>

  <dialog class="claim-modal" id="claimModal" aria-label="Add or edit claim">
    <form id="claimForm" method="dialog">
      <h2 class="modal-title" id="claimModalTitle">Add claim</h2>
      <div class="modal-body">
        <input id="claimIdInput" type="hidden">
        <div class="form-field">
          <label for="claimTypeSelect">Claim type ${helpHint("Claim type", "The category of claim. Different types activate different evidence collection and verification rules. Use 'software-proof' for automated tooling results.")}</label>
          <select id="claimTypeSelect" required></select>
          <p class="field-hint" id="claimTypeHint"></p>
        </div>
        <div class="form-field">
          <label for="claimSurfaceInput">Surface ${helpHint("Surface", "The logical boundary this claim belongs to — usually a repository, service, or product name. Claims are grouped and filtered by surface in the dashboard.")}</label>
          <input id="claimSurfaceInput" type="text" required autocomplete="off">
        </div>
        <div class="form-field">
          <label for="claimFieldInput">Field or behavior ${helpHint("Field or behavior", "The specific property or behavior being claimed. This becomes the display name in the feed. Be specific — 'unit test coverage ≥ 80%' is better than 'test coverage'.")}</label>
          <input id="claimFieldInput" type="text" required autocomplete="off" placeholder="e.g. unit test coverage">
        </div>
        <div class="form-field">
          <label for="claimSubjectTypeInput">Subject type ${helpHint("Subject type", "The kind of entity being evaluated. Common values: 'repository', 'pull-request', 'service', 'artifact'. Determines how the claim is scoped and reported.")}</label>
          <input id="claimSubjectTypeInput" type="text" required autocomplete="off" placeholder="e.g. repository">
        </div>
        <div class="form-field">
          <label for="claimSubjectIdInput">Subject ID ${helpHint("Subject ID", "The specific identifier for the entity being evaluated — e.g. the repository slug, PR number, or service name. Used to correlate claims with evidence.")}</label>
          <input id="claimSubjectIdInput" type="text" required autocomplete="off">
        </div>
        <div class="form-field">
          <label for="claimImpactSelect">Impact level ${helpHint("Impact level", "How important this claim is to your trust posture. High and critical claims are prioritized in attention reports and may block verification gates.")}</label>
          <select id="claimImpactSelect">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="form-field">
          <label for="claimPolicyInput">Policy ID ${helpHint("Policy ID", "The verification policy governing how this claim is evaluated. Leave blank to use the claim type's default. Policies define required evidence types, methods, and acceptance criteria.")}</label>
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
