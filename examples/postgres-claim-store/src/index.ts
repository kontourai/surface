import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { addClaimToStore, addPolicyToStore, emptyClaimStore } from "@kontourai/surface";
import { createPostgresClaimStoreAdapter } from "./postgres-claim-store-adapter.js";

/**
 * Runnable demo: creates the reference schema (if missing), saves a small
 * scoped ClaimStore through the adapter, loads it back, and prints the
 * round-tripped store. Requires a real Postgres connection — this is a
 * reference example, not part of Surface's own `npm test` run (Surface's CI
 * has no Postgres service; see examples/postgres-claim-store/README.md).
 *
 * Run with:
 *   DATABASE_URL=postgres://user:pass@localhost:5432/surface_demo npm run demo
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DATABASE_URL to a Postgres connection string before running this demo.");
}

const pool = new Pool({ connectionString });
const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "../schema.sql");

try {
  await pool.query(readFileSync(schemaPath, "utf8"));

  const adapter = createPostgresClaimStoreAdapter({
    pool,
    subjectType: "repository",
    subjectId: "postgres-claim-store-demo",
    producer: "postgres-claim-store-demo",
  });

  const withPolicy = addPolicyToStore(emptyClaimStore("postgres-claim-store-demo"), {
    id: "demo.evidence-check-policy",
    claimType: "software-evidence",
    requiredEvidence: ["test_output"],
    requiredMethods: ["observation"],
    requiresCorroboration: false,
    acceptanceCriteria: ["ci run passed"],
    reviewAuthority: "ci",
    validityRule: { kind: "manual" },
    stalenessTriggers: ["ci run status changes"],
    conflictRules: ["newer ci run supersedes older run"],
    impactLevel: "high",
  });
  const store = addClaimToStore(withPolicy, {
    id: "repo.proof.npm-test",
    facet: "veritas.evidence-check",
    claimType: "software-evidence",
    fieldOrBehavior: "npm test",
    subjectType: "repository",
    subjectId: "postgres-claim-store-demo",
    impactLevel: "high",
    verificationPolicyId: "demo.evidence-check-policy",
    createdAt: "2026-05-19T00:00:00.000Z",
    updatedAt: "2026-05-19T00:00:00.000Z",
  });

  await adapter.save(store);
  const loaded = await adapter.load();

  console.log(JSON.stringify({
    producer: loaded.producer,
    claims: loaded.claims.length,
    policies: loaded.policies.length,
    firstClaimId: loaded.claims[0]?.id,
  }));
} finally {
  await pool.end();
}
