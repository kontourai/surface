
const cfg = window.__SURFACE_CONFIG__ ?? {};
const vocab = cfg.vocab ?? {};
const trustChipAssets = window.__SURFACE_TRUST_CHIP__ ?? { glyphs: {}, defaultLabels: {} };
const claimTypes = cfg.claimTypes ?? [];
const filters = { search: "", status: "all", surface: "all" };
let currentData = null;
let currentDetailClaim = null;
let currentRunId = null;
let allRuns = [];
let pendingDeleteClaimId = null;
