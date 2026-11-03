/**
 * Evidence Visibility, extended to derived claims (#350).
 *
 * Surface represents visibility; stores and hosts enforce it. This module is the
 * representation: a two-sided lattice, how a claim's declared visibility is read
 * from `metadata`, and the per-viewer view of a supersession chain. The
 * derivation that applies it to `derivedFrom` / `derivationEdges` lives in
 * `deriveClaimVisibility` (`derivation.ts`), beside the status ceiling.
 *
 * The lattice:
 *   - `public` is the widest element: any viewer.
 *   - `restricted` names the audiences that may see it. An audience is an opaque
 *     string the owning store resolves (Surface never interprets it). A viewer
 *     may see a `restricted` element when at least one of the viewer's audiences
 *     is named. `restricted` with no audiences is the narrowest element
 *     ("sealed"): no viewer may see it.
 *   - The meet (what a derived claim is bounded by) is intersection of the named
 *     audiences, with `public` as the identity. Intersecting audience *labels*
 *     is conservative for a viewer who holds several labels, and it can never
 *     widen: that is the direction that is safe to be wrong in.
 *   - Anything Surface cannot read as a declared visibility is sealed, never
 *     public. Omission must not grant access.
 */

export type Visibility =
  | { kind: "public" }
  | { kind: "restricted"; audiences: string[] };

/** The viewer a visibility decision is evaluated for. No audiences means public-only. */
export interface ViewerContext {
  audiences: readonly string[];
}

export const PUBLIC_VISIBILITY: Visibility = Object.freeze({ kind: "public" }) as Visibility;

/** Narrowest element: no audience, so no viewer. The fail-closed value. */
export function sealedVisibility(): Visibility {
  return { kind: "restricted", audiences: [] };
}

/**
 * Greatest lower bound of the given visibilities: the widest visibility no wider
 * than every argument. The empty meet is `public` (the identity).
 */
export function meetVisibility(...visibilities: readonly Visibility[]): Visibility {
  let audiences: Set<string> | undefined;
  for (const visibility of visibilities) {
    if (visibility.kind === "public") continue;
    const next = new Set(visibility.audiences);
    if (audiences === undefined) {
      audiences = next;
    } else {
      for (const audience of audiences) if (!next.has(audience)) audiences.delete(audience);
    }
  }
  return audiences === undefined ? { kind: "public" } : { kind: "restricted", audiences: [...audiences].sort(compareStrings) };
}

/** Whether `viewer` may see something carrying `visibility`. A missing visibility is not visible. */
export function visibilityAllows(visibility: Visibility | undefined, viewer: ViewerContext | undefined): boolean {
  if (visibility === undefined || visibility === null) return false;
  if (visibility.kind === "public") return true;
  // Anything that is not a well-formed restricted value is not visible.
  if (visibility.kind !== "restricted" || !Array.isArray(visibility.audiences)) return false;
  const held = viewer?.audiences;
  if (!Array.isArray(held) || held.length === 0) return false;
  return visibility.audiences.some((audience) => held.includes(audience));
}

export type VisibilityDeclaration =
  | { state: "declared"; visibility: Visibility }
  /** No visibility was written. */
  | { state: "undeclared" }
  /** Something was written that Surface cannot read as a visibility. */
  | { state: "unrecognized" };

/** Restriction labels already in the Evidence Visibility vocabulary. None names an audience. */
const LEGACY_RESTRICTED_LABELS: ReadonlySet<string> = new Set(["private", "permissioned", "redacted", "unavailable"]);

/**
 * Read a declared visibility from `metadata.visibility`, or
 * `metadata.disclosure.visibility` (the two places the Evidence Visibility
 * concept already documents). Accepted forms:
 *   - `"public"`
 *   - `"private" | "permissioned" | "redacted" | "unavailable"`: restricted, no
 *     audience named, so sealed from Surface's point of view
 *   - `{ audiences: string[] }`: restricted to the named audiences
 * If both locations are written their meet applies. Any written value that is
 * not one of the forms above is `unrecognized`.
 */
