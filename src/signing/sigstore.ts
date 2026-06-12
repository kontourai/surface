/**
 * src/signing/sigstore.ts
 *
 * Tier-1 keyless signing adapter for the in-toto DSSE workflow.
 *
 * Design decisions:
 *
 * - Implements the existing `Signer` interface from `src/interop/in-toto.ts`
 *   so ANY producer can plug it into `toDsseEnvelope()` without touching the
 *   core interop module.
 *
 * - `@sigstore/sign` is an optionalDependency.  The module is imported
 *   dynamically at call-time so that the rest of the library loads fine even
 *   when the package is absent (local dev, consumer environments).
 *
 * - Fail-open design:  when no ambient OIDC credential is available (local
 *   runs without ACTIONS_ID_TOKEN_REQUEST_URL set) OR when @sigstore/sign
 *   is not installed, `createSigstoreSigner()` returns `null` and the caller
 *   is responsible for deciding how to proceed (log + skip, not throw).
 *
 * - The sigstore DSSEBundleBuilder produces its own DSSE envelope internally
 *   (PAE-encoded, Fulcio certificate, Rekor log entry).  That bundle is the
 *   *verification material* for independent verifiers.  The `sign()` method
 *   on the returned Signer also drives `toDsseEnvelope()` so that our
 *   in-toto Statement wrapper is signed with the same key.
 *
 * - At CI time the sigstore bundle (verification material + certificate chain)
 *   is exposed via `getSigstoreBundle()` on the returned signer so the
 *   release script can persist it as `trust-bundle.sigstore.json`.
 */

import type { Signer } from "../interop/in-toto.js";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Outcome of a `createSigstoreSigner()` call.
 *
 * When signing is not available (no OIDC, package missing), returns `null`
 * so the caller can log the assurance level and continue.
 */
export type SigstoreSignerResult =
  | {
      signer: Signer & { getSigstoreBundle: () => unknown };
      assuranceLevel: "signed";
    }
  | null;

/**
 * Options for `createSigstoreSigner`.  All fields are optional so local
 * tooling can call it without any config.
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
 * Attempt to create a keyless Sigstore signer that satisfies the in-toto
 * `Signer` interface.
 *
 * Returns `null` when:
 *   - `@sigstore/sign` is not installed (package is optional), OR
 *   - No ambient OIDC credential is available (not running in a supported CI
 *     environment that has `id-token: write`).
 *
 * The caller should log "unsigned (no ambient identity)" and proceed when
 * `null` is returned — unsigned is an assurance level, not an error.
 *
 * @example
 * ```ts
 * const result = await createSigstoreSigner();
 * if (!result) {
 *   console.log("unsigned (no ambient identity)");
 * } else {
 *   const envelope = await toDsseEnvelope(statement, result.signer);
 * }
 * ```
 */
export async function createSigstoreSigner(
  options: SigstoreSignerOptions = {},
): Promise<SigstoreSignerResult> {
  // ------------------------------------------------------------------
  // Fast-path: no ambient OIDC — detect before importing the package.
  // GitHub Actions sets ACTIONS_ID_TOKEN_REQUEST_URL when id-token:write
  // is granted.  Other CI providers set SIGSTORE_ID_TOKEN or similar.
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
  // State: the sigstore bundle produced for the last sign() call.
  // ------------------------------------------------------------------
  let lastBundle: unknown = null;

  // ------------------------------------------------------------------
  // Construct and return the Signer.
  //
  // The in-toto `Signer.sign()` contract: receive PAE bytes, return a
  // base64-encoded signature string.
  //
  // How we bridge: feed the PAE bytes to `DSSEBundleBuilder.create()` as
  // raw artifact data (no content-type — sigstore uses empty string which
  // is idiomatic for raw blobs).  The builder handles PAE internally via
  // its own `prepare()` step for the *outer* DSSE envelope, but since we
  // pass pre-encoded PAE bytes as the artifact, we get the Fulcio
  // certificate + Rekor entry attached to exactly those bytes.
  //
  // The signature we expose in the in-toto envelope is extracted from the
  // sigstore bundle's DSSE envelope `signatures[0].sig` field.
  // ------------------------------------------------------------------
  const signer: Signer & { getSigstoreBundle: () => unknown } = {
    keyid: "sigstore-keyless",

    async sign(paeBytes: Uint8Array): Promise<string> {
      const artifact = {
        data: Buffer.from(paeBytes),
        type: "application/vnd.in-toto.pae",
      };

      const bundle = await bundleBuilder.create(artifact);
      lastBundle = bundle;

      // Extract the base64 signature from the sigstore DSSE envelope.
      // The bundle wraps a DSSE envelope; its signatures[0].sig is base64.
      const bundleContent = bundle.content;
      if (
        bundleContent.$case === "dsseEnvelope" &&
        bundleContent.dsseEnvelope.signatures.length > 0
      ) {
        return bundleContent.dsseEnvelope.signatures[0].sig.toString("base64");
      }

      throw new Error(
        "createSigstoreSigner: bundle did not contain a DSSE envelope signature",
      );
    },

    getSigstoreBundle(): unknown {
      return lastBundle;
    },
  };

  return { signer, assuranceLevel: "signed" };
}
