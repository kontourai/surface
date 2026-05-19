# Plan: Claim Authorship, Surface Extensibility, and Veritas as First-Class Producer

## Background and Motivation

Surface currently treats claims as dynamically generated: Veritas's `buildSurfaceTrustInput` in
`src/surface/projection.mjs` generates both claims and evidence together on each run from the Veritas
record. This conflates two fundamentally different responsibilities:

- **Claim authorship** — what the application declares about itself. Stable, versioned, owned by the
  application team. Should live in git alongside the code.
- **Evidence collection** — what Veritas observes per run to prove or disprove those claims. Dynamic,
  produced by CI/tools, bound to a specific source ref and timestamp.

The correct model is:

```
Application  →  authors claims in veritas.claims.json  (stable, in git)
Veritas      →  collects evidence against those claims  (per-run, in CI)
Surface      →  derives trust status from evidence       (protocol, unchanged)
```

Applications use Veritas directly. Veritas is the product; Surface is the underlying protocol.
Applications that pull in Veritas get Surface's rigorous trust derivation but never need to
know that Surface exists — everything is branded and labelled by Veritas.

This plan implements:
1. A claim store schema and read/write API in Surface
2. A Surface extension/plugin API so Veritas (and others) can fully brand the experience
3. Write commands in the Surface CLI (`surface claim add/edit/remove`)
4. Claim authoring UI in the Surface dashboard
5. Veritas extension registration (vocab, theme, claim type definitions)
6. Veritas claim store integration (`veritas.claims.json` as source of truth)
7. Evidence collection decoupled from claim generation in `projection.mjs`
8. `veritas claim` CLI subcommand
9. Documentation for both repos
10. Derived trust status (previously planned — included here as Phase 5)

No backwards compatibility is required. Clean break throughout.

---

## Repository Layout

```
surface/                                 @kontourai/surface
  src/
    types.ts                             MODIFIED  — ClaimDefinition, ClaimStore, SurfaceExtension
    store.ts                             NEW       — claim store read/write/validate
    extension.ts                         NEW       — extension registry
    index.ts                             MODIFIED  — export store, extension
    cli.ts                               MODIFIED  — add `claim` subcommand
    dashboard/
      server.ts                          MODIFIED  — add /api/claims write endpoint
      script.ts                          MODIFIED  — authoring UI interactions
      shell.ts                           MODIFIED  — add claim modal HTML
      styles.ts                          MODIFIED  — modal and form styles
      types.ts                           MODIFIED  — SurfaceDashboardConfig.storePath
  tests/
    claim-store.test.ts                  NEW
    extension.test.ts                    NEW
    cli-write.test.ts                    NEW
  docs/
    claim-authoring.md                   NEW
    extension-api.md                     NEW
    architecture.md                      MODIFIED  — three-layer diagram

veritas/                                 @kontourai/veritas  (../veritas relative to surface)
  src/
    claims/
      store.mjs                          NEW       — load/save veritas.claims.json
      templates.mjs                      NEW       — baseline claim definitions per repo type
      init.mjs                           NEW       — bootstrap veritas.claims.json
    surface/
      extension.mjs                      NEW       — Veritas extension registration
      projection.mjs                     MODIFIED  — reads claims from store, generates evidence only
      policies.mjs                       MODIFIED  — export for use in extension policyTemplates
    cli/
      claims.mjs                         NEW       — `veritas claim` subcommand handler
      index.mjs                          MODIFIED  — wire up `veritas claim`
  tests/
    claim-store.test.mjs                 NEW
    projection-with-store.test.mjs       NEW
  docs/
    claim-authoring.md                   NEW
    veritas-on-surface.md                NEW
```

---

## Phase 1: Surface Type Changes (`src/types.ts`)

### 1.1 ClaimDefinition

The authored, persisted form of a claim. Lives in `veritas.claims.json`. Has no runtime-derived
fields (`status`, `currentIntegrityRef`, `confidenceBasis`, `derivedFrom`) — those are added by the
evidence collection step each run.

Add after the existing `Claim` interface:

```typescript
export interface ClaimDefinition {
  id: string;
  surface: string;
  claimType: string;
  fieldOrBehavior: string;
  subjectType: string;
  subjectId: string;
  impactLevel?: ImpactLevel;
  verificationPolicyId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### 1.2 ClaimStore

```typescript
export interface ClaimStore {
  schemaVersion: 1;
  producer: string;
  claims: ClaimDefinition[];
  policies: VerificationPolicy[];
}
```

### 1.3 ClaimTypeDefinition and SurfaceExtension

```typescript
export interface ClaimTypeMetadataField {
  key: string;
  label: string;
  type: "string" | "boolean" | "number";
  required?: boolean;
  hint?: string;
}

