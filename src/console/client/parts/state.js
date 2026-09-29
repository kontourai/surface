
const cfg = window.__SURFACE_CONFIG__ ?? {};
const vocab = cfg.vocab ?? {};
const claimTypes = cfg.claimTypes ?? [];
const filters = { search: "", status: "all", surface: "all" };
let currentData = null;
let currentDetailClaim = null;
let currentRunId = null;
let allRuns = [];
let pendingDeleteClaimId = null;
