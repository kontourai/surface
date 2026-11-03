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
  if (visibility === undefined) return false;
  if (visibility.kind === "public") return true;
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
  const metadata = source?.metadata;
  if (!isRecord(metadata)) return { state: "undeclared" };
  const written: unknown[] = [];
  if (metadata.visibility !== undefined) written.push(metadata.visibility);
  const disclosure = metadata.disclosure;
  if (disclosure !== undefined) {
    // A `disclosure` that is not an object cannot hold a visibility we can read.
    if (!isRecord(disclosure)) return { state: "unrecognized" };
    if (disclosure.visibility !== undefined) written.push(disclosure.visibility);
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
  if (isRecord(raw) && Array.isArray(raw.audiences)) {
    if (!raw.audiences.every((audience) => typeof audience === "string" && audience.length > 0)) return undefined;
    return { kind: "restricted", audiences: [...new Set(raw.audiences as string[])].sort(compareStrings) };
  }
  return undefined;
}

/** A directed replacement: `successorId` replaces `predecessorId`. */
export interface SupersessionEdge {
  predecessorId: string;
  successorId: string;
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
 * claim this viewer may see: the view never names a claim or an edge the viewer
 * cannot see, so it cannot leak that a newer value exists.
 */
export interface ViewerSupersessionView {
  /** Claims the viewer may see, sorted. */
  visibleClaimIds: string[];
  /** Visible claims no other visible claim replaces: the current value(s) for this viewer. */
  currentClaimIds: string[];
  /** Visible replacements per visible predecessor, sorted. Chains through hidden claims collapse to the nearest visible one. */
  supersededBy: Record<string, string[]>;
  /**
   * Visible claims that some hidden claim replaces. A stored `superseded`
   * status on one of these may encode that hidden successor, so the host must
   * recompute or withhold the status for this viewer. Showing it would leak.
   */
  recomputeStatusClaimIds: string[];
  /** Visible claims that sit in a visible replacement cycle and so reach no current value. */
  unresolvedClaimIds: string[];
}

/**
 * Evaluate supersession for one viewer. An edge only applies for viewers who may
 * see its successor; a viewer who cannot sees the predecessor as current, with
 * no trace of the hidden successor. Chains through hidden claims collapse, so a
 * viewer who sees a claim and its far successor still sees the successor win.
 */
export function viewerSupersessionView(input: ViewerSupersessionInput): ViewerSupersessionView {
  const visible = new Set<string>();
  for (const [claimId, visibility] of input.visibilityByClaimId) {
    if (visibilityAllows(visibility, input.viewer)) visible.add(claimId);
  }

  const successorsOf = new Map<string, string[]>();
  for (const edge of input.edges) {
    const list = successorsOf.get(edge.predecessorId) ?? [];
    list.push(edge.successorId);
    successorsOf.set(edge.predecessorId, list);
  }

  const supersededBy: Record<string, string[]> = Object.create(null);
  const recompute = new Set<string>();
  for (const claimId of visible) {
    const found = new Set<string>();
    const seen = new Set<string>([claimId]);
    const pending = [...(successorsOf.get(claimId) ?? [])];
    while (pending.length > 0) {
      const next = pending.pop() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      if (visible.has(next)) {
        found.add(next);
      } else {
        // A hidden hop: do not surface it, and look through it.
        recompute.add(claimId);
        pending.push(...(successorsOf.get(next) ?? []));
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
    visibleClaimIds,
    currentClaimIds,
    supersededBy,
    recomputeStatusClaimIds: [...recompute].sort(compareStrings),
    unresolvedClaimIds: visibleClaimIds.filter((claimId) => !resolved.has(claimId)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
