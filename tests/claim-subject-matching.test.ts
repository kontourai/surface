import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveOrphanedSubjectDisposition,
  deriveTrustStatus,
  matchClaimSubjects,
  validateTrustBundle,
  type Claim,
  type ClaimDefinition,
  type OrphanedSubjectDispositionStatus,
  type SubjectRef,
  type TrustBundle,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Shared fixtures — a producer-neutral "slot" analog: a container subject
// (e.g. a schedule, a plan, a roster) that owns a variable-length list of
// child rows re-extracted on every sync. Rows are matched by a normalized
// natural key (label + start + end), matching Surface's own "Repeated Field
// Claim" CONTEXT.md entry: independent row-level provenance requires durable
// row identifiers or separate row claims supplied by the producer.
// ---------------------------------------------------------------------------

interface ExistingSlot {
  readonly id: string;
  readonly label: string;
  readonly start: string;
  readonly end: string;
}

interface IncomingSlot {
  readonly label: string;
  readonly start: string;
  readonly end: string;
}

function slotKey(slot: { label: string; start: string; end: string }): string {
  return `${slot.label.trim().toLowerCase()}|${slot.start}|${slot.end}`;
}

function match(existing: ExistingSlot[], incoming: IncomingSlot[]) {
  return matchClaimSubjects<IncomingSlot, ExistingSlot>({
    existing,
    incoming,
    existingKey: slotKey,
    incomingKey: slotKey,
    existingId: (slot) => slot.id,
  });
}

// ---------------------------------------------------------------------------
// matchClaimSubjects
// ---------------------------------------------------------------------------

test("matchClaimSubjects matches by natural key and preserves the existing subject's stable id", () => {
  const existing: ExistingSlot[] = [
    { id: "slot-1", label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];
  const incoming: IncomingSlot[] = [
    { label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];

  const result = match(existing, incoming);

  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0]?.id, "slot-1");
  assert.equal(result.matched[0]?.existing, existing[0]);
  assert.equal(result.matched[0]?.incoming, incoming[0]);
  assert.deepEqual(result.orphaned, []);
  assert.deepEqual(result.created, []);
});

test("matchClaimSubjects classifies a renamed incoming item as both an orphan of the old key and a creation under the new one", () => {
  const existing: ExistingSlot[] = [
    { id: "slot-1", label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];
  // Same underlying slot, but its label changed — the natural key changed too.
  const incoming: IncomingSlot[] = [
    { label: "Early Morning", start: "2026-07-01", end: "2026-07-05" },
  ];

  const result = match(existing, incoming);

  assert.deepEqual(result.matched, []);
  assert.equal(result.orphaned.length, 1);
  assert.equal(result.orphaned[0], existing[0]);
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0], incoming[0]);
});

test("matchClaimSubjects resolves duplicate natural keys first-in-first-matched, in list order", () => {
  // Two existing rows share a natural key (a producer data-quality issue),
  // and only one incoming row carries that key.
  const existing: ExistingSlot[] = [
    { id: "slot-1", label: "Morning", start: "2026-07-01", end: "2026-07-05" },
    { id: "slot-2", label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];
  const incoming: IncomingSlot[] = [
    { label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];

  const result = match(existing, incoming);

  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0]?.id, "slot-1");
  assert.equal(result.orphaned.length, 1);
  assert.equal(result.orphaned[0]?.id, "slot-2");
  assert.deepEqual(result.created, []);
});

test("matchClaimSubjects resolves duplicate incoming natural keys the same way — surplus becomes a creation", () => {
  const existing: ExistingSlot[] = [
    { id: "slot-1", label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];
  const incoming: IncomingSlot[] = [
    { label: "Morning", start: "2026-07-01", end: "2026-07-05" },
    { label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];

  const result = match(existing, incoming);

  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0]?.id, "slot-1");
  assert.equal(result.matched[0]?.incoming, incoming[0]);
  assert.deepEqual(result.orphaned, []);
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0], incoming[1]);
});

test("matchClaimSubjects treats an empty incoming list as all-orphaned", () => {
  const existing: ExistingSlot[] = [
    { id: "slot-1", label: "Morning", start: "2026-07-01", end: "2026-07-05" },
    { id: "slot-2", label: "Afternoon", start: "2026-07-01", end: "2026-07-05" },
  ];

  const result = match(existing, []);

  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.orphaned, existing);
  assert.deepEqual(result.created, []);
});

test("matchClaimSubjects treats an empty existing list as all-created", () => {
  const incoming: IncomingSlot[] = [
    { label: "Morning", start: "2026-07-01", end: "2026-07-05" },
  ];

  const result = match([], incoming);

  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.orphaned, []);
  assert.deepEqual(result.created, incoming);
});

test("matchClaimSubjects returns empty results for two empty lists", () => {
  const result = match([], []);
  assert.deepEqual(result, { matched: [], orphaned: [], created: [] });
});

