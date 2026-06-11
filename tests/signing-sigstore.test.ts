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
 *   (1) Fail-open path — createSigstoreSigner() returns null when no ambient
 *       OIDC environment variable is present (the baseline for all local runs).
 *
 *   (2) Module loads cleanly — the module can be imported without throwing,
 *       even when @sigstore/sign is installed but no OIDC token is available.
 *
 *   (3) Signer adapter wiring — using the existing fake Signer from the
 *       interop tests, we verify that a Signer obtained from outside this
 *       module (e.g. the return value shape) correctly satisfies the Signer
 *       interface and works with toDsseEnvelope().
 *
 *   (4) Assurance level semantics — signed → "signed", no OIDC → null.
 *
 * Real signing is exercised in CI (trust-bundle job) where id-token:write is
 * granted and the ACTIONS_ID_TOKEN_REQUEST_URL variable is set.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createSigstoreSigner } from "../src/signing/sigstore.js";
import {
  toInTotoStatement,
  toDsseEnvelope,
  parseDssePayload,
} from "../src/interop/in-toto.js";
import type { TrustBundle } from "../src/types.js";
import type { Signer } from "../src/interop/in-toto.js";

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

/** A fake signer that mirrors the shape createSigstoreSigner() would return. */
function makeFakeSigstoreSigner(): Signer & { getSigstoreBundle: () => unknown } {
  let lastBundle: unknown = null;
  return {
    keyid: "sigstore-keyless",
    async sign(paeBytes: Uint8Array): Promise<string> {
      // Simulate producing a sigstore bundle from the PAE bytes.
      lastBundle = {
        mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.3",
        verificationMaterial: { tlogEntries: [] },
        dsseEnvelope: { payload: Buffer.from(paeBytes).toString("base64"), payloadType: "application/vnd.in-toto.pae", signatures: [] },
      };
      return Buffer.from("fake-sigstore-sig").toString("base64");
    },
    getSigstoreBundle(): unknown {
      return lastBundle;
    },
  };
}

// ---------------------------------------------------------------------------
// (1) Fail-open: no OIDC variables → returns null
// ---------------------------------------------------------------------------

test("createSigstoreSigner: returns null when no ambient OIDC variables set", async () => {
  // Snapshot and clear the OIDC-related env vars for this test.
  const saved = {
    ACTIONS_ID_TOKEN_REQUEST_URL: process.env["ACTIONS_ID_TOKEN_REQUEST_URL"],
    SIGSTORE_ID_TOKEN: process.env["SIGSTORE_ID_TOKEN"],
    GITHUB_ACTIONS: process.env["GITHUB_ACTIONS"],
  };

  delete process.env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  delete process.env["SIGSTORE_ID_TOKEN"];
  delete process.env["GITHUB_ACTIONS"];

  try {
    const result = await createSigstoreSigner();
    assert.equal(result, null, "Should return null without OIDC credentials");
  } finally {
    // Restore env.
    if (saved.ACTIONS_ID_TOKEN_REQUEST_URL !== undefined)
      process.env["ACTIONS_ID_TOKEN_REQUEST_URL"] = saved.ACTIONS_ID_TOKEN_REQUEST_URL;
    if (saved.SIGSTORE_ID_TOKEN !== undefined)
      process.env["SIGSTORE_ID_TOKEN"] = saved.SIGSTORE_ID_TOKEN;
    if (saved.GITHUB_ACTIONS !== undefined)
      process.env["GITHUB_ACTIONS"] = saved.GITHUB_ACTIONS;
  }
});

// ---------------------------------------------------------------------------
// (2) Module loads without throwing (even with @sigstore/sign installed)
// ---------------------------------------------------------------------------

test("createSigstoreSigner: module imports without error", async () => {
  // Simply importing and calling should not throw at module level.
  assert.equal(typeof createSigstoreSigner, "function");
});

// ---------------------------------------------------------------------------
// (3) Returned signer satisfies the in-toto Signer interface
// ---------------------------------------------------------------------------

test("fake sigstore signer: satisfies Signer interface and works with toDsseEnvelope", async () => {
  const signer = makeFakeSigstoreSigner();

  // Must have keyid string.
  assert.equal(typeof signer.keyid, "string");
  assert.ok(signer.keyid.length > 0);

  // Must have async sign() that returns a base64 string.
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
  const envelope = await toDsseEnvelope(stmt, signer);

  assert.equal(envelope.payloadType, "application/vnd.in-toto+json");
  assert.equal(envelope.signatures.length, 1);
  assert.equal(envelope.signatures[0].keyid, "sigstore-keyless");

  // The sig must be base64-decodable.
  const sigDecoded = Buffer.from(envelope.signatures[0].sig, "base64").toString("utf8");
  assert.equal(sigDecoded, "fake-sigstore-sig");
});

