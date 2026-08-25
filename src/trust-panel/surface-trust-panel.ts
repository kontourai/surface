import { buildBasisPanelViewModel, type BasisPanelViewModel } from "../basis/view.js";

// <surface-trust-panel> — a dependency-free, read-only Trust Panel custom element.
//
// Renders a derived Kontour Surface TrustReport (the output of `surface report`
// or `buildTrustReport`) so a viewer can inspect claims, evidence, freshness,
// and transparency gaps before relying on them. The element never mutates or
// re-derives trust state; it only displays what the kernel derived.
//
// The compiled dist/src/trust-panel/surface-trust-panel.js is a self-contained
// ES module with no imports — load it with <script type="module">. It reads
// untrusted pasted JSON, so the local shapes below stay loose and every
// rendered value is escaped.
//
// Usage:
//   <script type="module" src="surface-trust-panel.js"></script>
//   <surface-trust-panel></surface-trust-panel>
//   document.querySelector("surface-trust-panel").report = reportJson;
// or
//   <surface-trust-panel src="./report.json"></surface-trust-panel>

interface TrustPanelClaim {
  id?: unknown;
  status?: unknown;
  subjectType?: unknown;
  subjectId?: unknown;
  facet?: unknown;
  /**
   * @deprecated Legacy pre-rename field name (Hachure facet rename, 0.9.0).
   * Read-only fallback for pasted legacy-format reports; never written.
   */
  surface?: unknown;
  fieldOrBehavior?: unknown;
  value?: unknown;
  impactLevel?: unknown;
  verificationPolicyId?: unknown;
}

interface TrustPanelEvidence {
  claimId?: unknown;
  evidenceType?: unknown;
  method?: unknown;
  sourceRef?: unknown;
  excerptOrSummary?: unknown;
  /** "entails" (the evidence establishes the claim) or "cited" (referenced only). */
  supportStrength?: unknown;
  /** Whether the evidence passed its own check, when it has one. */
  passing?: unknown;
  /** Whether a non-passing result blocks the claim. */
  blocking?: unknown;
  observedAt?: unknown;
  integrityRef?: unknown;
  integrityAnchor?: { kind?: unknown; value?: unknown; verificationStatus?: unknown };
  /**
   * Producer-owned disclosure state (docs/specs/disclosure-requirements.md:
   * "existing evidence fields remain valid even when visibility is
   * represented through `metadata`"). Read leniently: a producer may put it
   * at `metadata.visibility` or `metadata.disclosure.visibility`.
   */
  metadata?: { visibility?: unknown; disclosure?: { visibility?: unknown } };
}

interface TrustPanelGap {
  claimId?: unknown;
  type?: unknown;
  severity?: unknown;
  message?: unknown;
}

interface TrustPanelReport {
  source?: unknown;
  generatedAt?: unknown;
  claims?: unknown;
  evidence?: unknown;
  transparencyGaps?: unknown;
}

