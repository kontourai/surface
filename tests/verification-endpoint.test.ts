/**
 * Tests for src/verification-endpoint.ts
 *
 * Covers:
 *  - known ref → scoped bundle with correct metadata
 *  - unknown ref → listed in unknownRefs, never silently omitted
 *  - mixed refs → known in bundle, unknown in unknownRefs
 *  - signer provided → valid DSSE envelope (verify PAE with fake signer)
 *  - http adapter GET + POST paths via mocked req/res
 *  - http adapter error paths (method not allowed, empty refs, bad JSON)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createVerificationResponder,
  createVerificationHttpHandler,
} from "../src/verification-endpoint.js";
import type { VerificationStore } from "../src/verification-endpoint.js";
import type { Claim, Evidence, VerificationEvent } from "../src/types.js";
import { buildPaeBytes } from "../src/interop/in-toto.js";
import type { Signer } from "../src/interop/in-toto.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLAIM_A: Claim = {
  id: "claim-a",
  subjectType: "service",
  subjectId: "api",
  facet: "test",
  claimType: "availability",
  fieldOrBehavior: "uptime",
  value: 99.9,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const EVIDENCE_A: Evidence = {
  id: "ev-a",
  claimId: "claim-a",
  evidenceType: "test_output",
  method: "validation",
  sourceRef: "run-001",
  excerptOrSummary: "uptime check passed",
  observedAt: "2025-01-01T00:00:00Z",
  collectedBy: "ci",
};

const EVENT_A: VerificationEvent = {
  id: "evt-a",
  claimId: "claim-a",
  status: "verified",
  actor: "ci",
  method: "automated",
  evidenceIds: ["ev-a"],
  createdAt: "2025-01-01T00:00:00Z",
};

function makeFakeStore(records: Record<string, {
  claims: Claim[];
  evidence: Evidence[];
  events: VerificationEvent[];
}>): VerificationStore {
  return {
    async lookupByIntegrityRef(ref) {
      return records[ref] ?? null;
    },
  };
}

/** A fake signer that records what it was asked to sign. */
function makeFakeSigner(): Signer & { calls: Uint8Array[] } {
  const calls: Uint8Array[] = [];
  return {
    keyid: "test-key",
    calls,
    async sign(paeBytes: Uint8Array): Promise<string> {
      calls.push(paeBytes);
      return Buffer.from("fake-sig").toString("base64");
    },
  };
}

const FIXED_NOW = new Date("2025-06-01T12:00:00Z");
const SOURCE = "https://producer.example.com";
const SFV = "1";

// ---------------------------------------------------------------------------
// createVerificationResponder — known ref
// ---------------------------------------------------------------------------

