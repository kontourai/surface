import type { SurfaceConsoleRuntimeConfig } from "./types.js";

export function buildConsoleHtml(config: SurfaceConsoleRuntimeConfig = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Surface Console</title>
  <link rel="stylesheet" href="/console.css">
  <script>
    (function(){
      var stored = localStorage.getItem("surface-theme");
      var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var theme = stored || (prefersDark ? "dark" : "light");
      if (theme === "light") document.documentElement.setAttribute("data-theme","light");
      else document.documentElement.setAttribute("data-theme","dark");
    })();
  </script>
</head>
<body class="console-page theme-surface">
  <header class="dash-header">
    <div class="dash-brand">
      <p class="dash-eyebrow">
        <svg class="brand-mark" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3.5 20.5 8 12 12.5 3.5 8Z"/>
          <path d="M3.5 12 12 16.5 20.5 12"/>
          <path d="M3.5 16 12 20.5 20.5 16"/>
        </svg>
        Surface
      </p>
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
      <div id="consoleMetrics" class="dash-metrics"></div>
      <span class="live-indicator" id="liveIndicator" data-live-state="connecting" aria-label="Connecting to live refresh…" title="Connecting to live refresh…"></span>
      <button type="button" class="theme-toggle" id="themeToggle" aria-label="Toggle light/dark theme">
        <svg class="icon-moon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M12.5 9A6 6 0 015 1.5a6 6 0 100 11 6 6 0 007.5-3.5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg class="icon-sun" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/>
          <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.93 2.93l.7.7M10.37 10.37l.7.7M2.93 11.07l.7-.7M10.37 3.63l.7-.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
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
          <option value="assumed">Assumed</option>
          <option value="proposed">Proposed</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
    </div>

    <p class="feed-count" id="feedCount" aria-live="polite"></p>
    <div id="claimFeed" class="claim-feed"></div>
  </div>

  <aside class="detail-sheet" id="detailSheet" hidden aria-label="Claim detail" aria-live="polite">
    <div class="sheet-drag" role="presentation" id="sheetDrag"></div>
    <button class="sheet-close" id="sheetClose" aria-label="Close detail">✕</button>
    <div class="sheet-scroll">

      <!-- (a) Big status + freshness header -->
      <div class="sheet-top">
        <span class="status-badge detail-badge-lg" id="detailBadge">—</span>
        <span class="sheet-surface" id="detailSurface"></span>
      </div>
      <p class="detail-freshness" id="detailFreshness" hidden></p>
      <h2 id="detailTitle" class="sheet-title">Claim detail</h2>
      <p id="detailSubtitle" class="sheet-subtitle"></p>
      <p id="detailDescription" class="sheet-description" hidden></p>

      <div id="detailDivergenceBlock" class="sheet-section divergence-banner" hidden>
        <p id="detailDivergenceBanner"></p>
      </div>

      <!-- (c) Gaps as alert section — "Why this isn't verified" for blocking -->
      <div id="detailGapBlock" class="sheet-section detail-gap-alert" hidden>
        <p class="section-label" id="detailGapLabel">Why this isn't verified ${helpHint("Transparency gaps", "Transparency gaps explain what prevented the claim from being cleanly verified, such as missing provenance, stale evidence, a conflict, or an unmet policy requirement.")}</p>
        <div id="detailGaps"></div>
      </div>

      <div id="detailPolicyGapBlock" class="sheet-section" hidden>
        <p class="section-label">Verification gap ${helpHint("Verification gap", "Compares what the policy requires against what was actually collected. Missing rows mean the producer did not emit the evidence Surface needs to evaluate this claim.")}</p>
        <div id="detailPolicyGap" class="gap-table"></div>
      </div>

      <!-- (b) Unified "What was checked" — evidence summary + observed result merged -->
      <div id="detailWhatWasCheckedBlock" class="sheet-section" hidden>
        <p class="section-label">What was checked ${helpHint("What was checked", "The evidence collected for this claim: what the producer observed, the pass/fail summary, and any command output. This merges the evidence summary and observed result so the same information appears only once.")}</p>
        <div id="detailWhatWasChecked"></div>
      </div>

      <div id="detailActionsBlock" class="sheet-section" hidden>
        <p class="section-label">Suggested actions ${helpHint("Suggested actions", "Actions are producer-supplied remediation hints. They are not automatic fixes; they help reviewers decide whether to refresh evidence, change code, improve configuration, or intentionally accept the finding.")}</p>
        <div id="detailActions" class="action-list"></div>
      </div>

      <div id="detailValueBlock" class="sheet-section" hidden>
        <p class="section-label">Expected value ${helpHint("Expected value", "This is the value being asserted by the claim. For automated evidence checks, it should describe the desired outcome, not the command used to collect evidence.")}</p>
        <code id="detailValue" class="mono-block"></code>
      </div>

      <!-- (d) Secondary detail in collapsed <details> accordions -->
      <details class="sheet-accordion" id="detailFilesAccordion" hidden>
        <summary>Files in scope ${helpHint("Files in scope", "These files were part of the producer run or evidence artifact. They help you understand the blast radius of the claim and whether the evidence applies to the work you are reviewing.")}</summary>
        <div id="detailFiles" class="file-chips sheet-accordion-body"></div>
      </details>

      <details class="sheet-accordion" id="detailIntegrityAccordion" hidden>
        <summary>Evidence anchors ${helpHint("Evidence anchors", "Shows what this claim's evidence is anchored to — the source revision, working tree digest, file hashes, or producer configuration hashes. Use it to decide whether verified evidence still applies to the current state.")}</summary>
        <div id="detailIntegrity" class="integrity-scope sheet-accordion-body"></div>
      </details>

      <details class="sheet-accordion">
        <summary>Verification rule ${helpHint("Verification rule", "This is the Surface rule used to judge the claim. Producers such as Veritas can map this to higher-level concepts like Evidence Checks, governance gates, or plugin-owned checks.")}</summary>
        <div class="sheet-accordion-body">
          <code id="detailPolicy">—</code>
        </div>
      </details>

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
          <label for="claimTypeSelect">Claim type ${helpHint("Claim type", "The category of claim. Different types activate different evidence collection and verification rules. Use a producer-specific claim type for automated tooling results.")}</label>
          <select id="claimTypeSelect" required></select>
          <p class="field-hint" id="claimTypeHint"></p>
        </div>
        <div class="form-field">
          <label for="claimSurfaceInput">Surface ${helpHint("Surface", "The logical boundary this claim belongs to — usually a repository, service, or product name. Claims are grouped and filtered by surface in the console.")}</label>
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

  <dialog class="claim-modal delete-confirm-modal" id="deleteConfirmModal" aria-label="Delete claim confirmation">
    <form method="dialog">
      <h2 class="modal-title">Delete claim?</h2>
      <div class="modal-body">
        <p class="delete-confirm-copy">This removes the authored claim from the local claim store. Generated run evidence and reports are not deleted.</p>
        <code id="deleteConfirmClaimId" class="mono-block"></code>
        <p class="field-hint" id="deleteConfirmError" hidden></p>
      </div>
      <div class="modal-actions">
        <button type="button" id="deleteConfirmCancel">Cancel</button>
        <button type="button" class="btn-danger" id="deleteConfirmSubmit">Delete claim</button>
      </div>
    </form>
  </dialog>

  <script>window.__SURFACE_CONFIG__ = ${JSON.stringify(config).replace(/</g, "\\u003c")};</script>
  <script src="/console.js"></script>
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
