/**
 * Issue #84 — generic envelope-unwrap adapter + the `veritas` preset.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createEnvelopeAdapter, getAdapter } from "../src/index.js";

test("veritas is registered and unwraps the evidence-record envelope at trust.bundle", () => {
  const veritas = getAdapter("veritas");
  assert.ok(veritas, "veritas adapter is registered");
  const bundle = { schemaVersion: 5, source: "producer", claims: [], evidence: [], policies: [], events: [] };
  const envelope = { kind: "veritas-evidence-record", trust: { bundle } };
  assert.deepEqual(veritas!.adapt(envelope), bundle);
});

test("veritas tolerates an already-unwrapped bundle (bare or wrapped both work)", () => {
  const veritas = getAdapter("veritas")!;
  const bundle = { schemaVersion: 5, source: "producer", claims: [], evidence: [], policies: [], events: [] };
  assert.deepEqual(veritas.adapt(bundle), bundle); // no trust.bundle, but is itself a bundle
});

test("veritas rejects a record that is neither an envelope nor a bundle, with a clear message", () => {
  const veritas = getAdapter("veritas")!;
  assert.throws(() => veritas.adapt({ some: "unrelated json" }), /veritas adapter: expected an envelope.*trust\.bundle/);
});

test("createEnvelopeAdapter unwraps an arbitrary nested dot-path", () => {
  const adapter = createEnvelopeAdapter({ name: "deep", unwrapPath: "a.b.c" });
  const bundle = { schemaVersion: 5, source: "s", claims: [], evidence: [], policies: [], events: [] };
  assert.deepEqual(adapter.adapt({ a: { b: { c: bundle } } }), bundle);
});

test("createEnvelopeAdapter carries defaultExample only when provided", () => {
  assert.equal(createEnvelopeAdapter({ name: "x", unwrapPath: "p" }).defaultExample, undefined);
  assert.equal(
    createEnvelopeAdapter({ name: "y", unwrapPath: "p", defaultExample: "examples/e.json" }).defaultExample,
    "examples/e.json",
  );
});

test("createEnvelopeAdapter rejects an empty unwrapPath", () => {
  assert.throws(() => createEnvelopeAdapter({ name: "bad", unwrapPath: "" }), /non-empty unwrapPath/);
  assert.throws(() => createEnvelopeAdapter({ name: "bad", unwrapPath: "..." }), /non-empty unwrapPath/);
});

test("a missing intermediate path segment yields the not-an-envelope error, not a crash", () => {
  const adapter = createEnvelopeAdapter({ name: "deep", unwrapPath: "a.b.c" });
  assert.throws(() => adapter.adapt({ a: { x: 1 } }), /deep adapter: expected an envelope/);
  assert.throws(() => adapter.adapt(null), /deep adapter: expected an envelope/);
});