test("matchClaimSubjects partition-totality: every existing item lands in exactly one of matched/orphaned, every incoming item lands in exactly one of matched/created, and the counts sum correctly", () => {
  // A mixed scenario deliberately exercising every partition at once: two
  // matches, one orphan (dropped), one created (genuinely new), and one
  // rename (orphan of the old key + creation under the new key).
  const existing: ExistingSlot[] = [
    { id: "slot-1", label: "Morning", start: "2026-07-01", end: "2026-07-05" }, // -> matched
    { id: "slot-2", label: "Afternoon", start: "2026-07-01", end: "2026-07-05" }, // -> matched
    { id: "slot-3", label: "Evening", start: "2026-07-01", end: "2026-07-05" }, // -> orphaned (dropped)
    { id: "slot-4", label: "Overnight", start: "2026-07-01", end: "2026-07-05" }, // -> orphaned (renamed)
  ];
  const incoming: IncomingSlot[] = [
    { label: "Morning", start: "2026-07-01", end: "2026-07-05" }, // -> matched (slot-1)
    { label: "Afternoon", start: "2026-07-01", end: "2026-07-05" }, // -> matched (slot-2)
    { label: "Late Night", start: "2026-07-01", end: "2026-07-05" }, // -> created
    { label: "Overnight (extended)", start: "2026-07-01", end: "2026-07-05" }, // -> created (slot-4's rename)
  ];

  const result = match(existing, incoming);

  // Counts sum correctly.
  assert.equal(result.matched.length + result.orphaned.length, existing.length);
  assert.equal(result.matched.length + result.created.length, incoming.length);
  assert.equal(result.matched.length, 2);
  assert.equal(result.orphaned.length, 2);
  assert.equal(result.created.length, 2);

  // Every existing item appears in exactly one of matched/orphaned.
  const matchedExistingIds = new Set(result.matched.map((entry) => entry.existing.id));
  const orphanedIds = new Set(result.orphaned.map((slot) => slot.id));
  for (const item of existing) {
    const inMatched = matchedExistingIds.has(item.id);
    const inOrphaned = orphanedIds.has(item.id);
    assert.notEqual(inMatched, inOrphaned, `existing item ${item.id} must appear in exactly one of matched/orphaned`);
  }
  assert.equal(matchedExistingIds.size + orphanedIds.size, existing.length);

  // Every incoming item appears in exactly one of matched/created.
  const matchedIncoming = new Set(result.matched.map((entry) => entry.incoming));
  const createdSet = new Set(result.created);
  for (const item of incoming) {
    const inMatched = matchedIncoming.has(item);
    const inCreated = createdSet.has(item);
    assert.notEqual(inMatched, inCreated, `incoming item ${JSON.stringify(item)} must appear in exactly one of matched/created`);
  }
  assert.equal(matchedIncoming.size + createdSet.size, incoming.length);
});

// ---------------------------------------------------------------------------
// deriveOrphanedSubjectDisposition
// ---------------------------------------------------------------------------

const orphanedSubject: SubjectRef = { subjectType: "schedule-slot", subjectId: "slot-1" };
const untouchedSubject: SubjectRef = { subjectType: "schedule-slot", subjectId: "slot-2" };

