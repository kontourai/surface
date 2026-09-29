/**
 * Display-name conformance (#224) — the canonical reader-facing vocabulary
 * table in src/display-names.ts is the single source for how the spec enums
 * (`TrustStatus`, `evidenceType`, `method`) are named to readers, and both
 * shipped renderers must consume it rather than minting synonyms.
 *
 * Same testable shape as the #213/#214 fix: assertions run against the
 * hand-written renderer sources AND the generated modules the runtime
 * actually ships, so a drifting label turns the suite red:
 *
 * 1. Coverage: each table covers its enum exactly — no missing member, no
 *    invented member. (A non-empty-iteration check cannot catch a deleted
 *    entry; deep equality against the enum arrays can.)
 * 2. Trust panel: <surface-trust-panel> is dependency-free by design (the
 *    compiled file ships as a self-contained ES module), so it carries inline
 *    copies of the tables. These are extracted from the source and from the
 *    generated module and must equal the canonical tables byte-for-byte.
 * 3. Console: buildConsoleHtml injects the canonical tables as vocab defaults
 *    (product overrides win per key), and the shipped client script resolves
 *    every label from that vocab — it holds no label literals of its own.
 * 4. The historical divergence ("Pending review" vs "Pending", "No evidence"
 *    vs "Never run") stays gone: the two renderers' status labels are asserted
 *    equal, and the minted synonyms are asserted absent from shipped output.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CLAIM_BASIS_MISSING_DISPLAY_NAMES,
  DERIVATION_METHOD_DISPLAY_NAMES,
  EVIDENCE_RESULT_DISPLAY_NAMES,
  EVIDENCE_RESULT_LABELS,
  EVIDENCE_STRENGTH_DISPLAY_NAMES,
  EVIDENCE_SUPPORT_DISPLAY_NAMES,
  EVIDENCE_SUPPORT_LABELS,
  REVIEWER_AUTHORITY_DISPLAY_NAMES,
  EVIDENCE_METHOD_DISPLAY_NAMES,
  EVIDENCE_METHOD_LABELS,
  EVIDENCE_TYPE_DISPLAY_NAMES,
  EVIDENCE_TYPE_LABELS,
  TRUST_STATUS_DISPLAY_NAMES,
  TRUST_STATUS_LABELS,
  evidenceMethodLabel,
  evidenceTypeLabel,
  trustStatusLabel,
} from "../src/display-names.js";
import {
  DERIVATION_METHODS,
  EVIDENCE_METHODS,
  EVIDENCE_SUPPORT_STRENGTHS,
  EVIDENCE_TYPES,
  TRUST_STATUSES,
} from "../src/validation/constants.js";
import { CONSOLE_SCRIPT } from "../src/console/assets.generated.js";
import { buildConsoleHtml } from "../src/console/shell.js";

// Read the generated trust-panel module from source (like trust-panel-widget.test.ts)
// rather than importing the dist copy: the build regenerates
// src/trust-panel/trust-panel-module.generated.ts AFTER tsc runs, so the dist
// import would lag the current build by one generation.
const TRUST_PANEL_JS: string = await (async () => {
  const generated = await readFile("src/trust-panel/trust-panel-module.generated.ts", "utf8");
  const match = generated.match(/export const TRUST_PANEL_JS: string = (".*");/);
  assert.ok(match, "expected TRUST_PANEL_JS literal in trust-panel-module.generated.ts");
  return JSON.parse(match[1]) as string;
})();

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract an inline `const <name>[: Record<string, string>] = { key: "Label", ... };`
 * literal from renderer source text. Extraction failure fails the test — a
 * renamed or removed map cannot silently pass.
 */
function extractLabelMap(source: string, name: string): Record<string, string> {
  // Whitespace-tolerant: the shipped module is whitespace-minified.
  const match = source.match(new RegExp(`const ${name}(?:: Record<string, string>)?\\s*=\\s*\\{([^{}]*)\\}`));
  assert.ok(match, `expected to find inline label map ${name}`);
  const entries: Record<string, string> = {};
  for (const entry of match[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*):\s*"([^"]*)"/g)) entries[entry[1]!] = entry[2]!;
  assert.ok(Object.keys(entries).length > 0, `label map ${name} parsed to zero entries`);
  return entries;
}

/** Parse the vocab the console page actually ships to the browser client. */
function injectedVocab(html: string): Record<string, Record<string, string>> {
  const match = html.match(/window\.__SURFACE_CONFIG__ = (.*);<\/script>/);
  assert.ok(match, "expected __SURFACE_CONFIG__ in console HTML");
  const config = JSON.parse(match[1]) as { vocab?: Record<string, Record<string, string>> };
  assert.ok(config.vocab, "expected vocab in injected console config");
  return config.vocab;
}

