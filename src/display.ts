// `@kontourai/surface/display`: reader-facing display names plus the claim
// basis view (kontourai/ui#87). The label tables are also re-exported from the
// root entry; `claimBasisView` is not, keeping "basis" projections out of the
// root barrel as with the answer-level `./basis` entries. This subpath imports
// no Node-only modules, so a browser renderer can bundle it on its own (the
// root barrel pulls in the file-backed store).
export * from "./display-names.js";
export * from "./claim-basis-view.js";
