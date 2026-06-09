function el(id) { return document.getElementById(id); }
function show(id) { const e = el(id); if (e) e.removeAttribute("hidden"); }
function hide(id) { const e = el(id); if (e) e.setAttribute("hidden", ""); }
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function surfaceLabel(surface) {
  if (vocab.surfaceLabels?.[surface]) return vocab.surfaceLabels[surface];
  const name = surface.includes(".") ? surface.split(".").slice(1).join(" ") : surface;
  return name.replace(/[-_.]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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
  const hasStructuredResult = Boolean(
    item.metadata?.observedResult ||
    item.metadata?.commandOutput ||
    item.metadata?.stdout ||
    item.metadata?.stderr ||
    item.metadata?.output ||
    item.metadata?.command ||
    (item.metadata?.exitCode !== undefined) ||
    typeof item.passing === "boolean"
  );
  if (!hasStructuredResult) return null;
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

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectIntegrityDetails(claim, evidence) {
  const sourceRefs = uniqueBy([
    claim.currentIntegrityRef,
    ...evidence.map(item => item.integrityRef),
    ...evidence.map(item => item.metadata?.integrity?.sourceRef),
  ].filter(Boolean), value => value);

  const configRefs = uniqueBy(evidence.flatMap(item => {
    const refs = item.metadata?.integrity?.configRefs ?? item.metadata?.configIntegrity ?? {};
    return Object.entries(refs)
      .filter(([, ref]) => ref?.hash)
      .map(([kind, ref]) => ({
        kind,
        name: ref.name ?? kind,
        hash: ref.hash,
        path: ref.path,
      }));
  }), item => [item.kind, item.name, item.hash, item.path].filter(Boolean).join(":"));

  const fileRefs = uniqueBy(evidence.flatMap(item => {
    const refs = item.metadata?.integrity?.fileRefs ?? item.metadata?.fileIntegrity ?? [];
    return refs.filter(ref => ref?.path).map(ref => ({
      path: ref.path,
      hash: ref.hash,
      status: ref.status,
      sizeBytes: ref.sizeBytes,
    }));
  }), item => [item.path, item.hash, item.status].filter(Boolean).join(":"));

  return { sourceRefs, configRefs, fileRefs };
}

function shortIntegrityRef(value) {
  const text = String(value ?? "");
  if (text.startsWith("sha256:") && text.length > 24) return text.slice(0, 19) + "…" + text.slice(-8);
  if (text.startsWith("working-tree:") && text.length > 32) return "working-tree:" + text.slice(-12);
  if (/^[a-f0-9]{40,64}$/i.test(text)) return text.slice(0, 12);
  return text.length > 44 ? text.slice(0, 32) + "…" + text.slice(-8) : text;
}

function renderIntegrityScope(details) {
  const rows = [];
  if (details.sourceRefs.length) {
    rows.push("<div class=\"integrity-group\"><span>Source anchor</span>" +
      details.sourceRefs.map(ref => `<code title="${esc(ref)}">${esc(shortIntegrityRef(ref))}</code>`).join("") +
      "</div>");
  }
  if (details.fileRefs.length) {
    const shown = details.fileRefs.slice(0, 8);
    rows.push("<div class=\"integrity-group\"><span>File fingerprints</span>" +
      shown.map(ref => `<code title="${esc(ref.hash ?? ref.status ?? "")}">${esc(ref.path)}${ref.hash ? " · " + esc(shortIntegrityRef(ref.hash)) : ref.status ? " · " + esc(ref.status) : ""}</code>`).join("") +
      (details.fileRefs.length > shown.length ? `<em>+${details.fileRefs.length - shown.length} more</em>` : "") +
      "</div>");
  }
  if (details.configRefs.length) {
    rows.push("<div class=\"integrity-group\"><span>Producer configuration</span>" +
      details.configRefs.map(ref => `<code title="${esc([ref.path, ref.hash].filter(Boolean).join(" · "))}">${esc(ref.name)} · ${esc(shortIntegrityRef(ref.hash))}</code>`).join("") +
      "</div>");
  }
  return rows.join("");
}

function renderObservedResult(result) {
  const rows = [
    result.expected ? "<div class=\"observed-row\"><span>Expected</span><code>" + esc(result.expected) + "</code></div>" : "",
    result.status ? "<div class=\"observed-row\"><span>Observed</span><code>" + esc(result.status) + "</code></div>" : "",
    result.exitCode != null ? "<div class=\"observed-row\"><span>Exit code</span><code>" + esc(String(result.exitCode)) + "</code></div>" : "",
    result.command ? "<div class=\"observed-row\"><span>Command</span><code>" + esc(result.command) + "</code></div>" : "",
  ].filter(Boolean).join("");
  const outputParts = [
    result.stdout ? "stdout\n" + result.stdout : "",
    result.stderr ? "stderr\n" + result.stderr : "",
    !result.stdout && !result.stderr && result.combined ? result.combined : "",
  ].filter(Boolean).join("\n\n");
  return "<div class=\"observed-result\">"
    + (result.summary ? "<p>" + esc(result.summary) + "</p>" : "")
    + (rows ? "<div class=\"observed-grid\">" + rows + "</div>" : "")
    + (outputParts ? "<details class=\"observed-output\"><summary>Command output</summary><pre>" + esc(outputParts) + "</pre></details>" : "")
    + "</div>";
}

function statusColor(status) {
  const m = { verified:"good", disputed:"bad", rejected:"bad", stale:"warn", assumed:"amber", proposed:"amber", unknown:"muted" };
  return m[status] ?? "muted";
}

function statusLabel(status, evidenceCount) {
  if (status === "unknown") return evidenceCount === 0 ? "Never run" : "No evidence";
  const m = { verified:"Verified", stale:"Needs refresh", disputed:"Disputed",
               rejected:"Rejected", assumed:"Assumed", proposed:"Pending" };
  return m[status] ?? status;
}

function claimEvidenceCount(claim) {
  return claim.evidenceIds?.length ?? 0;
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

function statusGuidance(status, evidenceCount) {
  if (status === "verified") return null;
  if (status === "unknown") {
    return evidenceCount === 0
      ? "This claim has never been evaluated — no evidence has been collected yet."
      : "Evidence exists but trust status could not be determined from it.";
  }
  const m = {
    assumed: "This claim depends on an explicit assumption. Review the assumption before relying on downstream conclusions.",
    proposed: "Awaiting first evidence collection run.",
    stale:    "Evidence is outdated — collected against a different version of the code. Stale claims are refreshed one run at a time.",
    disputed: "Surface derived a different status than the producer declared. Resolve the transparency gaps above.",
    rejected: "Verification failed. Check the transparency gaps above for specific remediation steps.",
  };
  return m[status] ?? null;
}

function updateConsoleChromeMetrics() {
  const header = document.querySelector(".dash-header");
  const height = header ? Math.ceil(header.getBoundingClientRect().height) : 96;
  document.documentElement.style.setProperty("--dash-header-height", height + "px");
}

function suggestCommand(claim, evidence, readModel) {
  const producer = readModel?.producer ?? {};
  const needsEvidence = ["unknown", "stale", "assumed", "proposed", "rejected"].includes(claim.status);
  if (!needsEvidence) return null;

  if (claim.metadata?.command) {
    return { command: claim.metadata.command, note: "Runs the evidence check and captures output as evidence." };
  }

  const isVeritas = producer.name === "veritas" || (claim.claimType ?? "").startsWith("veritas");
  if (isVeritas) {
    if (claim.status === "stale") {
      return { command: "veritas checkin", note: "Refreshes this claim’s evidence. Run once per stale claim until all are resolved." };
    }
    return { command: "veritas checkin", note: "Collects evidence and updates trust status for in-scope surfaces." };
  }

  return null;
}

function claimTypeLabel(claimType) {
  return vocab.claimTypeLabels?.[claimType] ??
    claimTypes.find(t => t.id === claimType)?.displayName ??
    claimType;
}

function confidenceTier(claim) {
  if (claim.status !== "verified") return "";
  const hasGaps = (claim.transparencyGapIds?.length ?? 0) > 0;
  const strength = claim.confidenceBasis?.evidenceStrength;
  if (!hasGaps && strength === "strong") return " card-strong";
  if (hasGaps || strength === "weak") return " card-weak";
  return "";
}

// ── gap classification ─────────────────────────────────
// Maps gap/gap types to a root-cause category and prescriptive hint.
// Returns { kind, title, hint } where kind is: setup | config | workflow | quality | policy