(() => {
  if (typeof customElements === "undefined" || customElements.get("surface-trust-panel")) return;

  // ---------------------------------------------------------------------
  // Display names (#224)
  //
  // These maps are inline copies of the canonical reader-facing display-name
  // tables in src/display-names.ts. This module must stay a dependency-free
  // ES module (the compiled file is loaded directly via <script type="module">
  // with no siblings), so it cannot import the canonical table at runtime.
  // tests/display-names.test.ts extracts these literals from the source AND
  // the generated module and fails the suite if they drift from the canonical
  // module — do not edit one side without the other.
  // ---------------------------------------------------------------------

  const STATUS_LABELS: Record<string, string> = {
    unknown: "No evidence",
    proposed: "Pending review",
    assumed: "Assumed",
    verified: "Verified",
    stale: "Needs refresh",
    disputed: "Disputed",
    superseded: "Superseded",
    rejected: "Rejected",
    revoked: "Revoked",
  };

  const EVIDENCE_TYPE_LABELS: Record<string, string> = {
    source_excerpt: "Source excerpt",
    test_output: "Test output",
    runtime_observation: "Machine-observed at run time",
    human_attestation: "Human sign-off",
    attestation: "Attested statement",
    calculation_trace: "Calculation trace",
    document_citation: "Document citation",
    crawl_observation: "Crawled page capture",
    policy_rule: "Policy rule",
  };

  const METHOD_LABELS: Record<string, string> = {
    observation: "Directly observed",
    extraction: "Extracted from a source",
    validation: "Checked against expectations",
    corroboration: "Corroborated independently",
    attestation: "Vouched for",
    auditability: "Audit-trail backed",
    anchoring: "Tamper-evident",
    monitoring: "Continuously monitored",
  };

  const STATUS_KIND: Record<string, string> = {
    verified: "positive",
    stale: "caution",
    disputed: "negative",
    rejected: "negative",
    revoked: "negative",
    superseded: "neutral",
    unknown: "neutral",
    proposed: "neutral",
    assumed: "caution",
  };

  // ---------------------------------------------------------------------
  // Evidence disclosure
  //
  // docs/specs/minimum-trust-panel.md §Required Sections 3 requires an
  // evidence row to show "evidence summary, type, method, source, observed
  // time, result when supplied, and visibility state". Rendering only
  // type/method/summary made materially different evidence states —
  // entailing and passing, cited-only, entailing but failing, and an
  // observation from years ago — produce byte-identical rows. Every state
  // below therefore renders as a named element, and an absent state renders
  // as an explicit "not stated" rather than as the same row shape as a
  // present one.
  // ---------------------------------------------------------------------

  interface EvidenceFacet {
    /** Machine-readable state for the row's data attribute. */
    state: string;
    /** Human-readable label. */
    label: string;
    /** Chip colour band: positive / caution / negative / neutral. */
    kind: string;
  }

  function supportFacet(value: unknown): EvidenceFacet {
    if (value === "entails") return { state: "entails", label: "Entails the claim", kind: "positive" };
    if (value === "cited") return { state: "cited", label: "Cited only", kind: "caution" };
    if (value === undefined || value === null) {
      return { state: "unstated", label: "Support strength not stated", kind: "neutral" };
    }
    return { state: String(value), label: `Support: ${String(value)}`, kind: "neutral" };
  }

  function resultFacet(passing: unknown, blocking: unknown): EvidenceFacet {
    const blocks = blocking === true;
    if (passing === true) return { state: "passed", label: "Passed", kind: "positive" };
    if (passing === false) {
      return {
        state: blocks ? "failed-blocking" : "failed",
        label: blocks ? "Failed — blocking" : "Failed",
        kind: "negative",
      };
    }
    // Absent `passing` is NOT a pass. It means the evidence carries no result
    // of its own, which a reader must be able to tell apart from one that
    // passed its check.
    return { state: "not-evaluated", label: "Not evaluated", kind: "neutral" };
  }

  function visibilityFacet(item: TrustPanelEvidence): EvidenceFacet {
    const raw = item.metadata?.visibility ?? item.metadata?.disclosure?.visibility;
    if (raw === undefined || raw === null || raw === "") {
      // Per docs/specs/disclosure-requirements.md, private/permissioned/
      // redacted/unavailable evidence must not read as missing — so an
      // undeclared visibility is reported as undeclared, not as "public".
      return { state: "unstated", label: "Visibility not stated", kind: "neutral" };
    }
    const value = String(raw);
    const hidden = ["private", "redacted", "permissioned", "unavailable"].includes(value);
    return { state: value, label: `Visibility: ${value}`, kind: hidden ? "caution" : "neutral" };
  }

  function integrityFacet(item: TrustPanelEvidence): EvidenceFacet | null {
    const anchor = item.integrityAnchor;
    if (!anchor) {
      if (item.integrityRef === undefined || item.integrityRef === null) return null;
      return { state: "ref-only", label: `Integrity ref: ${String(item.integrityRef)}`, kind: "neutral" };
    }
    const status = anchor.verificationStatus === undefined ? "unverified" : String(anchor.verificationStatus);
    const kind =
      status === "verified" ? "positive" : status === "failed" ? "negative" : status === "unverified" ? "caution" : "neutral";
    const anchorKind = anchor.kind === undefined ? "anchor" : String(anchor.kind);
    return { state: status, label: `Integrity ${anchorKind}: ${status}`, kind };
  }

  function observedLabel(value: unknown): string {
    if (value === undefined || value === null || value === "") return "Observed time not supplied";
    return `Observed ${String(value)}`;
  }

  function facetChip(item: EvidenceFacet, field: string): string {
    return `<span class="ev-flag" data-field="${escapeHtml(field)}" data-kind="${escapeHtml(item.kind)}" data-state="${escapeHtml(item.state)}">${escapeHtml(item.label)}</span>`;
  }

  function renderEvidenceItem(item: TrustPanelEvidence): string {
    const support = supportFacet(item.supportStrength);
    const result = resultFacet(item.passing, item.blocking);
    const visibility = visibilityFacet(item);
    const integrity = integrityFacet(item);
    const flags = [facetChip(support, "supportStrength"), facetChip(result, "result"), facetChip(visibility, "visibility")];
    if (integrity) flags.push(facetChip(integrity, "integrity"));

    // Reader-facing text uses the canonical display names (#224); the raw wire
    // enums stay machine-readable on data attributes. An unmapped value falls
    // back to the raw enum rather than an invented name; an absent value is
    // named as absent.
    const rawEvidenceType = asText(item.evidenceType);
    const rawMethod = asText(item.method);
    const evidenceTypeText = rawEvidenceType === "" ? "Evidence type not stated" : EVIDENCE_TYPE_LABELS[rawEvidenceType] ?? rawEvidenceType;
    const methodText = rawMethod === "" ? "method not stated" : METHOD_LABELS[rawMethod] ?? rawMethod;

    return `<li class="evidence" part="evidence-item" data-evidence-type="${escapeHtml(rawEvidenceType)}" data-method="${escapeHtml(rawMethod)}" data-support="${escapeHtml(support.state)}" data-result="${escapeHtml(result.state)}" data-blocking="${item.blocking === true ? "true" : "false"}" data-visibility="${escapeHtml(visibility.state)}"${integrity ? ` data-integrity="${escapeHtml(integrity.state)}"` : ""}>
        <span class="ev-head"><strong>${escapeHtml(evidenceTypeText)}</strong> · ${escapeHtml(methodText)}</span>
        <span class="ev-flags">${flags.join("")}</span>
        <span class="ev-summary">${escapeHtml(asText(item.excerptOrSummary ?? item.sourceRef))}</span>
        <span class="ev-meta">${escapeHtml(asText(item.sourceRef, "no source reference"))} · ${escapeHtml(observedLabel(item.observedAt))}</span>
      </li>`;
  }

  const PANEL_CSS = `
    :host {
      display: block;
      font-family: var(--k-font-ui, system-ui, sans-serif);
      color: var(--k-text, #17201b);
      line-height: 1.5;
    }
    .panel {
      border: 1px solid var(--k-line, rgba(36, 68, 52, 0.16));
      border-radius: 16px;
      background: var(--k-panel, #fffcf1);
      padding: 1rem;
    }
    .panel-header { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; align-items: baseline; }
    .panel-title { margin: 0; font-size: 1.05rem; font-weight: 700; }
    .panel-meta { margin: 0; color: var(--k-text-muted, #657267); font-size: 0.82rem; overflow-wrap: anywhere; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.8rem 0 0.4rem; }
    .chip {
      border: 1px solid var(--k-line, rgba(36, 68, 52, 0.16));
      border-radius: 999px;
      padding: 0.15rem 0.6rem;
      font-size: 0.78rem;
      font-weight: 600;
      background: var(--k-panel-raised, #fbf6e7);
    }
    .chip[data-kind="positive"] { color: var(--k-positive, #0f8f66); }
    .chip[data-kind="caution"] { color: var(--k-caution, #a86612); }
    .chip[data-kind="negative"] { color: var(--k-negative, #c24141); }
    .claim {
      border: 1px solid var(--k-line, rgba(36, 68, 52, 0.16));
      border-radius: 12px;
      margin-top: 0.6rem;
      background: var(--k-panel-raised, #fbf6e7);
    }
    .claim summary {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.6rem;
      align-items: center;
      min-height: 44px;
      padding: 0.45rem 0.75rem;
      cursor: pointer;
      list-style: none;
    }
    .claim summary::-webkit-details-marker { display: none; }
    .claim-field { font-weight: 600; overflow-wrap: anywhere; }
    .claim-subject { color: var(--k-text-muted, #657267); font-size: 0.8rem; overflow-wrap: anywhere; }
    .claim-body { padding: 0 0.75rem 0.75rem; border-top: 1px solid var(--k-line, rgba(36, 68, 52, 0.16)); }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 0.75rem; margin: 0.6rem 0; font-size: 0.85rem; }
    dt { color: var(--k-text-muted, #657267); }
    dd { margin: 0; overflow-wrap: anywhere; }
    h3 { margin: 0.7rem 0 0.25rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--k-text-muted, #657267); }
    ul { margin: 0.2rem 0; padding-left: 1.1rem; font-size: 0.85rem; }
    li { margin: 0.25rem 0; overflow-wrap: anywhere; }
    li.evidence { display: flex; flex-direction: column; gap: 0.2rem; margin: 0.5rem 0; }
    .ev-flags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
    .ev-flag {
      border: 1px solid var(--k-line, rgba(36, 68, 52, 0.16));
      border-radius: 999px;
      padding: 0.05rem 0.5rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--k-text-muted, #657267);
    }
    .ev-flag[data-kind="positive"] { color: var(--k-positive, #0f8f66); }
    .ev-flag[data-kind="caution"] { color: var(--k-caution, #a86612); }
    .ev-flag[data-kind="negative"] { color: var(--k-negative, #c24141); }
    .ev-meta { color: var(--k-text-muted, #657267); font-size: 0.78rem; }
    .gap { color: var(--k-negative, #c24141); }
    .gap[data-severity="low"], .gap[data-severity="medium"] { color: var(--k-caution, #a86612); }
    .empty, .error { padding: 0.5rem 0; color: var(--k-text-muted, #657267); font-size: 0.9rem; }
    .error { color: var(--k-negative, #c24141); }
    .footnote { margin: 0.8rem 0 0; color: var(--k-text-muted, #657267); font-size: 0.75rem; }
    .basis-standing { margin: 0.65rem 0; font-weight: 700; overflow-wrap: anywhere; }
    .basis-section { margin-top: 0.75rem; overflow-wrap: anywhere; }
    .basis-section summary { cursor: pointer; display: flex; align-items: center; font-weight: 700; min-height: 44px; }
    .basis-notice { margin: 0.3rem 0; color: var(--k-text-muted, #657267); }
    .basis-list { margin: 0.3rem 0; padding-left: 1.1rem; }
    .basis-technical { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; }
  `;

  class SurfaceTrustPanel extends HTMLElement {
    static get observedAttributes(): string[] {
      return ["src", "heading", "mode"];
    }

    #report: TrustPanelReport | null = null;
    #basisProjection: unknown = null;
    #shadow: ShadowRoot;

    constructor() {
      super();
      this.#shadow = this.attachShadow({ mode: "open" });
    }

    connectedCallback(): void {
      // Re-apply a `report` set before the element was upgraded, so the
      // property assignment reaches the class accessor instead of being
      // shadowed by an own property.
      if (Object.prototype.hasOwnProperty.call(this, "report")) {
        const pending = (this as { report?: unknown }).report;
        delete (this as { report?: unknown }).report;
        this.report = pending;
        return;
      }
      if (Object.prototype.hasOwnProperty.call(this, "basisProjection")) {
        const pending = (this as { basisProjection?: unknown }).basisProjection;
        delete (this as { basisProjection?: unknown }).basisProjection;
        this.basisProjection = pending;
        return;
      }
      const src = this.getAttribute("src");
      if (!this.#report && this.#basisProjection === null && src) void this.#load(src);
      else this.#render();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
      if (name === "src" && newValue && newValue !== oldValue) void this.#load(newValue);
      if ((name === "heading" || name === "mode") && newValue !== oldValue) this.#render();
    }

    get report(): TrustPanelReport | null {
      return this.#report;
    }

    set report(value: unknown) {
      this.#report = (value as TrustPanelReport | null) ?? null;
      this.#basisProjection = null;
      this.#render();
    }

    get basisProjection(): unknown { return this.#basisProjection; }

    set basisProjection(value: unknown) {
      this.#basisProjection = value;
      this.#report = null;
      this.#render();
    }

    async #load(src: string): Promise<void> {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Failed to load report: HTTP ${response.status}`);
        const value = await response.json();
        if (this.getAttribute("mode") === "basis") this.basisProjection = value;
        else this.report = value;
      } catch (error) {
        this.#renderError(error instanceof Error ? error.message : String(error));
      }
    }

    #render(): void {
      if (this.getAttribute("mode") === "basis" || this.#basisProjection !== null) {
        this.#renderBasis(buildBasisPanelViewModel(this.#basisProjection));
        return;
      }
      const report = this.#report;
      if (!report) {
        this.#renderShell('<p class="empty" part="empty">No trust report loaded yet.</p>');
        return;
      }
      if (!Array.isArray(report.claims)) {
        this.#renderError("This JSON does not look like a trust report: no claims array.");
        return;
      }
      const claims = report.claims as TrustPanelClaim[];
      if (claims.length > 0 && claims.every((claim) => !claim.status)) {
        this.#renderError(
          "This looks like a TrustBundle rather than a derived report. Run `surface report --input <file>` first, then load the report output.",
        );
        return;
      }

      const counts = new Map<string, number>();
      for (const claim of claims) {
        const status = typeof claim.status === "string" ? claim.status : "unknown";
        counts.set(status, (counts.get(status) ?? 0) + 1);
      }
      const chips = [...counts.entries()]
        .map(
          ([status, count]) =>
            `<span class="chip" part="standing" data-kind="${STATUS_KIND[status] ?? "neutral"}">${escapeHtml(STATUS_LABELS[status] ?? status)}: ${count}</span>`,
        )
        .join("");

      const claimRows = claims.map((claim) => this.#renderClaim(claim, report)).join("");

      this.#renderShell(`
        <div class="panel-header" part="header">
          <p class="panel-title" part="title">${escapeHtml(this.getAttribute("heading") ?? "Surface Trust Panel")}</p>
          <p class="panel-meta">${escapeHtml(asText(report.source))}${report.generatedAt ? ` · ${escapeHtml(asText(report.generatedAt))}` : ""}</p>
        </div>
        <div class="chips">${chips}</div>
        ${claimRows || '<p class="empty" part="empty">The report contains no claims.</p>'}
        <p class="footnote" part="footer">Derived by Kontour Surface. Status is derived deterministically — inspect the evidence and gaps before relying on a claim.</p>
      `);
    }

    #renderClaim(claim: TrustPanelClaim, report: TrustPanelReport): string {
      const status = typeof claim.status === "string" ? claim.status : "unknown";
      const evidence = asArray<TrustPanelEvidence>(report.evidence).filter((item) => item.claimId === claim.id);
      const gaps = asArray<TrustPanelGap>(report.transparencyGaps).filter((item) => item.claimId === claim.id);
      const evidenceList = evidence.map((item) => renderEvidenceItem(item)).join("");
      const gapList = gaps
        .map(
          (item) =>
            `<li class="gap" part="gap-row" data-severity="${escapeHtml(asText(item.severity))}">${escapeHtml(asText(item.type, "gap"))} — ${escapeHtml(asText(item.message))}</li>`,
        )
        .join("");

      return `<details class="claim" part="assessment">
        <summary>
          <span class="chip" part="standing" data-kind="${STATUS_KIND[status] ?? "neutral"}">${escapeHtml(STATUS_LABELS[status] ?? status)}</span>
          <span class="claim-field">${escapeHtml(asText(claim.fieldOrBehavior ?? claim.id))}</span>
          <span class="claim-subject">${escapeHtml(asText(claim.subjectType))}: ${escapeHtml(asText(claim.subjectId))}</span>
        </summary>
        <div class="claim-body">
          <dl>
            <dt>Value</dt><dd>${escapeHtml(formatValue(claim.value))}</dd>
            <dt>Claim</dt><dd>${escapeHtml(asText(claim.id))}</dd>
            <dt>Facet</dt><dd>${escapeHtml(asText(claim.facet ?? claim.surface))}</dd>
            <dt>Impact</dt><dd>${escapeHtml(asText(claim.impactLevel, "unspecified"))}</dd>
            ${claim.verificationPolicyId ? `<dt>Policy</dt><dd>${escapeHtml(asText(claim.verificationPolicyId))}</dd>` : ""}
          </dl>
          <h3>Evidence</h3>
          ${evidenceList ? `<ul part="evidence">${evidenceList}</ul>` : '<p class="empty" part="empty">No evidence recorded for this claim.</p>'}
          ${gapList ? `<h3>Transparency gaps</h3><ul part="gaps">${gapList}</ul>` : ""}
        </div>
      </details>`;
    }

    #renderShell(body: string): void {
      this.#shadow.innerHTML = `<style>${PANEL_CSS}</style><div class="panel" part="panel" role="region" aria-label="${this.getAttribute("mode") === "basis" ? "Basis" : "Surface Trust Panel"}">${body}</div>`;
    }

    #renderError(message: string): void {
      this.#renderShell(`<p class="error" part="error" role="status" aria-live="polite">${escapeHtml(message)}</p>`);
    }

    #renderBasis(model: BasisPanelViewModel): void {
      const priorOpen = new Map([...this.#shadow.querySelectorAll<HTMLDetailsElement>("details[part]")].map((detail) => [detail.getAttribute("part") ?? "", detail.open]));
      const activePart = this.#shadow.activeElement?.closest?.("[part]")?.getAttribute("part") ?? null;
      const disclosureOpen = (value: string): string => value === "expanded" ? "open" : "";
      const gaps = model.gaps.map((gap) => `<li part="gap-row">${escapeHtml(gap.code)} — ${escapeHtml(gap.message)}</li>`).join("");
      if (model.state === "unavailable") {
        this.#renderShell(`<header class="panel-header" part="header"><h2 class="panel-title" part="title">Basis</h2></header><p class="basis-standing" part="standing" data-kind="negative">${escapeHtml(model.standing.label)}</p><section class="basis-section" part="gaps"><h3>Gaps</h3><ul class="basis-list">${gaps}</ul></section>`);
        return;
      }
      const assessment = model.assessment ? `<details class="basis-section" part="assessment" ${disclosureOpen(model.disclosures.assessment)}><summary>Assessment</summary><dl><dt>Claim status</dt><dd>${escapeHtml(model.assessment.claimStatus ?? "not available")}</dd><dt>Freshness</dt><dd>${escapeHtml(model.assessment.freshness ?? "not stated")}</dd></dl>${model.assessment.policy ? `<p>${escapeHtml(model.assessment.policy)}</p>` : ""}${model.assessment.evidence.map((partition) => `<div><h3>${escapeHtml(partition.label)}</h3><ul class="basis-list" part="evidence">${partition.items.map((item) => `<li part="evidence-item">${escapeHtml(item.label)} — ${escapeHtml(item.source)} · ${escapeHtml(item.observedAt)}</li>`).join("") || "<li>None recorded.</li>"}</ul></div>`).join("")}</details>` : `<section class="basis-section" part="assessment"><h3>Assessment</h3><p>No Surface assessment is available.</p></section>`;
      const context = `<details class="basis-section" part="context" ${disclosureOpen(model.disclosures.context)}><summary>Context — ${escapeHtml(model.contextNotice)}</summary>${model.contextGroups.map((group) => `<section><h3>${escapeHtml(group.label)}</h3><ul class="basis-list">${group.items.map((item) => `<li><strong>${escapeHtml(item.label)}</strong> — ${escapeHtml(item.details)}${item.gaps.length ? ` — ${item.gaps.map((gap) => escapeHtml(gap.message)).join("; ")}` : ""}</li>`).join("") || "<li>None recorded.</li>"}</ul></section>`).join("")}</details>`;
      const relationships = `<details class="basis-section" part="relationships" ${disclosureOpen(model.disclosures.relationships)}><summary>Relationships</summary><ul class="basis-list">${model.relationships.map((item) => `<li><strong>${escapeHtml(item.label)}</strong> — ${escapeHtml(item.prose)} From ${escapeHtml(item.from.value)}; to ${escapeHtml(item.to.value)}.${item.gaps.length ? ` Gaps: ${item.gaps.map((gap) => escapeHtml(gap.message)).join("; ")}` : ""}</li>`).join("") || "<li>No Surface assessment relationships recorded.</li>"}</ul></details>`;
      const technical = `<details class="basis-section" part="technical" ${disclosureOpen(model.disclosures.technical)}><summary>Technical details</summary><dl class="basis-technical"><dt>Answer owner</dt><dd>${escapeHtml(model.technical.answerOwner)} (${escapeHtml(model.technical.answerState)})</dd><dt>Assessment owner</dt><dd>${escapeHtml(model.technical.assessmentOwner)} (${escapeHtml(model.technical.assessmentState)})</dd><dt>Bundle</dt><dd>${escapeHtml(model.technical.bundleId ?? "not available")}</dd><dt>Claim</dt><dd>${escapeHtml(model.technical.claimId ?? "not available")}</dd></dl></details>`;
      this.#renderShell(`<header class="panel-header" part="header"><h2 class="panel-title" part="title">Basis</h2></header><p class="basis-standing" part="standing" data-kind="${escapeHtml(model.standing.tone)}">${escapeHtml(model.standing.label)} — ${escapeHtml(model.standing.description)}</p><section class="basis-section" part="gaps"><h3>Gaps (${model.gaps.length})</h3><ul class="basis-list">${gaps || "<li>None recorded.</li>"}</ul></section>${assessment}${context}${relationships}${technical}<p class="footnote" part="footer">${escapeHtml(model.footer)}</p>`);
      for (const [part, open] of priorOpen) { const detail = this.#shadow.querySelector<HTMLDetailsElement>(`details[part="${part}"]`); if (detail) detail.open = open; }
      if (activePart) (this.#shadow.querySelector(`[part="${activePart}"] summary`) as HTMLElement | null)?.focus();
    }
  }

  function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  function asText(value: unknown, fallback = ""): string {
    if (value === undefined || value === null) return fallback;
    return String(value);
  }

  function formatValue(value: unknown): string {
    if (value === undefined || value === null) return "—";
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  function escapeHtml(text: string): string {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  customElements.define("surface-trust-panel", SurfaceTrustPanel);
})();