// ── 1. coverage: the tables cover the enums exactly ────────────────────────

test("display-name tables cover each spec enum exactly — no missing, no invented members", () => {
  assert.deepEqual(Object.keys(TRUST_STATUS_DISPLAY_NAMES).sort(), [...TRUST_STATUSES].sort());
  assert.deepEqual(Object.keys(EVIDENCE_TYPE_DISPLAY_NAMES).sort(), [...EVIDENCE_TYPES].sort());
  assert.deepEqual(Object.keys(EVIDENCE_METHOD_DISPLAY_NAMES).sort(), [...EVIDENCE_METHODS].sort());
});

test("every display name has a non-empty label and a one-line gloss, unique within its axis", () => {
  for (const table of [TRUST_STATUS_DISPLAY_NAMES, EVIDENCE_TYPE_DISPLAY_NAMES, EVIDENCE_METHOD_DISPLAY_NAMES]) {
    const labels = Object.values(table).map((entry) => entry.label);
    assert.equal(new Set(labels).size, labels.length, "labels must not collapse two enum members into one name");
    for (const entry of Object.values(table)) {
      assert.ok(entry.label.trim().length > 0);
      assert.ok(entry.gloss.trim().length > 0);
      assert.ok(!entry.gloss.includes("\n"), "gloss must be one line");
    }
  }
});

test("label helpers resolve table members and fall back to the raw value, never an invented name", () => {
  assert.equal(trustStatusLabel("proposed"), "Pending review");
  assert.equal(evidenceTypeLabel("runtime_observation"), "Machine-observed at run time");
  assert.equal(evidenceMethodLabel("validation"), "Checked against expectations");
  assert.equal(trustStatusLabel("not-a-status"), "not-a-status");
  assert.equal(evidenceTypeLabel("not-a-type"), "not-a-type");
  assert.equal(evidenceMethodLabel("not-a-method"), "not-a-method");
});

// ── 2. trust panel: inline copies equal the canonical tables ───────────────

test("trust panel source's inline label maps equal the canonical tables", async () => {
  const source = await readFile("src/trust-panel/surface-trust-panel.ts", "utf8");
  assert.deepEqual(extractLabelMap(source, "STATUS_LABELS"), TRUST_STATUS_LABELS);
  assert.deepEqual(extractLabelMap(source, "EVIDENCE_TYPE_LABELS"), EVIDENCE_TYPE_LABELS);
  assert.deepEqual(extractLabelMap(source, "METHOD_LABELS"), EVIDENCE_METHOD_LABELS);
});

test("the built trust-panel module (what MCP UI / the console drawer ship) carries the same tables", () => {
  assert.deepEqual(extractLabelMap(TRUST_PANEL_JS, "STATUS_LABELS"), TRUST_STATUS_LABELS);
  assert.deepEqual(extractLabelMap(TRUST_PANEL_JS, "EVIDENCE_TYPE_LABELS"), EVIDENCE_TYPE_LABELS);
  assert.deepEqual(extractLabelMap(TRUST_PANEL_JS, "METHOD_LABELS"), EVIDENCE_METHOD_LABELS);
});

test("trust panel renders display labels, not raw wire enums, in the evidence head", async () => {
  const source = await readFile("src/trust-panel/surface-trust-panel.ts", "utf8");
  // The regression this issue fixes: `<strong>${evidenceType}</strong> via ${method}`
  // showed an owner the literal string "test_output via validation".
  assert.doesNotMatch(source, /<strong>\$\{escapeHtml\(asText\(item\.evidenceType[^}]*\)\)\}<\/strong> via /);
  assert.match(source, /EVIDENCE_TYPE_LABELS\[rawEvidenceType\]/);
  assert.match(source, /METHOD_LABELS\[rawMethod\]/);
  // Raw enums stay machine-readable on data attributes.
  assert.match(source, /data-evidence-type="\$\{escapeHtml\(rawEvidenceType\)\}"/);
  assert.match(source, /data-method="\$\{escapeHtml\(rawMethod\)\}"/);
});

// ── 2b. claim basis vocabulary (kontourai/ui#87) ───────────────────────────

