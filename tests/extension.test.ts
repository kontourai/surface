import test from "node:test";
import assert from "node:assert/strict";
import {
  getExtension,
  listExtensions,
  registerExtension,
  resolveClaimTypeDefinition,
  type SurfaceExtension,
} from "../src/index.js";

function extension(name: string): SurfaceExtension {
  return {
    name,
    displayName: name,
    vocab: {},
    theme: { brandName: name },
    claimTypes: [{
      id: `${name}-claim`,
      displayName: `${name} claim`,
      description: "test claim type",
      defaultImpact: "medium",
    }],
  };
}

test("registerExtension registers and retrieves an extension by name", () => {
  const ext = extension("registry-test");
  registerExtension(ext);
  assert.equal(getExtension("registry-test"), ext);
});

test("registerExtension overwrites existing registration with the same name", () => {
  registerExtension(extension("registry-overwrite"));
  const replacement = { ...extension("registry-overwrite"), displayName: "Replacement" };
  registerExtension(replacement);
  assert.equal(getExtension("registry-overwrite")?.displayName, "Replacement");
});

test("resolveClaimTypeDefinition finds claim types across registered extensions", () => {
  registerExtension(extension("registry-claim-type"));
  assert.equal(resolveClaimTypeDefinition("registry-claim-type-claim")?.displayName, "registry-claim-type claim");
  assert.equal(resolveClaimTypeDefinition("missing"), undefined);
});

test("listExtensions returns registered extensions", () => {
  registerExtension(extension("registry-list"));
  assert.ok(listExtensions().some((item) => item.name === "registry-list"));
});
