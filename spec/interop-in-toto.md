# in-toto Interop: TrustBundle as an in-toto Statement v1

**Module:** `@kontourai/surface` — `src/interop/in-toto.ts`
**Public exports:** `toInTotoStatement`, `toDsseEnvelope`, `buildPaeBytes`, `parseDssePayload`

---

## Overview

This module lets a producer publish a TrustBundle as a signed software-supply-chain
attestation by wrapping it in the in-toto Statement v1 format and optionally enveloping
it in DSSE (Dead Simple Signing Envelope).  It adds no new crypto dependency: all
cryptographic operations are injected via a caller-supplied `Signer`.

---

## Statement shape

`toInTotoStatement(bundle, { subjects })` produces an in-toto Statement v1:

```jsonc
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "<producer-chosen artifact reference>",
      "digest": { "sha256": "<hex>" }
    }
  ],
  "predicateType": "https://hachure.org/v1/bundle",
  "predicate": { /* the TrustBundle verbatim */ }
}
```

| Field | Value | Note |
|---|---|---|
| `_type` | `https://in-toto.io/Statement/v1` | Fixed; identifies the in-toto spec version. |
| `subject` | caller-supplied `[{ name, digest }]` | At least one required. The producer knows which artifact digests are relevant; Surface does not infer them. |
| `predicateType` | `https://hachure.org/v1/bundle` | Stable URI identifying Kontour trust bundles. |
| `predicate` | the TrustBundle | The full bundle becomes the predicate; no fields are stripped or remapped. |

The `predicateType` URI is stable for the lifetime of `hachure.org/v1`.  If the
TrustBundle schema is broken (a new `apiVersion`), a new predicate type URI will be
registered rather than reusing this one.

---

## DSSE envelope and PAE

`toDsseEnvelope(statement, signer)` returns a DSSE envelope:

```jsonc
{
  "payloadType": "application/vnd.in-toto+json",
  "payload": "<base64-standard>",
  "signatures": [
    { "keyid": "<from signer>", "sig": "<base64 signature over PAE>" }
  ]
}
```

The payload is the base64-standard-encoded UTF-8 JSON serialisation of the Statement.

**Pre-Authentication Encoding (PAE)** — the bytes handed to `signer.sign()`:

```
PAE(type, body) = "DSSEv1" SP DEC(byte_len(type)) SP type SP DEC(byte_len(body)) SP body
```

`buildPaeBytes(payloadType, bodyString): Uint8Array` is exported so callers can
verify the pre-image independently or pass it directly to a WebCrypto
`SubtleCrypto.sign()` call.

### Injecting a signer

```ts
import { toInTotoStatement, toDsseEnvelope } from "@kontourai/surface/interop/in-toto";

const signer = {
  keyid: "my-key-id",
  async sign(paeBytes: Uint8Array): Promise<string> {
    // e.g. WebCrypto:
    const raw = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, paeBytes);
    return Buffer.from(raw).toString("base64");
  },
};

const statement = toInTotoStatement(bundle, { subjects });
const envelope = await toDsseEnvelope(statement, signer);
```

---

## Sigstore / Rekor anchoring guidance

The DSSE envelope produced by this module is structurally compatible with
[Sigstore](https://sigstore.dev) tooling:

1. **Sign with Sigstore Cosign** — Cosign's `attest` command accepts DSSE envelopes.
   Pass `--type custom` and `--predicate <bundle.json>` together with the
   `predicateType` URI to have Cosign wrap the bundle and upload the signed envelope
   to the [Rekor](https://docs.sigstore.dev/logging/overview/) transparency log.

2. **Upload to Rekor directly** — Use the Rekor `hashedrekord` or `dsse` entry type
   with the DSSE envelope JSON.  Once uploaded, Rekor returns a `LogEntry` UUID that
   can be stored in a `TrustBundle.proof` field (Kontour Resource Shape) as an
   `IntegrityAnchor` of kind `transparency_log`.

3. **Verify** — Retrieve the envelope from Rekor, decode `payload` from base64,
   reconstruct PAE via `buildPaeBytes`, verify the signature against the signer's
   public key, and check the `predicate` against the live `TrustBundle`.

---

## What Kontour adds on top of a frozen attestation

An in-toto Statement is a **frozen attestation**: it captures a point-in-time
assertion and anchors it cryptographically.  That is exactly what the DSSE envelope
provides.

A Kontour `TrustBundle` adds **living status** on top:

| Frozen attestation (in-toto envelope) | Living bundle (Surface) |
|---|---|
| Status is sealed at signing time. | Status is recomputed from events at query time: `f(claim, events, policy, now)`. |
| Tamper-evident; content cannot change. | Append-only; new events and evidence accumulate. |
| Verifier trusts the signer's identity. | Verifier trusts the derivation algorithm (`STATUS_FUNCTION_VERSION`). |
| Useful for supply-chain audits and legal holds. | Useful for operational dashboards, gates, and consumer inquiries. |

The two are complementary: embed the bundle in an in-toto envelope to
*anchor what was known at release time*; continue querying the live bundle to track
*what is true now*.  An `InquiryRecord` (ADR 0003 §6) records the live status at
inquiry time, linking the frozen and living views.
