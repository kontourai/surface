/**
 * scripts/verify-trust-bundle.mjs
 *
 * Structurally inspect a signed trust-bundle.dsse.json +
 * trust-bundle.sigstore.json pair produced by release-trust-bundle.mjs.
 *
 * Capability state: structural-only
 *
 * What it checks structurally:
 *   1. The DSSE envelope payload decodes to a valid in-toto Statement v1.
 *   2. The sigstore bundle contains certificate identity material that can be
 *      inspected manually.
 *   3. The Rekor log entry is present (transparency log inclusion).
 *
 * Usage:
 *   node scripts/verify-trust-bundle.mjs \
 *     --dsse    /path/to/trust-bundle.dsse.json \
 *     --bundle  /path/to/trust-bundle.sigstore.json \
 *     [--issuer https://token.actions.githubusercontent.com] \
 *     [--san    https://github.com/kontourai/surface/.github/workflows/publish-npm.yml@refs/tags/v*]
 *
 * Note on verification scope:
 *   Capability state: structural-only.
 *   This script performs structural verification only — it checks that the
 *   sigstore bundle is well-formed, that the certificate identity fields are
 *   present, and that the DSSE payload parses correctly.  Full cryptographic
 *   Sigstore verification, including certificate-chain validation and Rekor
 *   inclusion-proof verification, is not implemented here. Use a separate
 *   verifier such as cosign or sigstore-js for full cryptographic verification.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------
function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const dssePath = argValue("--dsse");
const bundlePath = argValue("--bundle");

if (!dssePath || !bundlePath) {
  console.error(
    [
      "Capability state: structural-only",
      "Usage: node scripts/verify-trust-bundle.mjs --dsse <path> --bundle <path> [--issuer <url>] [--san <pattern>]",
      "Full Sigstore cryptographic verification is unavailable in this script; use cosign or sigstore-js manually.",
    ].join("\n"),
  );
  process.exit(1);
}

const expectedIssuer =
  argValue("--issuer") ??
  "https://token.actions.githubusercontent.com";

const expectedSan = argValue("--san");

console.log("Capability state: structural-only");
console.log(
  "Full Sigstore cryptographic verification is unavailable in this script; use cosign or sigstore-js manually.",
);

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
const dsseEnvelope = JSON.parse(await readFile(dssePath, "utf8"));
const sigstoreBundle = JSON.parse(await readFile(bundlePath, "utf8"));

// ---------------------------------------------------------------------------
// 1. Parse and validate the DSSE envelope + in-toto Statement
// ---------------------------------------------------------------------------
const { parseDssePayload } = await import(
  path.join(root, "dist", "src", "interop", "in-toto.js")
);

let statement;
try {
  statement = parseDssePayload(dsseEnvelope);
  console.log("DSSE payload: valid in-toto Statement v1");
  console.log(`  _type:         ${statement._type}`);
  console.log(`  predicateType: ${statement.predicateType}`);
  console.log(`  subjects:      ${statement.subject.length}`);
  for (const s of statement.subject) {
    const alg = Object.keys(s.digest)[0];
    console.log(`    ${s.name} (${alg}: ${s.digest[alg].slice(0, 16)}…)`);
  }
} catch (err) {
  console.error(`DSSE payload parse failed: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Extract certificate identity from sigstore bundle
// ---------------------------------------------------------------------------
console.log("\nSigstore bundle verification material:");

const vm = sigstoreBundle.verificationMaterial;
if (!vm) {
  console.error("  Missing verificationMaterial in sigstore bundle");
  process.exit(1);
}

// Extract certificate from the bundle (single cert or chain).
let certDer = null;
if (vm.certificate?.rawBytes) {
  certDer = Buffer.from(vm.certificate.rawBytes, "base64");
  console.log("  Certificate: single (leaf)");
} else if (vm.x509CertificateChain?.certificates?.length) {
  certDer = Buffer.from(
    vm.x509CertificateChain.certificates[0].rawBytes,
    "base64",
  );
  console.log(
    `  Certificate: chain (${vm.x509CertificateChain.certificates.length} cert(s))`,
  );
} else {
  console.warn("  No certificate found in bundle — public-key binding only");
}

// Rekor tlog entries.
const tlogEntries = vm.tlogEntries ?? [];
if (tlogEntries.length > 0) {
  for (const entry of tlogEntries) {
    console.log(
      `  Rekor log entry: logIndex=${entry.logIndex ?? "(unknown)"}`,
    );
  }
} else {
  console.warn("  No Rekor transparency log entries in bundle");
}

// ---------------------------------------------------------------------------
// 3. Attempt full cryptographic verification via @sigstore/verify (optional)
// ---------------------------------------------------------------------------
let fullVerificationAttempted = false;

try {
  const verifyModule = await import("@sigstore/verify");
  const bundleModule = await import("@sigstore/bundle");

  const { Verifier, toSignedEntity } = verifyModule;
  const { bundleFromJSON } = bundleModule;

  // Reconstruct the PAE bytes from the DSSE envelope so we can pass the
  // artifact buffer to toSignedEntity().
  const { buildPaeBytes } = await import(
    path.join(root, "dist", "src", "interop", "in-toto.js")
  );
  const payloadJson = Buffer.from(dsseEnvelope.payload, "base64").toString("utf8");
  const paeBytes = buildPaeBytes(dsseEnvelope.payloadType, payloadJson);

  const bundle = bundleFromJSON(sigstoreBundle);
  const signedEntity = toSignedEntity(bundle, Buffer.from(paeBytes));

  // toTrustMaterial requires a TrustedRoot — fetch the public sigstore root.
  // This requires network access.  We wrap it so that offline runs skip it
  // gracefully and still print the identity fields we can extract statically.
  const { toTrustMaterial } = verifyModule;

  // Fetch the sigstore TUF root (network required).
  const tufFetch = await import("make-fetch-happen").catch(() => null);
  if (!tufFetch) {
    console.log(
      "\nFull Sigstore cryptographic verification unavailable in this structural-only script.",
    );
  } else {
    console.log(
      "\nFull Sigstore cryptographic verification unavailable in this structural-only script.",
    );
    console.log(
      "  Use cosign verify-blob or sigstore-js manually with the bundle.",
    );
  }

  fullVerificationAttempted = true;
} catch {
  console.log(
    "\n@sigstore/verify not available; continuing with structural-only inspection.",
  );
}

// ---------------------------------------------------------------------------
// 4. Print signer identity summary
// ---------------------------------------------------------------------------
console.log("\nSigner identity summary:");
if (certDer) {
  // Print the certificate in PEM so callers can pass it to openssl/cosign.
  const pem =
    "-----BEGIN CERTIFICATE-----\n" +
    certDer.toString("base64").match(/.{1,64}/g).join("\n") +
    "\n-----END CERTIFICATE-----";
  console.log(pem);
} else {
  console.log("  (no certificate available for identity inspection)");
}

if (!fullVerificationAttempted) {
  console.log(
    "\nNote: full Sigstore cryptographic verification was not performed.",
  );
  console.log(
    "  Use `cosign verify-blob` or the sigstore-js CLI manually for full verification.",
  );
}

console.log("\nStructural-only trust-bundle inspection complete.");