export interface ClaimTypeDefinition {
  id: string;
  displayName: string;
  description: string;
  defaultImpact: ImpactLevel;
  defaultSurface?: string;
  policyTemplateId?: string;
  metadataFields?: ClaimTypeMetadataField[];
}

export interface SurfaceExtension {
  name: string;
  displayName: string;
  vocab: import("./dashboard/types.js").SurfaceDashboardVocab;
  theme: import("./dashboard/types.js").SurfaceDashboardTheme;
  claimTypes?: ClaimTypeDefinition[];
  policyTemplates?: Array<{
    id: string;
    template: Omit<VerificationPolicy, "id">;
  }>;
}
```

---

## Phase 2: Surface Claim Store (`src/store.ts`)

New file. Pure functions — no side effects except the explicit `saveClaimStore` call. Immutable
update pattern throughout (never mutate the input store).

```typescript
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ClaimDefinition, ClaimStore, VerificationPolicy } from "./types.js";

export function loadClaimStore(path: string): ClaimStore {
  if (!existsSync(path)) return emptyClaimStore();
  const raw = readFileSync(path, "utf8");
  return validateClaimStore(JSON.parse(raw));
}

export function saveClaimStore(store: ClaimStore, path: string): void {
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function addClaimToStore(store: ClaimStore, claim: ClaimDefinition): ClaimStore {
  if (store.claims.some((c) => c.id === claim.id)) {
    throw new Error(`Claim "${claim.id}" already exists in store`);
  }
  return { ...store, claims: [...store.claims, claim] };
}

export function updateClaimInStore(
  store: ClaimStore,
  id: string,
  updates: Partial<Omit<ClaimDefinition, "id" | "createdAt">>,
): ClaimStore {
  const index = store.claims.findIndex((c) => c.id === id);
  if (index === -1) throw new Error(`Claim "${id}" not found in store`);
  const existing = store.claims[index];
  const updated: ClaimDefinition = {
    ...existing,
    ...updates,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...store,
    claims: [...store.claims.slice(0, index), updated, ...store.claims.slice(index + 1)],
  };
}

export function removeClaimFromStore(store: ClaimStore, id: string): ClaimStore {
  if (!store.claims.some((c) => c.id === id)) {
    throw new Error(`Claim "${id}" not found in store`);
  }
  return { ...store, claims: store.claims.filter((c) => c.id !== id) };
}

export function addPolicyToStore(store: ClaimStore, policy: VerificationPolicy): ClaimStore {
  if (store.policies.some((p) => p.id === policy.id)) {
    throw new Error(`Policy "${policy.id}" already exists in store`);
  }
  return { ...store, policies: [...store.policies, policy] };
}

export function emptyClaimStore(producer = "veritas"): ClaimStore {
  return { schemaVersion: 1, producer, claims: [], policies: [] };
}

export function validateClaimStore(raw: unknown): ClaimStore {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Claim store must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    throw new Error(`Unsupported claim store schemaVersion: ${obj.schemaVersion}`);
  }
  if (!Array.isArray(obj.claims)) throw new Error("Claim store must have a claims array");
  if (!Array.isArray(obj.policies)) throw new Error("Claim store must have a policies array");
  return raw as ClaimStore;
}
```

Export both `loadClaimStore` and all mutation functions from `src/index.ts`.

---

## Phase 3: Surface Extension Registry (`src/extension.ts`)

New file. A simple in-process registry. Extensions are registered at startup by the producer
(e.g., Veritas calls `registerExtension(VERITAS_EXTENSION)` when its module loads).

```typescript
import type { SurfaceExtension, ClaimTypeDefinition } from "./types.js";

const registry = new Map<string, SurfaceExtension>();

export function registerExtension(extension: SurfaceExtension): void {
  registry.set(extension.name, extension);
}

export function getExtension(name: string): SurfaceExtension | undefined {
  return registry.get(name);
}

export function listExtensions(): SurfaceExtension[] {
  return [...registry.values()];
}

export function resolveClaimTypeDefinition(claimTypeId: string): ClaimTypeDefinition | undefined {
  for (const ext of registry.values()) {
    const found = ext.claimTypes?.find((ct) => ct.id === claimTypeId);
    if (found) return found;
  }
  return undefined;
}

export function resolveExtensionVocab(
  producerName: string,
): SurfaceExtension["vocab"] | undefined {
  return registry.get(producerName)?.vocab;
}

export function resolveExtensionTheme(
  producerName: string,
): SurfaceExtension["theme"] | undefined {
  return registry.get(producerName)?.theme;
}
```

Export all from `src/index.ts`.

---

## Phase 4: Surface CLI Write Commands (`src/cli.ts`)

Add a `claim` command with subcommands. Default store path is `./veritas.claims.json`.

```
surface claim list    [--store <path>]
surface claim add     --type <claimType> --surface <surface> --subject-type <type>
                      --subject-id <id> --field <fieldOrBehavior>
                      [--id <id>] [--impact low|medium|high|critical]
                      [--policy-id <policyId>] [--store <path>]
