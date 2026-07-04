-- Reference schema for the Postgres ClaimStoreAdapter example.
--
-- Claims are normalized into their own table, indexed for the per-subject
-- query pattern createPostgresClaimStoreAdapter() is built around: load()
-- and save() only ever touch the rows for one (subjectType, subjectId) pair,
-- never the whole catalog.
--
-- Policies are stored separately because they are shared across subjects
-- (many claims across many subjects can reference the same
-- verificationPolicyId) — save() upserts the policies a scoped store
-- references, but never deletes a policy just because one subject's claims
-- stopped referencing it. Policies are declared first so claims can carry a
-- foreign key to them.

create table if not exists claim_store_policies (
  id text primary key,
  claim_type text not null,
  parent_type text,
  required_evidence jsonb not null,
  required_methods jsonb,
  requires_corroboration boolean,
  acceptance_criteria jsonb not null,
  review_authority text not null,
  validity_rule jsonb not null,
  staleness_triggers jsonb not null,
  conflict_rules jsonb not null,
  impact_level text not null,
  collect_when jsonb,
  incompatible_values jsonb,
  incompatible_statuses jsonb
);

create table if not exists claim_store_claims (
  id text primary key,
  producer text not null,
  subject_type text not null,
  subject_id text not null,
  claim_type text not null,
  field_or_behavior text not null,
  facet text,
  impact_level text,
  materiality text,
  -- Nullable: a claim's verificationPolicyId is optional on ClaimDefinition
  -- (see src/store.ts), so not every claim references a policy. "on delete
  -- set null" matches the adapter's own behavior of never deleting a shared
  -- policy on this table's behalf — if a policy row is ever removed by some
  -- other path, referencing claims fall back to no-policy rather than being
  -- deleted or blocking the delete; the app-level check in validateClaimStore
  -- remains the source of truth for cross-checking this reference.
  verification_policy_id text references claim_store_policies (id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists claim_store_claims_subject_idx
  on claim_store_claims (subject_type, subject_id);