const orphanedClaimA: ClaimDefinition = {
  id: "claim.slot-1.status",
  claimType: "schedule-field",
  fieldOrBehavior: "status",
  subjectType: "schedule-slot",
  subjectId: "slot-1",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const orphanedClaimB: ClaimDefinition = {
  id: "claim.slot-1.capacity",
  claimType: "schedule-field",
  fieldOrBehavior: "capacity",
  subjectType: "schedule-slot",
  subjectId: "slot-1",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const untouchedClaim: ClaimDefinition = {
  id: "claim.slot-2.status",
  claimType: "schedule-field",
  fieldOrBehavior: "status",
  subjectType: "schedule-slot",
  subjectId: "slot-2",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

test("deriveOrphanedSubjectDisposition emits one VerificationEvent per claim on an orphaned subject, with the caller-specified status", () => {
  const events = deriveOrphanedSubjectDisposition({
    orphanedSubjects: [orphanedSubject],
    claims: [orphanedClaimA, orphanedClaimB, untouchedClaim],
    status: "revoked",
    actor: "system:sync",
    method: "monitoring",
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.claimId).sort(), [orphanedClaimA.id, orphanedClaimB.id].sort());
  for (const event of events) {
    assert.equal(event.status, "revoked");
    assert.equal(event.actor, "system:sync");
    assert.equal(event.method, "monitoring");
    assert.equal(event.createdAt, "2026-07-01T00:00:00.000Z");
    assert.deepEqual(event.evidenceIds, []);
    assert.ok(event.id.length > 0);
  }
  // Untouched subject's claim must not receive a disposition event.
  assert.ok(!events.some((event) => event.claimId === untouchedClaim.id));
});

test("deriveOrphanedSubjectDisposition returns no events when no claim belongs to an orphaned subject", () => {
  const events = deriveOrphanedSubjectDisposition({
    orphanedSubjects: [untouchedSubject],
    claims: [orphanedClaimA],
    status: "revoked",
    actor: "system:sync",
    method: "monitoring",
  });
  assert.deepEqual(events, []);
});

test("deriveOrphanedSubjectDisposition returns no events for an empty orphaned-subjects list", () => {
  const events = deriveOrphanedSubjectDisposition({
    orphanedSubjects: [],
    claims: [orphanedClaimA, untouchedClaim],
    status: "revoked",
    actor: "system:sync",
    method: "monitoring",
  });
  assert.deepEqual(events, []);
});

test("deriveOrphanedSubjectDisposition defaults createdAt to now when `now` is omitted", () => {
  const before = Date.now();
  const events = deriveOrphanedSubjectDisposition({
    orphanedSubjects: [orphanedSubject],
    claims: [orphanedClaimA],
    status: "revoked",
    actor: "system:sync",
    method: "monitoring",
  });
  const after = Date.now();

  assert.equal(events.length, 1);
  const createdAtMs = Date.parse(events[0]?.createdAt ?? "");
  assert.ok(createdAtMs >= before && createdAtMs <= after);
});

test("deriveOrphanedSubjectDisposition emits a distinct event id per claim", () => {
  const events = deriveOrphanedSubjectDisposition({
    orphanedSubjects: [orphanedSubject],
    claims: [orphanedClaimA, orphanedClaimB],
    status: "revoked",
    actor: "system:sync",
    method: "monitoring",
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(events.length, 2);
  assert.notEqual(events[0]?.id, events[1]?.id);
});

test("deriveOrphanedSubjectDisposition events validate against Surface's own TrustBundle schema", () => {
  const events = deriveOrphanedSubjectDisposition({
    orphanedSubjects: [orphanedSubject],
    claims: [orphanedClaimA, orphanedClaimB],
    status: "revoked",
    actor: "system:sync",
    method: "monitoring",
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  const runtimeClaims: Claim[] = [orphanedClaimA, orphanedClaimB].map((claim) => ({
    ...claim,
    value: "OPEN",
  }));

  const bundle: TrustBundle = {
    schemaVersion: 5,
    source: "claim-subject-matching-test",
    claims: runtimeClaims,
    evidence: [],
    policies: [],
    events,
  };

  const validated = validateTrustBundle(bundle);
  assert.equal(validated.events.length, 2);
  assert.deepEqual(
    validated.events.map((event) => event.status),
    ["revoked", "revoked"],
  );
});

// ---------------------------------------------------------------------------
// Evaluator integration — feeds emitted events through the REAL
// deriveTrustStatus, not just schema validation, to pin the actual resulting
// claim status rather than only the events' shape.
// ---------------------------------------------------------------------------

const evaluatorClaim: Claim = {
  id: "claim.slot-1.status",
  claimType: "schedule-field",
  fieldOrBehavior: "status",
  subjectType: "schedule-slot",
  subjectId: "slot-1",
  value: "OPEN",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function deriveResultingStatus(status: OrphanedSubjectDispositionStatus) {
  const events = deriveOrphanedSubjectDisposition({
    orphanedSubjects: [orphanedSubject],
    claims: [evaluatorClaim],
    status,
    actor: "system:sync",
    method: "monitoring",
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  return deriveTrustStatus({
    claim: evaluatorClaim,
    evidence: [],
    events,
    now: new Date("2026-07-02T00:00:00.000Z"),
  });
}

test("deriveOrphanedSubjectDisposition('superseded') fed through the real deriveTrustStatus lands the claim in a terminal 'superseded' status", () => {
  assert.equal(deriveResultingStatus("superseded"), "superseded");
});

test("deriveOrphanedSubjectDisposition('revoked') fed through the real deriveTrustStatus lands the claim in a terminal 'stale' status — Surface's event-driven-staleness representation of a revocation, not literally 'revoked'", () => {
  // deriveTrustStatus (status.ts) deliberately folds a revoked terminal event
  // to "stale", never "revoked", for its own resulting claim status — this
  // pins that real, intentional behavior rather than assuming "revoked in,
  // revoked out".
  assert.equal(deriveResultingStatus("revoked"), "stale");
});

test("deriveOrphanedSubjectDisposition rejects a non-terminal TrustStatus at runtime with a clear error", () => {
  assert.throws(
    () =>
      deriveOrphanedSubjectDisposition({
        orphanedSubjects: [orphanedSubject],
        claims: [orphanedClaimA],
        // Bypass the type-level narrowing the way an `as`-casting or
        // plain-JS caller could, to exercise the runtime guard itself.
        status: "verified" as unknown as OrphanedSubjectDispositionStatus,
        actor: "system:sync",
        method: "monitoring",
      }),
    /not a terminal status/,
  );
});
