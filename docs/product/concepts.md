# Concepts

## Surface

Surface is the shared foundation for making product claims, evidence, policies, freshness, conflicts, and gaps inspectable by humans and agents.

In the current data contract, `surface` is still a producer-defined namespace for related claims. Do not confuse that field with the product itself.

## Claim

A claim is something a producer says is true enough to inspect, verify, refresh, dispute, or reject. It has a subject, asserted field or behavior, value, impact, optional materiality, optional policy, and derived status.

Examples:

- A field-attested record has `registrationStatus = OPEN`.
- A resolved fact has `w2.wages = 123456`.
- A repo surface requires `npm test` before a change is trusted.

`currentIntegrityRef` scopes the claim to the source it currently describes. For developer workflows this is often a commit, working-tree digest, file hash, or configuration hash. A verified claim is only valuable within that integrity scope; when the source anchor changes, Viewers and agents can see that the claim needs fresh verification.

## Evidence

Evidence explains why a claim deserves trust. It can be a source excerpt, test output, human attestation, calculation trace, document citation, crawl observation, or policy rule.

Each evidence record also declares a verification method: observation, extraction, validation, corroboration, attestation, auditability, anchoring, or monitoring. The evidence type says what the artifact is; the method says how much verification depth it represents.

Survey-produced source-of-authority observations should keep producer-declared source authority on the evidence record, under `metadata.sourceAuthority`. Do not promote that value into `authorityTrace` unless the producer also emits a producer-neutral actor or system authority record.

## Evidence Trace

An evidence trace is the inspectable path showing how evidence was produced, including source, method, actor or system, timestamp, tool or run context, logs when relevant, and integrity scope. Surface standardizes evidence traceability without owning evidence collection.

## Attestation

Attestation is the canonical shape for a human saying, "this policy, record, or source is the reviewed thing I approve." Use `evidenceType: "attestation"` with `method: "attestation"`, set `collectedBy` to the attesting actor, and put the attested content hash in `integrityRef`. Consumers should include the actor identity, attestation timestamp, optional expiry, and content hash in `metadata`.

The exported `buildHumanAttestationEvidence({ subject, actor, attestedAt, validUntil, contentHash })` helper builds this evidence record for producers that need a consistent human attestation payload.

## Authority Trace

Authority Trace records why an actor or system had authority to create, approve, or verify evidence for a subject. It is producer-neutral: the authority can be a role, permission, credential, system, organization, policy, or other reference from the producer's own directory, policy engine, workflow log, or signing system.

Authority Trace is reserved for portable actor or system authority. Producer-declared source authority from Survey observations belongs in `Evidence.metadata.sourceAuthority` unless and until it can be represented as a neutral authority record.

The current API field is `authorityTrace?: AuthorityTrace[]` on `TrustBundle` and `TrustReport`. Each record links an `actorRef` and `authorityRef` to a `subject`, `sourceRef`, observation timestamp, and optional claim or evidence IDs. Optional validity windows, revocation timestamps, integrity references, and metadata let consumers distinguish active authority from expired, revoked, or weak authority evidence.

Example:

```json
{
  "id": "authority.record-steward-1",
  "subject": { "subjectType": "record", "subjectId": "record-1" },
  "actorRef": "actor:record-steward-1",
  "authorityType": "role",
  "authorityRef": "role:record-steward",
  "sourceRef": "directory:records-team",
  "observedAt": "2026-05-01T00:04:00.000Z",
  "evidenceIds": ["evidence.record.attestation"],
  "claimIds": ["claim.record.status"],
  "validUntil": "2026-12-31T00:00:00.000Z",
  "integrityRef": "sha256:directory-entry"
}
```

## Check

A check is a verification run or event. Checks can promote a claim to verified, mark it stale, dispute it, reject it, or supersede it.

## Freshness

Freshness says how long a verification remains valid and whether the claim has changed since it was verified. A claim may need refresh because time passed, the source changed, new evidence arrived, or a dependent artifact changed.

