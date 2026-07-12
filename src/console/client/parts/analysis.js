// Gap classification (kind/title/hint) and policy gap analysis (required-vs-
// collected evidence/methods) are derived server-side in the claim detail
// projection; this browser layer renders the projected fields (issue #4).
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
