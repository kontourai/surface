# ADR 0005: Multi-Producer Merge Conformance

Status: accepted

Date: 2026-07-01

## Context

`mergeBundles` / `mergeBundlesDetailed` (`src/merge.ts`) fold Trust Bundles from
multiple producers into one ledger (ADR 0002, "Merge semantics"). The ratified
hachure identifier-and-merge design (landing upstream as `merge.md` in hachure
0.7.0) elevates that behavior from an implementation detail to normative,
cross-implementation spec text, and in doing so surfaced a concrete, previously
untested defect plus two additive requirements:

1. **Order-dependence for 3+-way id collisions (a real bug, not hypothetical).**
   The pre-WS4 `unionById` / `unionOptionalById` compared each colliding record
   only against the *first-seen* record for a shared id (`seen.get(record.id)`),
   never against every other record sharing that id. For three or more bundles
   contributing two or more *distinct* contents under one id, both the kept
   content and the reported `collisions[]` set therefore depended on the order
   the bundles were supplied in. The existing `tests/merge.test.ts` collision
   cases are all pairwise (2 bundles), where there is only one possible "prior"
   record, so the gap was real and untested. This violates the determinism MUST
   the merge design states (`merge.md` §6): for a fixed *set* of inputs the merge
   output must be identical regardless of input order.

2. **No stable producer identity.** `TrustBundle.source` is run-scoped free text
   (`veritas:run-48213`), not a stable, comparable identifier for the producing
   *system*.

3. **No executed conformance.** Surface's merge was proven only by Surface's own
   hand-written tests, not against the shared `conformance/merge/*.json` vectors
   any independent implementation is held to. `merge.md` §12 notes the spec
   repo's own test suite validates vector *shape*, not code *execution* — Surface
   is the reference implementation positioned to close that gap.

## Decision

### 1. Order-independence fix + deterministic tie-break (`src/merge.ts`)

For each id, `unionById` / `unionOptionalById` now collect **every** record
sharing that id across all bundles and delegate to a single `resolveGroup`
helper that:

- partitions the records into **distinct contents** (structural equality via a
  canonical, key-sorted serialization), where identical content under one id is
  kept once and is never a collision (idempotent re-merge);
- when two or more distinct contents exist, chooses the kept record **from
  content alone** — the one whose canonical serialization sorts lexicographically
  first among the distinct contents (`merge.md` §6 tie-break), never from array
  position — and reports one `MergeCollision` per losing distinct content.

This makes the kept content and the `{collection, id}` collision set a pure
function of the *set* of inputs. The synthesized `source` string is likewise
sorted so the entire merged bundle — not just its record collections — is
order-independent (`merge:<a>+<b>` is unchanged for the existing 2-source case).
`MergeCollision`'s shape is unchanged; only its *population* logic changed. The
`keptFromBundle` / `droppedFromBundle` indices remain order-relative provenance
pointers by nature (which physical bundle contributed a content depends on where
it sat in the given input array) — the order-independent invariant is the
`{collection, id}` collision set, documented as such on the type.

**Tie-break canonicalization — documented interim.** The tie-break uses
sorted-key `JSON.stringify` (`canonicalSortedStringify` in `src/merge.ts`), not a
full RFC 8785 / JCS canonicalization. `merge.md` §6 asks for
convergence-under-permutation of *this specific function*, which sorted-key
stringify provides; adopting RFC 8785 as a bundle-wide primitive is tracked as a
**WS1 follow-up, explicitly out of this ADR's scope**. No RFC 8785 primitive
exists in Surface today; introducing one bundle-wide is a separate change.

### 2. Optional `TrustBundle.producerId` (`src/types.ts`, `src/validate.ts`)

`TrustBundle` gains an OPTIONAL `producerId` string — a stable identifier for the
producing *system*, distinct from run-scoped `source` (`merge.md` §2). It is
additive (a bundle without it is exactly as valid as before), validated by the
existing non-empty-string rule (empty string rejected, matching every other
optional string field), and carries **no cryptographic weight** (an L0,
producer-asserted fact; verifiable identity remains Assurance L1/L2 territory).