## Transparency Gap

A transparency gap is a missing, weak, stale, disputed, private, unavailable, unverifiable, or unmapped trust element that may affect whether a product output or claim is transparent enough to inspect.

The current contract exposes many of these as `transparencyGaps` report annotations. Product-facing docs should call them transparency gaps or conflicts. They expose provenance gaps, policy requirement gaps, freshness breaches, missing corroboration, unsupported inferences, and contradictions without changing trust status by themselves.

Transparency gaps can carry `materiality` when the owning claim declares it. This lets review queues prioritize important gaps without turning the gap into a trust score.

## Materiality

Materiality is an optional ordinal hint for prioritizing human or agent inspection: `low`, `medium`, or `high`. It is separate from trust status, confidence basis, impact level, and transparency-gap severity. Materiality says how important the claim or gap is to inspect; it does not say whether the claim is true.

Surface core keeps materiality domain-neutral. Producers and vertical extensions own calibration, such as what "high" means for a legal filing, a financial fact, a repo policy, or a support workflow. Put those mappings in producer documentation, extension metadata, or product policy. Do not encode domain-specific materiality labels or numeric trust scores in the core Surface contract.

## Conflict

A conflict is a transparency gap where claims, evidence, policies, or source states disagree. Surface should make conflicts visible instead of smoothing them over.

## Claim Group

A claim group groups related claims into a framework, requirement set, or product-defined view. Claim groups are the portable way to say "these claims together support a broader assertion" without losing drilldown to the concrete evidence.

The current API calls this shape `claimGroups`. Requirements inside a claim group point at one or more claim IDs. A requirement may include a validation strategy that describes the evidence, methods, or authority expected for that requirement. Surface does not treat that strategy as evidence by itself; report generation rolls requirements up from the derived status of the referenced claims.

Examples:

- A repo governance product can project a repo standards as a framework and each policy rule as a requirement.
- A compliance product can project a regulatory framework as a claim group of requirements backed by document, attestation, and monitoring claims.
- A data quality product can project a publish-readiness checklist as a claim group of field-level claims.

## Trust Bundle

A Trust Bundle is a portable, point-in-time package of trust state from a single producer — claims, the evidence and verification events behind them, and the policies the producer played by — packed so it can cross a product boundary without the receiver needing access to the producer's internals. Think of it as a briefcase of receipts: claims are what is asserted, evidence and events are the receipts, policies are the rules the producer played by, and `source` says whose briefcase it is.

Survey emits a bundle, Surface evaluates one, Veritas embeds one in its evidence artifacts, and Flow queries one. Bundles from multiple producers fold into one ledger; when two bundles disagree about the same subject, the conflict surfaces as a `disputed` claim rather than last-write-wins.

The API type is `TrustBundle` (renamed from `TrustInput` per [ADR 0002](../adr/0002-trust-bundle.md), which also supersedes the earlier "Claim Package" vocabulary).

## Inquiry

An Inquiry is a question posed against the ledger: "is this statement trustworthy?" — including statements nobody pre-registered as claims. It resolves to exactly one of three outcomes: **matched** (an existing claim answers it, at its live status), **derived** (a named, versioned derivation rule over existing claims answers it), or **unsupported gap** (nothing answers it, reported honestly).

A resolved inquiry leaves an Inquiry record: the question, the resolution path, the answer, the statuses of every input at that moment, the timestamp, and the asker. Records are append-only testimony and never go stale; the live claim status is shown alongside. Equivalence between a question and a claim is never silently decided by a model — it is proposed, reviewed, and recorded.

A Trust Bundle is how trust state arrives at the ledger; an Inquiry is how questions arrive. See [ADR 0003](../adr/0003-inquiry-and-resolution.md) for the full design.

## Trust Snapshot

A Trust Snapshot is product language for the point-in-time trust state behind a product output, workflow, or package. It can drive a Trust Panel, Surface Console, API response, MCP resource, or export.

