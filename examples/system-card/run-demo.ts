/**
 * examples/system-card/run-demo.ts
 *
 * Flagship demo: a model/system card decomposed into evidenced claims with
 * living statuses. Walks the three verbs — Assert, Observe, Resolve — using
 * acme-support-agent-v2 as the fictional subject.
 *
 * Run after `npm run build` from the repo root:
 *   node dist/examples/system-card/run-demo.js
 */
import { readFileSync } from "node:fs";
import {
  buildTrustReport,
  resolveInquiry,
  buildDisputeResolutionEvent,
  toInTotoStatement,
  toDsseEnvelope,
  validateTrustBundle,
  type TrustBundle,
  type DerivationRule,
  type Inquiry,
  type Signer,
} from "../../src/index.js";

// ---------------------------------------------------------------------------
// Load and validate the bundle
// ---------------------------------------------------------------------------

// bundle.json lives in examples/system-card/ — use cwd-relative path.
// Run this script from the repo root: node dist/examples/system-card/run-demo.js
const rawJSON = JSON.parse(readFileSync("examples/system-card/bundle.json", "utf8")) as unknown;

// validateTrustBundle throws on invalid input and returns the parsed bundle.
// This enforces the schema contract at load time.
let rawBundle: TrustBundle;
try {
  rawBundle = validateTrustBundle(rawJSON);
} catch (err) {
  console.error("Bundle validation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function rule(char: string, width = 72): string {
  return char.repeat(width);
}

function section(title: string): void {
  console.log("\n" + rule("="));
  console.log(`  ${title}`);
  console.log(rule("="));
}

function sub(title: string): void {
  console.log("\n" + rule("-", 50));
  console.log(`  ${title}`);
  console.log(rule("-", 50));
}

function claimLabel(id: string): string {
  // Shorten the claim IDs to the final segment for readability.
  return id.split(".").slice(-1)[0] ?? id;
}

// ---------------------------------------------------------------------------
// SECTION 1 — buildTrustReport at T0 (2025-11-05, shortly after deployment)
// ---------------------------------------------------------------------------

section("SECTION 1 — buildTrustReport at T0 (2025-11-05)");
console.log(`
The system card for acme-support-agent-v2 asserts five claims:
  • training-data-cutoff            (model-property)
  • intent-classification-accuracy  (eval-score, 30-day freshness window)
  • red-team-review-completed       (review-completion, requires corroboration)
  • pii-filtering-enabled           (capability — has CONFLICTING evidence)
  • human-oversight-policy          (policy-compliance — NO evidence attached)

Think of buildTrustReport as a spell-check for evidence: it reads every
claim, traces the supporting evidence and verification events, and returns
a per-claim status plus a list of gaps.
`);

const T0 = new Date("2025-11-05T12:00:00.000Z");
const report0 = buildTrustReport(rawBundle, { id: "demo-report-t0", now: T0 });

sub("Per-claim statuses at T0");
for (const claim of report0.claims) {
  const label = claimLabel(claim.id).padEnd(40);
  console.log(`  ${label} → ${claim.status}`);
}

sub("Transparency gaps at T0");
if (report0.transparencyGaps.length === 0) {
  console.log("  (none)");
} else {
  for (const gap of report0.transparencyGaps) {
    const claimShort = claimLabel(gap.claimId);
    console.log(`  [${gap.type}] ${claimShort}: ${gap.message}`);
  }
}

sub("Summary at T0");
console.log(`  Total claims: ${report0.summary.totalClaims}`);
const s0 = report0.summary.byStatus;
for (const [status, count] of Object.entries(s0)) {
  if ((count as number) > 0) console.log(`    ${status}: ${count}`);
}

// ---------------------------------------------------------------------------
// SECTION 2 — Time passes; the eval-score claim goes stale (T+35 days)
// ---------------------------------------------------------------------------

section("SECTION 2 — Time passes (T+35 days): eval score goes stale");
console.log(`
The eval-score policy has a 30-day freshness window (validityRule.kind =
"duration", durationDays = 30). The verification event was timestamped
2025-10-28. Advancing now past that window (2025-12-10) shows the claim
flipping from verified → stale — without touching any records.
`);

const T_STALE = new Date("2025-12-10T12:00:00.000Z");
const reportStale = buildTrustReport(rawBundle, { id: "demo-report-stale", now: T_STALE });

sub("Per-claim statuses at T+35d");
for (const claim of reportStale.claims) {
  const label = claimLabel(claim.id).padEnd(40);
  const prev = report0.claims.find((c) => c.id === claim.id)?.status;
  const changed = prev !== claim.status ? "  ← CHANGED" : "";
  console.log(`  ${label} → ${claim.status}${changed}`);
}

// ---------------------------------------------------------------------------
// SECTION 3 — resolveInquiry: exact match, derived, and unsupported
// ---------------------------------------------------------------------------

section("SECTION 3 — resolveInquiry: three inquiry outcomes");
console.log(`
Inquiries are the demand side: consumers ask questions, and Surface returns
either a matched claim with its live status, a derived answer via a named
rule, or an honest "unsupported" when nothing covers the question.
`);

// --- 3a: Exact match ---
sub("3a. Exact match — what is the training-data cutoff?");

const inquiryExact: Inquiry = {
  id: "inq.training-cutoff",
  question: "What is the training data cutoff date for acme-support-agent-v2?",
  target: {
    subjectType: "model",
    subjectId: "acme-support-agent-v2",
    fieldOrBehavior: "training-data-cutoff",
  },
  askedBy: "consumer:deployment-review",
  askedAt: T0.toISOString(),
};

const exactRecord = resolveInquiry(rawBundle, inquiryExact, { now: T0 });
console.log(`  outcome:  ${exactRecord.outcome}`);
console.log(`  answer:   ${JSON.stringify(exactRecord.answer?.value)}   (status: ${exactRecord.answer?.status})`);
console.log(`  resolved via claim: ${exactRecord.resolutionPath.claimIds[0]}`);

// --- 3b: Derived via DerivationRule ---
sub("3b. Derived — is acme-support-agent-v2 production-ready?");
console.log(`
  The question "production-ready?" has no single registered claim. A
  DerivationRule named "production-ready" composes three input claims using
  ALL-combinator (every requirement must be verified):
    • intent-classification-accuracy  >= 0.90  AND  status in {verified}
    • red-team-review-completed        = true  AND  status in {verified}
    • pii-filtering-enabled            = true  AND  status in {verified}
`);

const productionReadyRule: DerivationRule = {
  id: "rule.production-ready",
  version: "1.0.0",
  name: "production-ready",
  target: {
    subjectType: "model",
    subjectId: "acme-support-agent-v2",
    fieldOrBehavior: "production-ready",
  },
  combinator: "all",
  requirements: [
    {
      target: {
        subjectType: "model",
        subjectId: "acme-support-agent-v2",
        fieldOrBehavior: "intent-classification-accuracy",
      },
      acceptedStatuses: ["verified"],
      predicate: { op: "gte", value: 0.90 },
    },
    {
      target: {
        subjectType: "model",
        subjectId: "acme-support-agent-v2",
        fieldOrBehavior: "red-team-review-completed",
      },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    },
    {
      target: {
        subjectType: "model",
        subjectId: "acme-support-agent-v2",
        fieldOrBehavior: "pii-filtering-enabled",
      },
      acceptedStatuses: ["verified"],
      predicate: { op: "eq", value: true },
    },
  ],
};

const inquiryDerived: Inquiry = {
  id: "inq.production-ready",
  question: "Is acme-support-agent-v2 production-ready?",
  target: {
    subjectType: "model",
    subjectId: "acme-support-agent-v2",
    fieldOrBehavior: "production-ready",
  },
  askedBy: "consumer:deployment-review",
  askedAt: T0.toISOString(),
};

const derivedRecord = resolveInquiry(rawBundle, inquiryDerived, {
  now: T0,
  rules: [productionReadyRule],
});
console.log(`  outcome:   ${derivedRecord.outcome}`);
console.log(`  satisfied: ${derivedRecord.answer?.value}  (status: ${derivedRecord.answer?.status})`);
console.log(`  rule:      ${derivedRecord.resolutionPath.ruleId}`);
console.log(`  inputs:`);
for (const snap of derivedRecord.inputSnapshot) {
  console.log(`    ${claimLabel(snap.claimId).padEnd(38)} → ${snap.status}`);
}
console.log(`
  Note: pii-filtering is "disputed" (blocking conflicting evidence exists),
  so the ALL-rule is not satisfied even though the other two inputs pass.
`);

// --- 3c: Unsupported ---
sub("3c. Unsupported — a gap in coverage");

const inquiryUnsupported: Inquiry = {
  id: "inq.bias-audit",
  question: "Has acme-support-agent-v2 undergone a formal bias audit?",
  target: {
    subjectType: "model",
    subjectId: "acme-support-agent-v2",
    fieldOrBehavior: "bias-audit-completed",
  },
  askedBy: "consumer:compliance-review",
  askedAt: T0.toISOString(),
};

const unsupportedRecord = resolveInquiry(rawBundle, inquiryUnsupported, { now: T0 });
console.log(`  outcome:  ${unsupportedRecord.outcome}`);
console.log(`
  This is an honest admission: no claim, no rule, no evidence covers bias
  audits. The gap is a demand signal — it can propose a new claim mapping for
  review.
`);

// ---------------------------------------------------------------------------
// SECTION 4 — Dispute resolution
// ---------------------------------------------------------------------------

section("SECTION 4 — Dispute resolution (authority-weighted)");
console.log(`
pii-filtering-enabled is disputed: a config attestation says the filter is
active, but an incident report (INC-2025-1104) found a bypass and has
blocking=true. Status = "disputed".

Step 1: an authorised reviewer (Incident Review Board) decides the evidence
and issues a resolution event. The bundle is extended in-memory; status
flips.

Step 2: new contradicting evidence arrives and re-disputes.
`);

sub("4a. Baseline — pii-filtering status before resolution");
const piiClaim = report0.claims.find((c) => c.id === "claim.acme-support-agent.pii-filtering");
console.log(`  claim:  claim.acme-support-agent.pii-filtering`);
console.log(`  status: ${piiClaim?.status}`);

sub("4b. Incident Review Board issues a resolution event");
console.log(`
  The board reviewed INC-2025-1104 and confirmed: the bypass only affects
  HTML-encoded inputs (< 0.1% of traffic), the config filter is otherwise
  active, and a hotfix was deployed 2025-11-05 at 16:00Z. Decision: verified.
`);

const resolutionEvent = buildDisputeResolutionEvent({
  claimId: "claim.acme-support-agent.pii-filtering",
  decidedStatus: "verified",
  actor: "acme-ai/incident-review-board",
  authorityRef: "role:incident-arbiter",
  rationale:
    "Hotfix deployed 2025-11-05T16:00Z closes the HTML-encoding bypass. " +
    "Residual risk accepted by CISO. PII filter confirmed active post-fix.",
  evidenceIds: [
    "ev.pii-filtering.config-attestation",
    "ev.pii-filtering.conflicting-incident",
  ],
  decidedAt: "2025-11-05T17:00:00.000Z",
});

const bundleAfterResolution: TrustBundle = {
  ...rawBundle,
  events: [...rawBundle.events, resolutionEvent],
};

const T_RESOLVED = new Date("2025-11-05T18:00:00.000Z");
const reportResolved = buildTrustReport(bundleAfterResolution, {
  id: "demo-report-resolved",
  now: T_RESOLVED,
});
const piiResolved = reportResolved.claims.find(
  (c) => c.id === "claim.acme-support-agent.pii-filtering",
);
console.log(`  Resolution event actor:   ${resolutionEvent.actor}`);
console.log(`  Resolution authority:     ${resolutionEvent.authorityRef}`);
console.log(`  pii-filtering status now: ${piiResolved?.status}  <- status flipped`);

sub("4c. New contradicting evidence arrives — re-disputed");
console.log(`
  A second incident (INC-2025-1110) surfaces another bypass vector. Adding
  new blocking=true evidence re-disputes the claim.
`);

const newConflictingEvidence = {
  id: "ev.pii-filtering.second-incident",
  claimId: "claim.acme-support-agent.pii-filtering",
  supportStrength: "entails" as const,
  evidenceType: "test_output" as const,
  method: "observation" as const,
  sourceRef: "https://internal.acme.ai/incidents/INC-2025-1110",
  sourceLocator: "findings",
  excerptOrSummary:
    "INC-2025-1110 (2025-11-10): automated red-team probe found base64-encoded " +
    "payloads also bypass the PII filter. Distinct bypass vector from INC-2025-1104.",
  observedAt: "2025-11-10T14:00:00.000Z",
  collectedBy: "acme-ai/security-scanner",
  passing: false,
  blocking: true,
};

const bundleReDisputed: TrustBundle = {
  ...bundleAfterResolution,
  evidence: [...bundleAfterResolution.evidence, newConflictingEvidence],
};

const T_REDISPUTED = new Date("2025-11-10T15:00:00.000Z");
const reportReDisputed = buildTrustReport(bundleReDisputed, {
  id: "demo-report-redisputed",
  now: T_REDISPUTED,
});
const piiReDisputed = reportReDisputed.claims.find(
  (c) => c.id === "claim.acme-support-agent.pii-filtering",
);
console.log(`  pii-filtering status: ${piiReDisputed?.status}  <- re-disputed by new blocking evidence`);

// ---------------------------------------------------------------------------
// SECTION 5 — in-toto Statement + DSSE envelope
// ---------------------------------------------------------------------------

section("SECTION 5 — toInTotoStatement + toDsseEnvelope (fake signer)");
console.log(`
The same TrustBundle (at T0, pre-dispute-resolution) can be wrapped as an
in-toto Statement v1 and signed into a DSSE envelope. The signer is injected
by the caller — Surface never sees key material.
`);

const statement = toInTotoStatement(rawBundle, {
  subjects: [
    {
      name: "acme-support-agent-v2",
      digest: {
        sha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    },
  ],
});

// Fake signer — in production this would be a KMS or HSM call.
const fakeSigner: Signer = {
  keyid: "demo-signing-key-2025",
  sign: async (_paeBytes: Uint8Array): Promise<string> => {
    return Buffer.from("DEMO-SIGNATURE-NOT-CRYPTOGRAPHIC").toString("base64");
  },
};

const envelope = await toDsseEnvelope(statement, fakeSigner);

sub("Envelope head");
console.log(`  payloadType: ${envelope.payloadType}`);
console.log(`  payload:     ${envelope.payload.slice(0, 60)}...  (truncated)`);
console.log(`  signatures[0].keyid: ${envelope.signatures[0]?.keyid}`);
console.log(`  signatures[0].sig:   ${envelope.signatures[0]?.sig}`);
console.log(`
  The full base64 payload decodes to the in-toto Statement wrapping the
  TrustBundle as the predicate. Any verifier with the public key and the
  original bundle can re-derive every status shown in this demo.
`);

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

section("DONE");
console.log(`
Three verbs over one ledger:
  Assert  — bundle.json declares five claims about acme-support-agent-v2.
  Observe — evidence, verification events, and authority traces attach to them.
  Resolve — buildTrustReport, resolveInquiry, and buildDisputeResolutionEvent
            answer every question with a status and a receipt, or admit a gap.
`);

