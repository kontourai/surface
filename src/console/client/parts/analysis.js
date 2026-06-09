function classifyGap(gapType, message) {
  if (gapType === "provenance_gap") {
    if ((message ?? "").includes("Missing required evidence")) {
      return {
        kind: "setup",
        title: "Evidence never collected",
        hint: "The producer ran but did not emit the required evidence type for this claim. This is a producer setup or configuration issue — check that the relevant check is enabled and its output is being captured.",
      };
    }
    return {
      kind: "setup",
      title: "Provenance gap",
      hint: "The evidence trace for this claim is incomplete. Check that all producer steps ran and emitted evidence.",
    };
  }
  if (gapType === "policy_violation") {
    if ((message ?? "").includes("Missing required verification method")) {
      return {
        kind: "config",
        title: "Required method not collected",
        hint: "Surface expected evidence tagged with this verification method. This can happen because no evidence was emitted, or because the producer emitted evidence with a different method. Run evidence collection first; if evidence appears under the wrong method, fix the producer or adapter mapping.",
      };
    }
    return {
      kind: "policy",
      title: "Policy requirement not met",
      hint: "The claim does not satisfy the requirements of its policy. Check what the policy requires and whether the producer is configured to meet those requirements.",
    };
  }
  if (gapType === "attestation_actor_missing") {
    return {
      kind: "workflow",
      title: "Human review incomplete — no actor",
      hint: "A review record exists but no reviewer identity was recorded. The attestation workflow was started but not completed. Whoever reviewed this needs to sign it properly.",
    };
  }
  if (gapType === "attestation_authority_unverified") {
    return {
      kind: "workflow",
      title: "Human review incomplete — authority not verified",
      hint: "A review record exists but the reviewer's authority cannot be confirmed. Ensure the attestation includes a verifiable authority source.",
    };
  }
  if (gapType === "attestation_identity_unverified") {
    return {
      kind: "workflow",
      title: "Human review incomplete — identity not verified",
      hint: "A review record exists but the reviewer's identity has not been verified. Ensure the attestation includes a valid identity evidence reference.",
    };
  }
  // default: tool/quality failure
  return {
    kind: "quality",
    title: "Verification failed",
    hint: null,
  };
}

const gapKindLabel = {
  setup:    "Setup issue",
  config:   "Configuration issue",
  workflow: "Workflow incomplete",
  quality:  "Quality failure",
  policy:   "Policy mismatch",
};

// ── policy gap analysis ────────────────────────────────
// Cross-references policy requirements against what the claim actually has.
function policyGapAnalysis(claim, policy) {
  if (!policy) return null;
  const requiredEvidence = policy.requiredEvidence ?? [];
  const requiredMethods  = policy.requiredMethods  ?? [];
  const hasEvidence = claim.evidenceTypes  ?? [];
  const hasMethods  = claim.evidenceMethods ?? [];
  const missingEvidence = requiredEvidence.filter(r => !hasEvidence.includes(r));
  const missingMethods  = requiredMethods.filter(r => !hasMethods.includes(r));
  if (!missingEvidence.length && !missingMethods.length) return null;
  return { requiredEvidence, requiredMethods, hasEvidence, hasMethods, missingEvidence, missingMethods };
}

function renderRequirementValues(values, emptyLabel) {
  return values.length
    ? values.map(v => `<code>${esc(v)}</code>`).join(" ")
    : `<span class="empty-value">${esc(emptyLabel)}</span>`;
}

// ── status donut chart ─────────────────────────────────
function renderDonut(d) {
  const canvas = el("statusDonut");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const size = 52;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + "px";
  canvas.style.height = size + "px";
  ctx.scale(dpr, dpr);

  const claims = d.claims ?? [];
  const total  = claims.length || 1;
  const counts = { verified: 0, stale: 0, disputed: 0, rejected: 0, unknown: 0, assumed: 0, proposed: 0 };
  claims.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++; });

  const styles = getComputedStyle(document.body);
  const cssVar = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const palette = {
    verified: cssVar("--green", "#34d399"),
    stale: cssVar("--orange", "#f3b14b"),
    disputed: cssVar("--red", "#ff6f6f"),
    rejected: cssVar("--red", "#ff6f6f"),
    unknown: cssVar("--muted", "#72869b"),
    assumed: cssVar("--amber", "#f3b14b"),
    proposed: cssVar("--blue", "#7aa2ff")
  };

  const slices = Object.entries(counts).filter(([, v]) => v > 0);
  const cx = size / 2, cy = size / 2, r = 20, inner = 12;
  let angle = -Math.PI / 2;
  ctx.clearRect(0, 0, size, size);

  slices.forEach(([status, count]) => {
    const sweep = (count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.arc(cx, cy, inner, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = palette[status] ?? "#888";
    ctx.fill();
    angle += sweep;
  });

  // center text: verified count
  const verified = counts.verified;
  ctx.fillStyle = cssVar("--ink", "#eef3f8");
  ctx.font = `bold ${verified > 9 ? 9 : 10}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(verified), cx, cy);
}

// ── main render ────────────────────────────────────────
