import type { TrustBundle, TrustBundleProof } from "./types.js";
import {
  isObject,
  rejectUnknownKeys,
  requireArray,
  requireSchemaVersion,
  requireString,
} from "./validation/primitives.js";
import { validateReferences } from "./validation/references.js";
import {
  validateAuthorityTrace,
  validateClaim,
  validateClaimGroup,
  validateEvent,
  validateEvidence,
  validateIdentityLink,
  validateIntegrityAnchor,
  validatePolicy,
} from "./validation/records.js";

// TOLERANCE SHIM support (owner-ratified, one release; see the facet-shim
// comment in `validateClaim` in ./validation/records.js for the read-path rule
// this guards). Warns exactly once per process — not once per claim, not once
// per call to validateTrustBundle — so a bundle with many legacy claims (or a
// long-lived process validating many bundles) does not flood stderr.
let warnedLegacySurfaceFieldOnce = false;
function warnLegacySurfaceFieldOnce(): void {
  if (warnedLegacySurfaceFieldOnce) return;
  warnedLegacySurfaceFieldOnce = true;
  console.warn(
    "[@kontourai/surface] deprecated: reading legacy claim field \"surface\" as \"facet\". " +
      "This read-tolerance shim will be removed in the next major release — re-emit affected bundles with \"facet\" instead of \"surface\".",
  );
}

/**
 * TOLERANCE SHIM (owner-ratified, one release): maps a legacy claim's
 * `surface` value onto `facet` and strips `surface`, without mutating the
 * caller-supplied object. Returns the original reference unchanged when the
 * claim carries no `surface` key at all (the overwhelmingly common case), and
 * only allocates a shallow copy when there is actually something to
 * normalize — so validateTrustBundle never rewrites objects the caller still
 * holds a reference to (e.g. for diffing or re-validating the original
 * payload).
 */
function normalizeClaimFacetForRead(raw: unknown): unknown {
  if (!isObject(raw) || !("surface" in raw)) return raw;
  const { surface, ...rest } = raw;
  if (rest.facet === undefined && typeof surface === "string" && surface.length > 0) {
    warnLegacySurfaceFieldOnce();
    return { ...rest, facet: surface };
  }
  return rest;
}

export function validateTrustBundle(input: unknown): TrustBundle {
  if (!isObject(input)) throw new Error("Trust bundle must be an object");
  const schemaVersion = requireSchemaVersion(input);
  const source = requireString(input, "source");
  // Optional stable producer identity (hachure merge.md §2). requireString
  // already rejects empty strings, matching the "minLength 1 when present" rule
  // used for every other optional string field in this validator.
  const producerId = input.producerId === undefined ? undefined : requireString(input, "producerId");
  // Optional signing/anchoring block (hachure schemaVersion 6). Validated and
  // carried through verbatim so signed bundles round-trip without losing their
  // proof; never consulted by status derivation.
  const proof = input.proof === undefined ? undefined : validateTrustBundleProof(input.proof);
  const claims = requireArray(input, "claims").map(normalizeClaimFacetForRead);
  const evidence = requireArray(input, "evidence");
  const policies = requireArray(input, "policies");
  const events = requireArray(input, "events");
  const identityLinks = input.identityLinks === undefined ? undefined : requireArray(input, "identityLinks");
  const claimGroups = input.claimGroups === undefined ? undefined : requireArray(input, "claimGroups");
  const authorityTrace = input.authorityTrace === undefined ? undefined : requireArray(input, "authorityTrace");

  for (const claim of claims) validateClaim(claim);

  for (const item of evidence) validateEvidence(item);

  for (const policy of policies) validatePolicy(policy);

  for (const event of events) validateEvent(event);

  if (identityLinks !== undefined) {
    for (const link of identityLinks) validateIdentityLink(link);
  }

  if (claimGroups !== undefined) {
    for (const claimGroup of claimGroups) {
      validateClaimGroup(claimGroup);
    }
  }

  if (authorityTrace !== undefined) {
    for (const trace of authorityTrace) {
      validateAuthorityTrace(trace);
    }
  }

  validateReferences({ claims, evidence, policies, events, claimGroups, authorityTrace } as TrustBundle);

  const result: TrustBundle = { schemaVersion, source, claims, evidence, policies, events } as TrustBundle;
  if (producerId !== undefined) (result as TrustBundle).producerId = producerId;
  if (identityLinks !== undefined) (result as TrustBundle).identityLinks = identityLinks as TrustBundle["identityLinks"];
  if (claimGroups !== undefined) (result as TrustBundle).claimGroups = claimGroups as TrustBundle["claimGroups"];
  if (authorityTrace !== undefined) (result as TrustBundle).authorityTrace = authorityTrace as TrustBundle["authorityTrace"];
  if (proof !== undefined) (result as TrustBundle).proof = proof;
  return result;
}

function validateTrustBundleProof(value: unknown): TrustBundleProof {
  if (!isObject(value)) throw new Error("Trust bundle proof must be an object");
  rejectUnknownKeys(value, new Set(["anchors", "metadata"]), "trust bundle proof");
  const proof: TrustBundleProof = {};
  if (value.anchors !== undefined) {
    if (!Array.isArray(value.anchors)) throw new Error("Trust bundle proof.anchors must be an array");
    value.anchors.forEach((anchor, index) => validateIntegrityAnchor(anchor, `proof anchors[${index}]`));
    proof.anchors = value.anchors as TrustBundleProof["anchors"];
  }
  if (value.metadata !== undefined) {
    if (!isObject(value.metadata)) throw new Error("Trust bundle proof.metadata must be an object");
    proof.metadata = value.metadata as Record<string, unknown>;
  }
  return proof;
}
