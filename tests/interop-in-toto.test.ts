/**
 * Tests for src/interop/in-toto.ts
 *
 * Covers:
 *  - toInTotoStatement: statement shape, predicateType URI
 *  - buildPaeBytes: PAE encoding ("DSSEv1 <type-len> <type> <body-len> <body>")
 *  - toDsseEnvelope: signer injection, base64 payload, round-trip parse
 *  - parseDssePayload: round-trip from envelope back to statement
 *  - Input validation errors
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  toInTotoStatement,
  toDsseEnvelope,
  buildPaeBytes,
  parseDssePayload,
} from "../src/interop/in-toto.js";
import type { TrustBundle } from "../src/types.js";
import type { InTotoSubject, Signer } from "../src/interop/in-toto.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_BUNDLE: TrustBundle = {
  schemaVersion: 3,
  source: "test-producer",
  claims: [],
  evidence: [],
  policies: [],
  events: [],
};

const SUBJECTS: InTotoSubject[] = [
  { name: "acme/api@sha256:abc123", digest: { sha256: "abc123def456" } },
];

/** A fake signer that records what it was asked to sign. */
function makeFakeSigner(): Signer & { calls: Uint8Array[] } {
  const calls: Uint8Array[] = [];
  return {
    keyid: "test-key-id",
    calls,
    async sign(paeBytes: Uint8Array): Promise<string> {
      calls.push(paeBytes);
      // Return a deterministic fake base64 signature.
      return Buffer.from("fake-signature").toString("base64");
    },
  };
}

// ---------------------------------------------------------------------------
// toInTotoStatement
// ---------------------------------------------------------------------------

test("toInTotoStatement: _type is Statement v1 URI", () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  assert.equal(stmt._type, "https://in-toto.io/Statement/v1");
});

test("toInTotoStatement: predicateType is kontour bundle URI", () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  assert.equal(stmt.predicateType, "https://hachure.org/v1/bundle");
});

test("toInTotoStatement: predicate is the bundle verbatim", () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  assert.deepEqual(stmt.predicate, MINIMAL_BUNDLE);
});

test("toInTotoStatement: subjects forwarded from options", () => {
  const subjects: InTotoSubject[] = [
    { name: "artifact-a", digest: { sha256: "aaa" } },
    { name: "artifact-b", digest: { sha512: "bbb" } },
  ];
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects });
  assert.deepEqual(stmt.subject, subjects);
});

test("toInTotoStatement: throws when subjects is empty", () => {
  assert.throws(() => toInTotoStatement(MINIMAL_BUNDLE, { subjects: [] }), /at least one subject/);
});

test("toInTotoStatement: throws when subject has no digest entries", () => {
  assert.throws(
    () => toInTotoStatement(MINIMAL_BUNDLE, { subjects: [{ name: "x", digest: {} }] }),
    /at least one digest entry/,
  );
});

test("toInTotoStatement: throws when subject name is empty string", () => {
  assert.throws(
    () => toInTotoStatement(MINIMAL_BUNDLE, { subjects: [{ name: "  ", digest: { sha256: "abc" } }] }),
    /non-empty name/,
  );
});

// ---------------------------------------------------------------------------
// buildPaeBytes — PAE encoding
// ---------------------------------------------------------------------------

test("buildPaeBytes: PAE string matches DSSEv1 spec format", () => {
  const payloadType = "application/vnd.in-toto+json";
  const body = '{"hello":"world"}';
  const paeBytes = buildPaeBytes(payloadType, body);
  const paeStr = new TextDecoder().decode(paeBytes);

  const typeByteLen = Buffer.byteLength(payloadType, "utf8");
  const bodyByteLen = Buffer.byteLength(body, "utf8");
  const expected = `DSSEv1 ${typeByteLen} ${payloadType} ${bodyByteLen} ${body}`;
  assert.equal(paeStr, expected);
});

