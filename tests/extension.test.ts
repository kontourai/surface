import test from "node:test";
import assert from "node:assert/strict";
import {
  getExtension,
  listExtensions,
  registerExtension,
  resolveClaimTypeDefinition,
  resolveExtensionTheme,
  resolveExtensionVocab,
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
      defaultFacet: `${name}.facet`,
      policyTemplateId: `${name}.policy`,
      metadataFields: [{ key: "owner", label: "Owner", type: "string" }],
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

test("claim type definitions expose authoring hints without changing trust semantics", () => {
  registerExtension(extension("registry-authoring"));
  const definition = resolveClaimTypeDefinition("registry-authoring-claim");

  assert.equal(definition?.defaultFacet, "registry-authoring.facet");
  assert.equal(definition?.policyTemplateId, "registry-authoring.policy");
  assert.deepEqual(definition?.metadataFields, [{ key: "owner", label: "Owner", type: "string" }]);
});

test("extension vocab and theme are presentation-only registry queries", () => {
  registerExtension({
    ...extension("registry-presentation"),
    vocab: { statusLabels: { verified: "Checked" } },
    theme: { brandName: "Presentation Extension" },
  });

  assert.equal(resolveExtensionVocab("registry-presentation")?.statusLabels?.verified, "Checked");
  assert.equal(resolveExtensionTheme("registry-presentation")?.brandName, "Presentation Extension");
});

test("listExtensions returns registered extensions", () => {
  registerExtension(extension("registry-list"));
  assert.ok(listExtensions().some((item) => item.name === "registry-list"));
});