test("basis tables cover their value sets exactly", () => {
  assert.deepEqual(Object.keys(DERIVATION_METHOD_DISPLAY_NAMES).sort(), [...DERIVATION_METHODS].sort());
  assert.deepEqual(Object.keys(EVIDENCE_SUPPORT_DISPLAY_NAMES).sort(), [...EVIDENCE_SUPPORT_STRENGTHS, "unstated"].sort());
  // reviewerAuthority / evidenceStrength have no runtime constant; pinned here
  // independently of the type so a dropped or invented member fails.
  assert.deepEqual(Object.keys(REVIEWER_AUTHORITY_DISPLAY_NAMES).sort(), ["domain_expert", "none", "operator", "system"]);
  assert.deepEqual(Object.keys(EVIDENCE_STRENGTH_DISPLAY_NAMES).sort(), ["moderate", "none", "strong", "weak"]);
  assert.deepEqual(Object.keys(EVIDENCE_RESULT_DISPLAY_NAMES).sort(), ["failed", "failed-blocking", "not-evaluated", "passed"]);
  assert.deepEqual(Object.keys(CLAIM_BASIS_MISSING_DISPLAY_NAMES).sort(), ["not-available", "not-recorded", "restricted", "unavailable"]);
});

test("basis tables: non-empty unique labels, one-line glosses, and the agreed voice", () => {
  const tables = [
    DERIVATION_METHOD_DISPLAY_NAMES,
    EVIDENCE_SUPPORT_DISPLAY_NAMES,
    EVIDENCE_RESULT_DISPLAY_NAMES,
    REVIEWER_AUTHORITY_DISPLAY_NAMES,
    EVIDENCE_STRENGTH_DISPLAY_NAMES,
    CLAIM_BASIS_MISSING_DISPLAY_NAMES,
  ];
  for (const table of tables) {
    const entries = Object.values(table) as Array<{ label: string; gloss: string }>;
    const labels = entries.map((entry) => entry.label);
    assert.equal(new Set(labels).size, labels.length);
    for (const entry of entries) {
      assert.ok(entry.label.trim().length > 0);
      assert.ok(entry.gloss.trim().length > 0 && !entry.gloss.includes("\n"));
      // "Verified" belongs to the status chip; basis copy never claims certainty.
      assert.doesNotMatch(`${entry.label} ${entry.gloss}`, /\b(verified|confirmed|trusted|certain|AI)\b/i);
    }
  }
  assert.equal(DERIVATION_METHOD_DISPLAY_NAMES.model.label, "Model-derived");
  for (const entry of Object.values(EVIDENCE_STRENGTH_DISPLAY_NAMES)) assert.match(entry.label, /\(producer-rated\)$/);
});

/**
 * The trust panel's support and result chips are string literals inside
 * supportFacet/resultFacet (importing the canonical tables would pull their
 * glosses into the panel bundle, past tests/basis-bundle-budget.test.ts).
 * Extract each state's label from the function bodies; extraction failure
 * fails the test.
 */
function extractPanelFacetLabels(source: string): { support: Record<string, string>; result: Record<string, string> } {
  const body = (name: string): string => {
    // Up to the next function declaration, so it also reads the whitespace-minified module.
    const match = source.match(new RegExp(`function ${name}\\([^)]*\\)(?::\\s*\\w+)?\\s*\\{([\\s\\S]*?)(?=\\bfunction\\s)`));
    assert.ok(match, `expected to find ${name} in the trust panel source`);
    return match[1]!;
  };
  const decode = (literal: string): string => JSON.parse(`"${literal}"`) as string;
  const pairs = (text: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const match of text.matchAll(/state:\s*"([\w-]+)",\s*label:\s*"((?:[^"\\]|\\.)*)"/g)) out[match[1]!] = decode(match[2]!);
    return out;
  };
  const support = pairs(body("supportFacet"));
  const resultBody = body("resultFacet");
  const result = pairs(resultBody);
  const failed = resultBody.match(/state:\s*blocks\s*\?\s*"failed-blocking"\s*:\s*"failed",\s*label:\s*blocks\s*\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  assert.ok(failed, "expected the failed / failed-blocking label ternary in resultFacet");
  result["failed-blocking"] = decode(failed[1]!);
  result.failed = decode(failed[2]!);
  return { support, result };
}

test("trust panel support and result chip labels equal the canonical basis tables (source and built module)", async () => {
  const source = await readFile("src/trust-panel/surface-trust-panel.ts", "utf8");
  for (const text of [source, TRUST_PANEL_JS]) {
    const { support, result } = extractPanelFacetLabels(text);
    assert.deepEqual(support, EVIDENCE_SUPPORT_LABELS);
    assert.deepEqual(result, EVIDENCE_RESULT_LABELS);
  }
});

