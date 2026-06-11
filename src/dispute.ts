/**
 * ADR 0003 §8 — authority-weighted dispute resolution.
 *
 * A dispute-resolution decision is a VerificationEvent with
 * `resolvesDispute: true`.  `deriveClaimStatus` folds these events with
 * authority-gating: only a decision from an actor whose AuthorityTrace is
 * active and covers the subject flips the claim status.
 */
import type { TrustStatus, VerificationEvent } from "./types.js";

export interface DisputeResolutionEventArgs {
  /** The claim being resolved. */
  claimId: string;
  /** The status the reviewer has decided (e.g. "verified", "rejected", "assumed"). */
  decidedStatus: TrustStatus;
  /** Actor ref — must match an active AuthorityTrace.actorRef covering the claim. */
  actor: string;
  /**
   * The AuthorityTrace.authorityRef this decision invokes.
   * When supplied, `deriveClaimStatus` additionally checks that the matching
   * AuthorityTrace carries this authorityRef.
   */
  authorityRef?: string;
  /** Human-readable rationale for the decision. */
  rationale?: string;
  /** IDs of the evidence records considered in the decision. */
  evidenceIds?: string[];
  /** ISO 8601 timestamp of when the decision was made. */
  decidedAt: string;
}

/**
 * Build a dispute-resolution VerificationEvent.
 *
 * The returned event has `resolvesDispute: true` and `method: "dispute-resolution"`.
 * To take effect, the actor's AuthorityTrace must be present and active in the
 * TrustBundle passed to `buildTrustReport` or `deriveClaimStatus`.
 *
 * Mirrors `buildHumanAttestationEvidence` in construction style.
 */
export function buildDisputeResolutionEvent(args: DisputeResolutionEventArgs): VerificationEvent {
  const event: VerificationEvent = {
    id: `event.dispute-resolution.${args.claimId}.${args.decidedAt}`,
    claimId: args.claimId,
    status: args.decidedStatus,
    actor: args.actor,
    method: "dispute-resolution",
    evidenceIds: args.evidenceIds ?? [],
    createdAt: args.decidedAt,
    resolvesDispute: true,
  };
  if (args.authorityRef !== undefined) event.authorityRef = args.authorityRef;
  if (args.rationale !== undefined) event.notes = args.rationale;
  return event;
}
