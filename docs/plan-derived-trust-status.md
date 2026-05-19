# Implementation Plan: Derived Trust Status

## Background and motivation

Surface is a trust engine. Its core value proposition is that a claim's
verification status must be **derived from evidence**, not accepted on a
producer's declaration. Currently `deriveTrustStatus` in `src/status.ts`
trusts the producer's `verified` event unconditionally — if the event says
verified, the claim is verified, even when required evidence is missing or
non-passing. This makes the `verified` label meaningless and undermines the
product's value.

The agreed model, reached through product design sessions, is:

```
Producer's job:  collect and emit evidence + its evaluation of that evidence
Surface's job:   derive status from the composition of all evidence parts
```

The producer contributes two legitimate things per evidence record:
1. **`passing: boolean`** — did this piece of evidence observe a passing result?
   (e.g. tests passed, fallow returned ok, policy rule satisfied)
2. **`blocking: boolean`** — if non-passing, does this failure block verification?
   (e.g. fallow warns but the producer config marks it non-blocking)

Surface then independently evaluates:
- Are all required evidence types present per the policy?
- Are all required verification methods present per the policy?
- Is every piece of evidence passing, or non-passing but non-blocking?
- Is the evidence fresh under the policy's validity rule?

The derived status rules:
| Condition | Derived status |
|---|---|
| Missing required evidence type(s) | `proposed` |
| Missing required verification method(s) | `proposed` |
| Any evidence `passing=false` AND `blocking=true` | `disputed` |
| Evidence complete, all passing (or non-blocking failures) | `verified` |
| Evidence complete but stale | `stale` |
| No verified event, has evidence | `proposed` |
| No verified event, no evidence | `unknown` |

The producer's declared status is preserved as `producerStatus` on the output
claim for audit and divergence display. Surface's derived `status` is the
authoritative field.

---

## Repository layout

```
/Users/brian/dev/github/kontourai/surface/
  src/
    types.ts          — all shared interfaces and type aliases
    status.ts         — deriveTrustStatus (THE core function)
    report.ts         — buildTrustReport, deriveFaultLines
    analytics.ts      — buildTrustAnalyticsProjection
    validate.ts       — validateTrustInput (input validation)
    index.ts          — public exports
    dashboard/
      types.ts        — SurfaceDashboardConfig, vocab, theme types
      script.ts       — client-side JS (single exported string constant)
      shell.ts        — HTML shell builder
      styles.ts       — CSS (single exported string constant)
      server.ts       — HTTP server
  tests/
    (existing test files — do not break them)
  bin/surface.mjs     — CLI entry point
```

Build command: `npm run build` (runs `tsc`)
Test command: `npm test`

---

## Changes required

### 1. `src/types.ts` — add fields to Evidence, FaultLine, and Claim output

**Add `passing` and `blocking` to `Evidence`:**
```typescript
export interface Evidence {
  id: string;
  claimId: string;
  evidenceType: EvidenceType;
  method: EvidenceMethod;
  sourceRef: string;
  sourceLocator?: string;
  excerptOrSummary: string;
  observedAt: string;
  collectedBy: string;
  integrityRef?: string;
  passing?: boolean;    // ADD: producer evaluation — did this evidence observe a pass?
  blocking?: boolean;   // ADD: if non-passing, is this failure blocking verification?
  metadata?: Record<string, unknown>;
}
```

Both fields are optional. Absence of `passing` means the producer did not
provide an evaluation — Surface treats it as passing (benefit of the doubt).
Absence of `blocking` when `passing=false` defaults to `true` (failures are
blocking unless explicitly marked otherwise).

**Add `blocking` to `FaultLine`:**
```typescript
export interface FaultLine {
  id: string;
  claimId: string;
  type: FaultLineType;
  severity: ImpactLevel;
  message: string;
  evidenceIds?: string[];
  policyId?: string;
  createdAt: string;
  blocking?: boolean;   // ADD: does this fault block the claim from being verified?
  metadata?: Record<string, unknown>;
}
```

**Add `producerStatus` to the TrustReport claim output type:**

The `TrustReport` interface already has:
```typescript
claims: Array<Claim & { status: TrustStatus }>;
```

Extend the inline type to carry the producer's original declaration:
```typescript
claims: Array<Claim & { status: TrustStatus; producerStatus?: TrustStatus }>;
```

---

### 2. `src/status.ts` — fix `deriveTrustStatus` to enforce evidence gates

This is the central change. The current function trusts a `verified` event
without checking whether the evidence behind it satisfies the policy. Fix it
to enforce two gates before granting `verified`:

