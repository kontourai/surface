/**
 * Verification Endpoint — reference implementation of the
 * hachure.org/v1 verification endpoint profile.
 *
 * Spec: https://hachure.org/v1 (see docs/reference/verification-endpoint.md)
 *
 * ## Overview
 *
 * `createVerificationResponder` builds a pure-function responder that a producer
 * mounts behind its own authentication layer.  The responder has no framework
 * dependency; it works in any Node.js environment (Express, Fastify, plain http,
 * workers, etc.).
 *
 * ## Quick start
 *
 * ```ts
 * import { createVerificationResponder, createVerificationHttpHandler } from "@kontourai/surface";
 *
 * const responder = createVerificationResponder(myStore, {
 *   source: "https://producer.example.com",
 *   statusFunctionVersion: "1",
 * });
 *
 * // Plain Node http — producers own auth:
 * import http from "node:http";
 * http.createServer(createVerificationHttpHandler(responder)).listen(3000);
 * ```
 */

import type { AuthorityTrace, Claim, Evidence, TrustBundle, VerificationEvent } from "./types.js";
import { toDsseEnvelope, toInTotoStatement } from "./interop/in-toto.js";
import type { DsseEnvelope, Signer } from "./interop/in-toto.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Store interface — producers inject their own storage
// ---------------------------------------------------------------------------

/**
 * The minimal storage interface a producer supplies.  Surface does not dictate
 * how claims are stored; the producer implements this against its own backend.
 *
 * `lookupByIntegrityRef` receives one `integrityRef` string (the value from
 * `claim.currentIntegrityRef` or a bundle-level `integrityAnchor.value`) and
 * returns the current bundle slice for that ref, or null when not found.
 */
export interface VerificationStore {
  lookupByIntegrityRef(ref: string): Promise<{
    claims: Claim[];
    evidence: Evidence[];
    events: VerificationEvent[];
    authorityTrace?: AuthorityTrace[];
  } | null>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options for `createVerificationResponder`.
 */
export interface VerificationResponderOptions {
  /**
   * The producer identifier placed in the `source` field of every response
   * bundle.  Should match the `source` value in original bundles from this
   * producer.
   */
  source: string;

  /**
   * The version string of the status function active at this producer.
   * Placed in `metadata.statusFunctionVersion` on every response.
   * Import `statusFunctionVersion` from `@kontourai/surface` and pass it here
   * to keep the value in sync with the library.
   */
  statusFunctionVersion: string;

