---
status: current
subject: Derived Visibility
decided: 2026-11-03
evidence:
  - kind: issue
    ref: "350"
  - kind: doc
    ref: src/visibility.ts
  - kind: doc
    ref: src/derivation.ts
  - kind: doc
    ref: tests/derived-visibility.test.ts
  - kind: doc
    ref: docs/specs/disclosure-requirements.md
---
# Derived Visibility

A derived claim has a computed answer to "who may see this?". Surface derives
it the way it already bounds status: a derived claim is never stronger than its
weakest input, and never more visible than its most restricted one. This extends
the existing Evidence Visibility concept to claims and to `derivedFrom` /
`derivationEdges`; it adds no second model of derivation.

Surface **represents** the result. Stores and hosts **enforce** it. Nothing in
this record makes Surface an access-control system.

## The lattice

A visibility is one of:

- `public`: any viewer.
- `restricted` with a set of **audiences**: opaque strings the owning store
  resolves (a role, group, or principal id). Surface never interprets them. A
  viewer may see it when at least one audience the viewer holds is named.

`restricted` with no audiences is **sealed**: no viewer. `public` is the widest
element, sealed the narrowest. The existing vocabulary maps in without a second
scale: `public` is `public`; `private`, `permissioned`, `redacted` and
`unavailable` name a restriction but no audience, so they read as sealed. A host
that wants an audience writes `{ "audiences": [...] }`.

The declared value is read from `metadata.visibility` or
`metadata.disclosure.visibility`, the two places Evidence Visibility already
documents. If both are written the narrower applies. No schema field is added.

### Intersection rule

A derived claim's effective visibility is the **meet** of its own declared
visibility and that of every claim it is transitively derived from. The meet is
the intersection of audience sets, with `public` as the identity. It is never
wider than any input. Intersecting audience labels is deliberately conservative
(a viewer reaching an input through a different label than another input is not
admitted); it can fail to admit someone, never admit someone it should not.

Only own properties of `metadata` are read; one inherited through a prototype is
not something the claim wrote. The claim being derived may narrow what its
inputs allow. It need not declare: a derived claim that declares nothing is
bounded by its inputs (a claim that lists only itself has no inputs). A claim with no
inputs has nothing to be bounded by, so it must declare.

### Fail-closed rule

Anything Surface cannot read as a declared visibility is **sealed**, never
public. Omission cannot grant access. This covers an input that declares nothing,
one that declares a value outside the forms above, a `derivedFrom` id with
no claim in the bundle, and a claim id that more than one claim carries. So removing the visibility field from any input can only
leave the derived visibility equal or narrower, and in fact seals it. A claim
with no inputs and no declaration is sealed.

### Trace

`deriveClaimVisibility` returns the visibility with a trace, one entry per
contributing claim (the claim itself first, then transitive inputs by id): its
`basis` (`declared`, `undeclared`, `unrecognized`, `missing-claim`, `duplicate-claim`), what it
contributed, and `restricts` when that is narrower than public. The restricting
inputs are the entries with `restricts: true`. `applyDerivation` returns it on
its outcome and `deriveTrustSnapshot` returns it as `visibilityByClaimId`. The
closed report schema is unchanged.

## Supersession is per visibility context

A later value supersedes an earlier one **only for viewers who may see the later
value**. `viewerSupersessionView` takes the effective visibility per claim, the
replacement edges, and a viewer, and returns that viewer's view:

- A claim with no visibility entry is hidden from everyone.
- The view names only claims the viewer may see. A viewer who cannot see the
  successor sees the predecessor as current, with no edge, id or count that
  reveals a newer value exists.
- A chain through a hidden claim collapses to the nearest visible one.
- A visible replacement cycle has no current value and is reported as
  unresolved, never resolved by guesswork.
- A visible replacement cycle, a claim that replaces itself included, has no
  current value and is reported as unresolved, never resolved by guesswork.
- The viewer view is identical whether or not a hidden successor exists, so it
  can be served to the viewer as is.
- `supersessionStatusRecomputeClaimIds` is a **separate, host-only** function. A
  visible predecessor whose successor is hidden may carry a stored `superseded`
  status, or a stale `supersededBy`, that encodes the hidden successor. The host
  must recompute that claim's status without the hidden edge, or withhold it,
  before serving the viewer. Its result differs between "a hidden successor
  exists" and "none does", so it is never part of the viewer view.

The edges are an input. Which edges are admissible (authority, same slot, valid
interval) belongs to the accumulation design
(#204, on `design/204-accumulation` at the time of writing, not yet on main), whose
visibility extension point this implements: a context-specific visibility decision over each
input and edge, filtering and supersession inside that context, omission
failing closed, no disclosure of hidden successors.

## What this does not do

- It does not enforce access, resolve audiences, authenticate viewers, or filter
  a store. A raw global projection is not safe to hand to an arbitrary viewer;
  the store applies this per viewer.
- It does not derive visibility from evidence. Evidence visibility describes
  disclosure of the evidence item, and a public claim may rest on private
  evidence. A producer that wants evidence to bound a claim declares that on the
  claim.
- It does not change status, freshness or any existing report field.
- Erasure and cascade (#351) is separate: an erased input is an unavailable
  input, not a visibility value.
