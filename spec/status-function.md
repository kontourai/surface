# Status Derivation — Specification

**Function:** `status = f(claim, evidence, events, policy, authorityTrace, now)`
**Version constant:** `STATUS_FUNCTION_VERSION` (currently `"1"`)
**Source of truth:** `src/status.ts` in `@kontourai/surface`

---

## Principle

Claim status is a pure, versioned, deterministic function (ADR 0003 §7). Given the
same inputs and the same `STATUS_FUNCTION_VERSION`, any conforming implementation
must derive the same status. There is no stored status field that overrides
computation; the derived status is always recomputed from the input bundle at
evaluation time.

`now` is an explicit input so that time-based staleness checks are reproducible.
A caller that wants a point-in-time view fixes `now` before evaluating; there are
no clock-tick events and no background expiry.

Reproducibility guarantee: if two independent implementations receive the same
`(claim, evidence, events, policies, authorityTrace, now)` and the same
`STATUS_FUNCTION_VERSION`, they must return the same `TrustStatus`.

---

## Inputs

| Input | Type | Required | Description |
|---|---|---|---|
| `claim` | `Claim` | yes | The claim being evaluated. |
| `evidence` | `Evidence[]` | yes | All evidence items whose `claimId` matches the claim. |
| `events` | `VerificationEvent[]` | yes | All verification events for the entire bundle; the function filters by `claimId`. |
| `policies` | `VerificationPolicy[]` | yes | All policies in the bundle; the function resolves the applicable policy internally. |
| `now` | `Date` | no (defaults to wall clock) | The evaluation timestamp for freshness checks. |
| `authorityTrace` | `AuthorityTrace[]` | no (defaults to `[]`) | Active authority records enabling dispute resolution. |

`deriveClaimStatus` (the public versioned entry point) resolves the policy and
partitions evidence before calling the internal `deriveTrustStatus` function.

---

## Evidence partitioning

Before the fold, evidence is partitioned by `supportStrength`:

- **`"entails"`** (default when `supportStrength` is absent) — fully entails the
  claim; satisfies policy requirement checks and corroboration counts.
- **`"cited"`** — contextual support only; does not satisfy required-evidence
  policy checks and does not count toward corroboration.

Only entailing evidence is passed to `deriveTrustStatus`. Cited evidence is
available to callers but does not influence status derivation.

---

## Policy resolution

Before the fold, the applicable `VerificationPolicy` is resolved from the policies
array using this priority order:

1. If `claim.verificationPolicyId` is set and a policy with that `id` exists, it wins.
2. Otherwise, find a policy whose `claimType` exactly matches `claim.claimType`.
3. Otherwise, walk the `parentType` chain declared by policies (most-specific first)
   and pick the first match.
4. If no policy is found, `policy` is `undefined` and the fold proceeds without one.

The first policy declared for a given `claimType` wins; later declarations do not
silently override.

---

## The fold

The fold is an ordered sequence of checks. The first matching branch terminates
the evaluation and returns its status. No subsequent checks are applied.

### Step 1: Authority-gated dispute resolution

Check for the most recent verification event (sorted most-recent-first by `createdAt`)
that satisfies both of these conditions:

- `event.resolvesDispute === true`
- The event's `actor` has an active `AuthorityTrace` at the time of the decision

An `AuthorityTrace` is active at a given `eventCreatedAt` if all of the following hold:

- `trace.actorRef === event.actor`
- `trace.revokedAt` is absent, or `trace.revokedAt > eventCreatedAt`
- `trace.validFrom` is absent, or `trace.validFrom <= eventCreatedAt`
- `trace.validUntil` is absent, or `trace.validUntil >= eventCreatedAt`
- If `event.authorityRef` is set, `trace.authorityRef === event.authorityRef`

If such a resolution event is found:

- Check whether any evidence item satisfies **all** of:
  - `evidence.passing === false`
  - `evidence.blocking !== false`
  - `Date.parse(evidence.observedAt) > Date.parse(resolutionEvent.createdAt)`

  If such a "newer blocking failure" exists, return **`disputed`** (the resolution
  is overridden by fresh contradicting evidence).

- Otherwise, return `resolutionEvent.status` directly. This is the authority-gated
  resolution outcome.

### Step 2: Terminal event statuses

