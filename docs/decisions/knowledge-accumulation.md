---
status: current
subject: Knowledge Accumulation
decided: 2026-11-02
evidence:
  - kind: issue
    ref: "204"
  - kind: url
    ref: https://github.com/hachure-org/spec/issues/34
  - kind: doc
    ref: tests/fixtures/knowledge-accumulation/vectors.json
  - kind: doc
    ref: docs/adr/0002-trust-bundle.md
  - kind: doc
    ref: docs/adr/0005-merge-conformance.md
---
# Knowledge Accumulation

Surface implements a provisional local projection of this decision. The portable
contract remains follow-up work. The existing
[Trust Bundle record](trust-bundle.md) remains a needs-decision record; the
frozen ADRs are historical context, not amended here.

## Unit and boundaries

A **claim** is an immutable, identified assertion, including its value and
provenance. A revision gets a new ID; carrying the same ID means carrying the
same content. A subject is a `(subjectType, subjectId)` reference. A property
slot is an equivalence class of subjects plus `claimType` and
`fieldOrBehavior` and canonical qualifiers; facet is not a cross-producer identity key.
Surface `canonicalClaimKey` includes qualifiers but omits claimType; accumulation
adds claimType deliberately without changing inquiry matching. Queries supply it. A slot's value
semantics and cardinality must be declared by its domain; these vectors use a
single-valued property and structural JSON value equality. Unknown cardinality
or comparison semantics cannot yield a unique answer. Do not discard aliases,
values, or derivation edges when persisting or rebuilding.

