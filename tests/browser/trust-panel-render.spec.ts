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
import AxeBuilder from "@axe-core/playwright";

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

// ---------------------------------------------------------------------------
// Provenance display names (#224)
// ---------------------------------------------------------------------------

/**
 * One claim with evidence spanning the declared-vs-observed axis the spec's
 * runtime-observation vector enforces. The reader must see the canonical
 * display names from src/display-names.ts, never the raw wire enums —
 * the regression this guards is an owner literally reading
 * "test_output via validation".
 */
function provenanceReport(): unknown {
  const common = {
    claimId: "claim.subject",
    sourceRef: "https://example.org/source",
    excerptOrSummary: "The registration is active.",
    supportStrength: "entails",
    passing: true,
    observedAt: "2026-07-30T00:00:00.000Z",
  };
  return {
    source: "test.trust-panel-provenance",
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
      { ...common, id: "ev.machine", evidenceType: "test_output", method: "validation" },
      { ...common, id: "ev.runtime", evidenceType: "runtime_observation", method: "observation" },
      { ...common, id: "ev.human", evidenceType: "human_attestation", method: "attestation" },
    ],
    transparencyGaps: [],
  };
}

test("evidence provenance renders canonical display names, never raw wire enums", async ({ page }) => {
  await loadPanel(page, provenanceReport());
  const rows = await evidenceRows(page);
  const [machine, runtime, human] = rows;

  expect(machine!.text).toContain("Test output · Checked against expectations");
  expect(runtime!.text).toContain("Machine-observed at run time · Directly observed");
  expect(human!.text).toContain("Human sign-off · Vouched for");

  // The raw enums stay machine-readable on the row's data attributes…
  expect(machine!.html).toContain('data-evidence-type="test_output"');
  expect(machine!.html).toContain('data-method="validation"');

  // …but never reach the reader as visible text.
  for (const row of rows) {
    expect(row.text).not.toContain("test_output");
    expect(row.text).not.toContain("runtime_observation");
    expect(row.text).not.toContain("human_attestation");
    expect(row.text).not.toMatch(/\bvalidation\b/);
  }
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

test("Basis mode keeps mandatory standing and gaps visible while disclosures remain native", async ({ page }) => {
  await page.goto("/viewer.html");
  await page.waitForFunction(() => customElements.get("surface-trust-panel") !== undefined);
  await page.evaluate(() => {
    const panel = document.getElementById("viewer-panel") as HTMLElement & { basisProjection: unknown };
    panel.setAttribute("mode", "basis");
    panel.basisProjection = {
      version: "surface.basis-projection/v1",
      answer: { owner: { authority: "@kontourai/thread" }, state: "available", observedAt: "2026-08-25T00:00:00.000Z", value: { ref: { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "assistant-message", standing: "observed", threadId: "thread", messageId: "message" }, fact: "answer-observed", observedAt: "2026-08-25T00:00:00.000Z" } },
      standing: "execution-only", unresolvedReason: null,
      assessment: { owner: { authority: "@kontourai/surface" }, state: "not-captured", observedAt: "2026-08-25T00:00:00.000Z" },
      regions: { inputs: [], execution: [], process: [], outcomes: [], support: [], sources: [], live: [] }, relationships: [], gaps: [],
    };
  });
  const basis = page.locator("surface-trust-panel");
  await expect(basis).toHaveAttribute("mode", "basis");
  const snapshot = await page.evaluate(() => {
    const root = (document.getElementById("viewer-panel") as HTMLElement).shadowRoot!;
    return {
      title: root.querySelector('[part="title"]')?.textContent,
      standing: root.querySelector('[part="standing"]')?.textContent,
      gaps: root.querySelector('[part="gaps"]')?.textContent,
      contextOpen: (root.querySelector('[part="context"]') as HTMLDetailsElement | null)?.open,
      parts: [...root.querySelectorAll("[part]")].map((item) => item.getAttribute("part")),
    };
  });
  expect(snapshot.title).toBe("Basis");
  expect(snapshot.standing).toContain("Unassessed");
  expect(snapshot.gaps).toContain("Gaps (0)");
  expect(snapshot.contextOpen).toBe(false);
  expect(snapshot.parts).toEqual(expect.arrayContaining(["panel", "header", "title", "standing", "gaps", "assessment", "context", "relationships", "technical", "footer"]));
});

test("Basis mode preserves complete disclosure, focus, accessibility, and narrow geometry", async ({ page }) => {
  const observedAt = "2026-08-25T00:00:00.000Z";
  const answer = { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "assistant-message", standing: "observed", threadId: "thread-a", messageId: "message-a" };
  const longInert = `<not-markup> https://example.test/${"x".repeat(3_400)}`;
  const projection = {
    version: "surface.basis-projection/v1",
    answer: { owner: { authority: "@kontourai/thread" }, state: "available", observedAt, value: { ref: answer, fact: "answer-observed", observedAt } },
    standing: "assessed-with-gaps", unresolvedReason: null,
    assessment: { owner: { authority: "@kontourai/surface" }, state: "available", observedAt, value: {
      version: "surface.basis-projection/v1", ref: { authority: "@kontourai/surface", schemaVersion: "surface.answer-assessment/v1", kind: "answer-assessment", bundleId: "bundle-a", claimId: "claim-a" }, found: true,
      bundle: { id: "bundle-a", schemaVersion: 7, source: "https://example.test/bundle", generatedAt: observedAt },
      claim: { id: "claim-a", subject: { subjectType: "answer", subjectId: "message-a" }, status: "verified", freshness: { asOf: observedAt, expiresAt: null, stale: false } }, policy: null,
      evidence: {
        cited: [{ id: "cite-a", label: "Citation label", sourceRef: "https://example.test/citation", observedAt }],
        entails: [{ id: "entail-a", label: "Entailing label", sourceRef: "https://example.test/entailing", observedAt }],
        counterevidence: [{ id: "counter-a", label: "Counter label", sourceRef: "https://example.test/counter", observedAt }],
      },
      derivation: { available: true, directInputs: [{ claimId: "input-claim", status: "verified" }] },
      gaps: [{ code: "assessment-gap", message: "Assessment gap remains visible." }],
    } },
    regions: {
      inputs: [{ ref: { authority: "@kontourai/station", schemaVersion: "1", kind: "input", sessionId: "thread-a", eventId: "input-a" }, role: "input", context: { kind: "station-input", inputKind: "prompt", promptExcerpt: longInert, attachmentCount: 2 }, gaps: [{ code: "input-gap", message: "Input relationship is not captured." }] }],
      execution: [
        { ref: { authority: "@kontourai/thread", schemaVersion: "1.2.0", kind: "result", threadId: "thread-a", resultId: "result-a" }, role: "execution", context: { kind: "thread-result", name: "search", terminalStatus: "completed", textParts: 2, truncatedParts: 1, omittedParts: 3 }, gaps: [] },
        { ref: { authority: "@kontourai/flow-agents", schemaVersion: "grounded-execution-narrative/v1", kind: "narrative", narrativeId: "narrative-a" }, role: "execution", context: { kind: "grounded-narrative", statementCount: 4, sourceCompleteness: "partial" }, gaps: [] },
      ],
      process: [],
      outcomes: [{ ref: { authority: "@kontourai/station", schemaVersion: "1", kind: "task-output", taskId: "task-a", outputId: "output-a" }, role: "outcome", context: { kind: "station-output", title: "Generated report", mediaType: "text/plain", byteLength: 42, digest: "sha256-abcd" }, gaps: [] }],
      support: [], sources: [],
      live: [{ ref: { authority: "@kontourai/station", schemaVersion: "1", kind: "live", sessionId: "thread-a", observationId: "live-a" }, role: "live", context: { kind: "station-live", state: "connected", observedAt }, gaps: [] }],
    },
    relationships: [
      { kind: "cites", from: "claim-a", to: "evidence:cite-a", source: "surface-assessment", gaps: [{ code: "edge-gap", message: "Citation visibility is limited." }] },
      { kind: "supports", from: "evidence:entail-a", to: "claim-a", source: "surface-assessment", gaps: [] },
      { kind: "counterevidence", from: "evidence:counter-a", to: "claim-a", source: "surface-assessment", gaps: [] },
      { kind: "derived-from", from: "claim-a", to: "claim:input-claim", source: "surface-assessment", gaps: [] },
    ],
    gaps: [{ code: "assessment-gap", message: "Assessment gap remains visible." }],
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/viewer.html");
  await page.waitForFunction(() => customElements.get("surface-trust-panel") !== undefined);
  await page.evaluate((value) => {
    const panel = document.getElementById("viewer-panel") as HTMLElement & { basisProjection: unknown };
    panel.setAttribute("mode", "basis");
    panel.basisProjection = value;
  }, projection);

  const panel = page.locator("surface-trust-panel");
  await expect(panel).toContainText("Assessed with gaps");
  await expect(panel).toContainText("Assessment gap remains visible.");
  const assessment = panel.locator('[part="assessment"]');
  await expect(assessment).toHaveAttribute("open", "");
  await expect(assessment).toContainText("verified");
  await expect(assessment).toContainText("Current as of");
  await expect(assessment).toContainText("Entailing label");
  await expect(assessment).toContainText("Citation label");
  await expect(assessment).toContainText("Counter label");

  const context = panel.locator('[part="context"]');
  await expect(context).not.toHaveAttribute("open", "");
  const contextSummary = context.locator("summary");
  await contextSummary.focus();
  await contextSummary.press("Enter");
  await expect(context).toHaveAttribute("open", "");
  await expect(context).toContainText("Prompt excerpt");
  await expect(context).toContainText("Attachments: 2");
  await expect(context).toContainText("Status: completed");
  await expect(context).toContainText("Source completeness: partial");
  await expect(context).toContainText("Generated report");
  await expect(context).toContainText("State: connected");
  await expect(context).toContainText("Input relationship is not captured.");

  const relationships = panel.locator('[part="relationships"]');
  const relationshipsSummary = relationships.locator("summary");
  await relationshipsSummary.click();
  await expect(relationships).toContainText("Citation visibility is limited.");
  await expect(relationships).toContainText("The assessed claim cites this evidence.");
  await expect(relationships).toContainText("This evidence supports the assessed claim.");
  await expect(relationships).toContainText("This evidence counters the assessed claim.");
  await expect(relationships).toContainText("derived from this input claim");

  await page.evaluate((value) => {
    (document.getElementById("viewer-panel") as HTMLElement & { basisProjection: unknown }).basisProjection = structuredClone(value);
  }, projection);
  await expect(context).toHaveAttribute("open", "");
  expect(await panel.evaluate((element) => element.shadowRoot?.activeElement === element.shadowRoot?.querySelector('[part="relationships"] summary'))).toBe(true);
  expect((await contextSummary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme });
    const results = await new AxeBuilder({ page }).include("surface-trust-panel").analyze();
    expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical"), `${colorScheme} accessibility`).toEqual([]);
  }
  expect(await contextSummary.evaluate((element) => getComputedStyle(element).transitionDuration)).toMatch(/^(0s|0ms)$/u);
});