**Gate 1 — evidence completeness:** all `policy.requiredEvidence` types must
be present in the evidence set, and all `policy.requiredMethods` must be
present. If either is missing → `proposed`.

**Gate 2 — evidence evaluation:** if any evidence record has `passing=false`
and `blocking` is not explicitly `false` → `disputed`.

Here is the complete rewrite of `deriveTrustStatus`:

```typescript
export function deriveTrustStatus(input: {
  claim: Claim;
  evidence: Evidence[];
  policy?: VerificationPolicy;
  events: VerificationEvent[];
  now?: Date;
}): TrustStatus {
  const now = input.now ?? new Date();
  const claimEvents = input.events
    .filter((event) => event.claimId === input.claim.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latestEvent = claimEvents[0];

  // Terminal events always win — producer explicitly marked this rejected,
  // disputed, superseded, or stale. These override any evidence evaluation.
  if (latestEvent && TERMINAL_EVENT_STATUSES.has(latestEvent.status)) {
    return latestEvent.status;
  }

  // A verified event is a producer signal that verification ran. Surface
  // still independently validates the evidence before accepting it.
  if (latestEvent?.status === "verified") {
    // Freshness check first — stale supersedes all other checks.
    if (isVerifiedEventStale(latestEvent, input.claim, input.evidence, input.policy, now)) {
      return "stale";
    }

    // Evidence completeness gate: Surface requires all policy-mandated
    // evidence types and methods to be present. Missing evidence means the
    // verification pipeline was not complete — regardless of what the
    // producer declared. Downgrade to proposed.
    if (input.policy) {
      const evidenceTypes = new Set(input.evidence.map((e) => e.evidenceType));
      const evidenceMethods = new Set(input.evidence.map((e) => e.method));
      const missingTypes = input.policy.requiredEvidence.filter((t) => !evidenceTypes.has(t));
      const missingMethods = (input.policy.requiredMethods ?? []).filter((m) => !evidenceMethods.has(m));
      if (missingTypes.length > 0 || missingMethods.length > 0) {
        return "proposed";
      }
    }

    // Evidence evaluation gate: if any evidence record explicitly marks
    // itself as non-passing, and that failure is not marked non-blocking,
    // the claim is disputed rather than verified.
    const hasBlockingFailure = input.evidence.some(
      (e) => e.passing === false && e.blocking !== false,
    );
    if (hasBlockingFailure) {
      return "disputed";
    }

    return "verified";
  }

  // No verified event: fall through to the existing proposed/unknown logic.
  if (input.claim.status === "proposed") {
    return "proposed";
  }

  if (!input.policy) {
    return input.evidence.length > 0 ? "proposed" : "unknown";
  }

  const evidenceTypes = new Set(input.evidence.map((e) => e.evidenceType));
  const hasRequiredEvidence = input.policy.requiredEvidence.every((t) => evidenceTypes.has(t));
  return hasRequiredEvidence ? "proposed" : "unknown";
}
```

The `isVerifiedEventStale` helper function below it does not change.

---

### 3. `src/report.ts` — preserve producerStatus, propagate blocking to fault lines

**In `buildTrustReport`, Pass 1**, after computing `ownStatus` per claim,
preserve the producer's declared status alongside it:

In the `ownStatuses` map call, capture the claim's original status:

```typescript
const ownStatuses = input.claims.map((claim) => {
  claimsById.set(claim.id, claim);
  const evidence = input.evidence.filter((item) => item.claimId === claim.id);
  const policy = resolvePolicyForClaim(claim, input.policies);
  if (policy) policyByClaimId.set(claim.id, policy);
  const producerStatus = claim.status;                          // ADD
  const ownStatus = deriveTrustStatus({ claim, evidence, policy, events: input.events, now });
  ownStatusByClaimId.set(claim.id, ownStatus);
  if (policy) {
    proofRequirementsByClaimId[claim.id] = proofRequirementFromPolicy(policy);
    faultLines.push(...deriveFaultLines({ claim, evidence, policy, status: ownStatus, now }));
  } else if (evidence.length === 0) {
    faultLines.push({ /* existing no-evidence fault line unchanged */ });
  }
  return { claim, ownStatus, producerStatus };                  // ADD producerStatus
});
```

**In Pass 2**, when spreading the claim into the output array, include
`producerStatus` only when it differs from the derived status (no noise when
they agree):