test("buildPaeBytes: length prefix counts UTF-8 bytes not characters", () => {
  // A string with multi-byte UTF-8 characters (e.g. 2-byte characters)
  const body = "héllo"; // 'é' is 2 bytes in UTF-8
  const paeBytes = buildPaeBytes("type/plain", body);
  const paeStr = new TextDecoder().decode(paeBytes);
  const bodyByteLen = Buffer.byteLength(body, "utf8");
  assert.ok(paeStr.includes(` ${bodyByteLen} ${body}`), "body byte length should be in PAE");
  assert.ok(bodyByteLen > body.length, "UTF-8 byte length exceeds char count for multi-byte chars");
});

// ---------------------------------------------------------------------------
// toDsseEnvelope
// ---------------------------------------------------------------------------

test("toDsseEnvelope: payloadType is application/vnd.in-toto+json", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  const signer = makeFakeSigner();
  const env = await toDsseEnvelope(stmt, signer);
  assert.equal(env.payloadType, "application/vnd.in-toto+json");
});

test("toDsseEnvelope: payload is base64 of JSON statement", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  const signer = makeFakeSigner();
  const env = await toDsseEnvelope(stmt, signer);
  const decoded = Buffer.from(env.payload, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as Record<string, unknown>;
  assert.equal(parsed["_type"], "https://in-toto.io/Statement/v1");
  assert.equal(parsed["predicateType"], "https://hachure.org/v1/bundle");
});

test("toDsseEnvelope: signer is called with PAE bytes", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  const signer = makeFakeSigner();
  await toDsseEnvelope(stmt, signer);
  assert.equal(signer.calls.length, 1);
  const paeStr = new TextDecoder().decode(signer.calls[0]);
  assert.ok(paeStr.startsWith("DSSEv1 "), "PAE bytes must start with DSSEv1");
  assert.ok(paeStr.includes("application/vnd.in-toto+json"), "PAE must contain payloadType");
});

test("toDsseEnvelope: signer keyid appears in signatures array", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  const signer = makeFakeSigner();
  const env = await toDsseEnvelope(stmt, signer);
  assert.equal(env.signatures.length, 1);
  assert.equal(env.signatures[0].keyid, "test-key-id");
});

test("toDsseEnvelope: signatures[0].sig is the base64 result of signer.sign", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  const signer = makeFakeSigner();
  const env = await toDsseEnvelope(stmt, signer);
  const decoded = Buffer.from(env.signatures[0].sig, "base64").toString("utf8");
  assert.equal(decoded, "fake-signature");
});

// ---------------------------------------------------------------------------
// parseDssePayload — round-trip
// ---------------------------------------------------------------------------

test("parseDssePayload: round-trips statement through envelope", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  const signer = makeFakeSigner();
  const env = await toDsseEnvelope(stmt, signer);
  const recovered = parseDssePayload(env);
  assert.equal(recovered._type, stmt._type);
  assert.equal(recovered.predicateType, stmt.predicateType);
  assert.deepEqual(recovered.subject, stmt.subject);
  assert.deepEqual(recovered.predicate, MINIMAL_BUNDLE);
});

test("parseDssePayload: throws for non-Statement payload", () => {
  const bad = {
    payloadType: "application/vnd.in-toto+json" as const,
    payload: Buffer.from(JSON.stringify({ not: "a statement" })).toString("base64"),
    signatures: [],
  };
  assert.throws(() => parseDssePayload(bad), /not an in-toto Statement/);
});

// ---------------------------------------------------------------------------
// PAE is the pre-image signed — verify the signer receives the canonical form
// ---------------------------------------------------------------------------

test("signer receives PAE not raw payload: reconstructed PAE matches signer input", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: SUBJECTS });
  const signer = makeFakeSigner();
  const env = await toDsseEnvelope(stmt, signer);

  // Manually reconstruct PAE from the envelope.
  const payloadJson = Buffer.from(env.payload, "base64").toString("utf8");
  const expectedPae = buildPaeBytes(env.payloadType, payloadJson);

  assert.deepEqual(signer.calls[0], expectedPae);
});
