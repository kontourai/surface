import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTrustReport, deriveWaiverValidity, validateTrustBundle } from "../src/index.js";

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string | null;
  result?: any;
  error?: { code: number; message: string };
}

test("surface mcp serves trust state over the Model Context Protocol", async () => {
  const server = spawn("node", ["bin/surface.mjs", "mcp", "--input", "examples/surface-example-bundle.json"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = collectResponses(server.stdout);

  try {
    send(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "surface-tests", version: "0.0.0" },
      },
    });
    const initialize = await responses.next(1);
    assert.equal(initialize.result.serverInfo.name, "kontour-surface");
    assert.equal(initialize.result.protocolVersion, "2025-06-18");
    assert.ok(initialize.result.capabilities.tools);
    // SEP-1865: resources back the ui:// trust panel, and the MCP Apps
    // capability extension is advertised.
    assert.ok(initialize.result.capabilities.resources);
    assert.ok(initialize.result.capabilities.extensions?.["io.modelcontextprotocol/ui"]);

    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    send(server, { jsonrpc: "2.0", id: 2, method: "ping" });
    const ping = await responses.next(2);
    assert.deepEqual(ping.result, {});

    send(server, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const toolsList = await responses.next(3);
    const toolNames = toolsList.result.tools.map((tool: { name: string }) => tool.name).sort();
    assert.deepEqual(toolNames, [
      "surface_get_claim",
      "surface_missing_evidence",
      "surface_policy",
      "surface_stale_claims",
      "surface_summary",
      "surface_waiver_validity",
    ]);
    for (const tool of toolsList.result.tools) {
      assert.equal(typeof tool.description, "string");
      assert.equal(tool.inputSchema.type, "object");
    }
    // surface_summary advertises its SEP-1865 UI resource in BOTH the flat
    // canonical key and the nested convenience shape, so one server renders in
    // the official Apps hosts (ChatGPT/Claude) and in Station alike.
    const summaryTool = toolsList.result.tools.find(
      (tool: { name: string }) => tool.name === "surface_summary",
    );
    assert.equal(summaryTool._meta["ui/resourceUri"], "ui://surface/trust-panel/summary");
    assert.equal(summaryTool._meta.ui.resourceUri, "ui://surface/trust-panel/summary");

    send(server, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "surface_summary", arguments: {} } });
    const summary = await responses.next(4);
    assert.equal(summary.result.isError, false);
    // First content entry must be the text summary
    assert.equal(summary.result.content[0].type, "text");
    assert.match(summary.result.content[0].text, /Kontour Surface report/);
    assert.match(summary.result.content[0].text, /Claims: 4/);
    // Second content entry is the MCP UI resource
    assert.equal(summary.result.content.length, 2);
    const summaryUiResource = summary.result.content[1];
    assert.equal(summaryUiResource.type, "resource");
    assert.equal(summaryUiResource.resource.uri, "ui://surface/trust-panel/summary");
    assert.equal(summaryUiResource.resource.mimeType, "text/html;profile=mcp-app");
    assert.ok(summaryUiResource.resource.text.includes("<surface-trust-panel>"));
    assert.ok(summaryUiResource.resource.text.includes("surface-trust-panel"));
    // Report data is embedded in the HTML
    assert.ok(summaryUiResource.resource.text.includes("field-attested-records"));

    send(server, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "surface_stale_claims", arguments: {} } });
    const stale = await responses.next(5);
    assert.equal(stale.result.isError, false);
    const staleClaims = JSON.parse(stale.result.content[0].text);
    assert.ok(Array.isArray(staleClaims));
    assert.ok(staleClaims.some((claim: { claimId: string }) => claim.claimId.includes("registration-status")));

    send(server, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "surface_get_claim", arguments: { claimId: "claim.field-attested-records.registration-status" } },
    });
    const drilldown = await responses.next(6);
    assert.equal(drilldown.result.isError, false);
    // First content entry must be the text drilldown
    assert.equal(drilldown.result.content[0].type, "text");
    const claimView = JSON.parse(drilldown.result.content[0].text);
    assert.equal(claimView.claim.id, "claim.field-attested-records.registration-status");
    assert.ok(Array.isArray(claimView.evidence));
    assert.ok(claimView.derivation);
    // Second content entry is the MCP UI resource
    assert.equal(drilldown.result.content.length, 2);
    const claimUiResource = drilldown.result.content[1];
    assert.equal(claimUiResource.type, "resource");
    assert.equal(
      claimUiResource.resource.uri,
      "ui://surface/trust-panel/claim-claim.field-attested-records.registration-status",
    );
    assert.equal(claimUiResource.resource.mimeType, "text/html;profile=mcp-app");
    assert.ok(claimUiResource.resource.text.includes("<surface-trust-panel>"));
    // Report data containing the claim is embedded
    assert.ok(claimUiResource.resource.text.includes("field-attested-records"));

    send(server, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "surface_get_claim", arguments: { claimId: "claim.does-not-exist" } },
    });
    const missingClaim = await responses.next(7);
    assert.equal(missingClaim.result.isError, true);
    assert.match(missingClaim.result.content[0].text, /Unknown claim/);

    send(server, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "not_a_tool", arguments: {} } });
    const unknownTool = await responses.next(8);
    assert.equal(unknownTool.error?.code, -32602);
    assert.match(unknownTool.error?.message ?? "", /Unknown tool/);

    // SEP-1865 declared-resource path: list + read the trust panel resource.
    send(server, { jsonrpc: "2.0", id: 9, method: "resources/list" });
    const resourcesList = await responses.next(9);
    const listed = resourcesList.result.resources;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].uri, "ui://surface/trust-panel/summary");
    assert.equal(listed[0].mimeType, "text/html;profile=mcp-app");

    send(server, {
      jsonrpc: "2.0",
      id: 10,
      method: "resources/read",
      params: { uri: "ui://surface/trust-panel/summary" },
    });
    const resourceRead = await responses.next(10);
    const contents = resourceRead.result.contents;
    assert.equal(contents.length, 1);
    assert.equal(contents[0].uri, "ui://surface/trust-panel/summary");
    assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
    assert.ok(contents[0].text.includes("surface-trust-panel"));
    // The report data is embedded in the read resource (no extra round-trip).
    assert.ok(contents[0].text.includes("field-attested-records"));

    send(server, {
      jsonrpc: "2.0",
      id: 11,
      method: "resources/read",
      params: { uri: "ui://surface/does-not-exist" },
    });
    const unknownResource = await responses.next(11);
    assert.equal(unknownResource.error?.code, -32602);

    send(server, { jsonrpc: "2.0", id: 12, method: "no/such/method" });
    const unknownMethod = await responses.next(12);
    assert.equal(unknownMethod.error?.code, -32601);
  } finally {
    server.stdin.end();
    await once(server, "exit");
  }
});

