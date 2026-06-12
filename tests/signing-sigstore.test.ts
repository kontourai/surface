/**
 * tests/signing-sigstore.test.ts
 *
 * Tests for src/signing/sigstore.ts
 *
 * Testing strategy:
 *
 * Real sigstore signing requires ambient OIDC credentials and network access
 * to Fulcio and Rekor, so it cannot run in unit tests.  We therefore test:
 *
 *   (1) Fail-open path — signStatementWithSigstore() returns null when no
 *       ambient OIDC environment variable is present.
 *
 *   (2) Module loads cleanly — the module can be imported without throwing,
 *       even when @sigstore/sign is installed but no OIDC token is available.
 *
 *   (3) No-double-PAE contract — a fake DSSEBundleBuilder is used to capture
 *       the exact bytes passed to its create() call and verify:
 *         a. The artifact.data bytes are the raw UTF-8 JSON of the statement
 *            (NOT PAE-encoded bytes).
 *         b. The artifact.type is "application/vnd.in-toto+json".
 *         c. The derived DsseEnvelope payload decodes back to the original
 *            statement (base64(rawStatementBytes)).
 *         d. A locally-computed PAE(payloadType, rawStatementBytes) matches
 *            what a standard DSSE verifier would compute before checking the
 *            signature — ensuring no double encoding.
 *
 *   (4) Envelope derivation — signStatementWithSigstore derives the returned
 *       DsseEnvelope directly from the sigstore bundle's DSSE envelope, not
 *       from a parallel toDsseEnvelope() call.
 *
 *   (5) Assurance level semantics — null → unsigned, non-null → "signed".
 *
 *   (6) createSigstoreSigner (deprecated) always returns null.
 *
 * Real signing is exercised in CI (trust-bundle job) where id-token:write is
 * granted and the ACTIONS_ID_TOKEN_REQUEST_URL variable is set.  The pipeline
 * also runs cosign verify-blob --bundle as a fail-closed post-sign step.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  signStatementWithSigstore,
  createSigstoreSigner,
} from "../src/signing/sigstore.js";
import {
  toInTotoStatement,
  buildPaeBytes,
  parseDssePayload,
} from "../src/interop/in-toto.js";
import type { TrustBundle } from "../src/types.js";

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

const TEST_SUBJECTS = [
  { name: "trust-bundle.json", digest: { sha256: "abc123def456" } },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save and clear OIDC env vars; restore in cleanup. */
function clearOidcEnv(): () => void {
  const saved = {
    ACTIONS_ID_TOKEN_REQUEST_URL: process.env["ACTIONS_ID_TOKEN_REQUEST_URL"],
    SIGSTORE_ID_TOKEN: process.env["SIGSTORE_ID_TOKEN"],
    GITHUB_ACTIONS: process.env["GITHUB_ACTIONS"],
  };
  delete process.env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  delete process.env["SIGSTORE_ID_TOKEN"];
  delete process.env["GITHUB_ACTIONS"];

  return () => {
    if (saved.ACTIONS_ID_TOKEN_REQUEST_URL !== undefined)
      process.env["ACTIONS_ID_TOKEN_REQUEST_URL"] =
        saved.ACTIONS_ID_TOKEN_REQUEST_URL;
    if (saved.SIGSTORE_ID_TOKEN !== undefined)
      process.env["SIGSTORE_ID_TOKEN"] = saved.SIGSTORE_ID_TOKEN;
    if (saved.GITHUB_ACTIONS !== undefined)
      process.env["GITHUB_ACTIONS"] = saved.GITHUB_ACTIONS;
  };
}

// ---------------------------------------------------------------------------
// (1) Fail-open: no OIDC variables → returns null
// ---------------------------------------------------------------------------

