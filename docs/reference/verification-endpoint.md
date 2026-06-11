# Verification Endpoint

Surface ships a reference implementation of the
hachure.org/v1 verification endpoint profile.
The implementation is framework-free and is split into two parts:

- `createVerificationResponder` — the pure async core.
- `createVerificationHttpHandler` — a thin Node.js `(req, res)` adapter.

Producers own authentication.  The handler itself performs none.

---

## Quick start

```ts
import {
  createVerificationResponder,
  createVerificationHttpHandler,
  statusFunctionVersion,
} from "@kontourai/surface";
import http from "node:http";

// Implement VerificationStore against your own backend:
const store = {
  async lookupByIntegrityRef(ref) {
    const record = await db.findByIntegrityRef(ref);
    if (!record) return null;
    return {
      claims: record.claims,
      evidence: record.evidence,
      events: record.events,
      authorityTrace: record.authorityTrace,
    };
  },
};

const responder = createVerificationResponder(store, {
  source: "https://producer.example.com",
  statusFunctionVersion,   // re-export from @kontourai/surface
});

const handler = createVerificationHttpHandler(responder);

// Mount behind your own auth middleware:
http.createServer((req, res) => {
  if (!isAuthenticated(req)) { res.writeHead(401).end(); return; }
  handler(req, res);
}).listen(3000);
```

---

## API

### `createVerificationResponder(store, options)`

Creates a responder bound to a storage adapter and options.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `store` | `VerificationStore` | yes | Storage adapter the producer supplies. |
| `options.source` | `string` | yes | Producer identifier placed in `bundle.source`. |
| `options.statusFunctionVersion` | `string` | yes | Status function version; use the `statusFunctionVersion` export from `@kontourai/surface`. |
| `options.signer` | `Signer` | no | Optional in-toto signer.  When present, the response includes a DSSE envelope. |

**Returns** `VerificationResponder` — an async function `respond(refs, { now? })`.

### `VerificationStore`

The interface the producer implements:

```ts
interface VerificationStore {
  lookupByIntegrityRef(ref: string): Promise<{
    claims: Claim[];
    evidence: Evidence[];
    events: VerificationEvent[];
    authorityTrace?: AuthorityTrace[];
  } | null>;
}
```

Return `null` when the ref is not recognised.  The responder places unrecognised
refs in `metadata.unknownRefs` honestly — never silently omitting them.

### `createVerificationHttpHandler(responder)`

Wraps a `VerificationResponder` in a plain Node.js `(req, res)` handler.

Supported request shapes (per the profile):

```
GET  /.well-known/hachure/verify?ref=<ref>[&ref=...]
POST /.well-known/hachure/verify
     Content-Type: application/json
     { "refs": ["<ref>", ...] }
```

Responds with `Content-Type: application/json`.  The response body is
`{ bundle }` when unsigned, or `{ bundle, envelope }` when a signer was provided.

**Authentication** — producers MUST mount this handler behind their own auth
middleware before exposing it.  The handler itself has no auth logic.

---

## Response shape

The response bundle is a scoped `TrustBundle` extended with a mandatory
`metadata` block:

| Key | Type | Meaning |
|---|---|---|
| `respondedAt` | ISO 8601 string | When the producer assembled this response. |
| `statusFunctionVersion` | string | Status function version active at response time. |
| `requestedRefs` | string[] | All refs from the request, in order. |
| `unknownRefs` | string[] | Refs the producer does not recognise.  Always present, never empty by omission. |

---

## Signed responses

When a `signer` is provided the responder calls `toDsseEnvelope` (from the
in-toto interop module) to wrap the bundle in an in-toto Statement v1 DSSE
envelope.  The `envelope` field on the response carries the result.

Signing is OPTIONAL per ADR 0004 §Backlog.  Until key-management infrastructure
exists, unsigned responses over a trusted transport are valid.

---

## Receiver rules

Receivers MUST re-run the status function over the merged bundle rather than
trusting any status value in the response directly.  The profile specifies the
full set of receiver rules: merge events and evidence from the response bundle
with the held bundle, then call the status function at your own `now`.
