/**
 * in-toto interop — wrap a TrustBundle as an in-toto Statement v1 and
 * optionally produce a DSSE envelope.
 *
 * Spec references:
 *   Statement v1:   https://in-toto.io/Statement/v1
 *   DSSE:           https://github.com/secure-systems-lab/dsse/blob/master/protocol.md
 *   PAE encoding:   https://github.com/secure-systems-lab/dsse/blob/master/protocol.md#protocol
 *
 * No crypto dependency — the caller supplies a `Signer` to produce signatures.
 */
import type { TrustBundle } from "../types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A subject that the statement is about (artifact reference).
 * The producer decides which artifacts are relevant; Surface does not infer
 * them — it is not in a position to know which build outputs or source trees
 * the bundle describes.
 */
export interface InTotoSubject {
  /** A human-readable name for the artifact (e.g. file path, OCI image reference). */
  name: string;
  /**
   * A map of algorithm name → hex digest, e.g. { sha256: "abc123..." }.
   * At least one entry is required.
   */
  digest: Record<string, string>;
}

/**
 * An in-toto Statement v1.
 * https://in-toto.io/Statement/v1
 */
export interface InTotoStatement {
  _type: "https://in-toto.io/Statement/v1";
  subject: InTotoSubject[];
  predicateType: "https://hachure.org/v1/bundle";
  predicate: TrustBundle;
}

/**
 * An injected signer.  The caller provides a keyid and an async sign function
 * that accepts the raw PAE bytes and returns a base64-encoded signature.
 * No key material ever enters this module.
 */
export interface Signer {
  keyid: string;
  sign(paeBytes: Uint8Array): Promise<string>;
}

/**
 * A DSSE Envelope as specified in:
 * https://github.com/secure-systems-lab/dsse/blob/master/protocol.md
 */
export interface DsseEnvelope {
  payloadType: "application/vnd.in-toto+json";
  /** Base64-standard-encoded JSON-serialised InTotoStatement. */
  payload: string;
  signatures: Array<{
    keyid: string;
    /** Base64-standard-encoded signature over PAE(payloadType, payload). */
    sig: string;
  }>;
}

// ---------------------------------------------------------------------------
// Statement construction
// ---------------------------------------------------------------------------

/**
 * Wrap a TrustBundle as an in-toto Statement v1.
 *
 * @param bundle   The TrustBundle that becomes the predicate.
 * @param options  `subjects` — caller-supplied artifact references.  At least
 *                 one subject is required by the in-toto spec; the caller is
 *                 the only party that knows which artifacts the bundle
 *                 describes.
 */
export function toInTotoStatement(
  bundle: TrustBundle,
  options: { subjects: InTotoSubject[] },
): InTotoStatement {
  if (!Array.isArray(options.subjects) || options.subjects.length === 0) {
    throw new Error("toInTotoStatement: at least one subject is required");
  }
  for (const subject of options.subjects) {
    if (typeof subject.name !== "string" || subject.name.trim() === "") {
      throw new Error("toInTotoStatement: each subject must have a non-empty name");
    }
    if (
      typeof subject.digest !== "object" ||
      subject.digest === null ||
      Object.keys(subject.digest).length === 0
    ) {
      throw new Error(`toInTotoStatement: subject "${subject.name}" must have at least one digest entry`);
    }
  }
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: options.subjects,
    predicateType: "https://hachure.org/v1/bundle",
    predicate: bundle,
  };
}

// ---------------------------------------------------------------------------
// DSSE envelope construction
// ---------------------------------------------------------------------------

/**
 * Build a DSSE envelope from an in-toto Statement.
 *
 * PAE (Pre-Authentication Encoding) per DSSE spec:
 *   PAE(type, body) = "DSSEv1" SP LEN(type) SP type SP LEN(body) SP body
 * where LEN is the decimal byte-length of the UTF-8 encoding.
 *
 * The `signer` must be injected by the caller; this function has no crypto
 * dependency of its own.
 *
 * @param statement  The in-toto Statement to envelope.
 * @param signer     A caller-supplied signer with keyid and async sign().
 */
export async function toDsseEnvelope(
  statement: InTotoStatement,
  signer: Signer,
): Promise<DsseEnvelope> {
  const payloadType = "application/vnd.in-toto+json";
  const statementJson = JSON.stringify(statement);
  const payloadBase64 = toBase64(statementJson);

  const paeBytes = buildPaeBytes(payloadType, statementJson);
  const sig = await signer.sign(paeBytes);

  return {
    payloadType,
    payload: payloadBase64,
    signatures: [{ keyid: signer.keyid, sig }],
  };
}

// ---------------------------------------------------------------------------
// PAE helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the Pre-Authentication Encoding bytes for DSSE.
 *
 *   PAE(type, body) = "DSSEv1" SP DEC(LEN(type)) SP type SP DEC(LEN(body)) SP body
 *
 * All lengths are byte lengths of the UTF-8-encoded strings.
 * The result is returned as a Uint8Array so callers can pass it directly to
 * a WebCrypto sign() call or a Node crypto createSign().
 */
export function buildPaeBytes(payloadType: string, payloadBody: string): Uint8Array {
  const enc = new TextEncoder();
  const typeBytes = enc.encode(payloadType);
  const bodyBytes = enc.encode(payloadBody);

  // "DSSEv1 <type-len> <type> <body-len> <body>"
  const prefix = enc.encode(
    `DSSEv1 ${typeBytes.length} `,
  );
  const middle = enc.encode(` ${bodyBytes.length} `);

  const total = prefix.length + typeBytes.length + middle.length + bodyBytes.length;
  const result = new Uint8Array(total);
  let offset = 0;
  result.set(prefix, offset); offset += prefix.length;
  result.set(typeBytes, offset); offset += typeBytes.length;
  result.set(middle, offset); offset += middle.length;
  result.set(bodyBytes, offset);
  return result;
}

/**
 * Decode a DSSE envelope's base64 payload back to an InTotoStatement.
 * Throws if the payload is not valid JSON or does not look like a Statement.
 */
export function parseDssePayload(envelope: DsseEnvelope): InTotoStatement {
  const json = fromBase64(envelope.payload);
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>)["_type"] !== "https://in-toto.io/Statement/v1"
  ) {
    throw new Error("parseDssePayload: payload is not an in-toto Statement v1");
  }
  return parsed as InTotoStatement;
}

// ---------------------------------------------------------------------------
// Minimal base64 helpers (no external dependency)
// ---------------------------------------------------------------------------

function toBase64(str: string): string {
  // Node.js Buffer-based encoding (works in Node >= 20 without btoa issues
  // with arbitrary unicode bytes from JSON).
  return Buffer.from(str, "utf8").toString("base64");
}

function fromBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}
