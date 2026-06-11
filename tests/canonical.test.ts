import test from "node:test";
import assert from "node:assert/strict";
import { canonicalClaimKey } from "../src/canonical.js";

// ---------------------------------------------------------------------------
// Basic key structure
// ---------------------------------------------------------------------------

test("canonicalClaimKey produces subjectType:subjectId:fieldOrBehavior format", () => {
  const key = canonicalClaimKey({ subjectType: "repo", subjectId: "acme/api", fieldOrBehavior: "testsPassing" });
  assert.equal(key, "repo:acme/api:testspassing");
});

// ---------------------------------------------------------------------------
// Normalisation: trim + lowercase on subjectType and fieldOrBehavior
// ---------------------------------------------------------------------------

test("trims and lowercases subjectType and fieldOrBehavior", () => {
  const key = canonicalClaimKey({
    subjectType: "  REPO  ",
    subjectId: "acme/api",
    fieldOrBehavior: "  TestsPassing  ",
  });
  assert.equal(key, "repo:acme/api:testspassing");
});

test("preserves subjectId case but trims whitespace", () => {
  const key = canonicalClaimKey({ subjectType: "repo", subjectId: "  Acme/API  ", fieldOrBehavior: "field" });
  assert.equal(key, "repo:Acme/API:field");
});

// ---------------------------------------------------------------------------
// Qualifiers — sorting and determinism
// ---------------------------------------------------------------------------

test("qualifiers are appended after a ? separator", () => {
  const key = canonicalClaimKey({
    subjectType: "repo",
    subjectId: "acme/api",
    fieldOrBehavior: "field",
    qualifiers: { env: "prod" },
  });
  assert.match(key, /\?/);
  assert.match(key, /env=prod/);
});

test("qualifiers with different insertion order produce the same key (sorted by key)", () => {
  const a = canonicalClaimKey({
    subjectType: "repo",
    subjectId: "id",
    fieldOrBehavior: "field",
    qualifiers: { z: "last", a: "first", m: "middle" },
  });
  const b = canonicalClaimKey({
    subjectType: "repo",
    subjectId: "id",
    fieldOrBehavior: "field",
    qualifiers: { m: "middle", z: "last", a: "first" },
  });
  assert.equal(a, b);
});

test("qualifier keys and values are lowercased and trimmed", () => {
  const key = canonicalClaimKey({
    subjectType: "repo",
    subjectId: "id",
    fieldOrBehavior: "field",
    qualifiers: { "  ENV  ": "  PROD  " },
  });
  assert.match(key, /env=prod/);
});

test("empty qualifiers record produces no qualifier suffix", () => {
  const withEmpty = canonicalClaimKey({ subjectType: "t", subjectId: "id", fieldOrBehavior: "f", qualifiers: {} });
  const withUndefined = canonicalClaimKey({ subjectType: "t", subjectId: "id", fieldOrBehavior: "f" });
  assert.equal(withEmpty, withUndefined);
});

test("keys with different qualifier values are not equal", () => {
  const a = canonicalClaimKey({ subjectType: "t", subjectId: "id", fieldOrBehavior: "f", qualifiers: { env: "prod" } });
  const b = canonicalClaimKey({ subjectType: "t", subjectId: "id", fieldOrBehavior: "f", qualifiers: { env: "staging" } });
  assert.notEqual(a, b);
});

test("keys without qualifiers differ from keys with qualifiers", () => {
  const a = canonicalClaimKey({ subjectType: "t", subjectId: "id", fieldOrBehavior: "f" });
  const b = canonicalClaimKey({ subjectType: "t", subjectId: "id", fieldOrBehavior: "f", qualifiers: { env: "prod" } });
  assert.notEqual(a, b);
});