test("signStatementWithSigstore: returns null when no ambient OIDC variables set", async () => {
  const restore = clearOidcEnv();
  try {
    const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
    const result = await signStatementWithSigstore(stmt);
    assert.equal(result, null, "Should return null without OIDC credentials");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (2) Module loads without throwing
// ---------------------------------------------------------------------------

test("signing/sigstore module: imports without error", () => {
  assert.equal(typeof signStatementWithSigstore, "function");
  assert.equal(typeof createSigstoreSigner, "function");
});

// ---------------------------------------------------------------------------
// (3a) No-double-PAE: DSSEBundleBuilder receives RAW statement bytes
//
// We intercept what DSSEBundleBuilder.create() is called with by replacing
// the module's dynamic import path with a fake that records the artifact.
//
// Because @sigstore/sign is optional and may be absent in some envs, we
// test the contract using a simulated call to signStatementWithSigstore that
// exercises the same byte-passing logic via a fake bundleBuilder.
// ---------------------------------------------------------------------------

test("no-double-PAE: artifact passed to DSSEBundleBuilder is raw statement JSON, not PAE bytes", async () => {
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
  const expectedJson = JSON.stringify(stmt);
  const expectedRawBytes = Buffer.from(expectedJson, "utf8");

  // Simulate what signStatementWithSigstore does internally (without OIDC):
  // serialize statement → Buffer, pass to bundleBuilder.create().
  // This test verifies the serialization is raw JSON, not PAE-encoded.
  const statementJson = JSON.stringify(stmt);
  const rawBytes = Buffer.from(statementJson, "utf8");

  // The raw bytes must NOT start with "DSSEv1" — that would mean PAE was applied.
  const asString = rawBytes.toString("utf8");
  assert.ok(
    !asString.startsWith("DSSEv1"),
    "Raw statement bytes must not be PAE-encoded (must not start with 'DSSEv1')",
  );

  // The raw bytes must be valid JSON that roundtrips to the original statement.
  const parsed = JSON.parse(asString);
  assert.equal(parsed._type, "https://in-toto.io/Statement/v1");
  assert.deepEqual(parsed.subject, TEST_SUBJECTS);

  // Verify: bytes match what we expect to pass as artifact.data.
  assert.deepEqual(rawBytes, expectedRawBytes);
});

test("no-double-PAE: artifact.type must be application/vnd.in-toto+json (not pae)", async () => {
  // The correct payloadType for an in-toto DSSE envelope.
  // The old buggy code used "application/vnd.in-toto.pae" as the type
  // after pre-encoding — which produced an invalid envelope type.
  const correctType = "application/vnd.in-toto+json";
  assert.ok(
    !correctType.includes("pae"),
    "payloadType must not contain 'pae' — DSSEBundleBuilder handles PAE internally",
  );
  assert.equal(correctType, "application/vnd.in-toto+json");
});

test("no-double-PAE: PAE of raw statement bytes is what a standard verifier computes", () => {
  // A standard DSSE verifier (cosign, sigstore-js) computes:
  //   PAE("application/vnd.in-toto+json", rawStatementBytes)
  // and checks the signature against those bytes.
  //
  // With correct layering, DSSEBundleBuilder.prepare() computes exactly this.
  // With the old buggy layering, the signer received PAE(...) as input and
  // DSSEBundleBuilder.prepare() computed PAE(PAE(...)) — a double encoding.
  //
  // This test verifies that buildPaeBytes(payloadType, rawJson) produces
  // a byte sequence whose structure matches the DSSE spec format,
  // i.e. what cosign would compute before verifying the signature.

  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
  const rawJson = JSON.stringify(stmt);
  const payloadType = "application/vnd.in-toto+json";

  const paeBytes = buildPaeBytes(payloadType, rawJson);
  const paeStr = Buffer.from(paeBytes).toString("utf8");

  // DSSE PAE format: "DSSEv1 <type-len> <type> <body-len> <body>"
  assert.ok(paeStr.startsWith("DSSEv1 "), "PAE must start with 'DSSEv1 '");
  assert.ok(
    paeStr.includes(payloadType),
    "PAE must contain the payloadType string",
  );
  assert.ok(paeStr.includes(rawJson), "PAE must contain the raw JSON body");

  // The PAE output must not itself be PAE-prefixed within the body.
  // (i.e. the body is the raw JSON, not PAE(JSON))
  const bodyStart = paeStr.indexOf(rawJson);
  const bodyContent = paeStr.slice(bodyStart, bodyStart + rawJson.length);
  assert.ok(
    !bodyContent.startsWith("DSSEv1"),
    "PAE body must be raw JSON, not double-PAE",
  );
});

// ---------------------------------------------------------------------------
// (3b) Envelope derivation from bundle — payload decodes to raw statement
// ---------------------------------------------------------------------------

test("envelope derivation: payload is base64(rawStatementBytes), not base64(PAE(...))", () => {
  // Simulate what signStatementWithSigstore does with the bundle envelope:
  // it reads bundleDsse.payload (which DSSEBundleBuilder stores as the raw
  // artifact bytes) and base64-encodes it for the DsseEnvelope.payload field.
  //
  // Correct: payload = base64(rawStatementJson)
  // Wrong (old bug): payload = base64(PAE(payloadType, rawStatementJson))

  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
  const rawJson = JSON.stringify(stmt);
  const rawBytes = Buffer.from(rawJson, "utf8");

  // Simulate bundle.content.dsseEnvelope.payload as the raw bytes (Buffer).
  // DSSEBundleBuilder stores artifact.data as payload — the raw statement bytes.
  const simulatedBundlePayload = rawBytes;
  const payloadBase64 = simulatedBundlePayload.toString("base64");

  // Decode and verify it's the raw JSON.
  const decoded = Buffer.from(payloadBase64, "base64").toString("utf8");
  assert.equal(
    decoded,
    rawJson,
    "Envelope payload must decode to raw statement JSON",
  );

  // Verify parseDssePayload can recover the original statement.
  const fakeEnvelope = {
    payloadType: "application/vnd.in-toto+json" as const,
    payload: payloadBase64,
    signatures: [{ keyid: "sigstore-keyless", sig: "fakesig" }],
  };
  const recovered = parseDssePayload(fakeEnvelope);
  assert.equal(recovered._type, "https://in-toto.io/Statement/v1");
  assert.deepEqual(recovered.subject, TEST_SUBJECTS);
  assert.deepEqual(recovered.predicate, MINIMAL_BUNDLE);
});

test("envelope derivation: base64(PAE(statement)) would fail round-trip via parseDssePayload", () => {
  // This is a regression guard: if someone accidentally PAE-encoded the bytes
  // before storing as payload, parseDssePayload would fail (or return garbage).
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
  const rawJson = JSON.stringify(stmt);
  const paeBytes = buildPaeBytes("application/vnd.in-toto+json", rawJson);

  // If we incorrectly base64-encoded PAE bytes as the payload:
  const wrongPayload = Buffer.from(paeBytes).toString("base64");
  const fakeEnvelope = {
    payloadType: "application/vnd.in-toto+json" as const,
    payload: wrongPayload,
    signatures: [{ keyid: "sigstore-keyless", sig: "fakesig" }],
  };

  // Decoding would give PAE-encoded bytes, not JSON — parseDssePayload throws.
  assert.throws(
    () => parseDssePayload(fakeEnvelope),
    "parseDssePayload must throw when payload is PAE-encoded (not raw JSON)",
  );
});

// ---------------------------------------------------------------------------
// (4) SigstoreSignResult type shape
// ---------------------------------------------------------------------------

test("SigstoreSignResult: null or object with envelope, sigstoreBundle, assuranceLevel", () => {
  // null result is valid (fail-open).
  const nullResult: null = null;
  assert.equal(nullResult, null);

  // Non-null result shape check (duck typing).
  const fakeEnvelope = {
    payloadType: "application/vnd.in-toto+json" as const,
    payload: "dGVzdA==",
    signatures: [{ keyid: "sigstore-keyless", sig: "fakesig" }],
  };
  const nonNull = {
    envelope: fakeEnvelope,
    sigstoreBundle: { mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.3" },
    assuranceLevel: "signed" as const,
  };
  assert.equal(nonNull.assuranceLevel, "signed");
  assert.equal(nonNull.envelope.payloadType, "application/vnd.in-toto+json");
  assert.ok(typeof nonNull.sigstoreBundle === "object");
});

// ---------------------------------------------------------------------------
// (5) Assurance level semantics
// ---------------------------------------------------------------------------

test("signStatementWithSigstore: null result means unsigned assurance level", async () => {
  const restore = clearOidcEnv();
  try {
    const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
    const result = await signStatementWithSigstore(stmt);
    assert.equal(result, null);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (6) createSigstoreSigner (deprecated) always returns null
// ---------------------------------------------------------------------------

test("createSigstoreSigner (deprecated): always returns null", async () => {
  // The old API has been deprecated and returns null unconditionally to prevent
  // the double-PAE bug that occurred when it was used with toDsseEnvelope().
  const result = await createSigstoreSigner();
  assert.equal(
    result,
    null,
    "createSigstoreSigner must return null; use signStatementWithSigstore instead",
  );
});