  /**
   * Optional in-toto signer (same `Signer` interface used by
   * `toDsseEnvelope`).  When provided, `respond()` also returns a signed DSSE
   * envelope wrapping the response bundle as an in-toto Statement.
   *
   * Key management and distribution are out of scope for this profile (see ADR
   * 0004 §Backlog).  Until key infrastructure exists, leave `signer` undefined
   * and deliver unsigned responses over a trusted transport.
   *
   * Producers that provide a signer MUST distribute the corresponding public
   * key via a separate, authenticated channel so receivers can verify the
   * envelope signatures.
   */
  signer?: Signer;
}

/**
 * The metadata block the profile mandates on every response bundle.
 */
export interface VerificationResponseMetadata {
  /** ISO 8601 timestamp at which the producer assembled this response. */
  respondedAt: string;
  /** Status function version active at the producer at response time. */
  statusFunctionVersion: string;
  /** The full list of refs from the request, in the order supplied. */
  requestedRefs: string[];
  /**
   * Refs from the request that the producer does not recognise.  Always
   * present; may be an empty array.  Never silently omitted.
   */
  unknownRefs: string[];
}

/**
 * A TrustBundle extended with the profile-mandated metadata block.
 * The `metadata` field on the standard `TrustBundle` type is
 * `Record<string, unknown> | undefined`; this narrowed view makes the
 * mandatory keys visible at the type level.
 */
export type VerificationBundle = Omit<TrustBundle, "metadata"> & {
  metadata: VerificationResponseMetadata;
};

/**
 * The value returned by `respond()`.
 *
 * `bundle` is always present.  `envelope` is present only when a `signer` was
 * supplied in the responder options.
 */
export interface VerificationResponse {
  bundle: VerificationBundle;
  envelope?: DsseEnvelope;
}

/**
 * The callable created by `createVerificationResponder`.
 */
export type VerificationResponder = (
  refs: string[],
  options?: { now?: Date },
) => Promise<VerificationResponse>;

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------

/**
 * Create a verification responder bound to the given store and options.
 *
 * The returned function is a pure async function with no side-effects beyond
 * calling `store.lookupByIntegrityRef` and (optionally) `signer.sign`.  Mount
 * it behind your own auth middleware; no authentication logic is included here.
 *
 * @param store   The producer's storage adapter.
 * @param options Configuration for the responder.
 * @returns       An async function `respond(refs, { now? })`.
 *
 * @example
 * ```ts
 * const responder = createVerificationResponder(store, {
 *   source: "https://producer.example.com",
 *   statusFunctionVersion: statusFunctionVersion, // from "@kontourai/surface"
 * });
 *
 * const { bundle, envelope } = await responder(["sha256:abc123"]);
 * ```
 */
export function createVerificationResponder(
  store: VerificationStore,
  options: VerificationResponderOptions,
): VerificationResponder {
  const { source, statusFunctionVersion: sfv, signer } = options;

  return async function respond(
    refs: string[],
    callOptions?: { now?: Date },
  ): Promise<VerificationResponse> {
    const now = callOptions?.now ?? new Date();
    const respondedAt = now.toISOString();

    // Look up each ref from the store.
    const lookups = await Promise.all(
      refs.map(async (ref) => ({ ref, result: await store.lookupByIntegrityRef(ref) })),
    );

    const unknownRefs: string[] = [];
    const allClaims: Claim[] = [];
    const allEvidence: Evidence[] = [];
    const allEvents: VerificationEvent[] = [];
    const allAuthorityTrace: AuthorityTrace[] = [];

    for (const { ref, result } of lookups) {
      if (result === null) {
        unknownRefs.push(ref);
      } else {
        allClaims.push(...result.claims);
        allEvidence.push(...result.evidence);
        allEvents.push(...result.events);
        if (result.authorityTrace) {
          allAuthorityTrace.push(...result.authorityTrace);
        }
      }
    }

    const metadata: VerificationResponseMetadata = {
      respondedAt,
      statusFunctionVersion: sfv,
      requestedRefs: refs,
      unknownRefs,
    };

    const bundle: VerificationBundle = {
      schemaVersion: 3,
      source,
      claims: allClaims,
      evidence: allEvidence,
      policies: [],
      events: allEvents,
      ...(allAuthorityTrace.length > 0 ? { authorityTrace: allAuthorityTrace } : {}),
      metadata,
    };

    if (!signer) {
      return { bundle };
    }

    // Wrap the bundle in an in-toto Statement and produce a DSSE envelope.
    // The statement subject uses the set of requested refs as the artifact
    // descriptor so receivers can correlate the envelope back to the request.
    const subjects = refs.map((ref) => ({
      name: ref,
      digest: { "integrity-ref": ref },
    }));

    const statement = toInTotoStatement(bundle, { subjects });
    const envelope = await toDsseEnvelope(statement, signer);

    return { bundle, envelope };
  };
}

// ---------------------------------------------------------------------------
// HTTP adapter
// ---------------------------------------------------------------------------

/**
 * Wrap a `VerificationResponder` in a plain Node.js `(req, res)` handler.
 *
 * Supported request shapes (per the profile):
 *
 * ```
 * GET  /.well-known/hachure/verify?ref=<ref>[&ref=...]
 * POST /.well-known/hachure/verify
 *      Content-Type: application/json
 *      { "refs": ["<ref>", ...] }
 * ```
 *
 * The handler responds with `application/json`.  When the responder has a
 * signer, the JSON body is `{ bundle, envelope }`; otherwise `{ bundle }`.
 *
 * **Authentication** — producers MUST mount this handler behind their own auth
 * middleware.  The handler itself performs no authentication.  This is
 * intentional: the profile is auth-agnostic and producers choose their own
 * credential scheme (API key, OAuth, mTLS, etc.).
 *
 * @param responder  A `VerificationResponder` created by `createVerificationResponder`.
 * @returns          A plain Node.js `(req, res) => void` handler.
 *
 * @example
 * ```ts
 * import http from "node:http";
 * import { createVerificationResponder, createVerificationHttpHandler } from "@kontourai/surface";
 *
 * const handler = createVerificationHttpHandler(
 *   createVerificationResponder(store, { source: "https://producer.example.com", statusFunctionVersion: "1" })
 * );
 *
 * // Mount behind your own auth middleware before attaching to the server:
 * http.createServer((req, res) => {
 *   if (!isAuthenticated(req)) { res.writeHead(401).end(); return; }
 *   handler(req, res);
 * }).listen(3000);
 * ```
 */
export function createVerificationHttpHandler(
  responder: VerificationResponder,
): (req: IncomingMessage, res: ServerResponse) => void {
  return function handler(req: IncomingMessage, res: ServerResponse): void {
    void handleRequest(req, res, responder);
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  responder: VerificationResponder,
): Promise<void> {
  try {
    let refs: string[];

    if (req.method === "GET" || req.method === "HEAD") {
      refs = extractRefsFromQuery(req.url ?? "");
    } else if (req.method === "POST") {
      refs = await extractRefsFromBody(req);
    } else {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    if (refs.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "At least one ref is required" }));
      return;
    }

    const result = await responder(refs);

    const body = JSON.stringify(result);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body, "utf8").toString(),
    });
    res.end(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

function extractRefsFromQuery(url: string): string[] {
  const questionMark = url.indexOf("?");
  if (questionMark === -1) return [];
  const queryString = url.slice(questionMark + 1);
  const params = new URLSearchParams(queryString);
  return params.getAll("ref").filter((r) => r.length > 0);
}

async function extractRefsFromBody(req: IncomingMessage): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          typeof body !== "object" ||
          body === null ||
          !Array.isArray((body as Record<string, unknown>)["refs"])
        ) {
          reject(new Error("POST body must be { refs: string[] }"));
          return;
        }
        const refs = ((body as Record<string, unknown>)["refs"] as unknown[])
          .filter((r): r is string => typeof r === "string" && r.length > 0);
        resolve(refs);
      } catch {
        reject(new Error("Invalid JSON in request body"));
      }
    });
    req.on("error", reject);
  });
}