surface claim edit    --claim-id <id> [same optional flags as add] [--store <path>]
surface claim remove  --claim-id <id> [--store <path>]
surface claim validate [--store <path>]
```

Implementation pattern in `runCli`:

```typescript
} else if (command === "claim") {
  await runClaimCommand(rest);
```

```typescript
async function runClaimCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === "list")     return runClaimList(rest);
  if (sub === "add")      return runClaimAdd(rest);
  if (sub === "edit")     return runClaimEdit(rest);
  if (sub === "remove")   return runClaimRemove(rest);
  if (sub === "validate") return runClaimValidate(rest);
  throw new Error(`Unknown claim subcommand: ${sub}. Use list, add, edit, remove, or validate.`);
}
```

`runClaimAdd` behavior:
- Parse flags into a `ClaimDefinition` shape.
- Auto-generate `id` if not provided: `${subjectId}.${surface}.${slugify(fieldOrBehavior)}`.
- Set `createdAt` and `updatedAt` to `new Date().toISOString()`.
- Call `addClaimToStore`, then `saveClaimStore`.
- Print `Added claim: <id>` on success.

`runClaimValidate` behavior:
- Load the store, call `validateClaimStore`.
- Cross-check each claim's `verificationPolicyId` exists in `store.policies`.
- Print a summary: N claims, N policies, any issues found.

Update `printHelp()` to document the new commands.

---

## Phase 5: Derived Trust Status (from `docs/plan-derived-trust-status.md`)

Implement the plan already written at `docs/plan-derived-trust-status.md`. This makes Surface's
trust derivation correct before the evidence decoupling work in Veritas depends on it.

Key changes (summary — see the plan doc for full detail):
- `Evidence` gains `passing?: boolean` and `blocking?: boolean`
- `FaultLine` gains `blocking?: boolean`
- `TrustReport` claims gain `producerStatus?: TrustStatus`
- `deriveTrustStatus` in `src/status.ts` adds evidence completeness gate and evaluation gate
- `buildTrustReport` in `src/report.ts` preserves `producerStatus` and propagates `blocking`
- Dashboard shows divergence banner when `producerStatus` differs from derived `status`

---

## Phase 6: Surface Dashboard Authoring

### 6.1 `src/dashboard/types.ts`

Add `storePath` to `SurfaceDashboardConfig`:

```typescript
export interface SurfaceDashboardConfig {
  port?: number;
  readModelPath?: string;
  storePath?: string;    // path to veritas.claims.json, default ./veritas.claims.json
  vocab?: SurfaceDashboardVocab;
  theme?: SurfaceDashboardTheme;
}
```

### 6.2 `src/dashboard/server.ts` — Write Endpoints

Add three REST handlers after the existing static file and read-model handlers:

```typescript
// POST /api/claims — create
// PUT  /api/claims/:id — update
// DELETE /api/claims/:id — remove
```

Each handler:
1. Reads JSON body (with size limit, validate it is an object)
2. Loads the claim store from `config.storePath ?? "veritas.claims.json"`
3. Calls the appropriate store mutation (`addClaimToStore` / `updateClaimInStore` / `removeClaimFromStore`)
4. Saves the updated store
5. Responds 201/200/204 with `{"ok": true}`
6. On error responds 400 with `{"error": "message"}`

No authentication required (dashboard is local-only, same origin).

### 6.3 `src/dashboard/shell.ts` — Claim Modal

Add an "Add claim" button to `.dash-toolbar` after the search row:

```html
<div class="toolbar-actions">
  <button class="btn-primary" id="addClaimBtn" type="button">+ Add claim</button>
</div>
```

Add a `<dialog>` element before the closing `</body>`:

```html
<dialog class="claim-modal" id="claimModal" aria-label="Add or edit claim">
  <form id="claimForm" method="dialog">
    <h2 class="modal-title" id="claimModalTitle">Add claim</h2>
    <div class="modal-body">
      <div class="form-field">
        <label for="claimTypeSelect">Claim type</label>
        <select id="claimTypeSelect" required></select>
        <p class="field-hint" id="claimTypeHint"></p>
      </div>
      <div class="form-field">
        <label for="claimSurfaceInput">Surface</label>
        <input id="claimSurfaceInput" type="text" required autocomplete="off">
      </div>
      <div class="form-field">
        <label for="claimFieldInput">Field or behavior</label>
        <input id="claimFieldInput" type="text" required autocomplete="off"
               placeholder="e.g. unit test coverage">
      </div>
      <div class="form-field">
        <label for="claimSubjectTypeInput">Subject type</label>
        <input id="claimSubjectTypeInput" type="text" required autocomplete="off"
               placeholder="e.g. repository">
      </div>
      <div class="form-field">
        <label for="claimSubjectIdInput">Subject ID</label>
        <input id="claimSubjectIdInput" type="text" required autocomplete="off">
      </div>
      <div class="form-field">
        <label for="claimImpactSelect">Impact level</label>
        <select id="claimImpactSelect">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <div id="claimMetadataFields"></div>
    </div>
    <div class="modal-actions">
      <button type="button" id="claimModalCancel">Cancel</button>
      <button type="submit" class="btn-primary" id="claimModalSave">Save claim</button>
    </div>
  </form>