test("surface mcp --no-ui omits the UI resource entry", async () => {
  const server = spawn(
    "node",
    ["bin/surface.mjs", "mcp", "--input", "examples/surface-example-bundle.json", "--no-ui"],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const responses = collectResponses(server.stdout);

  try {
    send(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "surface-tests", version: "0.0.0" },
      },
    });
    const noUiInitialize = await responses.next(1);
    // --no-ui suppresses the resources capability and the MCP Apps extension.
    assert.equal(noUiInitialize.result.capabilities.resources, undefined);
    assert.equal(noUiInitialize.result.capabilities.extensions, undefined);
    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    // No UI resources are advertised, and tools carry no SEP-1865 _meta.
    send(server, { jsonrpc: "2.0", id: 10, method: "resources/list" });
    const noUiResources = await responses.next(10);
    assert.equal(noUiResources.result.resources.length, 0);

    send(server, { jsonrpc: "2.0", id: 11, method: "tools/list" });
    const noUiTools = await responses.next(11);
    const noUiSummary = noUiTools.result.tools.find(
      (tool: { name: string }) => tool.name === "surface_summary",
    );
    assert.equal(noUiSummary._meta, undefined);

    send(server, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "surface_summary", arguments: {} } });
    const summary = await responses.next(2);
    assert.equal(summary.result.isError, false);
    assert.equal(summary.result.content.length, 1);
    assert.equal(summary.result.content[0].type, "text");
    assert.match(summary.result.content[0].text, /Kontour Surface report/);

    send(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "surface_get_claim", arguments: { claimId: "claim.field-attested-records.registration-status" } },
    });
    const drilldown = await responses.next(3);
    assert.equal(drilldown.result.isError, false);
    assert.equal(drilldown.result.content.length, 1);
    assert.equal(drilldown.result.content[0].type, "text");
    const claimView = JSON.parse(drilldown.result.content[0].text);
    assert.equal(claimView.claim.id, "claim.field-attested-records.registration-status");
  } finally {
    server.stdin.end();
    await once(server, "exit");
  }
});

