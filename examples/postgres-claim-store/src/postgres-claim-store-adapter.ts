import { Pool } from "pg";
import {
  validateClaimStore,
  type ClaimDefinition,
  type ClaimStore,
  type ClaimStoreAdapter,
  type ImpactLevel,
  type Materiality,
  type VerificationPolicy,
} from "@kontourai/surface";

/**
 * Reference Postgres implementation of `@kontourai/surface`'s
 * `ClaimStoreAdapter` seam (see src/store.ts and docs/reference/adapters.md
 * in the Surface repo). This file is meant to be copied and adapted, not
 * imported as a dependency — Surface ships zero runtime dependencies and
 * does not bundle `pg`.
 *
 * Claims are normalized into `claim_store_claims`, indexed on
 * (subject_type, subject_id) — see schema.sql. This adapter is
 * SUBJECT-SCOPED: it is constructed for exactly one (subjectType,
 * subjectId) pair and every load()/save() call is scoped to that subject,
 * so a large claim catalog is never fully loaded on every operation. From
 * the caller's point of view `load()` still returns "the whole store" — for
 * this adapter instance, that means "the claims/policies in scope for the
 * subject it was constructed for."
 *
 * Policies live in a separate, non-subject-scoped table
 * (`claim_store_policies`) because a policy can be referenced by claims
 * belonging to many different subjects. save() upserts the policies the
 * given store references but never deletes a policy just because this
 * subject's claims stopped referencing it — deleting a shared policy is out
 * of scope for a single subject's adapter instance.
 *
 * `producer` round-trips: save() persists `store.producer` (denormalized
 * onto every claim row) and load() reads it back from the first row for
 * this subject, rather than reusing the adapter's own configured default.
 * Known limitation of that design: if a caller saves an empty claim list
 * (no rows to stamp), the producer has nowhere to persist for this subject,
 * so a subsequent load() falls back to the adapter's configured default
 * instead of the empty store's producer — a real, accepted gap for a
 * subject-scoped, claims-table-only reference schema with no separate
 * per-subject store-metadata row.
 */

export interface PostgresClaimStoreAdapterOptions {
  readonly pool: Pool;
  readonly subjectType: string;
  readonly subjectId: string;
  /**
   * Default producer used only when `load()` finds no existing rows for this
   * subject (i.e. bootstrapping a brand-new, empty store) — matches the file
   * adapter's "empty store on missing file" behavior. Once any rows exist,
   * `producer` round-trips from what `save()` actually persisted; this option
   * has no effect on a store that already has data. Defaults to "veritas"
   * (matches Surface's emptyClaimStore default).
   */
  readonly producer?: string;
}

