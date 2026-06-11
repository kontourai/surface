# Hachure — an open trust format

**Namespace:** `hachure.org/v1`
**Reference implementation:** `@kontourai/surface`
**Status:** pre-1.0, hard versioning, no compatibility promises yet
**Originally developed by:** [Kontour AI](https://kontour.ai)

---

## What this is

Hachure is an open format for portable trust state. It defines how claims about
real-world subjects — and the evidence, policies, verification events, authority
records, and derivation rules behind them — are represented so they can cross
product and vendor boundaries without the receiver needing access to the
producer's internals.

Hachures are the short strokes on hand-drawn maps that show the shape and
steepness of terrain. This format does the same for trust: it shows the contours
of what is supported, what is stale, what is disputed, and what is simply
asserted.

The format is deliberately not named after any company or product.
`@kontourai/surface` is its reference implementation. Producers outside the
Kontour suite can emit and consume these records without adopting a vendor name
into their wire format.

**Governance intent:** Hachure is currently developed by Kontour AI, which holds
the name to protect it. We intend to move the specification to neutral
governance as adoption warrants.

The Kontour products build on top: Survey emits Trust Bundles, Veritas authors claims
through it, Flow consumes Surface-shaped evidence at gates, and Console operates across
all of them. Each product stands alone; the format requires none of them.

---

## Namespace and versioning

All core trust-format records use `apiVersion: hachure.org/v1` in the Kontour
Resource Shape envelope. Product-specific records use product-scoped namespaces
(`surface.kontour.ai/v1alpha1`, `survey.kontour.ai/v1alpha1`, etc.).

Pre-1.0: the format uses hard breaking changes rather than compatibility aliases.
No forward or backward compatibility guarantees are made across versions. Version
bumps are reflected in `schemaVersion` (an integer field in TrustBundle, currently
`3`) and in `STATUS_FUNCTION_VERSION` (a string exported by the reference
implementation, currently `"1"`).

---

## Scope: core record shapes

This specification covers the following record types. Each is a first-class concept
in the format; none requires a specific producer or product to instantiate.

### TrustBundle

The central wire record. A portable, point-in-time package of trust state from a
single producer: claims, evidence, policies, verification events, and optional identity
links, claim groups, and authority traces.

Plain-language definition (ADR 0002):

> A Trust Bundle is a portable, point-in-time package of trust state from a single
> producer — claims, the evidence and verification events behind them, and the policies
> the producer played by — packed so it can cross a product boundary without the
> receiver needing access to the producer's internals.

The `source` field identifies the producer. Bundles from multiple producers can be
merged; conflicts surface as `disputed` status (never last-write-wins).

An optional `identityLinks` array declares co-referent subjects — real-world entities
known under more than one identifier.  Each link carries a stable optional `id`, a
`subjects` array (two or more `{ subjectType, subjectId }` refs), and an optional
`relation` field: `"equivalent"` (default — the subjects denote the same entity),
`"subsumes"` (the first subject is a superset of the others), or `"converts"` (the
subjects are related by a unit or scale transformation, parameterised by an optional
`conversion: { factor, offset, note }` object).  A link may additionally carry a
`mappingClaimId` pointing to the Claim that evidences the mapping assertion itself;
when set, inquiry resolution through that link is subject to a weakest-link status cap —
a disputed mapping claim cannot yield a verified answer.

### Claim

An assertion about a real-world subject. A claim has a stable `id`, a `subjectType`
and `subjectId` pair identifying what is being asserted, a `claimType`, a
`fieldOrBehavior`, and a `value`. Claims carry optional `impactLevel`, integrity
anchors, policy references, derivation edges, and confidence basis metadata.

Derived trust status is never stored on the claim itself as source of truth; it is
computed from the surrounding bundle at evaluation time.

### Evidence

An item of support for a claim. Evidence is linked to a claim via `claimId`. Each
item carries `evidenceType`, `method`, `sourceRef`, an excerpt or summary, and
`observedAt`. Evidence can declare a `passing` boolean and a `blocking` flag; a
non-passing, non-blocked evidence item is a soft signal; a non-passing blocking
item can cause a `disputed` status outcome.

`supportStrength` (default `"entails"`) distinguishes full entailment from citation:
only `"entails"` evidence feeds policy requirement checks. `"cited"` evidence is
contextual but does not satisfy required-evidence policies.

### VerificationPolicy

A policy declares what evidence and methods are required to reach `verified` status
for a given `claimType`, and how long verification remains valid. Core fields:
`requiredEvidence` (array of evidence types), `requiredMethods`, `requiresCorroboration`,
`validityRule` (one of `duration`, `commit`, `historical`, `manual`), and
`acceptanceCriteria`.

Policies are resolved against claims by `verificationPolicyId` first, then by
`claimType` exact match, then by walking the `parentType` chain from most-specific
to most-general. See [Status Derivation](status-function.md) for how the resolved
policy feeds the derivation.

### VerificationEvent

An append-only event representing a status decision for a claim. Events carry
`claimId`, `status`, `actor`, `method`, `evidenceIds`, and timestamps. Events are
never updated; they accumulate as a ledger. The most recent event of a given kind
shapes the derived status via the fold described in [Status Derivation](status-function.md).

A verification event may carry `resolvesDispute: true` and an `authorityRef` to
indicate it is an authority-gated dispute-resolution decision (ADR 0003 §8).

### AuthorityTrace

A record establishing that a named actor held a named authority over a subject during
a time window. Authority traces are the credential that makes a dispute-resolution
event binding: the fold checks that the resolution event's actor has an active trace
at the decision timestamp. Fields: `actorRef`, `authorityType`, `authorityRef`,
`validFrom`, `validUntil`, `revokedAt`, and optional integrity anchors.

### InquiryRecord

An append-only record capturing the resolution of a consumer-side question (Inquiry)
against the ledger (ADR 0003 §6). An InquiryRecord carries the original question, the
resolution path (matched claim or named derivation rule plus input claims), the answer
with its status at evaluation time, a frozen snapshot of input claim statuses, the
`statusFunctionVersion` used, and the `resolvedAt` timestamp.

Records never go stale because they never assert present-tense truth; they assert what
was knowable at a specific moment. The `statusFunctionVersion` field enables
re-evaluation if the derivation algorithm changes.

### DerivationRule

A named, versioned rule that derives a boolean answer from existing claims (ADR 0003 §5).
Rules compose claims using value predicates (`eq`, `gt`, `gte`, `lte`, `in`, `exists`)
and status predicates (`acceptedStatuses`), combined with `"all"` or `"any"`. Rules
are promoted from Flow's gate-expectation language. The weakest-link confidence ceiling
propagates through rule evaluation unchanged.

---

## Status semantics

Status is a pure, versioned function of the bundle data and a `now` timestamp. The
full specification of the derivation algorithm is in [status-function.md](status-function.md).

The eight possible statuses:

| Status | Meaning |
|---|---|
| `unknown` | No supporting evidence or events; the claim cannot be evaluated. |
| `proposed` | Evidence exists or a verification event indicates proposed, but policy requirements are not fully met. |
| `assumed` | The claim is treated as true for operational purposes without full verification evidence. |
| `verified` | A verification event asserts verified, required policy evidence is present, and the verification is still fresh. |
| `stale` | The most recent verified event has expired under the policy's validity rule. |
| `disputed` | A verified claim has blocking contradicting evidence, or a terminal dispute event exists. |
| `superseded` | A terminal event marks the claim as superseded. |
| `rejected` | A terminal event marks the claim as rejected. |

---

## Normative schemas

The JSON schemas at [`../schemas/`](../schemas/) are the normative wire contracts for
all core record shapes. The following schema files are part of this format:

| Schema file | Record type(s) |
|---|---|
| `trust-bundle.schema.json` | TrustBundle (top-level container) |
| `claim.schema.json` | Claim |
| `evidence.schema.json` | Evidence |
| `verification-policy.schema.json` | VerificationPolicy |
| `verification-event.schema.json` | VerificationEvent |
| `trust-report.schema.json` | TrustReport (derived, not emitted by producers) |
| `derivation-rule.schema.json` | DerivationRule |
| `inquiry-record.schema.json` | InquiryRecord |

Schemas are not duplicated in this directory. The reference implementation
validates TrustBundle input against these schemas via `validateTrustBundle()`.

---

## Out of scope: future extension profiles

The following producer domains are explicitly out of scope for this core specification.
Each is a candidate for a future extension profile that imports the core record shapes
and adds domain-specific vocabulary:

- **Survey chains** — the source → extraction → candidate → review → claim provenance
  path that Survey uses to build trust bundles. Survey emits bundles conforming to
  this spec; the review-trail records above it are Survey-scoped.
- **Veritas standards** — repo-area claims, per-run evidence collection, merge-gate
  integration, and the `ClaimReviewRecord` pattern from the Kontour Resource Shape.
- **Flow gates** — gate-expectation language, run-scoped views, gate results, and
  the `GateRun` resource shape.

Extension profiles reference this spec as their foundation and declare any additional
fields or constraints. They do not modify the core record shapes.

---

## Executable conformance

`spec/conformance/` contains fixture bundles and expected per-claim statuses at a
fixed `now`. The test at `tests/spec-conformance.test.ts` loads every fixture and
asserts that the reference implementation derives the expected statuses, making this
specification executable.

See [conformance/README.md](conformance/README.md) for the fixture inventory.