test("surface_waiver_validity tool: tools/list entry and call round-trip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-mcp-waiver-"));
  const bundlePath = join(dir, "waiver-bundle.json");
  const waivedClaimId = "claim.waiver-test.waived";
  const bareClaimId = "claim.waiver-test.bare";
  const staleClaimId = "claim.waiver-test.stale";
  const commandBackedClaimId = "claim.waiver-test.command-backed";
  const escReasonClaimId = "claim.waiver-test.esc-reason";
  const bidiApprovedByClaimId = "claim.waiver-test.bidi-approved-by";
  // Raw ESC byte in `reason` -- proves the double JSON.stringify encoding
  // already neutralizes ANSI injection (finding 6, test (a)).
  const escReason = "\x1b[31mhack\x1b[0m";
  // Raw RTL-override character in `approved_by` -- proves the new
  // stripUnsafeRenderingChars fix (finding 6, test (b)); JSON.stringify alone
  // would let this character through untouched.
  const bidiApprovedBy = "\u202eevil\u202c";

  const bundle = {
    schemaVersion: 3,
    source: "surface-mcp-waiver-validity-test",
    claims: [
      {
        id: waivedClaimId,
        subjectType: "test-subject",
        subjectId: "subject-waived",
        claimType: "test-claim",
        fieldOrBehavior: "status",
        value: "OK",
        status: "assumed",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        metadata: {
          waiver: {
            reason: "Deferred pending release.",
            approved_by: "actor:eng-lead-1",
            approved_at: "2026-06-01T00:00:00.000Z",
          },
        },
      },
      {
        id: bareClaimId,
        subjectType: "test-subject",
        subjectId: "subject-bare",
        claimType: "test-claim",
        fieldOrBehavior: "status",
        value: "OK",
        status: "assumed",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: staleClaimId,
        subjectType: "test-subject",
        subjectId: "subject-stale",
        claimType: "test-claim",
        fieldOrBehavior: "status",
        value: "OK",
        status: "stale",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        metadata: {
          waiver: {
            reason: "Deferred pending release.",
            approved_by: "actor:eng-lead-1",
            approved_at: "2026-06-01T00:00:00.000Z",
          },
        },
      },
      {
        id: commandBackedClaimId,
        subjectType: "test-subject",
        subjectId: "subject-command-backed",
        claimType: "test-claim",
        fieldOrBehavior: "status",
        value: "OK",
        status: "assumed",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        metadata: {
          waiver: {
            reason: "Deferred pending release.",
            approved_by: "actor:eng-lead-1",
            approved_at: "2026-06-01T00:00:00.000Z",
          },
        },
      },
      {
        id: escReasonClaimId,
        subjectType: "test-subject",
        subjectId: "subject-esc-reason",
        claimType: "test-claim",
        fieldOrBehavior: "status",
        value: "OK",
        status: "assumed",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        metadata: {
          waiver: {
            reason: escReason,
            approved_by: "actor:eng-lead-1",
            approved_at: "2026-06-01T00:00:00.000Z",
          },
        },
      },
      {
        id: bidiApprovedByClaimId,
        subjectType: "test-subject",
        subjectId: "subject-bidi-approved-by",
        claimType: "test-claim",
        fieldOrBehavior: "status",
        value: "OK",
        status: "assumed",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        metadata: {
          waiver: {
            reason: "Deferred pending release.",
            approved_by: bidiApprovedBy,
            approved_at: "2026-06-01T00:00:00.000Z",
          },
        },
      },
    ],
    evidence: [
      {
        id: "evidence.command-backed-test-output",
        claimId: commandBackedClaimId,
        evidenceType: "test_output",
        method: "validation",
        sourceRef: "run:command-backed",
        excerptOrSummary: "CI run",
        observedAt: "2026-06-01T00:00:00.000Z",
        collectedBy: "ci",
      },
    ],
    policies: [],
    // A status-driven event is required for the stale claim: `deriveTrustStatus`
    // only honors a bare claim.status of "assumed"/"proposed" with no events at
    // all -- "stale" needs an explicit event to derive as "stale" rather than
    // falling through to "unknown" (which would make the waiver verdict
    // "not-applicable" instead of "stale-or-revoked-waiver").
    events: [
      {
        id: `event.${staleClaimId}.stale`,
        claimId: staleClaimId,
        status: "stale",
        actor: "monitor",
        method: "freshness-check",
        evidenceIds: [],
        createdAt: "2026-06-01T00:05:00.000Z",
      },
    ],
  };
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");

  const server = spawn("node", ["bin/surface.mjs", "mcp", "--input", bundlePath, "--no-ui"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = collectResponses(server.stdout);

  try {
    send(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "surface-tests", version: "0.0.0" },
      },
    });
    await responses.next(1);
    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    send(server, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const toolsList = await responses.next(2);
    const waiverTool = toolsList.result.tools.find(
      (tool: { name: string }) => tool.name === "surface_waiver_validity",
    );
    assert.ok(waiverTool, "surface_waiver_validity must be listed");
    assert.equal(typeof waiverTool.description, "string");
    assert.equal(waiverTool.inputSchema.type, "object");
    assert.equal(waiverTool.inputSchema.properties.claimId.type, "string");
    // All 6 verdicts must be enumerated, including "not-applicable" (finding 8).
    assert.match(waiverTool.description, /not-applicable/);

    // Call without claimId: every claim in the report gets a verdict.
    send(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: {} },
    });
    const all = await responses.next(3);
    assert.equal(all.result.isError, false);
    const allMap = JSON.parse(all.result.content[0].text);
    assert.equal(allMap[waivedClaimId].verdict, "complete-waiver");
    assert.equal(allMap[waivedClaimId].approverAuthenticated, false);
    assert.equal(allMap[waivedClaimId].waiver.reason, "Deferred pending release.");
    assert.equal(allMap[bareClaimId].verdict, "bare-assumed");
    assert.equal(allMap[bareClaimId].approverAuthenticated, false);
    assert.equal(allMap[bareClaimId].waiver, undefined);
    // MCP round-trip coverage for stale-or-revoked-waiver and
    // command-backed-waiver-rejection (previously only exercised at the
    // unit/report layer, per the code review INFO finding).
    assert.equal(allMap[staleClaimId].verdict, "stale-or-revoked-waiver");
    assert.equal(allMap[commandBackedClaimId].verdict, "command-backed-waiver-rejection");

    // Call with claimId: only that claim's verdict comes back.
    send(server, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: waivedClaimId } },
    });
    const filtered = await responses.next(4);
    assert.equal(filtered.result.isError, false);
    const filteredMap = JSON.parse(filtered.result.content[0].text);
    assert.deepEqual(Object.keys(filteredMap), [waivedClaimId]);
    assert.equal(filteredMap[waivedClaimId].verdict, "complete-waiver");

    // Parity proof: the tool's result for a given claim is deep-equal to
    // buildTrustReport(...).waiverValidityByClaimId[claimId] (finding 3) --
    // catches a future divergence between the report field and the tool.
    const parsedBundle = validateTrustBundle(bundle);
    const directReport = buildTrustReport(parsedBundle);
    assert.deepEqual(
      filteredMap[waivedClaimId],
      directReport.waiverValidityByClaimId[waivedClaimId],
    );

    // Unknown claimId is an error, mirroring surface_get_claim.
    send(server, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: "claim.does-not-exist" } },
    });
    const missing = await responses.next(5);
    assert.equal(missing.result.isError, true);
    assert.match(missing.result.content[0].text, /Unknown claim/);

    // claimId "toString" repro (Codex High/Medium finding, mcp.ts:148): before
    // the Object.hasOwn fix, `"toString" in {}` was `true` via
    // Object.prototype.toString, so this returned `{}` instead of erroring.
    send(server, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: "toString" } },
    });
    const toStringResult = await responses.next(6);
    assert.equal(toStringResult.result.isError, true);
    assert.match(toStringResult.result.content[0].text, /Unknown claim: toString/);

    // ESC byte in `reason` round-trips as the literal six-character escape
    // sequence "\u001b" in the raw JSON-RPC stdout text -- this is the
    // (accidentally safe) double-JSON.stringify object-payload path: the
    // payload passes through JSON.stringify once inside buildToolContent and
    // again in send()'s outer envelope, so the ESC byte is already "cooked"
    // into printable escape text before the sanitizer even runs. This does
    // NOT generalize to bare-string payloads (see the surface_summary
    // hostile-source test below, r2 MEDIUM finding) -- that path only passes
    // through one JSON.stringify layer and relies on the sanitizer's own
    // C0-control stripping, not on encoding alone.
    send(server, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: escReasonClaimId } },
    });
    const escResult = await responses.next(7);
    assert.equal(escResult.result.isError, false);
    const escText: string = escResult.result.content[0].text;
    assert.ok(escText.includes("\\u001b"), "raw ESC byte must round-trip as the literal \\u001b escape sequence");
    assert.ok(!escText.includes("\x1b"), "raw ESC byte must not appear unescaped in the stdout text");

    // RTL-override character in `approved_by` is absent from the tool's text
    // content after stripUnsafeRenderingChars runs -- proves the new fix,
    // since JSON.stringify alone would have let it through (finding 6, test (b)).
    send(server, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: bidiApprovedByClaimId } },
    });
    const bidiResult = await responses.next(8);
    assert.equal(bidiResult.result.isError, false);
    const bidiText: string = bidiResult.result.content[0].text;
    assert.ok(!bidiText.includes("\u202e"), "RTL-override character must be stripped from MCP text output");
    assert.ok(!bidiText.includes("\u202c"), "PDF (pop directional formatting) character must be stripped too");
    assert.ok(bidiText.includes("evil"), "the surrounding plain text must survive stripping");
  } finally {
    server.stdin.end();
    await once(server, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});