test("known ref → bundle contains matching claims, evidence, and events", async () => {
  const store = makeFakeStore({
    "sha256:aaaa": { claims: [CLAIM_A], evidence: [EVIDENCE_A], events: [EVENT_A] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["sha256:aaaa"], { now: FIXED_NOW });

  assert.deepEqual(bundle.claims, [CLAIM_A]);
  assert.deepEqual(bundle.evidence, [EVIDENCE_A]);
  assert.deepEqual(bundle.events, [EVENT_A]);
});

test("known ref → bundle source matches options.source", async () => {
  const store = makeFakeStore({
    "sha256:aaaa": { claims: [CLAIM_A], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["sha256:aaaa"], { now: FIXED_NOW });

  assert.equal(bundle.source, SOURCE);
});

test("known ref → metadata.respondedAt equals now.toISOString()", async () => {
  const store = makeFakeStore({
    "sha256:aaaa": { claims: [], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["sha256:aaaa"], { now: FIXED_NOW });

  assert.equal(bundle.metadata.respondedAt, FIXED_NOW.toISOString());
});

test("known ref → metadata.statusFunctionVersion matches options", async () => {
  const store = makeFakeStore({
    "sha256:aaaa": { claims: [], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: "42" });
  const { bundle } = await responder(["sha256:aaaa"], { now: FIXED_NOW });

  assert.equal(bundle.metadata.statusFunctionVersion, "42");
});

test("known ref → metadata.requestedRefs preserves order", async () => {
  const store = makeFakeStore({
    "ref-1": { claims: [], evidence: [], events: [] },
    "ref-2": { claims: [], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["ref-2", "ref-1"], { now: FIXED_NOW });

  assert.deepEqual(bundle.metadata.requestedRefs, ["ref-2", "ref-1"]);
});

test("known ref → metadata.unknownRefs is empty array", async () => {
  const store = makeFakeStore({
    "sha256:aaaa": { claims: [], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["sha256:aaaa"], { now: FIXED_NOW });

  assert.deepEqual(bundle.metadata.unknownRefs, []);
});

// ---------------------------------------------------------------------------
// createVerificationResponder — unknown ref
// ---------------------------------------------------------------------------

test("unknown ref → bundle claims/evidence/events are empty", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["sha256:unknown"], { now: FIXED_NOW });

  assert.deepEqual(bundle.claims, []);
  assert.deepEqual(bundle.evidence, []);
  assert.deepEqual(bundle.events, []);
});

test("unknown ref → listed in metadata.unknownRefs", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["sha256:missing"], { now: FIXED_NOW });

  assert.deepEqual(bundle.metadata.unknownRefs, ["sha256:missing"]);
});

test("unknown ref is never silently omitted — still appears in requestedRefs", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["sha256:ghost"], { now: FIXED_NOW });

  assert.ok(bundle.metadata.requestedRefs.includes("sha256:ghost"));
  assert.ok(bundle.metadata.unknownRefs.includes("sha256:ghost"));
});

// ---------------------------------------------------------------------------
// createVerificationResponder — mixed refs
// ---------------------------------------------------------------------------

test("mixed refs → known claims merged, unknown refs reported", async () => {
  const store = makeFakeStore({
    "ref-known": { claims: [CLAIM_A], evidence: [EVIDENCE_A], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["ref-known", "ref-unknown"], { now: FIXED_NOW });

  assert.deepEqual(bundle.claims, [CLAIM_A]);
  assert.deepEqual(bundle.evidence, [EVIDENCE_A]);
  assert.deepEqual(bundle.metadata.unknownRefs, ["ref-unknown"]);
  assert.deepEqual(bundle.metadata.requestedRefs, ["ref-known", "ref-unknown"]);
});

test("multiple known refs → claims from all are merged", async () => {
  const claimB: Claim = { ...CLAIM_A, id: "claim-b" };
  const store = makeFakeStore({
    "ref-1": { claims: [CLAIM_A], evidence: [], events: [] },
    "ref-2": { claims: [claimB], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["ref-1", "ref-2"], { now: FIXED_NOW });

  assert.equal(bundle.claims.length, 2);
  assert.deepEqual(bundle.metadata.unknownRefs, []);
});

// ---------------------------------------------------------------------------
// createVerificationResponder — authorityTrace forwarding
// ---------------------------------------------------------------------------

test("authorityTrace records are forwarded when store returns them", async () => {
  const trace = {
    id: "trace-1",
    subject: { subjectType: "service", subjectId: "api" },
    actorRef: "actor-1",
    authorityType: "role" as const,
    authorityRef: "approver",
    sourceRef: "doc-1",
    observedAt: "2025-01-01T00:00:00Z",
  };
  const store = makeFakeStore({});
  const storeWithTrace: VerificationStore = {
    async lookupByIntegrityRef(ref) {
      if (ref === "ref-trace") {
        return { claims: [], evidence: [], events: [], authorityTrace: [trace] };
      }
      return null;
    },
  };
  const responder = createVerificationResponder(storeWithTrace, { source: SOURCE, statusFunctionVersion: SFV });
  const { bundle } = await responder(["ref-trace"], { now: FIXED_NOW });

  assert.ok(Array.isArray(bundle.authorityTrace));
  assert.deepEqual(bundle.authorityTrace, [trace]);
});

// ---------------------------------------------------------------------------
// createVerificationResponder — no signer → no envelope
// ---------------------------------------------------------------------------

test("no signer → envelope is undefined", async () => {
  const store = makeFakeStore({ "r": { claims: [], evidence: [], events: [] } });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const result = await responder(["r"], { now: FIXED_NOW });

  assert.equal(result.envelope, undefined);
});

// ---------------------------------------------------------------------------
// createVerificationResponder — signer provided → DSSE envelope
// ---------------------------------------------------------------------------

test("signer provided → envelope is defined", async () => {
  const signer = makeFakeSigner();
  const store = makeFakeStore({ "r": { claims: [], evidence: [], events: [] } });
  const responder = createVerificationResponder(store, {
    source: SOURCE,
    statusFunctionVersion: SFV,
    signer,
  });
  const result = await responder(["r"], { now: FIXED_NOW });

  assert.ok(result.envelope !== undefined);
});

test("signer provided → envelope payloadType is application/vnd.in-toto+json", async () => {
  const signer = makeFakeSigner();
  const store = makeFakeStore({ "r": { claims: [], evidence: [], events: [] } });
  const responder = createVerificationResponder(store, {
    source: SOURCE,
    statusFunctionVersion: SFV,
    signer,
  });
  const { envelope } = await responder(["r"], { now: FIXED_NOW });

  assert.equal(envelope?.payloadType, "application/vnd.in-toto+json");
});

test("signer provided → envelope payload decodes to Statement with bundle as predicate", async () => {
  const signer = makeFakeSigner();
  const store = makeFakeStore({ "r": { claims: [CLAIM_A], evidence: [], events: [] } });
  const responder = createVerificationResponder(store, {
    source: SOURCE,
    statusFunctionVersion: SFV,
    signer,
  });
  const { bundle, envelope } = await responder(["r"], { now: FIXED_NOW });

  assert.ok(envelope !== undefined);
  const decoded = Buffer.from(envelope.payload, "base64").toString("utf8");
  const statement = JSON.parse(decoded) as Record<string, unknown>;
  assert.equal(statement["_type"], "https://in-toto.io/Statement/v1");
  assert.equal(statement["predicateType"], "https://hachure.org/v1/bundle");
  assert.deepEqual(statement["predicate"], bundle);
});

test("signer receives PAE bytes — reconstructed PAE matches what signer saw", async () => {
  const signer = makeFakeSigner();
  const store = makeFakeStore({ "r": { claims: [], evidence: [], events: [] } });
  const responder = createVerificationResponder(store, {
    source: SOURCE,
    statusFunctionVersion: SFV,
    signer,
  });
  const { envelope } = await responder(["r"], { now: FIXED_NOW });

  assert.ok(envelope !== undefined);
  assert.equal(signer.calls.length, 1);

  // Reconstruct PAE from envelope and verify it matches what the signer received.
  const payloadJson = Buffer.from(envelope.payload, "base64").toString("utf8");
  const expectedPae = buildPaeBytes(envelope.payloadType, payloadJson);
  assert.deepEqual(signer.calls[0], expectedPae);
});

test("signer provided → envelope signatures contain correct keyid", async () => {
  const signer = makeFakeSigner();
  const store = makeFakeStore({ "r": { claims: [], evidence: [], events: [] } });
  const responder = createVerificationResponder(store, {
    source: SOURCE,
    statusFunctionVersion: SFV,
    signer,
  });
  const { envelope } = await responder(["r"], { now: FIXED_NOW });

  assert.equal(envelope?.signatures.length, 1);
  assert.equal(envelope?.signatures[0].keyid, "test-key");
});

// ---------------------------------------------------------------------------
// HTTP adapter — helpers for mocked req/res
// ---------------------------------------------------------------------------

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Build a minimal IncomingMessage-compatible mock.
 * Extends EventEmitter so data/end events work.
 */
function makeMockReq(method: string, url: string, body?: string): IncomingMessage {
  const emitter = new EventEmitter() as unknown as IncomingMessage;
  (emitter as unknown as Record<string, unknown>)["method"] = method;
  (emitter as unknown as Record<string, unknown>)["url"] = url;

  if (body !== undefined) {
    // Schedule data + end events after current tick so listeners can attach.
    setTimeout(() => {
      emitter.emit("data", Buffer.from(body, "utf8"));
      emitter.emit("end");
    }, 0);
  } else {
    setTimeout(() => emitter.emit("end"), 0);
  }

  return emitter;
}

function makeMockRes(): ServerResponse & { _result: MockResponse } {
  const result: MockResponse = { statusCode: 0, headers: {}, body: "" };
  const res = {
    _result: result,
    writeHead(statusCode: number, headers?: Record<string, string>) {
      result.statusCode = statusCode;
      if (headers) Object.assign(result.headers, headers);
      return this;
    },
    end(body?: string) {
      if (body) result.body += body;
    },
  } as unknown as ServerResponse & { _result: MockResponse };
  return res;
}

async function invokeHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  handler(req, res);
  // Allow async work inside the handler to settle.
  await new Promise((resolve) => setTimeout(resolve, 50));
}

// ---------------------------------------------------------------------------
// HTTP adapter — GET
// ---------------------------------------------------------------------------

test("http GET with ?ref= → 200 application/json with bundle", async () => {
  const store = makeFakeStore({
    "sha256:abc": { claims: [CLAIM_A], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const req = makeMockReq("GET", "/.well-known/hachure/verify?ref=sha256:abc");
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 200);
  assert.equal(res._result.headers["Content-Type"], "application/json");

  const parsed = JSON.parse(res._result.body) as { bundle: { claims: Claim[] } };
  assert.equal(parsed.bundle.claims.length, 1);
  assert.equal(parsed.bundle.claims[0].id, "claim-a");
});

test("http GET with multiple ?ref= params → all refs in requestedRefs", async () => {
  const store = makeFakeStore({
    "ref-1": { claims: [], evidence: [], events: [] },
    "ref-2": { claims: [], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const req = makeMockReq("GET", "/verify?ref=ref-1&ref=ref-2");
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 200);
  const parsed = JSON.parse(res._result.body) as { bundle: { metadata: { requestedRefs: string[] } } };
  assert.deepEqual(parsed.bundle.metadata.requestedRefs, ["ref-1", "ref-2"]);
});

test("http GET with no ref params → 400", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const req = makeMockReq("GET", "/verify");
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 400);
});

// ---------------------------------------------------------------------------
// HTTP adapter — POST
// ---------------------------------------------------------------------------

test("http POST with { refs } body → 200 with bundle", async () => {
  const store = makeFakeStore({
    "ref-post": { claims: [CLAIM_A], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const body = JSON.stringify({ refs: ["ref-post"] });
  const req = makeMockReq("POST", "/verify", body);
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 200);
  const parsed = JSON.parse(res._result.body) as { bundle: { claims: Claim[] } };
  assert.equal(parsed.bundle.claims.length, 1);
});

test("http POST with unknown ref → unknownRefs populated in response", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const body = JSON.stringify({ refs: ["ref-unknown"] });
  const req = makeMockReq("POST", "/verify", body);
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 200);
  const parsed = JSON.parse(res._result.body) as { bundle: { metadata: { unknownRefs: string[] } } };
  assert.deepEqual(parsed.bundle.metadata.unknownRefs, ["ref-unknown"]);
});

test("http POST with empty refs array → 400", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const body = JSON.stringify({ refs: [] });
  const req = makeMockReq("POST", "/verify", body);
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 400);
});

test("http POST with invalid JSON body → 500", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const req = makeMockReq("POST", "/verify", "not-json");
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 500);
});

test("http PUT → 405", async () => {
  const store = makeFakeStore({});
  const responder = createVerificationResponder(store, { source: SOURCE, statusFunctionVersion: SFV });
  const handler = createVerificationHttpHandler(responder);

  const req = makeMockReq("PUT", "/verify");
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 405);
});

// ---------------------------------------------------------------------------
// HTTP adapter — signer present → envelope in JSON response
// ---------------------------------------------------------------------------

test("http GET with signer → response JSON includes envelope", async () => {
  const signer = makeFakeSigner();
  const store = makeFakeStore({
    "r": { claims: [], evidence: [], events: [] },
  });
  const responder = createVerificationResponder(store, {
    source: SOURCE,
    statusFunctionVersion: SFV,
    signer,
  });
  const handler = createVerificationHttpHandler(responder);

  const req = makeMockReq("GET", "/verify?ref=r");
  const res = makeMockRes();
  await invokeHandler(handler, req, res);

  assert.equal(res._result.statusCode, 200);
  const parsed = JSON.parse(res._result.body) as { envelope?: { payloadType: string } };
  assert.ok(parsed.envelope !== undefined);
  assert.equal(parsed.envelope.payloadType, "application/vnd.in-toto+json");
});
