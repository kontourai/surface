/**
 * src/signing/sigstore.ts
 *
 * Tier-1 keyless signing adapter for the in-toto DSSE workflow.
 *
 * Design decisions:
 *
 * - The PRIMARY export is `signStatementWithSigstore(statement)`.
 *   It hands RAW statement bytes + payloadType "application/vnd.in-toto+json"
 *   to DSSEBundleBuilder and treats the returned bundle's DSSE envelope as
 *   authoritative.  The trust-bundle.dsse.json is derived FROM that envelope
 *   (same payload bytes, same signature), not from a parallel toDsseEnvelope()
 *   call that would PAE-encode the bytes a second time.
 *
 *   Layering that is correct:
 *     DSSEBundleBuilder.prepare() calls PAE(payloadType, rawStatementBytes)
 *     → signer signs those PAE bytes
 *     → bundle envelope stores rawStatementBytes as payload
 *     → cosign verify-blob computes PAE(payloadType, rawStatementBytes) once ✓
 *
 *   The old layering that was wrong:
 *     toDsseEnvelope() calls buildPaeBytes(payloadType, rawStatementBytes) = PAE(...)
 *     → old Signer.sign(paeBytes) passed PAE output to DSSEBundleBuilder as data
 *     → DSSEBundleBuilder.prepare() called PAE(type, PAE(...)) — double encoding ✗
 *     → bundle envelope stored PAE(...) as payload (not the raw statement) ✗
 *
 * - `@sigstore/sign` is an optionalDependency.  The module is imported
 *   dynamically at call-time so that the rest of the library loads fine even
 *   when the package is absent (local dev, consumer environments).
 *
 * - Fail-open design:  when no ambient OIDC credential is available (local
 *   runs without ACTIONS_ID_TOKEN_REQUEST_URL set) OR when @sigstore/sign
 *   is not installed, `signStatementWithSigstore()` returns `null` and the
 *   caller is responsible for deciding how to proceed (log + skip, not throw).
 *
 * - Signing is fail-open; VERIFICATION of a produced signature is fail-closed.
 *   A bad signature is worse than none.  The release pipeline therefore runs
 *   `cosign verify-blob --bundle` after signing and fails the job if that step
 *   fails (wired in the publish-npm.yml workflow).
 */

import type { DsseEnvelope, InTotoStatement } from "../interop/in-toto.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The result of a successful `signStatementWithSigstore()` call.
 *
 * `envelope`       — a DSSE envelope whose payload is the raw statement bytes
 *                    and whose signature was produced by Fulcio+Rekor.  This
 *                    is what standard `cosign verify-blob --bundle` checks.
 *
 * `sigstoreBundle` — the full sigstore bundle (Fulcio cert + Rekor entry) in
 *                    the @sigstore/bundle protobuf-JSON shape.  Persist this as
 *                    `trust-bundle.sigstore.json` for independent verification.
 *
 * `assuranceLevel` — always "signed" when returned (non-null result).
 */
export interface SigstoreSignResult {
  envelope: DsseEnvelope;
  sigstoreBundle: unknown;
  assuranceLevel: "signed";
}

/**
 * Options for Sigstore signing.  All fields are optional so local tooling can
 * call it without any config.
 */
export interface SigstoreSignerOptions {
  /** Override Fulcio CA URL (default: public Fulcio). */
  fulcioURL?: string;
  /** Override Rekor transparency log URL (default: public Rekor). */
  rekorURL?: string;
  /**
   * OIDC audience for the CI token request (default: "sigstore").
   * GitHub Actions requires "sigstore".
   */
  oidcAudience?: string;
}

/**
 * @deprecated Use `signStatementWithSigstore` instead.
 *
 * Kept for backward compatibility.  This type was used by code that passed the
 * signer to `toDsseEnvelope()`, which caused a double-PAE bug because
 * `toDsseEnvelope()` PAE-encodes the payload before passing it to `sign()`,
 * and `DSSEBundleBuilder` PAE-encodes it again internally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SigstoreSignerResult = any;

// ---------------------------------------------------------------------------
// Primary API
// ---------------------------------------------------------------------------

/**
 * Sign an in-toto Statement with Sigstore keyless signing (Fulcio + Rekor).
 *
 * Correct layering:
 *   1. Serialize the statement to JSON bytes (raw payload).
 *   2. Pass `{ data: rawBytes, type: "application/vnd.in-toto+json" }` to
 *      `DSSEBundleBuilder.create()`.
 *   3. The builder calls `PAE(payloadType, rawBytes)` internally and signs
 *      those bytes with the Fulcio ephemeral key.
 *   4. The returned bundle's DSSE envelope has `payload = rawBytes` (base64)
 *      and `payloadType = "application/vnd.in-toto+json"` — exactly what
 *      standard verifiers (cosign, sigstore-js) expect.
 *   5. We expose that envelope directly as our `DsseEnvelope` output.
 *
 * Returns `null` (fail-open) when:
 *   - `@sigstore/sign` is not installed (package is optional), OR
 *   - No ambient OIDC credential is available.
 *
 * @example
 * ```ts
 * const result = await signStatementWithSigstore(statement);
 * if (!result) {
 *   console.log("unsigned (no ambient identity)");
 * } else {
 *   const { envelope, sigstoreBundle } = result;
 *   // write envelope → trust-bundle.dsse.json
 *   // write sigstoreBundle → trust-bundle.sigstore.json
 * }
 * ```
 */