On merge a bundle represents more than one producer, so a merged bundle **MUST
omit `producerId`** (`merge.md` §5 rule 3) — unlike `source`, which is
synthesized. The omission is enforced by construction (the merged-bundle literal
never copies the field) and asserted by a dedicated regression test.

### 3. Executed conformance harness (`tests/merge-conformance.test.ts`)

A new harness loads `node_modules/hachure/conformance/merge/*.json` and
**executes** each vector against `mergeBundlesDetailed` + `buildTrustReport`,
asserting `mergedClaimIds`, the `{collection, id}` collision set, and
`statusByClaimId` on the merged bundle. It mirrors the established
`tests/spec-conformance.test.ts` pattern for the existing `sf-*` status vectors.

### 4. Interim dependency decision — and why this delivery ships NO dependency bump

Executing the vectors requires a `hachure` devDependency that ships
`conformance/merge/`. At delivery time hachure 0.7.0 (the version carrying
`merge.md`, the `producerId` schema, and `conformance/merge/*.json`) is **not yet
published** — `npm view hachure version` reports 0.6.0, and the concurrent
upstream delivery is mid-gate.

- A **`file:`-protocol** devDependency (`file:../../hachure-org/spec`) was
  considered and **rejected**: Surface and hachure-org/spec are separate git
  repositories with no npm workspace tie, so a `file:` path resolves only on one
  machine and silently breaks CI and every other clone.
- A **git-SHA-pinned** interim (`git+https://.../spec.git#<sha>`) is npm-installable
  and reproducible in principle, but is **not used here** because the upstream
  branch is mid-gate and has not landed the real `merge.md` + schema + vectors as
  committed artifacts to pin against. Fabricating a locally-authored stand-in
  vector would prove nothing about real hachure conformance and would diverge the
  moment the real vectors land.

**Decision: this delivery ships no dependency change.** The conformance harness
**auto-skips with an explicit TODO marker** when `conformance/merge/` is absent
from the installed hachure, and the deferral is recorded in the session
handoff. When hachure 0.7.0 is published, the mandatory follow-up is: bump the
devDependency to a published `^0.7.0` semver range, `npm install`, `npm run
sync:schemas` (so `schemas/trust-bundle.schema.json` gains `producerId` and
`tests/schema-parity.test.ts` stays green), and re-run the full suite — at which
point the harness executes the real vectors instead of skipping. **This delivery
must never merge a git-pinned or `file:` hachure devDependency.**

## Consequences

- Merging bundles from 3+ producers now yields a merged `TrustBundle` /
  `MergeResult` whose kept content and collision set are identical for every
  ordering of the same input set, proven by a permutation sweep
  (`tests/merge-order-independence.test.ts`, N=3 and N=4) plus the `merge.md` §11
  worked-example hand-derivation.
- The change is API-additive: `producerId` is optional, `src/index.ts` exports
  are unchanged, and `MergeCollision` / `MergeResult` shapes are unchanged.
- Conformance against the shared vectors is deferred, not dropped — it is an
  explicit, recorded accepted gap that becomes green automatically once the
  hachure 0.7.0 devDependency lands and the skip path is removed.
- The tie-break's sorted-key-stringify interim is a known, documented substitute
  for RFC 8785 (a WS1 follow-up); it is sufficient for the convergence property
  `merge.md` §6 requires but is not a general-purpose canonicalization.

## Relationship to ADR 0002

This ADR does not modify ADR 0002. It records the merge *conformance* decision;
ADR 0002's "Merge semantics" section remains the record of the bundle-merge
concept itself. ADR 0002's prose claiming that a policy `incompatibleStatuses`
match derives a `disputed` **status** is a known inaccuracy (the code produces a
`contradiction` transparency gap, never a status change by itself — see
`merge.md` §7c); that correction is being made in ADR 0002 directly, not here.