`buildTrustReport(input, options?)` is the stable public API that turns a validated Trust Bundle (API type `TrustBundle`) into a `TrustReport`. The report carries claims, evidence, policies, events, current `claimGroups`, and current `authorityTrace` field data, then adds derived status, freshness outcomes, requirement fields, `transparencyGaps` annotations, derivation `changeRecords`, subject groups, claim group rollups, and summary counts.

Producers should project product-specific workflow data into `TrustBundle`, call `validateTrustBundle`, and then call `buildTrustReport`. Product layers may persist a compact report summary, but Surface remains responsible for deriving statuses such as `verified`, `assumed`, `stale`, `disputed`, and `rejected`.

## Trust Panel

A Trust Panel is the Viewer-facing projection of a Trust Snapshot. It should let a human inspect material claims, evidence trace, freshness, conflicts, evidence visibility, and transparency gaps before relying on product information.

## Surface Console

The Surface Console is the Operator-facing projection for shaping product transparency. It manages claims, policies, evidence, owners, materiality, review queues, candidate claims, and unresolved gaps. The current local `surface console` command is an implementation path toward the Console.

## Confidence Basis

Confidence basis records how much verification depth supports a claim. It captures:

- `sourceQuality`: the quality of evidence source (strong, moderate, weak)
- `reviewerAuthority`: who verified the claim (system, human, agent)
- `evidenceStrength`: for technical evidence, the evidence strength (strong, moderate, weak)

When claims depend on other claims (`derivedFrom` or `derivationEdges`), the derived claim's status is capped by the weakest link in the chain. This is a status ceiling: an upstream weak link cannot surface as a confidently `verified` downstream claim. The authored `confidenceBasis` fields themselves travel through the report unchanged; they are recorded context, not recomputed.

## Derivation

When one claim depends on another, the dependent claim can carry `derivedFrom` for simple claim-id links or `derivationEdges` for typed links. A derivation edge records the input claim, method, optional role, and support strength. This chains the provenance so reviewers and systems can:

- Detect when upstream claims become stale
- Apply confidence ceilings (derived claims cannot be stronger than their sources)
- Surface conflict when an upstream claim is disputed or superseded

When a derivation input becomes stale, superseded, disputed, rejected, assumed, missing, or cyclic, the report emits `changeRecords`. These records are report-derived guidance: they explain whether a derived claim should be recomputed, reviewed, or treated as blocked. Producers still own the domain recomputation itself.

## Coverage

Coverage measures how much of a product surface is supported by current evidence and policy.

## Trust Analytics Projection

`buildTrustAnalyticsProjection(report)` derives evidence intelligence from a `TrustReport`. It groups verification coverage by producer namespace, claim group rollups, stale and disputed claims, high-impact unsupported claims, transparency gaps, evidence gaps, requirement gaps, authority trace state, confidence basis, action queues, and attestation validity. Queue items carry optional materiality so consumers can sort or filter review work by `low`, `medium`, or `high` without using a numeric trust score.

The projection is Console-ready and query-ready, but it is still derived from the open trust format. Surface analytics should mean provenance-aware trust analytics, not arbitrary charts over product data.

## Attestation Validity

An attestation records that an actor approved, observed, or accepted something. It does not automatically prove that the actor was real, authorized, current, or bound to the attested payload.

Surface treats attestation validity as a separate evidence-intelligence layer. A product can emit actor references, identity evidence references, first-class `authorityTrace` records, validity windows, revocation markers, and integrity hashes. Surface can then expose gaps when an attestation is missing identity evidence, authority evidence, freshness, or integrity. Existing metadata keys such as `authoritySource` remain compatible, but new producers should prefer `authorityTrace`.

Surface does not own auth or product permissions. Downstream systems own accounts, roles, and login. Surface owns the portable evidence shape and the derived visibility into whether the attestation can satisfy trust policy.