test("surface mcp: sanitizer boundary covers bare-string surface_summary output and the tool-error path (r2 MEDIUM repros)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-mcp-sanitizer-"));
  const bundlePath = join(dir, "sanitizer-bundle.json");
  // Hostile `source` field: raw ESC (U+001B) + BEL (U+0007) bytes, exactly the
  // review-security-r2.md/review-codex-r2.md repro shape. `surface_summary`'s
  // `_summary` is a BARE STRING (src/report.ts formatTrustReportSummary), so
  // it takes buildToolContent's single-JSON.stringify string branch -- unlike
  // the object-payload ESC test above, a raw ESC/BEL byte here is NOT
  // "encoded away" by JSON.stringify alone and must be stripped by
  // stripUnsafeRenderingChars itself.
  const hostileSource = "safe[31mRED[0mend";

  const bundle = {
    schemaVersion: 3,
    source: hostileSource,
    claims: [
      {
        id: "claim.sanitizer-test.verified",
        subjectType: "test-subject",
        subjectId: "subject-verified",
        claimType: "test-claim",
        fieldOrBehavior: "status",
        value: "OK",
        status: "verified",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    evidence: [],
    policies: [],
    events: [],
  };
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");

  const server = spawn("node", ["bin/surface.mjs", "mcp", "--input", bundlePath, "--no-ui"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = collectResponses(server.stdout);

  try {
    send(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "surface-tests", version: "0.0.0" },
      },
    });
    await responses.next(1);
    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    // (1) Hostile source string with a raw ESC byte -> sanitized in the
    // surface_summary bare-string output (review-security-r2.md MEDIUM,
    // review-codex-r2.md MEDIUM).
    send(server, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "surface_summary", arguments: {} } });
    const summary = await responses.next(2);
    assert.equal(summary.result.isError, false);
    const summaryText: string = summary.result.content[0].text;
    assert.ok(!summaryText.includes("\x1b"), "raw ESC byte must be stripped from the bare-string surface_summary text");
    assert.ok(!summaryText.includes("\x07"), "raw BEL byte must be stripped from the bare-string surface_summary text");
    assert.ok(summaryText.includes("safe"), "surrounding plain text must survive stripping");
    assert.ok(summaryText.includes("RED"), "surrounding plain text must survive stripping");
    assert.ok(summaryText.includes("end"), "surrounding plain text must survive stripping");
    // (3) Ordinary newlines are preserved in a legitimate multi-line summary
    // (formatTrustReportSummary joins its lines with "\n") -- the sanitizer
    // must not strip \n/\t/\r while stripping C0 controls.
    assert.ok(summaryText.includes("\n"), "ordinary newlines in the summary must be preserved, not stripped");
    assert.match(summaryText, /Kontour Surface report/);

    // (2) claimId containing a bidi RTL-override character -> sanitized in
    // the "Unknown claim" tool-error text, which previously bypassed
    // buildToolContent (and its sanitizer) entirely (review-codex-r2.md
    // mcp.ts:287 repro).
    const rtlClaimId = "missing‮txt";
    send(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: rtlClaimId } },
    });
    const rtlError = await responses.next(3);
    assert.equal(rtlError.result.isError, true);
    const rtlErrorText: string = rtlError.result.content[0].text;
    assert.match(rtlErrorText, /Unknown claim/);
    assert.ok(!rtlErrorText.includes("\u202e"), "RTL-override character must be stripped from the error text");
    assert.ok(rtlErrorText.includes("missing"), "surrounding plain text of the error message must survive stripping");
    assert.ok(rtlErrorText.includes("txt"), "surrounding plain text of the error message must survive stripping");

    // U+061C ARABIC LETTER MARK -> sanitized in the same error path (r2 LOW
    // finding: the bidi denylist previously omitted U+061C).
    const armClaimId = "؜";
    send(server, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "surface_waiver_validity", arguments: { claimId: armClaimId } },
    });
    const armError = await responses.next(4);
    assert.equal(armError.result.isError, true);
    const armErrorText: string = armError.result.content[0].text;
    assert.match(armErrorText, /Unknown claim/);
    assert.ok(!armErrorText.includes("\u061c"), "Arabic Letter Mark must be stripped from the error text");
  } finally {
    server.stdin.end();
    await once(server, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});