export function readDeclaredVisibility(source: { metadata?: Record<string, unknown> } | undefined): VisibilityDeclaration {
  // Own property: a `metadata` inherited through a prototype is not the claim's.
  const metadata = isRecord(source) ? ownValue(source, "metadata") : undefined;
  if (!isRecord(metadata)) return { state: "undeclared" };
  const written: unknown[] = [];
  // Own properties only: a value inherited through a prototype is not something
  // the claim wrote, and deleting the own one must not fall back to it.
  if (ownValue(metadata, "visibility") !== undefined) written.push(ownValue(metadata, "visibility"));
  const disclosure = ownValue(metadata, "disclosure");
  if (disclosure !== undefined) {
    // A `disclosure` that is not an object cannot hold a visibility we can read.
    if (!isRecord(disclosure)) return { state: "unrecognized" };
    if (ownValue(disclosure, "visibility") !== undefined) written.push(ownValue(disclosure, "visibility"));
  }
  if (written.length === 0) return { state: "undeclared" };
  const parsed: Visibility[] = [];
  for (const raw of written) {
    const visibility = parseVisibility(raw);
    if (visibility === undefined) return { state: "unrecognized" };
    parsed.push(visibility);
  }
  return { state: "declared", visibility: meetVisibility(...parsed) };
}

function parseVisibility(raw: unknown): Visibility | undefined {
  if (raw === "public") return { kind: "public" };
  if (typeof raw === "string" && LEGACY_RESTRICTED_LABELS.has(raw)) return sealedVisibility();
  if (isRecord(raw)) {
    const audiences = ownValue(raw, "audiences");
    if (!Array.isArray(audiences)) return undefined;
    if (!audiences.every((audience) => typeof audience === "string" && audience.length > 0)) return undefined;
    return { kind: "restricted", audiences: [...new Set(audiences as string[])].sort(compareStrings) };
  }
  return undefined;
}

/**
 * A directed replacement: `successorId` replaces `predecessorId`. In the
 * accumulation record's terms, a claim carrying `supersedes: [{claimId}]` is the
 * successor and `claimId` is the predecessor.
 */
export interface SupersessionEdge {
  predecessorId: string;
  successorId: string;
  /**
   * Visibility of the edge itself, for an edge whose reason or provenance is
   * more restricted than its endpoints. It can only narrow: an edge a viewer may
   * not see is never followed for that viewer, whatever its endpoints allow.
   * Absent means the edge adds no restriction of its own.
   */
  visibility?: Visibility;
}

export interface ViewerSupersessionInput {
  /**
   * Effective visibility per claim id (for example from
   * `deriveClaimVisibility`). A claim with no entry is not visible to anyone.
   */
  visibilityByClaimId: ReadonlyMap<string, Visibility>;
  /** Replacement edges already admitted by whatever owns supersession authority. */
  edges: readonly SupersessionEdge[];
  viewer: ViewerContext;
}

/**
 * One viewer's view of a set of supersession chains. Every id it contains is a
 * claim this viewer may see, and its content is identical whether or not a
 * hidden successor exists, so it can be served to the viewer as is. It carries
 * nothing about claims the viewer cannot see.
 */
export interface ViewerSupersessionView {
  /** Claims the viewer may see, sorted. */
  visibleClaimIds: string[];
  /** Visible claims no other visible claim replaces: the current value(s) for this viewer. */
  currentClaimIds: string[];
  /** Visible replacements per visible predecessor, sorted. Chains through hidden claims collapse to the nearest visible one. */
  supersededBy: Record<string, string[]>;
  /** Visible claims that sit in a visible replacement cycle (a self-replacement included) and so reach no current value. */
  unresolvedClaimIds: string[];
}