interface ClaimRow {
  id: string;
  producer: string;
  subject_type: string;
  subject_id: string;
  claim_type: string;
  field_or_behavior: string;
  facet: string | null;
  impact_level: ImpactLevel | null;
  materiality: Materiality | null;
  verification_policy_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface PolicyRow {
  id: string;
  claim_type: string;
  parent_type: string | null;
  required_evidence: VerificationPolicy["requiredEvidence"];
  required_methods: VerificationPolicy["requiredMethods"] | null;
  requires_corroboration: boolean | null;
  acceptance_criteria: string[];
  review_authority: string;
  validity_rule: VerificationPolicy["validityRule"];
  staleness_triggers: string[];
  conflict_rules: string[];
  impact_level: ImpactLevel;
  collect_when: VerificationPolicy["collectWhen"] | null;
  incompatible_values: VerificationPolicy["incompatibleValues"] | null;
  incompatible_statuses: VerificationPolicy["incompatibleStatuses"] | null;
}

export function createPostgresClaimStoreAdapter(options: PostgresClaimStoreAdapterOptions): ClaimStoreAdapter {
  const { pool, subjectType, subjectId } = options;
  const defaultProducer = options.producer ?? "veritas";

  return {
    name: "postgres",

    async load(): Promise<ClaimStore> {
      const { rows: claimRows } = await pool.query<ClaimRow>(
        `select id, producer, subject_type, subject_id, claim_type, field_or_behavior, facet,
                impact_level, materiality, verification_policy_id, metadata, created_at, updated_at
           from claim_store_claims
          where subject_type = $1 and subject_id = $2
          order by id`,
        [subjectType, subjectId],
      );

      const claims: ClaimDefinition[] = claimRows.map(claimRowToDefinition);
      const policyIds = [...new Set(claims.map((claim) => claim.verificationPolicyId).filter((id): id is string => Boolean(id)))];

      const policies: VerificationPolicy[] = policyIds.length === 0
        ? []
        : (await pool.query<PolicyRow>(
            `select id, claim_type, parent_type, required_evidence, required_methods, requires_corroboration,
                    acceptance_criteria, review_authority, validity_rule, staleness_triggers, conflict_rules,
                    impact_level, collect_when, incompatible_values, incompatible_statuses
               from claim_store_policies
              where id = any($1)`,
            [policyIds],
          )).rows.map(policyRowToDefinition);

      // `producer` is a whole-store field, denormalized onto every claim row
      // so it round-trips exactly what the last save() wrote (see save()
      // below) even though this adapter only ever sees one subject's rows at
      // a time. A single save() call stamps every row it writes with the
      // same validated.producer value, so the first row's producer is
      // authoritative for this subject. Only when there are no rows yet
      // (nothing has been saved for this subject) do we fall back to the
      // adapter's configured default, matching the file adapter's
      // empty-store-on-missing-file behavior.
      const producer = claimRows[0]?.producer ?? defaultProducer;

      // load() proves it did not bypass validation, matching the file
      // adapter's behavior (loadClaimStore also runs validateClaimStore).
      return validateClaimStore({ schemaVersion: 1, producer, claims, policies });
    },

    async save(store: ClaimStore): Promise<void> {
      // save() proves it did not bypass validation, matching the file
      // adapter's behavior (saveClaimStore also runs validateClaimStore).
      const validated = validateClaimStore(store);

      const outOfScope = validated.claims.find((claim) => claim.subjectType !== subjectType || claim.subjectId !== subjectId);
      if (outOfScope) {
        throw new Error(
          `Postgres claim store adapter is scoped to subject "${subjectType}:${subjectId}"; ` +
            `refusing to save claim "${outOfScope.id}" for subject "${outOfScope.subjectType}:${outOfScope.subjectId}"`,
        );
      }

      const client = await pool.connect();
      try {
        await client.query("begin");

        // Policies are upserted before claims: claim_store_claims.verification_policy_id
        // carries a foreign key to claim_store_policies.id (see schema.sql), so a
        // save() that introduces both a new policy and a new claim referencing
        // it in the same call must write the policy first within this
        // transaction. Policies are not subject-scoped and are never deleted
        // here — only upserted, since other subjects' claims may still
        // reference them.
        for (const policy of validated.policies) {
          await client.query(
            `insert into claim_store_policies
               (id, claim_type, parent_type, required_evidence, required_methods, requires_corroboration,
                acceptance_criteria, review_authority, validity_rule, staleness_triggers, conflict_rules,
                impact_level, collect_when, incompatible_values, incompatible_statuses)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             on conflict (id) do update set
               claim_type = excluded.claim_type,
               parent_type = excluded.parent_type,
               required_evidence = excluded.required_evidence,
               required_methods = excluded.required_methods,
               requires_corroboration = excluded.requires_corroboration,
               acceptance_criteria = excluded.acceptance_criteria,
               review_authority = excluded.review_authority,
               validity_rule = excluded.validity_rule,
               staleness_triggers = excluded.staleness_triggers,
               conflict_rules = excluded.conflict_rules,
               impact_level = excluded.impact_level,
               collect_when = excluded.collect_when,
               incompatible_values = excluded.incompatible_values,
               incompatible_statuses = excluded.incompatible_statuses`,
            [
              policy.id,
              policy.claimType,
              policy.parentType ?? null,
              JSON.stringify(policy.requiredEvidence),
              policy.requiredMethods ? JSON.stringify(policy.requiredMethods) : null,
              policy.requiresCorroboration ?? null,
              JSON.stringify(policy.acceptanceCriteria),
              policy.reviewAuthority,
              JSON.stringify(policy.validityRule),
              JSON.stringify(policy.stalenessTriggers),
              JSON.stringify(policy.conflictRules),
              policy.impactLevel,
              policy.collectWhen ? JSON.stringify(policy.collectWhen) : null,
              policy.incompatibleValues ? JSON.stringify(policy.incompatibleValues) : null,
              policy.incompatibleStatuses ? JSON.stringify(policy.incompatibleStatuses) : null,
            ],
          );
        }

        const keptIds = validated.claims.map((claim) => claim.id);
        // Whole-store save() semantics scoped to this subject: any row for
        // this subject not present in the given store is deleted, matching
        // a full "this is now the claim set for this subject" replace at
        // the port level while staying a cheap, idempotent row-level
        // upsert underneath (natural key = claim id).
        await client.query(
          `delete from claim_store_claims
            where subject_type = $1 and subject_id = $2 and not (id = any($3))`,
          [subjectType, subjectId, keptIds],
        );

        for (const claim of validated.claims) {
          await client.query(
            `insert into claim_store_claims
               (id, producer, subject_type, subject_id, claim_type, field_or_behavior, facet,
                impact_level, materiality, verification_policy_id, metadata, created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             on conflict (id) do update set
               producer = excluded.producer,
               subject_type = excluded.subject_type,
               subject_id = excluded.subject_id,
               claim_type = excluded.claim_type,
               field_or_behavior = excluded.field_or_behavior,
               facet = excluded.facet,
               impact_level = excluded.impact_level,
               materiality = excluded.materiality,
               verification_policy_id = excluded.verification_policy_id,
               metadata = excluded.metadata,
               updated_at = excluded.updated_at`,
            [
              claim.id,
              // Persist the store's own producer, not the adapter's
              // configured default — save() must round-trip whatever
              // `store.producer` the caller supplied, matching the file
              // adapter's ("same behavior") bar. See load() above for the
              // corresponding read-back.
              validated.producer,
              claim.subjectType,
              claim.subjectId,
              claim.claimType,
              claim.fieldOrBehavior,
              claim.facet ?? null,
              claim.impactLevel ?? null,
              claim.materiality ?? null,
              claim.verificationPolicyId ?? null,
              claim.metadata ? JSON.stringify(claim.metadata) : null,
              claim.createdAt,
              claim.updatedAt,
            ],
          );
        }

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function claimRowToDefinition(row: ClaimRow): ClaimDefinition {
  return {
    id: row.id,
    facet: row.facet ?? undefined,
    claimType: row.claim_type,
    fieldOrBehavior: row.field_or_behavior,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    impactLevel: row.impact_level ?? undefined,
    materiality: row.materiality ?? undefined,
    verificationPolicyId: row.verification_policy_id ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function policyRowToDefinition(row: PolicyRow): VerificationPolicy {
  return {
    id: row.id,
    claimType: row.claim_type,
    parentType: row.parent_type ?? undefined,
    requiredEvidence: row.required_evidence,
    requiredMethods: row.required_methods ?? undefined,
    requiresCorroboration: row.requires_corroboration ?? undefined,
    acceptanceCriteria: row.acceptance_criteria,
    reviewAuthority: row.review_authority,
    validityRule: row.validity_rule,
    stalenessTriggers: row.staleness_triggers,
    conflictRules: row.conflict_rules,
    impactLevel: row.impact_level,
    collectWhen: row.collect_when ?? undefined,
    incompatibleValues: row.incompatible_values ?? undefined,
    incompatibleStatuses: row.incompatible_statuses ?? undefined,
  };
}
