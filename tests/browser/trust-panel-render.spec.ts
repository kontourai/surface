/**
 * Rendering tests for <surface-trust-panel> with discriminating power.
 *
 * The panel is the trust suite's face: it is what a second person reads when
 * a claim is shared. Two audit findings motivated this file, and each test
 * here is written so that reintroducing the finding turns it red:
 *
 * 1. The status chip had no test power. Replacing STATUS_LABELS/STATUS_KIND
 *    so that every status rendered as a green "Verified" chip left the whole
 *    suite passing — the only chip assertion in the repo was
 *    `expect(chipCount).toBeGreaterThan(0)`. The status table below asserts
 *    the label AND the colour band for every status the panel knows.
 *
 * 2. Evidence rows rendered materially different evidence states
 *    byte-identically. An entailing-and-passing item, a cited-only item, an
 *    entailing item that failed its check, and an observation from years ago
 *    all produced the same `<li>`. The evidence tests assert that those four
 *    rows are pairwise distinct and that each state is named on the row.
 *
 * The panel is exercised through the published docs-site viewer page, which
 * loads the same compiled `surface-trust-panel.js` the npm package ships —
 * so a change to src/trust-panel/surface-trust-panel.ts reaches these
 * assertions through the real build.
 */
import { expect, test, type Page } from "@playwright/test";

/** Every status the panel maps, with the label and colour band it must use. */
const STATUS_RENDERING = [
  { status: "verified", label: "Verified", kind: "positive" },
  { status: "assumed", label: "Assumed", kind: "caution" },
  { status: "stale", label: "Needs refresh", kind: "caution" },
  { status: "disputed", label: "Disputed", kind: "negative" },
  { status: "rejected", label: "Rejected", kind: "negative" },
  { status: "revoked", label: "Revoked", kind: "negative" },
  { status: "superseded", label: "Superseded", kind: "neutral" },
  { status: "unknown", label: "No evidence", kind: "neutral" },
  { status: "proposed", label: "Pending review", kind: "neutral" },
] as const;

function statusReport(): unknown {
  return {
    source: "test.trust-panel-render",
    generatedAt: "2026-08-01T00:00:00.000Z",
    claims: STATUS_RENDERING.map((entry) => ({
      id: `claim.${entry.status}`,
      status: entry.status,
      subjectType: "service",
      subjectId: "acme",
      facet: "test.facet",
      fieldOrBehavior: entry.status,
      value: "v",
      impactLevel: "medium",
    })),
    evidence: [],
    transparencyGaps: [],
  };
}

/**
 * One claim carrying the four evidence items from the audit probe. They are
 * deliberately identical in the three fields the old template rendered
 * (evidenceType, method, excerptOrSummary) and differ only in the fields it
 * dropped, so any row that still renders identically is the defect.
 */
function evidenceReport(): unknown {
  const common = {
    claimId: "claim.subject",
    evidenceType: "source_excerpt",
    method: "observation",
    sourceRef: "https://example.org/source",
    excerptOrSummary: "The registration is active.",
    collectedBy: "crawler",
  };
  return {
    source: "test.trust-panel-evidence",
    generatedAt: "2026-08-01T00:00:00.000Z",
    claims: [
      {
        id: "claim.subject",
        status: "verified",
        subjectType: "service",
        subjectId: "acme",
        facet: "test.facet",
        fieldOrBehavior: "registration",
        value: "active",
        impactLevel: "medium",
      },
    ],
    evidence: [
      { ...common, id: "ev.entails-passing", supportStrength: "entails", passing: true, observedAt: "2026-07-30T00:00:00.000Z" },
      { ...common, id: "ev.cited-only", supportStrength: "cited", passing: true, observedAt: "2026-07-30T00:00:00.000Z" },
      {
        ...common,
        id: "ev.entails-failing",
        supportStrength: "entails",
        passing: false,
        blocking: true,
        observedAt: "2026-07-30T00:00:00.000Z",
      },
      { ...common, id: "ev.ancient", supportStrength: "entails", passing: true, observedAt: "2019-01-04T00:00:00.000Z" },
      { ...common, id: "ev.unevaluated" },
      {
        ...common,
        id: "ev.private",
        supportStrength: "entails",
        passing: true,
        observedAt: "2026-07-30T00:00:00.000Z",
        metadata: { visibility: "private" },
      },
      {
        ...common,
        id: "ev.anchor-failed",
        supportStrength: "entails",
        passing: true,
        observedAt: "2026-07-30T00:00:00.000Z",
        integrityAnchor: { kind: "hash", value: "sha256:abc", verificationStatus: "failed" },
      },
      {
        ...common,
        id: "ev.anchor-verified",
        supportStrength: "entails",
        passing: true,
        observedAt: "2026-07-30T00:00:00.000Z",
        integrityAnchor: { kind: "hash", value: "sha256:abc", verificationStatus: "verified" },
      },
    ],
    transparencyGaps: [],
  };
}