test("surface mcp launched without --input is input-agnostic: honest error, no silent example data (#95)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surface-mcp-noinput-"));
  const bundlePath = join(dir, "trust-bundle.json");
  await writeFile(bundlePath, JSON.stringify(validateTrustBundle({
    schemaVersion: 5, source: "producer", claims: [], evidence: [], policies: [], events: [],
  })), "utf8");

  // No --input: the server must NOT fall back to the bundled example bundle.
  const server = spawn("node", ["bin/surface.mjs", "mcp", "--no-ui"], { stdio: ["pipe", "pipe", "inherit"] });
  const responses = collectResponses(server.stdout);

  try {
    send(server, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
    await responses.next(1);
    send(server, { jsonrpc: "2.0", method: "notifications/initialized" });

    // A call with no per-call input and no startup input → clear error, not example data.
    send(server, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "surface_summary", arguments: {} } });
    const noInput = await responses.next(2);
    assert.equal(noInput.result.isError, true);
    assert.match(noInput.result.content[0].text, /No trust input configured/);

    // A per-call input makes the same server serve that input (first-class multi-input).
    send(server, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "surface_summary", arguments: { input: bundlePath } } });
    const withInput = await responses.next(3);
    assert.equal(withInput.result.isError, false);
    assert.match(withInput.result.content[0].text, /Kontour Surface report/);
  } finally {
    server.stdin.end();
    await once(server, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});

function send(server: ReturnType<typeof spawn>, message: unknown): void {
  server.stdin!.write(`${JSON.stringify(message)}\n`);
}

function collectResponses(stdout: NodeJS.ReadableStream) {
  const byId = new Map<number, JsonRpcResponse>();
  const waiters = new Map<number, (response: JsonRpcResponse) => void>();
  const rl = createInterface({ input: stdout });
  rl.on("line", (line) => {
    if (line.trim() === "") return;
    const parsed = JSON.parse(line) as JsonRpcResponse;
    if (typeof parsed.id !== "number") return;
    const waiter = waiters.get(parsed.id);
    if (waiter) {
      waiters.delete(parsed.id);
      waiter(parsed);
    } else {
      byId.set(parsed.id, parsed);
    }
  });

  return {
    next(id: number): Promise<JsonRpcResponse> {
      const existing = byId.get(id);
      if (existing) {
        byId.delete(id);
        return Promise.resolve(existing);
      }
      return new Promise((resolveResponse, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for response ${id}`)), 15_000);
        waiters.set(id, (response) => {
          clearTimeout(timer);
          resolveResponse(response);
        });
      });
    },
  };
}
