import type { Claim, IdentityLink, SubjectGroup, SubjectRef, TrustInput } from "./types.js";

/**
 * Builds an index of co-referent subjects across a TrustInput.
 *
 * A claim's primary subject (subjectType, subjectId) and any subjectAliases
 * declare that those refs point at the same real entity. Top-level identityLinks
 * declare the same across multiple subjects without requiring a host claim.
 *
 * The resolver returns:
 *  - canonicalKey(ref): a stable key shared by all co-referent subjects
 *  - groups: equivalence classes with their member refs and the claim ids that
 *    point at any member
 */
export interface IdentityIndex {
  canonicalKey(ref: SubjectRef): string;
  canonicalKeyForClaim(claim: Claim): string;
  groups: SubjectGroup[];
  claimIdsByCanonicalKey: Map<string, string[]>;
}

export function buildIdentityIndex(input: TrustInput): IdentityIndex {
  const parent = new Map<string, string>();
  const ensure = (key: string): string => {
    if (!parent.has(key)) parent.set(key, key);
    return key;
  };
  const find = (key: string): string => {
    ensure(key);
    let current = key;
    while (parent.get(current) !== current) {
      const next = parent.get(current) ?? current;
      parent.set(current, parent.get(next) ?? next);
      current = parent.get(current) ?? current;
    }
    return current;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    if (rootA < rootB) parent.set(rootB, rootA);
    else parent.set(rootA, rootB);
  };

  const refKey = (ref: SubjectRef): string => `${ref.subjectType}::${ref.subjectId}`;

  // Seed every claim's primary subject and any aliases.
  for (const claim of input.claims) {
    const primary = ensure(refKey({ subjectType: claim.subjectType, subjectId: claim.subjectId }));
    if (Array.isArray(claim.subjectAliases)) {
      for (const alias of claim.subjectAliases) {
        union(primary, ensure(refKey(alias)));
      }
    }
  }

  // Apply explicit identityLinks.
  if (Array.isArray(input.identityLinks)) {
    for (const link of input.identityLinks) {
      if (!Array.isArray(link.subjects) || link.subjects.length < 2) continue;
      const head = ensure(refKey(link.subjects[0]));
      for (let i = 1; i < link.subjects.length; i += 1) {
        union(head, ensure(refKey(link.subjects[i])));
      }
    }
  }

  // Build groups keyed by canonical root.
  const refByKey = new Map<string, SubjectRef>();
  for (const claim of input.claims) {
    const direct = { subjectType: claim.subjectType, subjectId: claim.subjectId };
    refByKey.set(refKey(direct), direct);
    if (Array.isArray(claim.subjectAliases)) {
      for (const alias of claim.subjectAliases) {
        refByKey.set(refKey(alias), { subjectType: alias.subjectType, subjectId: alias.subjectId });
      }
    }
  }
  if (Array.isArray(input.identityLinks)) {
    for (const link of input.identityLinks) {
      if (!Array.isArray(link.subjects)) continue;
      for (const ref of link.subjects) {
        refByKey.set(refKey(ref), { subjectType: ref.subjectType, subjectId: ref.subjectId });
      }
    }
  }

  const membersByCanonical = new Map<string, SubjectRef[]>();
  for (const [key, ref] of refByKey) {
    const root = find(key);
    const list = membersByCanonical.get(root) ?? [];
    list.push(ref);
    membersByCanonical.set(root, list);
  }

  const claimIdsByCanonical = new Map<string, string[]>();
  for (const claim of input.claims) {
    const root = find(refKey({ subjectType: claim.subjectType, subjectId: claim.subjectId }));
    const list = claimIdsByCanonical.get(root) ?? [];
    list.push(claim.id);
    claimIdsByCanonical.set(root, list);
  }

  const groups: SubjectGroup[] = [];
  for (const [canonical, members] of membersByCanonical) {
    const sortedMembers = [...members].sort((a, b) => refKey(a).localeCompare(refKey(b)));
    groups.push({
      canonicalKey: canonical,
      members: dedupeRefs(sortedMembers),
      claimIds: claimIdsByCanonical.get(canonical) ?? [],
    });
  }
  groups.sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey));

  return {
    canonicalKey(ref: SubjectRef): string {
      return find(refKey(ref));
    },
    canonicalKeyForClaim(claim: Claim): string {
      return find(refKey({ subjectType: claim.subjectType, subjectId: claim.subjectId }));
    },
    groups,
    claimIdsByCanonicalKey: claimIdsByCanonical,
  };
}

function dedupeRefs(refs: SubjectRef[]): SubjectRef[] {
  const seen = new Set<string>();
  const out: SubjectRef[] = [];
  for (const ref of refs) {
    const key = `${ref.subjectType}::${ref.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export function describeIdentityLinks(input: TrustInput): IdentityLink[] {
  return Array.isArray(input.identityLinks) ? input.identityLinks : [];
}