</dialog>
```

### 6.4 `src/dashboard/script.ts` — Authoring Interactions

Add to the main script:

```typescript
// Claim type registry (populated from __SURFACE_CONFIG__.claimTypes injected by server)
function buildClaimTypeOptions(): void { ... }

// Open modal for add (no arg) or edit (existing claim)
function openClaimModal(existing?: ClaimDef): void { ... }
function closeClaimModal(): void { ... }

// Submit handler — POST for new, PUT for edit
async function submitClaimForm(event: Event): Promise<void> { ... }

// Delete from detail sheet
async function deleteCurrentClaim(claimId: string): Promise<void> { ... }
```

In `showClaimDetail()`, add Edit and Delete buttons to the sheet:

```typescript
// Near the top of the detail sheet, add:
const editBtn = document.createElement("button");
editBtn.textContent = "Edit claim";
editBtn.className = "sheet-action-btn";
editBtn.onclick = () => openClaimModal(claim);

const deleteBtn = document.createElement("button");
deleteBtn.textContent = "Delete claim";
deleteBtn.className = "sheet-action-btn sheet-action-btn--danger";
deleteBtn.onclick = () => deleteCurrentClaim(claim.id);
```

After a successful create/update/delete, trigger a full read-model reload by calling the existing
dashboard refresh logic. (The server already re-reads the store file on the next request.)

The server needs to expose claim type definitions for the modal. Inject them via
`window.__SURFACE_CONFIG__` alongside the read model — the server reads registered extensions
and includes `claimTypes` in the config payload.

### 6.5 `src/dashboard/styles.ts` — Modal Styles

Add `<dialog>` styles using the existing `--s-*` token system:

```css
.claim-modal {
  border: none;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.25);
  padding: 0;
  width: min(560px, 95vw);
  background: var(--s-panel);
  color: var(--s-ink);
}
.claim-modal::backdrop {
  background: rgba(0,0,0,.4);
}
.modal-title { ... }
.modal-body { display: flex; flex-direction: column; gap: 1rem; padding: 1.5rem; }
.form-field { display: flex; flex-direction: column; gap: .25rem; }
.form-field label { font-size: .8125rem; font-weight: 600; color: var(--s-muted); }
.form-field input, .form-field select {
  background: var(--s-input); border: 1px solid var(--s-line);
  border-radius: 6px; padding: .5rem .75rem; color: var(--s-ink); font-size: .875rem;
}
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; padding: 1rem 1.5rem; border-top: 1px solid var(--s-line); }
.btn-primary { background: var(--s-accent, #6366f1); color: #fff; border: none; border-radius: 6px; padding: .5rem 1rem; cursor: pointer; }
.sheet-action-btn { ... }
.sheet-action-btn--danger { color: var(--s-bad); }
```

---

## Phase 7: Veritas Extension Registration (`src/surface/extension.mjs`)

New file. Registers Veritas as a Surface extension so the dashboard uses Veritas branding
everywhere when the producer is `veritas`.

```javascript
import * as Surface from '@kontourai/surface';
import { SURFACE_TRUST_POLICIES } from './policies.mjs';

export const VERITAS_EXTENSION = {
  name: 'veritas',
  displayName: 'Veritas',
  vocab: {
    projectKind: 'repository',
    surfaceLabels: {
      'veritas.affected-surface': 'Affected Surface',
      'veritas.proof-lane':       'Proof Lanes',
      'veritas.governance':       'Governance',
      'veritas.external-tools':   'External Tools',
      'veritas.proposals':        'Proposals',
    },
    surfaceDescriptions: {
      'veritas.affected-surface': 'Files and modules touched by this change, with per-node verification.',
      'veritas.proof-lane':       'Automated test suites and proof commands that verify code correctness.',
      'veritas.governance':       'Policy compliance and governance artifact integrity.',
      'veritas.external-tools':   'Results from integrated external analysis tools (Snyk, etc.).',
      'veritas.proposals':        'Agent-proposed changes awaiting human review.',
    },
    claimTypeLabels: {
      'veritas-affected-surface':    'Affected surface node',
      'software-proof':              'Proof lane',
      'veritas-governance-artifact': 'Governance artifact',
      'veritas-policy-result':       'Policy result',
      'veritas-external-tool-result':'External tool result',
      'veritas-verification-budget': 'Verification budget',
      'veritas-proposal':            'Proposal',
    },
    statusLabels: {
      proposed:   'Pending evidence',
      verified:   'Verified',
      stale:      'Needs re-verification',
      disputed:   'Has failures',
      rejected:   'Rejected',
      unknown:    'Not yet evaluated',
      superseded: 'Superseded',
    },
    actionText: {
      reviewItem:      'Review in Veritas',
      refreshEvidence: 'Re-run veritas',
      markProposed:    'Mark as pending',
    },
  },
  theme: {
    brandName:    'Veritas',
    primaryColor: '#6366f1',
  },
  claimTypes: [
    {
      id: 'software-proof',
      displayName: 'Proof Lane',
      description: 'An automated test suite or proof command that verifies code correctness.',
      defaultImpact: 'high',
      defaultSurface: 'veritas.proof-lane',
      policyTemplateId: 'veritas.proof-lane',
      metadataFields: [
        { key: 'command', label: 'Proof command', type: 'string', required: true,
          hint: 'The command that runs this proof, e.g. "npm test"' },
        { key: 'scope', label: 'Scope', type: 'string',
          hint: 'Files or modules covered by this proof' },
      ],
    },
    {
      id: 'veritas-governance-artifact',
      displayName: 'Governance Artifact',
      description: 'A governance artifact that must remain in sync with policy and adapter configuration.',
      defaultImpact: 'high',
      defaultSurface: 'veritas.governance',
      policyTemplateId: 'veritas.governance-artifact',
    },
    {
      id: 'veritas-external-tool-result',
      displayName: 'External Tool Result',
      description: 'Result from an external analysis tool integrated via a Veritas adapter.',
      defaultImpact: 'medium',
      defaultSurface: 'veritas.external-tools',
      policyTemplateId: 'veritas.external-tool-result',
      metadataFields: [
        { key: 'tool', label: 'Tool name', type: 'string', required: true },
        { key: 'resultFile', label: 'Result file path', type: 'string' },
      ],
    },
  ],
  policyTemplates: Object.entries(SURFACE_TRUST_POLICIES).map(([, policy]) => ({
    id: policy.id,
    template: policy,
  })),
};

export function registerVeritasExtension() {
  Surface.registerExtension(VERITAS_EXTENSION);
}
```

Call `registerVeritasExtension()` at the top of `src/index.mjs` (or lazily in the dashboard path).

---

## Phase 8: Veritas Claim Store (`src/claims/`)

### `src/claims/store.mjs`

Thin wrapper around Surface's store API for Veritas's file path conventions.

```javascript
import * as Surface from '@kontourai/surface';
import { resolve } from 'node:path';

const STORE_FILE = 'veritas.claims.json';

export function loadVeritasClaimStore(rootDir = process.cwd()) {
  return Surface.loadClaimStore(resolve(rootDir, STORE_FILE));
}

export function saveVeritasClaimStore(store, rootDir = process.cwd()) {
  Surface.saveClaimStore(store, resolve(rootDir, STORE_FILE));
}

export function claimStoreExists(rootDir = process.cwd()) {
  return existsSync(resolve(rootDir, STORE_FILE));
}
```

### `src/claims/templates.mjs`

Builds the baseline claim set for `veritas init`. Scans the repo config to determine which
claim types apply (proof lanes from adapter config, governance artifact from existing governance
block, etc.).

```javascript
export function buildBaselineClaims(repoName, { hasGovernance, proofLaneCommands = [] } = {}) {
  const now = new Date().toISOString();
  const claims = [];
  const policies = [];

  if (hasGovernance) {
    claims.push({
      id: `${repoName}.governance`,
      surface: 'veritas.governance',
      claimType: 'veritas-governance-artifact',
      fieldOrBehavior: 'governance artifact integrity',
      subjectType: 'repository',
      subjectId: repoName,
      impactLevel: 'high',
      verificationPolicyId: 'veritas.governance-artifact',
      createdAt: now,
      updatedAt: now,
    });
    policies.push(SURFACE_TRUST_POLICIES.governanceArtifact);
  }

  for (const command of proofLaneCommands) {
    const slug = command.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    claims.push({
      id: `${repoName}.proof.${slug}`,
      surface: 'veritas.proof-lane',
      claimType: 'software-proof',
      fieldOrBehavior: command,
      subjectType: 'repository',
      subjectId: repoName,
      impactLevel: 'high',
      verificationPolicyId: 'veritas.proof-lane',
      metadata: { command },
      createdAt: now,
      updatedAt: now,
    });
  }
  if (proofLaneCommands.length > 0) policies.push(SURFACE_TRUST_POLICIES.proofLane);

  return { claims, policies };
}
```

### `src/claims/init.mjs`

```javascript
export async function initClaimStore({ rootDir, repoName, dryRun = false }) {
  if (!dryRun && claimStoreExists(rootDir)) {
    throw new Error(
      'veritas.claims.json already exists. Use `veritas claim add` to add claims.'
    );
  }

  // Detect what's in the repo
  const adapterConfig = loadAdapterConfig({ rootDir });
  const proofLaneCommands = readDefaultProofLaneIds(rootDir)
    .map((id) => proofCommandsForLaneIds([id], rootDir)[0])
    .filter(Boolean);
  const hasGovernance = existsSync(resolve(rootDir, '.veritas/GOVERNANCE.md'));

  const { claims, policies } = buildBaselineClaims(repoName, {
    hasGovernance,
    proofLaneCommands,
  });

  const store = { schemaVersion: 1, producer: 'veritas', claims, policies };
  if (!dryRun) saveVeritasClaimStore(store, rootDir);
  return store;
}
```

---

## Phase 9: Veritas Evidence Collection Refactor (`src/surface/projection.mjs`)

This is the core architectural change. `buildSurfaceTrustInput` shifts from generating claims
to collecting evidence against pre-authored claims from the store.

**Key behavioral changes:**
- Claims come from `veritas.claims.json`, not from `record.affected_nodes` directly
- Evidence is generated per-run and bound to specific claim IDs from the store
- If a claim exists in the store but Veritas didn't touch that area in this run, the claim
  appears in the output with no new evidence — it retains its previous status via the
  existing staleness logic
- If an affected node has no matching claim in the store, it is silently skipped (not
  auto-generated). This is intentional: the app team must explicitly author the claim first.

**New structure of `buildSurfaceTrustInput`:**

```javascript
export function buildSurfaceTrustInput(record, { rootDir = process.cwd() } = {}) {
  registerVeritasExtension();  // idempotent
  const claimStore = loadVeritasClaimStore(rootDir);
  const assembler = createSurfaceTrustInputAssembler({
    source: `veritas:${record.run_id}`,
    schemaVersion: 2,
  });

  // All claims come from the store
  for (const def of claimStore.claims) {
    assembler.claims.push(claimDefToClaim(def, record));
  }
  for (const policy of claimStore.policies) {
    assembler.policies.push(policy);
  }

  // Evidence is collected per-run
  collectAffectedSurfaceEvidence(record, claimStore, assembler);
  collectProofLaneEvidence(record, claimStore, assembler);
  collectPolicyResultEvidence(record, claimStore, assembler);
  collectProofFamilyEvidence(record, claimStore, assembler);
  collectVerificationBudgetEvidence(record, claimStore, assembler);
  collectExternalToolEvidence(record, claimStore, assembler);
  collectGovernanceEvidence(record, claimStore, assembler);
  collectProposalEvidence(record, claimStore, assembler);

  return assembler.build();
}
```

Helper `claimDefToClaim(def, record)` maps a `ClaimDefinition` to a full `Claim`, adding
runtime fields from the current record:

```javascript
function claimDefToClaim(def, record) {
  return {
    ...def,
    status: def.status,
    currentIntegrityRef: record.source_ref ?? undefined,
    createdAt: def.createdAt,
    updatedAt: record.timestamp,
  };
}
```

Each `collect*` function:
1. Finds claims in the store by `claimType` (e.g., `'software-proof'`)
2. Matches them against the relevant run record data
3. Pushes evidence items referencing the matched `claim.id`

Example — `collectProofLaneEvidence`:

```javascript
function collectProofLaneEvidence(record, claimStore, assembler) {
  const proofClaims = claimStore.claims.filter((c) => c.claimType === 'software-proof');
  for (const lane of record.selected_proof_lanes ?? []) {
    const claim = proofClaims.find((c) => c.metadata?.command === lane.command);
    if (!claim) continue;
    const evidenceId = `${record.run_id}.proof.${lane.id}`;
    assembler.evidence.push({
      id: evidenceId,
      claimId: claim.id,
      evidenceType: 'test_output',
      method: 'validation',
      sourceRef: record.source_ref,
      excerptOrSummary: lane.result?.summary ?? `Proof lane "${lane.command}" ran in ${record.run_id}`,
      observedAt: record.timestamp,
      collectedBy: 'veritas',
      integrityRef: record.source_ref,
      passing: lane.result?.passed ?? undefined,
      blocking: lane.blocking ?? undefined,
      metadata: { lane },
    });
    if (lane.result?.passed === false) {
      assembler.events.push({
        id: `${record.run_id}.proof.${lane.id}.event`,
        claimId: claim.id,
        status: 'disputed',
        method: 'validation',
        evidenceIds: [evidenceId],
        createdAt: record.timestamp,
        verifiedAt: undefined,
      });
    } else if (lane.result?.passed === true) {
      assembler.events.push({
        id: `${record.run_id}.proof.${lane.id}.event`,
        claimId: claim.id,
        status: 'verified',
        method: 'validation',
        evidenceIds: [evidenceId],
        createdAt: record.timestamp,
        verifiedAt: record.timestamp,
      });
    }
  }
}
```

Remove all the original per-run claim-generation code that currently builds
`claims.push({...})` from `record.affected_nodes`, `proofLaneClaimIds`, etc.

---

## Phase 10: Veritas CLI — `veritas claim` Subcommand

### `src/cli/claims.mjs`

```javascript
import { loadVeritasClaimStore, saveVeritasClaimStore } from '../claims/store.mjs';
import * as Surface from '@kontourai/surface';

export async function runClaimCli(args, { rootDir = process.cwd() } = {}) {
  const [sub, ...rest] = args;
  if (sub === 'list')     return runClaimList(rest, rootDir);
  if (sub === 'add')      return runClaimAdd(rest, rootDir);
  if (sub === 'edit')     return runClaimEdit(rest, rootDir);
  if (sub === 'remove')   return runClaimRemove(rest, rootDir);
  if (sub === 'validate') return runClaimValidate(rest, rootDir);
  throw new Error(`Unknown claim subcommand: ${sub}`);
}

function runClaimList(args, rootDir) {
  const store = loadVeritasClaimStore(rootDir);
  if (store.claims.length === 0) {
    console.log('No claims defined. Run `veritas claim add` to create one.');
    return;
  }
  for (const claim of store.claims) {
    const type = resolveClaimTypeLabel(claim.claimType);
    console.log(`  ${claim.id}  [${type}]  ${claim.fieldOrBehavior}  (${claim.impactLevel ?? 'medium'})`);
  }
}

function runClaimAdd(args, rootDir) {
  const opts = parseClaimFlags(args);
  const now = new Date().toISOString();
  const claim = {
    id: opts.id ?? generateClaimId(opts),
    surface: opts.surface,
    claimType: opts.type,
    fieldOrBehavior: opts.field,
    subjectType: opts.subjectType,
    subjectId: opts.subjectId,
    impactLevel: opts.impact ?? 'medium',
    verificationPolicyId: opts.policyId,
    metadata: opts.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
  const store = loadVeritasClaimStore(rootDir);
  const updated = Surface.addClaimToStore(store, claim);
  saveVeritasClaimStore(updated, rootDir);
  console.log(`Added claim: ${claim.id}`);
}
```

Add `runClaimCli` export to `src/index.mjs` and wire up in `src/cli/index.mjs`:

```javascript
// In the CLI dispatch:
if (command === 'claim') return runClaimCli(rest, { rootDir });
```

---

## Phase 11: Documentation

### Surface — `docs/claim-authoring.md`

Cover:
- What `veritas.claims.json` is and why it lives in git
- `ClaimDefinition` schema reference (all fields, what each means)
- `ClaimStore` schema (schemaVersion, producer, claims, policies)
- `surface claim` command reference (list/add/edit/remove/validate)
- How the store feeds into `buildTrustReport`
- When to add a policy to the store vs using an existing one

### Surface — `docs/extension-api.md`

Cover:
- `registerExtension(extension)` — when and where to call it
- `SurfaceExtension` interface reference
- `ClaimTypeDefinition` — how to define custom claim types for the authoring modal
- `policyTemplates` — how pre-built policy configs work
- How vocab/theme flow through to dashboard rendering
- Code example: registering a minimal extension

### Surface — `docs/architecture.md`

Update the architecture diagram and description to reflect the three-layer model:

```
Application  →  veritas.claims.json  (authors claims, committed to git)
Veritas      →  evidence collection   (per CI run, against claim IDs from store)
Surface      →  trust derivation      (protocol, derives status from evidence)
```

Clarify that Surface's adapter system (`src/adapters/`) remains for non-Veritas producers
(npm-audit, fact-resolution, etc.) that still own their own claim generation.

### Veritas — `docs/claim-authoring.md`

Cover:
- `veritas init` — what it generates and when to run it
- `veritas claim list/add/edit/remove/validate` — command reference with examples
- Available claim types and when to use each (proof lane, governance artifact, external tool)
- How to link a claim to a policy
- How to add a custom metadata field to a claim

### Veritas — `docs/veritas-on-surface.md`

Cover:
- How Veritas uses Surface under the hood
- Why claim definitions are separate from evidence collection
- What happens per CI run: claims from store, evidence from tools
- How the dashboard is branded: Veritas extension registration
- How to customize branding for organizations that ship on top of Veritas

---

## Phase 12: Tests

### Surface — `tests/claim-store.test.ts`

```typescript
describe('loadClaimStore', () => {
  it('returns empty store when file does not exist');
  it('loads a valid store from disk');
  it('throws when schemaVersion is not 1');
  it('throws when claims is not an array');
});

describe('addClaimToStore', () => {
  it('adds a claim and returns new store');
  it('throws when claim id already exists');
  it('does not mutate the input store');
});

describe('updateClaimInStore', () => {
  it('updates mutable fields and bumps updatedAt');
  it('preserves id and createdAt');
  it('throws when claim id is not found');
  it('does not mutate the input store');
});

describe('removeClaimFromStore', () => {
  it('removes claim by id and returns new store');
  it('throws when claim id is not found');
  it('does not mutate the input store');
});

describe('validateClaimStore', () => {
  it('passes a well-formed store');
  it('throws for non-object input');
  it('throws for wrong schemaVersion');
});
```

### Surface — `tests/extension.test.ts`

```typescript
describe('registerExtension / getExtension', () => {
  it('registers an extension and retrieves it by name');
  it('overwrites an existing registration with the same name');
});

describe('resolveClaimTypeDefinition', () => {
  it('finds a claim type across registered extensions');
  it('returns undefined when not found');
});

describe('listExtensions', () => {
  it('returns all registered extensions');
});
```

### Surface — `tests/cli-write.test.ts`

Use a temp directory for all tests. Import `runCli` and call it directly.

```typescript
it('surface claim add creates veritas.claims.json in cwd');
it('surface claim add generates id when not provided');
it('surface claim add --id <id> uses provided id');
it('surface claim list prints claim ids');
it('surface claim edit updates a field');
it('surface claim remove deletes the claim');
it('surface claim validate passes a clean store');
it('surface claim validate reports missing policy reference');
```

### Veritas — `tests/claim-store.test.mjs`

```javascript
it('loadVeritasClaimStore returns empty store when file missing');
it('saveVeritasClaimStore writes valid JSON');
it('round-trip: save then load returns equal store');
```

### Veritas — `tests/projection-with-store.test.mjs`

```javascript
it('buildSurfaceTrustInput reads claims from store');
it('evidence is generated per-run against store claim ids');
it('proof lane claim is verified when lane passes');
it('proof lane claim is disputed when lane fails');
it('affected node without matching claim is skipped (not auto-generated)');
it('claim with no matching evidence this run still appears in output');
```

---

## Phase 13: Verification Steps

Run these in order after implementation to confirm correctness end-to-end.

1. **Surface build** — `npm run build` in `surface/` passes with no TypeScript errors.
2. **Surface tests** — `npm test` in `surface/` — all new and existing tests pass.
3. **Veritas build** — `npm run build` (or equivalent) in `veritas/` passes.
4. **Veritas tests** — all new and existing tests pass.
5. **`veritas init`** — run in a test repo with existing adapter config and proof lanes.
   Confirm `veritas.claims.json` is created with the expected claims + policies.
6. **`veritas claim list`** — prints the claims from the generated file.
7. **`veritas claim add`** — adds a new claim, re-run `list` to confirm.
8. **`veritas run`** — in the same test repo. Confirm the dashboard read model includes:
   - All claims from `veritas.claims.json`
   - Evidence IDs referencing store claim IDs (not generated IDs)
   - Proof lane claims are `verified` when the lane passed, `disputed` when it failed
9. **Dashboard branding** — start `surface dashboard` with the Veritas read model.
   Confirm no "Surface" references appear in the UI; all labels use Veritas vocab.
10. **Dashboard authoring** — click "+ Add claim", fill the modal, save.
    Confirm `veritas.claims.json` is updated on disk.
    Confirm the new claim appears in the feed after a re-run.
11. **Edit and delete** — open a claim detail, edit a field, confirm store updated.
    Delete a claim, confirm removed from store.
12. **Claim with no evidence** — add a claim with no matching proof lane or affected node
    in the next run. Confirm it appears in the dashboard as `unknown` or `proposed`,
    not absent.
13. **Derived trust status** — a proof lane claim with a failed lane is `disputed`, not
    `verified`, regardless of any producer-declared status.

---

## What NOT to Change

- `buildTrustReport` in `src/report.ts` — core derivation pipeline, unchanged.
- `validateTrustInput` in `src/validate.ts` — stays as the validation boundary.
- `deriveTrustStatus` in `src/status.ts` — enhanced by Phase 5 but architecturally unchanged.
- Surface's adapter system (`src/adapters/`) — stays for non-Veritas producers. npm-audit,
  fact-resolution, and field-attested-records adapters continue to generate their own claims
  and are unaffected by the claim store work.
- `writeSurfaceDashboardReadModel` in Veritas — stays. It reads from the assembled trust input
  which now comes from the store. No changes needed to its output format.
- The Surface dashboard read-only query paths — `surface get`, `surface stale`, `surface missing`,
  `surface policy`, `surface report` — all stay as-is. They read from the same trust report.
- `buildSurfaceDashboardReadModel` in Veritas — minor update only to include `claimInputPaths`
  pointing to `veritas.claims.json`. No structural changes.