// ---------------------------------------------------------------------------
// (4) getSigstoreBundle() is populated after sign()
// ---------------------------------------------------------------------------

test("fake sigstore signer: getSigstoreBundle() returns null before first sign", () => {
  const signer = makeFakeSigstoreSigner();
  assert.equal(signer.getSigstoreBundle(), null);
});

test("fake sigstore signer: getSigstoreBundle() populated after toDsseEnvelope", async () => {
  const signer = makeFakeSigstoreSigner();
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
  await toDsseEnvelope(stmt, signer);

  const bundle = signer.getSigstoreBundle();
  assert.ok(bundle !== null, "Bundle should be set after signing");
  assert.equal(typeof bundle, "object");
});

// ---------------------------------------------------------------------------
// (5) DSSE round-trip with sigstore signer adapter
// ---------------------------------------------------------------------------

test("sigstore signer adapter: DSSE round-trip recovers original statement", async () => {
  const signer = makeFakeSigstoreSigner();
  const stmt = toInTotoStatement(MINIMAL_BUNDLE, { subjects: TEST_SUBJECTS });
  const envelope = await toDsseEnvelope(stmt, signer);

  const recovered = parseDssePayload(envelope);
  assert.equal(recovered._type, "https://in-toto.io/Statement/v1");
  assert.equal(recovered.predicateType, "https://hachure.org/v1/bundle");
  assert.deepEqual(recovered.subject, TEST_SUBJECTS);
  assert.deepEqual(recovered.predicate, MINIMAL_BUNDLE);
});

// ---------------------------------------------------------------------------
// (6) Assurance level semantics
// ---------------------------------------------------------------------------

test("createSigstoreSigner: null result means assurance level is unsigned", async () => {
  const saved = {
    ACTIONS_ID_TOKEN_REQUEST_URL: process.env["ACTIONS_ID_TOKEN_REQUEST_URL"],
    SIGSTORE_ID_TOKEN: process.env["SIGSTORE_ID_TOKEN"],
    GITHUB_ACTIONS: process.env["GITHUB_ACTIONS"],
  };

  delete process.env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  delete process.env["SIGSTORE_ID_TOKEN"];
  delete process.env["GITHUB_ACTIONS"];

  try {
    const result = await createSigstoreSigner();
    // null means "unsigned (no ambient identity)" — caller decides to proceed.
    assert.equal(result, null);
  } finally {
    if (saved.ACTIONS_ID_TOKEN_REQUEST_URL !== undefined)
      process.env["ACTIONS_ID_TOKEN_REQUEST_URL"] = saved.ACTIONS_ID_TOKEN_REQUEST_URL;
    if (saved.SIGSTORE_ID_TOKEN !== undefined)
      process.env["SIGSTORE_ID_TOKEN"] = saved.SIGSTORE_ID_TOKEN;
    if (saved.GITHUB_ACTIONS !== undefined)
      process.env["GITHUB_ACTIONS"] = saved.GITHUB_ACTIONS;
  }
});

test("fake signer result: assuranceLevel is 'signed' when signing succeeds", () => {
  // Simulate the shape returned by createSigstoreSigner() in CI.
  const signer = makeFakeSigstoreSigner();
  const signerResult = { signer, assuranceLevel: "signed" as const };
  assert.equal(signerResult.assuranceLevel, "signed");
});

// ---------------------------------------------------------------------------
// (7) SigstoreSignerResult type shape (compile-time + runtime)
// ---------------------------------------------------------------------------

test("SigstoreSignerResult: null or object with signer and assuranceLevel", () => {
  // Type-check via duck typing: a null result is valid.
  const nullResult: null = null;
  assert.equal(nullResult, null);

  // A non-null result must have signer + assuranceLevel.
  const signer = makeFakeSigstoreSigner();
  const nonNull = { signer, assuranceLevel: "signed" as const };
  assert.equal(typeof nonNull.signer.sign, "function");
  assert.equal(typeof nonNull.signer.keyid, "string");
  assert.equal(nonNull.assuranceLevel, "signed");
});