Aliases assert co-reference. Only `equivalent` IdentityLinks (including the
omitted default) can join subjects; `subsumes` is a directional superset and
`converts` describes a transformation, neither is equivalence. Preserve each
link, its subjects, relation, mapping claim, evidence, and review/authority
trace. For accumulation, a mapping claim must be verified and admissible at
the knowledge cut to join through that link; absent, disputed, rejected, or
unassessable mappings cannot silently join. An unbacked alias or equivalent
link is an assertion, not proof of reviewed identity: expose its provenance
and uncertainty; it does not join accumulation classes. `buildIdentityIndex` joins equivalent links regardless of mapping status. The
projection passes it admitted links and retains excluded links and aliases in its
trace. A split is a later
reviewed rejection or replacement of a mapping; rebuild the classes from the
remaining active links, not from a destructive union-find history. Survey owns
reviewed merge and split decisions ([Survey #243](https://github.com/kontourai/survey/issues/243)).

Claim Dependencies express prerequisites and their status effect; `derivedFrom`
and `derivationEdges` express lineage and impose the existing derivation ceiling.
Neither means that a claim replaces another. Preserve the input IDs, methods,
evidence and authority traces; missing lineage inputs produce an explicit gap
and cannot strengthen the result or count as independent support. An incomplete
claim does not suppress independently eligible support for the same value, and a
conflicting value remains visible as a contradiction. If every candidate has
missing lineage, the slot cannot select a current answer. Use Surface's existing merge, identity,
status fold, conflict/dispute derivation and recompute machinery, extended as
needed; do not create a second independent trust derivation. Retention State
is evidence availability, not a claim revision or permission to erase history.

## Time and immutable inputs

A projection takes an immutable collection of bundle observations, each with a
stable observation identity, content/integrity reference, and receiver-recorded
knowledge instant. The vector `observedAtByBundle` is an illustrative external
observation envelope, not a Hachure bundle field. These times are inputs, not
inferred from claim `createdAt`, `updatedAt`, event times, or evidence
`observedAt`; a producer can report old information late. The same bundle may
be delivered twice; deduplicate identical content and observations without
moving the first recorded knowledge instant. Conflicting content under the same
ID is invalid, not last-write-wins. No mutable clock, network lookup, input
iteration order, or random ID may influence the result. The explicit `now` is
the default for both query instants and is also passed to existing status rules.

For `knownAt=K`, include only observations recorded at or before K. A carried
old claim is first known when a containing bundle is observed; it is not
retroactively known at its authored timestamp. Events, evidence, links, policy,
and their provenance are filtered by observation, then folded using their own
specified event ordering. Historical queries must not use later evidence,
identity decisions, or corrections. Missing or untrustworthy observation times
make an as-of answer indeterminate, never guessed. Same-instant ties use stable
IDs and the normative merge/status tie rules; irreconcilable collisions fail
closed. Supplied observation times must themselves be protected by the host's
custody mechanism; the producer's timestamp is not proof of receipt.

For `validAt=V`, ask what the assertion says held in the world at V, according
to knowledge available at K. Proposed `validTime: {from?, until?}` is a half-open
interval `[from, until)`; absent bounds are unbounded, and absent `validTime`
means no asserted bound, not evidence of perpetual truth. Invalid timestamps or
`from >= until` fail closed. A succession's successor `from` is its effective
boundary: while that edge is active, it ends the predecessor's interval at that
instant without rewriting the predecessor. A correction instead says the old
assertion was wrong for the corrected interval, not that the world changed.
The two axes allow a later observation to change an answer about a past V while
leaving the earlier K answer reproducible. Intervals and observation envelopes
are proposed pending Hachure, not fields accepted by today's validator. This
half-open interval differs from the existing authority trace's inclusive
`validUntil`. `expiresAt` and TTL govern freshness, not world validity.

## Revision, authority, and projection

Proposed `supersedes: [{claimId, kind: "correction" | "succession", reason}]`
on a new claim is a directed, provenance-bearing replacement proposal. Every
edge targets a verbatim carried claim in its bundle, and both endpoints must
refer to the same slot. Evidence and policy establish authority; an unsigned
`producerId` alone is not authentication. A producer may revise its own claim
only when custody establishes that identity. A third party needs an explicit
applicable authority decision; a verified successor alone is not authority to
replace another producer's claim. Without established authority the edge is
pending, both viable values remain visible, and a gap explains why. The vector
examples assume the fixture producer identities are established for self
revisions; production must supply that custody input.

At fixed `(K,V,now)` the pure projection validates inputs and identity. Before
merge it records each claim and event's observation and authenticated publisher,
and an independently established claim-owner binding; a copied claim does not
transfer ownership. It retains this sidecar through deduplication and merge,
which deliberately omits producerId. Neither ID prefixes nor the unsigned
producerId alone establish ownership. The versioned admission policy must bind
each actor to the relevant action and scope: an ordinary verification needs an
authorized verifier for the claim, and a producer's own terminal event needs
authenticated ownership and permission to perform that action. A third-party
decision needs applicable authority. The vectors assume established producer
ownership and delegated `producer-review` permission for each producer's own
claims, and the stated reviewed mapping permission for the identity desk; these
are fixture inputs, not evidence that the wire format authenticates them. Each
case supplies `fixtureAuthority` ownership and admitted-event IDs as synthetic
test inputs; a host must derive these from its own protected custody and policy.
An admitted-event list is an input assumption here, not an implementation of
the authority decision.
The projection then admits only events whose provenance and authority permit the
asserted action, merges and deduplicates without dropping the sidecar, folds the
admitted events and derivation ceiling, evaluates
admissible replacement edges, then groups eligible values by slot. A valid
accepted correction excludes its predecessor in the corrected interval and
reports it as superseded in this projection; a succession applies at its valid
boundary and retains both historical statuses. Retracting a successor (a
revoked terminal event in these vectors) withdraws its outgoing replacement
edge; recomputation may restore an independently eligible predecessor. Removing
an entire observation recomputes from the remaining inputs and cannot retain an
orphaned edge. Retraction is not physical erasure. The existing fold maps revoked
to `stale`, which also describes expiry. The projection must retain the admitted
governing event and distinguish retraction from expiry; vector `retracted` is an
exclusion reason, not a TrustStatus. For these vectors an admitted `revoked`
event is a retraction whether or not it has `type: invalidation`; an
invalidation carrying `stale` is not by itself a retraction. Ordinary stale claims remain visible but
cannot establish verified standing. A terminal rejection or admitted retraction
excludes that assertion; a disputed claim stays visible as disputed,
not a verified answer. Existing authority-gated event resolution is applied by
the status fold, never replaced by a timestamp ranking. The existing fold does
not authenticate ordinary terminal events: a later rival rejection can change
status without authority. The new admission step must hold such events pending
before folding, preserving them and a gap; missing custody or authority fails
closed. The admission boundary is a Surface-local extension, not a property of
the underlying fold.

Verified, proposed, assumed, stale, disputed and unknown assertions remain
visible candidates when their valid interval and admitted lineage permit them;
rejected and retracted assertions are excluded. A proposed conflicting value
can prevent a unique answer without overruling stronger evidence. Equal values
collect individually labeled support; the answer status is the strongest
independently eligible supporting status, never a promotion of weaker claims.
Derived copies retain their input trace and cannot count as independent
corroboration of their own inputs.
Incomparable or policy-undefined standings produce ambiguity. Cardinality and
value equality must be explicit versioned inputs; vectors assume a declared
single-valued JSON property.

Distinct simultaneous eligible values are a contradiction with all candidates,
support and provenance visible. Equal values may aggregate support, but cannot
upgrade a weak claim's status. Recency, confidence, producer order, or a newer
unreviewed claim never resolves a conflict. A dispute is an explicit adverse
claim status or reviewed challenge; value contradiction itself is a transparency
gap, not automatically a `disputed` status. Resolution requires an applicable
authority-backed event, and keeps the losing evidence and the decision trace.
No eligible value yields `none`, with a reason. A public traversal result must
include supporting and excluded claim IDs, statuses, evidence/authority and
identity/derivation references, active, pending, inert and withdrawn replacement
edges, and gaps explaining each decision. Stable canonical ordering makes a
rebuild over the same observations and parameters identical, including traces.

Cycles, self-edges, conflicting duplicate IDs, malformed intervals, missing
references or unresolved authority cannot select a winner. A cycle invalidates
the affected slot and its edges are inert; a cross-slot edge is inert with a
gap on both slots, without suppressing otherwise valid claims. Missing mapping
or evidence and conflicting identity decisions remain visible as ambiguity.
Unknown status or unsupported policy cannot be promoted into verified. A
projection cannot advertise completeness when its custody or inputs are missing.
Projection-local `superseded` is a replacement disposition, not a mutation of
the source fold status. Recompute and traversal must expose both; existing
status-change records do not capture this projected disposition.

## Extension points and ownership

* **Visibility context (#350):** before exposing a projection, accept a
  context-specific visibility decision and trace over each input and edge;
  filtering and supersession must occur within that context, with omission
  failing closed and no disclosure of hidden successors. The merged #350 API
  derives claim visibility; `accumulationViewerSupersessionInput` supplies only
  effective admitted edges to its viewer evaluator and seals omitted edge
  decisions. This handoff is host-only and names hidden claims. Hosts must filter
  the entire traversal and recompute in viewer context before disclosure; a raw
  global projection is not safe to expose directly to an arbitrary viewer.
* **Retention and erasure (#351):** accept retention/tombstone and dependency
  recomputation results as inputs to the same fold. An unavailable input cannot
  silently support a derived answer; retain permitted audit references and
  expose affected dependencies. Tombstone shape, surviving independent support,
  purge and blast-radius semantics belong to #351. Immutable logical history
  does not require retaining erased content.

Hachure 0.18 defines Claim, IdentityLink, status events and lineage, but not
the proposed typed replacement edges, valid interval, or receiver observation
contract. [Hachure #34](https://github.com/hachure-org/spec/issues/34) requests
the normative schema, provenance, temporal and conformance changes. Until
then these shapes are design vectors, not valid portable bundle fields. Surface
must not publish them as a Hachure extension by assumption. Retrieval indexes,
entity-match inference, review workflow, and access-control enforcement are
out of scope. Consumers own their derived indexes and hosts enforce access.

## Executable status

`projectAccumulation` evaluates receiver observations with explicit knowledge and
valid-time cuts and a declared single-valued JSON policy. `appendAccumulationObservation`
assembles inputs for replay. The admission adapter requires the host to authenticate
publishers and protect the policy digest, owner bindings, observation time, and
per-event admission decisions, and identity-link decisions that bind the exact
link, mapping claim and authenticated publisher. Hosts must verify that the
mapping actually supports those subjects before admitting the link. For every
`knownAt` query, the host must supply and protect the authority snapshot in force
at that knowledge cut, including owner bindings, event and identity decisions,
and replacement grants. A later snapshot is not evidence of earlier authority;
Surface cannot reconstruct prior policy decisions from an untimed snapshot. The digest
detects changes relative to a trusted
reference; it is not a signature or independent authorization. Callers must not
construct those decisions from unsigned bundle fields. Unadmitted events are kept
in the trace but excluded from the fold. The resulting global projection must not
be exposed directly to an arbitrary viewer; per-viewer disclosure enforcement and
[erasure](https://github.com/kontourai/surface/issues/351) remain separate
responsibilities.

Survey's reviewed entity projection ([Survey #358](https://github.com/kontourai/survey/pull/358))
produces candidate links, mapping claims, evidence and events. The Surface-local
`surveyIdentityAdmission` adapter binds an exact accepted record to separate host
verification and identity decisions; a reviewed split can withdraw the prior link
through `surveySplitIdentityAdmission`. The host authenticates custody, validates
the Survey outcome and provides the applicable verification policy and authority
snapshot. The adapter does not authenticate a digest, evaluate Survey ancestry,
or make an unsigned review authoritative. The fixture is generated from the merged
Survey source at `da1e74c60f96cd8f77dceaacc8ca1a3bbfb84d47`.

The [vectors](../../tests/fixtures/knowledge-accumulation/vectors.json) execute
against the projection, and the local shapes do not claim Hachure portability.
[Hachure #34](https://github.com/hachure-org/spec/issues/34) remains the upstream
contract dependency. Source status and projected replacement disposition are
separate; traces include the contributing observations and publishers, and name
claims whose lineage is missing. Status comes from independent eligible support;
an unowned claim cannot strengthen it. Subject types are normalized for identity
matching while the trace retains the original spelling. Missing custody or lineage
cannot establish verified standing.