```typescript
const claims = ownStatuses.map(({ claim, ownStatus, producerStatus }) => {
  const outcome = applyDerivation({ claim, ownStatus, ownStatusByClaimId, claimsById, now });
  faultLines.push(...outcome.faultLines);
  const derived = outcome.status;
  const output: Claim & { status: TrustStatus; producerStatus?: TrustStatus } = {
    ...claim,
    status: derived,
  };
  if (producerStatus !== undefined && producerStatus !== derived) {
    output.producerStatus = producerStatus;
  }
  return output;
});
```

**In `deriveFaultLines`**, propagate `blocking` from evidence to the fault
lines it generates. When a fault line is created because evidence is
non-passing or because required evidence is missing, set `blocking` on the
fault line to match the evidence's intent:

- For `provenance_gap` (missing evidence types): `blocking: true` — missing
  required evidence is always a blocking gap.
- For `policy_violation` (missing methods): `blocking: true` — same rationale.
- For fault lines sourced from `evidence.metadata.faultLineHints`: read
  `hint.blocking` if present; otherwise default to `true`.

Add `blocking` to each `faultLines.push(...)` call in `deriveFaultLines`
where applicable. For example:

```typescript
if (missingEvidence.length > 0) {
  faultLines.push({
    id: `${input.claim.id}.fault.provenance-gap`,
    claimId: input.claim.id,
    type: "provenance_gap",
    severity: input.claim.impactLevel ?? input.policy.impactLevel,
    message: `Missing required evidence: ${missingEvidence.join(", ")}.`,
    policyId: input.policy.id,
    blocking: true,   // ADD
    createdAt,
  });
}
```

For `faultLineHintsFromEvidence`, read `hint.blocking`:
```typescript
// inside the .map:
blocking: typeof hint.blocking === "boolean" ? hint.blocking : true,   // ADD
```

---

### 4. `src/analytics.ts` — no structural changes required

The analytics projection already reads `status` from the report claims. Once
`deriveTrustStatus` produces correct statuses, `staleClaims`,
`disputedClaims`, and `highImpactUnsupportedClaims` will automatically
reflect the derived truth.

No changes needed here.

---

### 5. `src/validate.ts` — check this file exists and add `passing`/`blocking` to evidence validation

Read `src/validate.ts` before editing. It validates the `TrustInput` shape.
Add acceptance of the new optional `passing` (boolean) and `blocking`
(boolean) fields on each evidence record without making them required. The
validator should not reject existing inputs that omit them.

---

### 6. `src/dashboard/script.ts` — show divergence and confidence tier

The dashboard script is a single exported string constant in
`src/dashboard/script.ts`. The client-side JS reads
`window.__SURFACE_CONFIG__.readModel` which is the full serialised
`TrustReport` including the new `producerStatus` field on each claim.

**Add a divergence indicator to `claimCard`:**

When `claim.producerStatus` exists (it is only set when it differs from
`claim.status`), append a small divergence note to the card meta row:

```javascript
${claim.producerStatus
  ? `<span class="card-divergence" title="Producer declared ${claim.producerStatus}">⚠ was ${esc(claim.producerStatus)}</span>`
  : ""}
```

**Add a confidence tier to claim cards:**

A `verified` claim with no fault lines and `proofStrength: "strong"` in its
`confidenceBasis` is "strongly verified". A `verified` claim with fault lines
or weak proof strength is "weakly verified". Express this through an
additional CSS class on the card:

```javascript
function confidenceTier(claim) {
  if (claim.status !== "verified") return "";
  const hasFaults = (claim.faultLineIds?.length ?? 0) > 0;
  const strength = claim.confidenceBasis?.proofStrength;
  if (!hasFaults && strength === "strong") return " card-strong";
  if (hasFaults || strength === "weak") return " card-weak";
  return "";
}
```

Apply: `class="claim-card${confidenceTier(claim)}${isAttention ? " card-attention" : ""}"`

**In `showClaimDetail`**, when `claim.producerStatus` exists, add a section
above the fault block:

```javascript
if (claim.producerStatus) {
  // show a banner: "Producer declared [producerStatus] — Surface derived [claim.status]"
  el("detailDivergenceBanner").textContent =
    "Producer declared "" + claim.producerStatus + "" but Surface derived "" + claim.status +
    "" from the evidence.";
  show("detailDivergenceBlock");
} else {
  hide("detailDivergenceBlock");
}
```

Add the corresponding HTML element to `src/dashboard/shell.ts` immediately
after the `<div class="sheet-top">` block:

```html
<div id="detailDivergenceBlock" class="sheet-section divergence-banner" hidden>
  <p id="detailDivergenceBanner"></p>
</div>
```

Add CSS to `src/dashboard/styles.ts`:

```css
.card-strong { border-left: 3px solid var(--s-good); }
.card-weak   { border-left: 3px solid var(--s-amber); opacity: 0.92; }
.card-divergence {
  font-size: 0.72rem; font-weight: 800; color: var(--s-amber);
  padding: 0.1rem 0.35rem; border-radius: 4px;
  background: var(--s-amber-bg); border: 1px solid var(--s-amber);
}
.divergence-banner {
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border-left: 3px solid var(--s-amber);
  background: var(--s-amber-bg);
  font-size: 0.88rem;
  line-height: 1.45;
  margin-bottom: 0.9rem;
}
.divergence-banner p { margin: 0; color: var(--s-ink); }
```

Also add the fault line `blocking` indicator in the detail sheet fault
rendering. When `fl.blocking === false`, append a "non-blocking" pill:

```javascript
${fl.blocking === false ? `<span class="nonblocking-pill">non-blocking</span>` : ""}
```

CSS:
```css
.nonblocking-pill {
  font-size: 0.65rem; font-weight: 900; letter-spacing: 0.08em;
  text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 4px;
  background: var(--s-blue-bg); color: var(--s-blue); border: 1px solid var(--s-blue);
  margin-left: 0.4rem;
}
```

---

### 7. Tests

The existing test suite lives in `tests/`. Read those files to understand the
fixture format before adding new tests. Add to the appropriate existing test
file (or create `tests/derived-status.test.ts`):

**Test cases required:**

1. **Missing required evidence type → proposed, not verified**
   - Claim with verified event
   - Policy requires `["test_output", "policy_rule"]`
   - Evidence only has `policy_rule`
   - Expected: `derived status = "proposed"`, `producerStatus = "verified"`

2. **Missing required method → proposed, not verified**
   - Claim with verified event
   - Policy requires methods `["validation", "auditability"]`
   - Evidence only uses `auditability`
   - Expected: `derived status = "proposed"`

3. **Non-passing blocking evidence → disputed**
   - Claim with verified event
   - Evidence has `passing: false, blocking: true` (or omitted blocking)
   - Expected: `derived status = "disputed"`

4. **Non-passing non-blocking evidence → verified (soft failure)**
   - Claim with verified event, complete evidence
   - Evidence has `passing: false, blocking: false`
   - Expected: `derived status = "verified"` (non-blocking failure does not prevent verification)

5. **All evidence present and passing → verified**
   - Claim with verified event
   - Policy evidence types all satisfied
   - All evidence has `passing: true` (or passing omitted — default to passing)
   - Expected: `derived status = "verified"`

6. **Stale still wins over evidence gates**
   - Claim with verified event
   - Evidence is complete and passing
   - But integrity ref is stale (commit-based policy, ref differs)
   - Expected: `derived status = "stale"`

7. **Terminal events still win**
   - Claim with disputed event (terminal)
   - Evidence is complete and passing
   - Expected: `derived status = "disputed"` (terminal event is not overridden)

8. **producerStatus only set when diverged**
   - Two claims: one where derived matches producer, one where it diverges
   - Verify `producerStatus` is undefined on the matching one
   - Verify `producerStatus` is set on the diverged one

---

## What NOT to change

- `src/policy-resolver.ts` — no changes
- `src/derivation.ts` — no changes
- `src/identity.ts` — no changes
- `src/adapters/` — no changes; adapters produce `TrustInput`, the new
  `passing`/`blocking` fields are optional so existing adapters continue
  to work without modification
- `src/linked.ts` — no changes
- `bin/surface.mjs` — no changes
- `src/cli.ts` — no changes
- The dashboard server (`src/dashboard/server.ts`) — no changes
- The dashboard HTML shell (`src/dashboard/shell.ts`) — only the divergence
  block addition described in step 6 above

---

## Verification steps

After implementation:

1. `npm run build` must pass with zero TypeScript errors.
2. `npm test` must pass — existing tests must not break. New tests must pass.
3. Run the dashboard against the live Veritas read model:
   ```
   node bin/surface.mjs dashboard --read-model /Users/brian/dev/github/kontourai/veritas/.veritas/surface-dashboard/latest.json
   ```
   Open `http://localhost:4242` and verify:
   - Governance artifact claims (policy `veritas.governance-artifact`) now
     show `proposed` rather than `verified` — they have missing required
     evidence types and methods
   - The divergence banner appears in the detail sheet for those claims
     showing "Producer declared 'verified' — Surface derived 'proposed'"
   - The fallow disputed claim is still `disputed`
   - Claims with complete, passing evidence and no faults still show as
     `verified`
4. Run `surface report --input examples/surface-fixtures.json` and confirm
   the summary output is still coherent (totals add up, no crashes).