/** Load the viewer page and hand the panel a report object directly. */
async function loadPanel(page: Page, report: unknown): Promise<void> {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const response = await page.goto("/viewer.html");
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => customElements.get("surface-trust-panel") !== undefined);
  await page.evaluate((value) => {
    (document.getElementById("viewer-panel") as HTMLElement & { report: unknown }).report = value;
  }, report);
  await expect(page.locator("surface-trust-panel .panel-title")).toBeVisible();
  expect(consoleErrors).toEqual([]);
}

/** The chip rendered inside a claim row's own summary, by claim id. */
async function claimChips(page: Page): Promise<Array<{ id: string; label: string; kind: string }>> {
  return page.evaluate(() => {
    const panel = document.getElementById("viewer-panel") as HTMLElement;
    const rows = [...(panel.shadowRoot?.querySelectorAll("details.claim") ?? [])];
    return rows.map((row) => {
      const chip = row.querySelector("summary .chip");
      return {
        id: row.querySelector(".claim-field")?.textContent?.trim() ?? "",
        label: chip?.textContent?.trim() ?? "",
        kind: chip?.getAttribute("data-kind") ?? "",
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

test("renders each claim status with its own label and colour band", async ({ page }) => {
  await loadPanel(page, statusReport());
  const chips = await claimChips(page);
  const byField = new Map(chips.map((chip) => [chip.id, chip]));

  expect(chips).toHaveLength(STATUS_RENDERING.length);
  for (const entry of STATUS_RENDERING) {
    const chip = byField.get(entry.status);
    expect(chip, `no rendered claim row for status ${entry.status}`).toBeDefined();
    expect(chip!.label, `label for ${entry.status}`).toBe(entry.label);
    expect(chip!.kind, `data-kind for ${entry.status}`).toBe(entry.kind);
  }
});

test("no non-verified status renders as verified or as the positive band", async ({ page }) => {
  // This is the audit's all-green injection, stated as an assertion: a map
  // that renders every status as a green "Verified" chip must fail here.
  await loadPanel(page, statusReport());
  const chips = await claimChips(page);

  for (const chip of chips.filter((entry) => entry.id !== "verified")) {
    expect(chip.label, `${chip.id} must not read as Verified`).not.toBe("Verified");
    expect(chip.kind, `${chip.id} must not use the positive band`).not.toBe("positive");
  }
  // Distinct statuses must stay distinguishable from one another, not merely
  // distinguishable from "verified".
  expect(new Set(chips.map((chip) => chip.label)).size).toBe(STATUS_RENDERING.length);
});

test("summary chips count each status under its own label", async ({ page }) => {
  await loadPanel(page, statusReport());
  const summary = await page.evaluate(() => {
    const panel = document.getElementById("viewer-panel") as HTMLElement;
    return [...(panel.shadowRoot?.querySelectorAll(".chips .chip") ?? [])].map((chip) => ({
      text: chip.textContent?.trim() ?? "",
      kind: chip.getAttribute("data-kind") ?? "",
    }));
  });

  expect(summary).toHaveLength(STATUS_RENDERING.length);
  for (const entry of STATUS_RENDERING) {
    const chip = summary.find((item) => item.text === `${entry.label}: 1`);
    expect(chip, `no summary chip for ${entry.status} (${entry.label})`).toBeDefined();
    expect(chip!.kind).toBe(entry.kind);
  }
});

// ---------------------------------------------------------------------------
// Evidence rows
// ---------------------------------------------------------------------------

/** The rendered evidence rows, in order, with their markup and attributes. */
async function evidenceRows(page: Page): Promise<
  Array<{ html: string; text: string; support: string; result: string; blocking: string; visibility: string; integrity: string }>
> {
  return page.evaluate(() => {
    const panel = document.getElementById("viewer-panel") as HTMLElement;
    const row = panel.shadowRoot?.querySelector("details.claim") as HTMLDetailsElement | null;
    if (row) row.open = true;
    return [...(panel.shadowRoot?.querySelectorAll("li.evidence") ?? [])].map((item) => ({
      html: item.outerHTML,
      text: item.textContent?.replace(/\s+/g, " ").trim() ?? "",
      support: item.getAttribute("data-support") ?? "",
      result: item.getAttribute("data-result") ?? "",
      blocking: item.getAttribute("data-blocking") ?? "",
      visibility: item.getAttribute("data-visibility") ?? "",
      integrity: item.getAttribute("data-integrity") ?? "",
    }));
  });
}

test("materially different evidence states do not render identically", async ({ page }) => {
  await loadPanel(page, evidenceReport());
  const rows = await evidenceRows(page);

  expect(rows).toHaveLength(8);
  // Every row shares evidenceType, method and excerptOrSummary — the three
  // fields the panel used to render. If any two rows are byte-identical, the
  // panel is again collapsing states the reader needs.
  expect(new Set(rows.map((row) => row.html)).size).toBe(rows.length);
});

test("names the support strength, result, and observed time on every evidence row", async ({ page }) => {
  await loadPanel(page, evidenceReport());
  const rows = await evidenceRows(page);
  const [entailsPassing, citedOnly, entailsFailing, ancient, unevaluated] = rows;

  expect(entailsPassing!.support).toBe("entails");
  expect(entailsPassing!.result).toBe("passed");
  expect(entailsPassing!.text).toContain("Entails the claim");
  expect(entailsPassing!.text).toContain("Passed");
  expect(entailsPassing!.text).toContain("Observed 2026-07-30T00:00:00.000Z");

  expect(citedOnly!.support).toBe("cited");
  expect(citedOnly!.text).toContain("Cited only");

  expect(entailsFailing!.result).toBe("failed-blocking");
  expect(entailsFailing!.blocking).toBe("true");
  expect(entailsFailing!.text).toContain("Failed");
  expect(entailsFailing!.text).toContain("blocking");

  // Same fields as the first row apart from when it was observed — a reader
  // deciding whether to rely on this claim needs that difference visible.
  expect(ancient!.text).toContain("Observed 2019-01-04T00:00:00.000Z");
  expect(ancient!.html).not.toBe(entailsPassing!.html);

  // Absent state is stated, never rendered as the same row shape as a
  // present one.
  expect(unevaluated!.support).toBe("unstated");
  expect(unevaluated!.result).toBe("not-evaluated");
  expect(unevaluated!.text).toContain("Support strength not stated");
  expect(unevaluated!.text).toContain("Not evaluated");
  expect(unevaluated!.text).toContain("Observed time not supplied");
});

test("discloses evidence visibility and integrity-anchor verification state", async ({ page }) => {
  await loadPanel(page, evidenceReport());
  const rows = await evidenceRows(page);
  const [entailsPassing, , , , unevaluated, isPrivate, anchorFailed, anchorVerified] = rows;

  // Undeclared visibility says so rather than implying "public".
  expect(entailsPassing!.visibility).toBe("unstated");
  expect(unevaluated!.text).toContain("Visibility not stated");

  expect(isPrivate!.visibility).toBe("private");
  expect(isPrivate!.text).toContain("Visibility: private");

  // An anchor that failed verification must not read like one that passed.
  expect(anchorFailed!.integrity).toBe("failed");
  expect(anchorFailed!.text).toContain("Integrity hash: failed");
  expect(anchorVerified!.integrity).toBe("verified");
  expect(anchorVerified!.text).toContain("Integrity hash: verified");
  expect(anchorFailed!.html).not.toBe(anchorVerified!.html);
});