interface SupersessionEvaluation {
  view: ViewerSupersessionView;
  recomputeStatusClaimIds: string[];
}

function evaluateSupersession(input: ViewerSupersessionInput): SupersessionEvaluation {
  const visible = new Set<string>();
  for (const [claimId, visibility] of input.visibilityByClaimId) {
    if (visibilityAllows(visibility, input.viewer)) visible.add(claimId);
  }

  const successorsOf = new Map<string, string[]>();
  const recompute = new Set<string>();
  for (const edge of input.edges) {
    if (edge.visibility !== undefined && !visibilityAllows(edge.visibility, input.viewer)) {
      // A restricted edge is not followed, but a visible predecessor's stored
      // status may still encode it.
      if (visible.has(edge.predecessorId)) recompute.add(edge.predecessorId);
      continue;
    }
    const list = successorsOf.get(edge.predecessorId) ?? [];
    list.push(edge.successorId);
    successorsOf.set(edge.predecessorId, list);
  }

  const supersededBy: Record<string, string[]> = Object.create(null);
  for (const claimId of visible) {
    const found = new Set<string>();
    const expanded = new Set<string>();
    const pending = (successorsOf.get(claimId) ?? []).map((id) => ({ id, throughHidden: false }));
    while (pending.length > 0) {
      const { id: next, throughHidden } = pending.pop() as { id: string; throughHidden: boolean };
      if (visible.has(next)) {
        // A direct edge back to the claim itself is a visible replacement cycle
        // and is kept. A path that only returns to it through hidden claims adds
        // no visible value, so it is dropped: it would otherwise reveal them.
        if (next === claimId && throughHidden) continue;
        found.add(next);
      } else {
        // A hidden hop: do not surface it, and look through it.
        recompute.add(claimId);
        if (expanded.has(next)) continue;
        expanded.add(next);
        for (const after of successorsOf.get(next) ?? []) pending.push({ id: after, throughHidden: true });
      }
    }
    if (found.size > 0) supersededBy[claimId] = [...found].sort(compareStrings);
  }

  const visibleClaimIds = [...visible].sort(compareStrings);
  const currentClaimIds = visibleClaimIds.filter((claimId) => supersededBy[claimId] === undefined);

  // A visible claim that cannot reach a current value is part of a cycle.
  const resolved = new Set<string>(currentClaimIds);
  for (let changed = true; changed;) {
    changed = false;
    for (const claimId of visibleClaimIds) {
      if (resolved.has(claimId)) continue;
      if (supersededBy[claimId]?.some((successor) => resolved.has(successor))) {
        resolved.add(claimId);
        changed = true;
      }
    }
  }

  return {
    view: {
      visibleClaimIds,
      currentClaimIds,
      supersededBy,
      unresolvedClaimIds: visibleClaimIds.filter((claimId) => !resolved.has(claimId)),
    },
    recomputeStatusClaimIds: [...recompute].sort(compareStrings),
  };
}

/**
 * Evaluate supersession for one viewer. An edge only applies for viewers who may
 * see its successor; a viewer who cannot sees the predecessor as current, with
 * no trace of the hidden successor. Chains through hidden claims collapse, so a
 * viewer who sees a claim and its far successor still sees the successor win.
 */
export function viewerSupersessionView(input: ViewerSupersessionInput): ViewerSupersessionView {
  return evaluateSupersession(input).view;
}

/**
 * HOST-ONLY. Visible claims some hidden claim replaces. A stored `superseded`
 * status (or a stored successor pointer) on one of these may encode that hidden
 * successor, so the host must recompute the status without the hidden edge, or
 * withhold it, before serving the viewer. This list differs between "a hidden
 * successor exists" and "none does", so it must never be sent to the viewer.
 */
export function supersessionStatusRecomputeClaimIds(input: ViewerSupersessionInput): string[] {
  return evaluateSupersession(input).recomputeStatusClaimIds;
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