// ── 3. console: canonical defaults injected, client resolves from vocab ────

test("buildConsoleHtml injects the canonical tables as vocab defaults", () => {
  const vocab = injectedVocab(buildConsoleHtml());
  assert.deepEqual(vocab.statusLabels, TRUST_STATUS_LABELS);
  assert.deepEqual(vocab.evidenceTypeLabels, EVIDENCE_TYPE_LABELS);
  assert.deepEqual(vocab.methodLabels, EVIDENCE_METHOD_LABELS);
});

test("product vocab overrides win per key without erasing the canonical defaults", () => {
  const vocab = injectedVocab(
    buildConsoleHtml({
      vocab: {
        statusLabels: { proposed: "Awaiting owner review" },
        methodLabels: { validation: "Machine-checked" },
      },
    }),
  );
  assert.equal(vocab.statusLabels.proposed, "Awaiting owner review");
  assert.equal(vocab.statusLabels.unknown, TRUST_STATUS_LABELS.unknown);
  assert.equal(vocab.methodLabels.validation, "Machine-checked");
  assert.equal(vocab.methodLabels.observation, EVIDENCE_METHOD_LABELS.observation);
  assert.deepEqual(vocab.evidenceTypeLabels, EVIDENCE_TYPE_LABELS);
});

test("the shipped console client resolves labels from vocab and holds no status-label literals", () => {
  // The client's statusLabel/evidenceTypeLabel/methodLabel are pure vocab
  // lookups with a raw-enum fallback — no inline label map to drift.
  assert.match(CONSOLE_SCRIPT, /vocab\.statusLabels\?\.\[status\] \?\? status/);
  assert.match(CONSOLE_SCRIPT, /vocab\.evidenceTypeLabels\?\.\[evidenceType\] \?\? evidenceType/);
  assert.match(CONSOLE_SCRIPT, /vocab\.methodLabels\?\.\[method\] \?\? method/);
});

// ── 4. the two renderers agree; the minted synonyms stay gone ──────────────

test("both shipped renderers use the same status labels (the 'Pending review' vs 'Pending' divergence is gone)", () => {
  const panelLabels = extractLabelMap(TRUST_PANEL_JS, "STATUS_LABELS");
  const consoleLabels = injectedVocab(buildConsoleHtml()).statusLabels;
  assert.deepEqual(consoleLabels, panelLabels);
  assert.equal(consoleLabels.proposed, "Pending review");
  assert.equal(consoleLabels.unknown, "No evidence");
});

test("previously minted console synonyms are absent from shipped renderer output", () => {
  assert.ok(!CONSOLE_SCRIPT.includes("Never run"), "console must not mint 'Never run' for unknown");
  assert.doesNotMatch(CONSOLE_SCRIPT, /proposed:\s*"Pending"/, "console must not mint 'Pending' for proposed");
  for (const synonym of ["witnessed", "repeatable"]) {
    assert.ok(!CONSOLE_SCRIPT.toLowerCase().includes(synonym), `console must not mint '${synonym}'`);
    assert.ok(!TRUST_PANEL_JS.toLowerCase().includes(synonym), `trust panel must not mint '${synonym}'`);
  }
});


test("requirement rows label each axis with its own table: method attestation is 'Vouched for', never 'Attested statement' (#224 review MEDIUM-1)", async () => {
  const analysis = await readFile("src/console/client/parts/analysis.js", "utf8");
  // The renderer must carry the axis per group rather than guessing by lookup order.
  assert.match(analysis, /axis === "method" \? methodLabel\(v\) : evidenceTypeLabel\(v\)/);
  const detail = await readFile("src/console/client/parts/detail.js", "utf8");
  assert.match(detail, /axis: "method"/);
  assert.match(detail, /axis: "evidenceType"/);
  // The ambiguity that motivated this: the two tables genuinely disagree on the shared key.
  assert.notStrictEqual(EVIDENCE_TYPE_DISPLAY_NAMES.attestation.label, EVIDENCE_METHOD_DISPLAY_NAMES.attestation.label);
});

test("the divergence banner renders status display names, not raw enums (#224 review MEDIUM-2)", async () => {
  const detail = await readFile("src/console/client/parts/detail.js", "utf8");
  assert.match(detail, /statusLabel\(claim\.producerStatus\)/);
  assert.match(detail, /statusLabel\(claim\.status\)/);
  assert.doesNotMatch(detail, /"Producer declared " \+ claim\.producerStatus/);
});
