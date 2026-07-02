import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMergedConsoleReadModel,
  projectBundleToConsoleReadModel,
  type ConsoleMergeCollision,
} from "../src/console/merged-read-model.js";
import { buildSurfaceConsoleProjection } from "../src/console/projection.js";
import type { TrustBundle } from "../src/index.js";

const sharedClaim = {
  id: "claim.shared.repo-identity",
  subjectType: "repository",
  subjectId: "acme/widgets",
  facet: "governance.identity",
  claimType: "repo-metadata",
  fieldOrBehavior: "canonical repository",
  value: "acme/widgets",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function bundle(overrides: Partial<TrustBundle>): TrustBundle {
  return {
    schemaVersion: 5,
    source: "producer",
    claims: [],
    evidence: [],
    policies: [],
    events: [],
    ...overrides,
  };
}

const ciProducer = bundle({
  source: "ci-producer:run-1",
  producerId: "ci-producer",
  claims: [
    { ...sharedClaim },
    {
      id: "claim.ci.unit-tests",
      subjectType: "repository",
      subjectId: "acme/widgets",
      facet: "ci.tests",
      claimType: "test-suite",
      fieldOrBehavior: "unit tests pass",
      value: "passing",
      createdAt: "2026-07-01T09:00:00.000Z",
      updatedAt: "2026-07-01T09:00:00.000Z",
    },
    {
      id: "claim.build.digest",
      subjectType: "artifact",
      subjectId: "acme/widgets@1.4.0",
      facet: "ci.build",
      claimType: "artifact-digest",
      fieldOrBehavior: "artifact digest",
      value: "sha256:aaaa",
      createdAt: "2026-07-01T09:05:00.000Z",
      updatedAt: "2026-07-01T09:05:00.000Z",
    },
  ],
});

const securityProducer = bundle({
  source: "security-producer:scan-1",
  producerId: "security-producer",
  claims: [
    { ...sharedClaim },
    {
      id: "claim.build.digest",
      subjectType: "artifact",
      subjectId: "acme/widgets@1.4.0",
      facet: "ci.build",
      claimType: "artifact-digest",
      fieldOrBehavior: "artifact digest",
      value: "sha256:9999",
      createdAt: "2026-07-01T09:05:00.000Z",
      updatedAt: "2026-07-01T09:05:00.000Z",
    },
  ],
});

const reviewProducer = bundle({
  source: "review-producer:pr-1",
  producerId: "review-producer",
  claims: [{ ...sharedClaim }],
});

test("buildMergedConsoleReadModel dedups identical shared claims and attributes every producer", () => {
  const model = buildMergedConsoleReadModel([ciProducer, reviewProducer, securityProducer]);

  // shared claim appears once after merge (deduped)
  const shared = model.claims.filter((claim) => claim.id === "claim.shared.repo-identity");
  assert.equal(shared.length, 1);
  // ...but attributes all three contributing producers (sorted)
  assert.deepEqual(model.producerAttribution["claim.shared.repo-identity"], [
    "ci-producer",
    "review-producer",
    "security-producer",
  ]);
  assert.deepEqual(shared[0].producers, ["ci-producer", "review-producer", "security-producer"]);
  // distinct producer set is sorted and order-independent
  assert.deepEqual(model.producers, ["ci-producer", "review-producer", "security-producer"]);
});

test("buildMergedConsoleReadModel surfaces a same-id/different-content collision with named producers", () => {
  const model = buildMergedConsoleReadModel([ciProducer, reviewProducer, securityProducer]);

  assert.equal(model.mergeCollisions.length, 1);
  const collision = model.mergeCollisions[0];
  assert.equal(collision.collection, "claims");
  assert.equal(collision.id, "claim.build.digest");
  // lexicographically-first content ("sha256:9999") is kept — security-producer
  assert.equal(collision.keptProducer, "security-producer");
  assert.equal(collision.droppedProducer, "ci-producer");
  assert.equal(collision.withinBundle, false);
  assert.equal(model.summary.collisionCount, 1);
});

test("merged read model is order-independent for producers and collision set", () => {
  const a = buildMergedConsoleReadModel([ciProducer, reviewProducer, securityProducer]);
  const b = buildMergedConsoleReadModel([securityProducer, ciProducer, reviewProducer]);

  assert.deepEqual(a.producers, b.producers);
  assert.deepEqual(
    a.mergeCollisions.map((c) => `${c.collection}:${c.id}:${c.keptProducer}:${c.droppedProducer}`),
    b.mergeCollisions.map((c) => `${c.collection}:${c.id}:${c.keptProducer}:${c.droppedProducer}`),
  );
  assert.deepEqual(a.producerAttribution["claim.build.digest"], b.producerAttribution["claim.build.digest"]);
});

test("projectBundleToConsoleReadModel maps a report into the console read-model shape", () => {
  const collisions: ConsoleMergeCollision[] = [];
  const model = projectBundleToConsoleReadModel(
    ciProducer,
    { "claim.ci.unit-tests": ["ci-producer"] },
    collisions,
    { runId: "unit" },
  );
  assert.equal(model.producer.runId, "unit");
  assert.equal(typeof model.summary.claimCount, "number");
  assert.equal(model.summary.claimCount, model.claims.length);
  // every claim carries evidenceIds/transparencyGapIds arrays the console feed reads
  for (const claim of model.claims) {
    assert.ok(Array.isArray(claim.evidenceIds));
    assert.ok(Array.isArray(claim.transparencyGapIds));
  }
});

test("console projection carries producers + producer-named collisions through to the view", () => {
  const model = buildMergedConsoleReadModel([ciProducer, reviewProducer, securityProducer]);
  const projection = buildSurfaceConsoleProjection(model, {});

  assert.deepEqual(projection.producers, ["ci-producer", "review-producer", "security-producer"]);
  assert.equal(projection.collisions.length, 1);
  assert.equal(projection.collisions[0].id, "claim.build.digest");
  assert.equal(projection.collisions[0].keptProducer, "security-producer");
  assert.equal(projection.collisions[0].droppedProducer, "ci-producer");
});

test("single-producer read model keeps producers/collisions empty (additive, no regressions)", () => {
  const projection = buildSurfaceConsoleProjection(
    { producer: { runId: "solo" }, summary: { claimCount: 0, statusCounts: {} }, claims: [] },
    {},
  );
  assert.deepEqual(projection.producers, []);
  assert.deepEqual(projection.collisions, []);
});