Filter all events to those matching `claim.id`, sort most-recent-first by `createdAt`.
Let `latestEvent` be the first (most recent) event.

If `latestEvent` exists and its `status` is one of `"rejected"`, `"disputed"`,
`"superseded"`, or `"stale"` — return that status. These are terminal: they are
not overridden by evidence inspection.

### Step 3: Assumed from event

If `latestEvent` exists and `latestEvent.status === "assumed"` — return **`assumed`**.

### Step 4: Verified event path

If `latestEvent` exists and `latestEvent.status === "verified"`:

#### 4a. Staleness check

If a policy is present, check whether the verification is stale based on
`policy.validityRule.kind`:

- **`"commit"`** — stale if `claim.currentIntegrityRef` is set AND none of the
  evidence items linked by `latestEvent.evidenceIds` carry an `integrityRef` equal
  to `claim.currentIntegrityRef`. (If `claim.currentIntegrityRef` is absent, not stale.)
- **`"duration"`** — stale if `now > verifiedTime + (policy.validityRule.durationDays × 86400000 ms)`,
  where `verifiedTime = Date.parse(latestEvent.verifiedAt ?? latestEvent.createdAt)`.
- **`"historical"` or `"manual"`** — never stale by time or commit change.
- If `policy` is absent — not stale.

If stale: return **`stale`**.

#### 4b. Policy evidence gap check

If a policy is present, check whether all required evidence types and methods are
present among entailing evidence items:

- Build the set of `evidenceType` values from entailing evidence.
- Build the set of `method` values from entailing evidence.
- Compute `missingTypes = policy.requiredEvidence` items not in the type set.
- Compute `missingMethods = (policy.requiredMethods ?? [])` items not in the method set.
- Corroboration gap: `policy.requiresCorroboration === true` and `entailingEvidence.length < 2`.

If any gap exists: return **`proposed`** (the event says verified but policy
requirements are not met — the claim is effectively a proposed state).

#### 4c. Blocking failure check

Check whether any evidence item satisfies both:
- `evidence.passing === false`
- `evidence.blocking !== false` (i.e., `blocking` is `true` or absent/`undefined`)

If such evidence exists: return **`disputed`**.

#### 4d. Verified

Return **`verified`**.

### Step 5: Claim-level status baseline

If there is no verification event (or `latestEvent.status` was not one of the above):

- If `claim.status === "proposed"` — return **`proposed`**.
- If `claim.status === "assumed"` — return **`assumed`**.

### Step 6: No policy

If no policy is resolved (`policy` is `undefined`):

- Return **`proposed`** if `evidence.length > 0` (there is evidence but no policy to
  evaluate it against).
- Return **`unknown`** if `evidence.length === 0`.

### Step 7: Policy evidence presence

If a policy is present but no verification event exists:

- Build the set of `evidenceType` values from all evidence (not just entailing, at
  this step — but in practice the partitioning above was already applied upstream).
- If `policy.requiredEvidence` is a subset of the evidence type set: return **`proposed`**.
- Otherwise: return **`unknown`**.

---

## Derivation ceiling

For derived claims (claims built from other claims via `derivationEdges` or
`derivedFrom`), the status of the derived claim cannot exceed the weakest input
claim status. This ceiling is applied by the derivation layer before the fold
receives the claim; it is reflected in `DerivationChangeRecord` entries in the
report.

---

## Status ordering (for ceiling purposes)

From weakest to strongest: `unknown` < `rejected` < `superseded` < `disputed` <
`stale` < `assumed` < `proposed` < `verified`.

---

## Output

`deriveClaimStatus` returns `{ status: TrustStatus; policyId: string | undefined }`.
`policyId` is the `id` of the resolved policy, or `undefined` if none was found.

---

## Versioning

`STATUS_FUNCTION_VERSION` is a string exported by `@kontourai/surface`. It is
incremented when the algorithm changes in a way that could produce different outputs
for the same inputs. `InquiryRecord.statusFunctionVersion` captures which version
was active at resolution time, enabling re-evaluation when the algorithm version
changes.

Conforming implementations must declare which `STATUS_FUNCTION_VERSION` value they
implement. Implementations claiming version `"1"` must satisfy all conformance
cases in `spec/conformance/`.