export async function signStatementWithSigstore(
  statement: InTotoStatement,
  options: SigstoreSignerOptions = {},
): Promise<SigstoreSignResult | null> {
  // ------------------------------------------------------------------
  // Fast-path: no ambient OIDC.
  // ------------------------------------------------------------------
  const hasAmbientOidc =
    !!process.env["ACTIONS_ID_TOKEN_REQUEST_URL"] ||
    !!process.env["SIGSTORE_ID_TOKEN"] ||
    !!process.env["GITHUB_ACTIONS"];

  if (!hasAmbientOidc) {
    return null;
  }

  // ------------------------------------------------------------------
  // Dynamic import — graceful failure if @sigstore/sign is not installed.
  // ------------------------------------------------------------------
  let signModule: typeof import("@sigstore/sign");
  try {
    signModule = await import("@sigstore/sign");
  } catch {
    return null;
  }

  const {
    CIContextProvider,
    DSSEBundleBuilder,
    FulcioSigner,
    RekorWitness,
    DEFAULT_FULCIO_URL,
    DEFAULT_REKOR_URL,
  } = signModule;

  // ------------------------------------------------------------------
  // Build the signing pipeline: OIDC → Fulcio cert → Rekor log entry.
  // ------------------------------------------------------------------
  const identityProvider = new CIContextProvider(
    options.oidcAudience ?? "sigstore",
  );

  const fulcioSigner = new FulcioSigner({
    fulcioBaseURL: options.fulcioURL ?? DEFAULT_FULCIO_URL,
    identityProvider,
  });

  const rekorWitness = new RekorWitness({
    rekorBaseURL: options.rekorURL ?? DEFAULT_REKOR_URL,
  });

  const bundleBuilder = new DSSEBundleBuilder({
    signer: fulcioSigner,
    witnesses: [rekorWitness],
  });

  // ------------------------------------------------------------------
  // Serialize the statement to raw bytes (the actual DSSE payload).
  // DSSEBundleBuilder.prepare() will PAE-encode these internally.
  // We must NOT pre-PAE here — that was the double-encoding bug.
  // ------------------------------------------------------------------
  const statementJson = JSON.stringify(statement);
  const rawStatementBytes = Buffer.from(statementJson, "utf8");

  const artifact = {
    data: rawStatementBytes,
    type: "application/vnd.in-toto+json" as const,
  };

  const bundle = await bundleBuilder.create(artifact);

  // ------------------------------------------------------------------
  // Extract the DSSE envelope from the sigstore bundle.
  // The bundle's envelope IS the authoritative DSSE envelope:
  //   - payload = base64(rawStatementBytes)
  //   - payloadType = "application/vnd.in-toto+json"
  //   - signatures[0].sig = base64(signature over PAE(payloadType, rawBytes))
  //
  // We derive our DsseEnvelope from this — not from a separate call to
  // toDsseEnvelope(), which would PAE the payload again.
  // ------------------------------------------------------------------
  const bundleContent = bundle.content;
  if (bundleContent.$case !== "dsseEnvelope") {
    throw new Error(
      "signStatementWithSigstore: bundle did not contain a DSSE envelope",
    );
  }

  const bundleDsse = bundleContent.dsseEnvelope;

  if (bundleDsse.signatures.length === 0) {
    throw new Error(
      "signStatementWithSigstore: DSSE envelope contained no signatures",
    );
  }

  // The bundle stores payload as a Buffer; encode it as base64 string for our
  // DsseEnvelope type (which uses base64-standard string per spec).
  const payloadBase64 =
    bundleDsse.payload instanceof Buffer
      ? bundleDsse.payload.toString("base64")
      : Buffer.from(bundleDsse.payload).toString("base64");

  const sigBase64 =
    bundleDsse.signatures[0].sig instanceof Buffer
      ? bundleDsse.signatures[0].sig.toString("base64")
      : Buffer.from(bundleDsse.signatures[0].sig).toString("base64");

  const envelope: DsseEnvelope = {
    payloadType: "application/vnd.in-toto+json",
    payload: payloadBase64,
    signatures: [
      {
        keyid: bundleDsse.signatures[0].keyid ?? "sigstore-keyless",
        sig: sigBase64,
      },
    ],
  };

  return {
    envelope,
    sigstoreBundle: bundle,
    assuranceLevel: "signed",
  };
}

// ---------------------------------------------------------------------------
// Legacy API (kept for any external consumers of the old shape)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `signStatementWithSigstore(statement)` instead.
 *
 * The old `createSigstoreSigner()` returned a `Signer` for use with
 * `toDsseEnvelope()`.  That pattern caused a double-PAE bug: `toDsseEnvelope`
 * PAE-encodes the payload before calling `signer.sign()`, and
 * `DSSEBundleBuilder` PAE-encodes it again internally.  The signature ended up
 * over `PAE(PAE(statement))` while the envelope advertised the raw statement,
 * so `cosign verify-blob --bundle` always failed.
 *
 * This function now returns null unconditionally so that any caller still using
 * the old path gets the fail-open behaviour (unsigned, not wrongly signed).
 * Migrate callers to `signStatementWithSigstore`.
 */
export async function createSigstoreSigner(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: SigstoreSignerOptions = {},
): Promise<null> {
  return null;
}
