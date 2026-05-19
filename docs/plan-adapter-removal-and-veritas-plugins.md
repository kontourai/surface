# Plan: Adapter Removal and Veritas Plugin API

## Context

Builds directly on `docs/plan-claim-authorship-and-extensibility.md`, which is now implemented.

The Surface adapter system allowed third-party tool output (npm audit, etc.) to be adapted into
Surface's trust model in a single pass — generating both claims and evidence together. This
conflicts with the architectural model established by the previous plan, where claims are
authored by the application and evidence is collected per run.

This plan:
1. Removes the built-in Surface adapters (npm-audit, field-attested-records, fact-resolution)
2. Retains the adapter registry API for any custom producers that still need it
3. Adds a Veritas plugin API so third parties can ship authoritative evidence importers
4. Migrates the npm-audit adapter logic to a reference plugin example

The core principle: **tool vendors own the evidence mapping for their tools**. A plugin authored
by npm carries more trust than one written by an application team who had to reverse-engineer the
output format.

---

## Repository Layout

```
surface/
  src/
    adapters/
      builtin.ts              MODIFIED — remove npm-audit, fact-resolution, field-attested-records; keep surface passthrough only
      npm-audit.ts            DELETED
      index.ts                MODIFIED — remove npm-audit export
    cli.ts                    MODIFIED — remove npm-audit/fact-resolution/field-attested-records from help and arg parsing
  examples/
    adapters/                 DELETED — fact-resolution.ts and field-attested-records.ts
    veritas-plugins/          NEW — reference plugin implementations
      npm-audit.mjs           NEW — npm-audit migrated as a reference Veritas plugin
  tests/
    adapter-registry.test.ts  MODIFIED — remove tests for removed built-ins
    cross-domain-adapters.test.ts  DELETED — these tested the removed example adapters
  docs/
    adapters.md               MODIFIED — document migration path; note adapters are for custom producers only

veritas/
  src/
    plugins/
      registry.mjs            NEW — plugin register/get/list
      loader.mjs              NEW — load plugins from veritas config
      interface.d.ts          NEW — JSDoc/TypeScript interface for a VeritasPlugin
    surface/
      projection.mjs          MODIFIED — call plugin importers after built-in evidence collectors
    cli/
      index.mjs               MODIFIED — add `veritas plugin list` subcommand
      claims.mjs              MODIFIED — add `veritas claim scaffold --plugin <name>` subcommand
  tests/
    plugins.test.mjs          NEW
  docs/
    plugin-authoring.md       NEW
```

---

## Section 1: Remove Surface Built-in Adapters

### `src/adapters/builtin.ts`

Remove all registrations except the `surface` passthrough:

```typescript
import { registerAdapter } from "../adapter.js";
import type { TrustInput } from "../types.js";

registerAdapter({
  name: "surface",
  defaultFixture: "examples/surface-fixtures.json",
  adapt(record: unknown): TrustInput {
    return record as TrustInput;
  },
});
```

Rationale for keeping `surface`: it is the default adapter for `surface report` with no
`--adapter` flag. It accepts pre-formatted Surface input directly and is needed for testing and
for any producer that already emits valid `TrustInput` JSON.

### `src/adapters/npm-audit.ts` — DELETE

The evidence collection logic is migrated to `examples/veritas-plugins/npm-audit.mjs` (see
Section 4).

### `src/adapters/index.ts` — MODIFY

Remove the `NpmAuditVulnerability`, `NpmAuditReport`, and `adaptNpmAuditReportToTrustInput`
exports.

### `examples/adapters/` — DELETE

`fact-resolution.ts` and `field-attested-records.ts` are demo adapters that no longer serve
a purpose now that claim authorship is separate from evidence collection. Delete the directory.

### `src/cli.ts` — UPDATE help text

Remove `npm-audit`, `field-attested-records`, and `fact-resolution` from the help output and
from the `--adapter` validation. The only supported value remains `surface` (the default).

Update `printHelp()`:
```
surface report [--input examples/surface-fixtures.json] [--format json|summary|linked|analytics]
surface report --adapter <name> --input <file>   (for custom registered adapters)
```

Remove the three explicit `surface report --adapter <name>` examples from help.

### Tests — `tests/adapter-registry.test.ts`

Remove the tests that assert on the built-in adapters (`npm-audit`, `field-attested-records`,
`fact-resolution`). Keep:
- Test that `registerAdapter` registers a new adapter
- Test that `registerAdapter` throws on duplicate name
- Test that `getAdapter("surface")` returns the passthrough
- Test that unknown adapter throws a clear error

### Tests — `tests/cross-domain-adapters.test.ts` — DELETE

This file tests the `field-attested-records` and `fact-resolution` example adapters end-to-end.
Both are being removed. Delete the file and any fixtures it depends on exclusively.

---

## Section 2: Veritas Plugin Interface

### `src/plugins/interface.d.ts`

TypeScript-compatible JSDoc interface for a Veritas plugin. This is the contract third parties
implement.

```typescript
export interface VeritasPluginClaimType {
  id: string;
  displayName: string;
  description: string;
  defaultImpact: 'low' | 'medium' | 'high' | 'critical';
  defaultSurface?: string;
  policyTemplateId?: string;
  metadataFields?: Array<{
    key: string;
    label: string;
    type: 'string' | 'boolean' | 'number';
    required?: boolean;
    hint?: string;
  }>;
}

export interface VeritasPluginEvidence {
  id: string;
  claimId: string;
  evidenceType: string;
  method: string;
  sourceRef?: string;
  excerptOrSummary: string;
  observedAt: string;
  passing?: boolean;
  blocking?: boolean;
  metadata?: Record<string, unknown>;
}

export interface VeritasPluginImportContext {
  runId: string;
  sourceRef?: string;
  timestamp: string;
  rootDir: string;
}

export interface VeritasPlugin {
  /** Unique package-scoped name, e.g. '@npm/veritas-plugin' */
  name: string;
  version: string;
  /** Author attribution — shown in dashboard and evidence metadata */
  author: {
    name: string;
    url?: string;
  };
  /** Claim types this plugin can provide evidence for */
  claimTypes: VeritasPluginClaimType[];
  /** Optional policy templates keyed by claimType id */
  policyTemplates?: Record<string, object>;
  /**
   * Primary entry point. Given the raw tool output file content and
   * the set of matching claims from the store, return evidence items.
   * Return an empty array if the tool output is unavailable or irrelevant.
   */
  importEvidence(
    rawOutput: string,
    claims: object[],
    context: VeritasPluginImportContext,
  ): VeritasPluginEvidence[];
  /**
   * Optional. Build default claim definitions for a new repo.
   * Used by `veritas claim scaffold --plugin <name>`.
   */
  scaffoldClaims?(repoName: string, options?: Record<string, unknown>): object[];
}
```

A plugin is a plain ESM module with a default export satisfying this interface. No base class,
no framework.

---

## Section 3: Veritas Plugin Registry (`src/plugins/registry.mjs`)

```javascript
const registry = new Map();

export function registerPlugin(plugin) {
  if (!plugin?.name) throw new Error('Plugin must have a name');
  registry.set(plugin.name, plugin);
}

export function getPlugin(name) {
  return registry.get(name);
}

export function listPlugins() {
  return [...registry.values()];
}
```

---

## Section 4: Veritas Plugin Loader (`src/plugins/loader.mjs`)

Reads the `plugins` array from the Veritas adapter config (`.veritas/repo.adapter.json` or the
config loaded by `loadAdapterConfig`) and dynamically imports each plugin package.

Plugin config format in `repo.adapter.json`:

```json
{
  "plugins": [
    { "package": "@npm/veritas-plugin", "inputFile": "npm-audit.json" },
    { "package": "@snyk/veritas-plugin", "inputFile": ".snyk-report.json" }
  ]
}
```

`inputFile` is relative to `rootDir`. If the file doesn't exist, the plugin's `importEvidence`
receives an empty string and is expected to return `[]`.

```javascript
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { registerPlugin, listPlugins } from './registry.mjs';

export async function loadPluginsFromConfig(adapterConfig, rootDir = process.cwd()) {
  const pluginEntries = adapterConfig?.plugins ?? [];
  for (const entry of pluginEntries) {
    if (!entry.package) continue;
    try {
      const mod = await import(entry.package);
      const plugin = mod.default ?? mod;
      plugin._inputFile = entry.inputFile ?? null;  // stash for collection step
      registerPlugin(plugin);
    } catch (error) {
      throw new Error(`Failed to load Veritas plugin "${entry.package}": ${error.message}`);
    }
  }
}

export function collectPluginEvidence(claimStore, context) {
  const evidence = [];
  for (const plugin of listPlugins()) {
    const matchingClaims = claimStore.claims.filter((claim) =>
      plugin.claimTypes.some((ct) => ct.id === claim.claimType)
    );
    if (matchingClaims.length === 0) continue;

    let rawOutput = '';
    if (plugin._inputFile) {
      const inputPath = resolve(context.rootDir, plugin._inputFile);
      if (existsSync(inputPath)) {
        rawOutput = readFileSync(inputPath, 'utf8');
      }
    }

    const pluginEvidence = plugin.importEvidence(rawOutput, matchingClaims, context);
    for (const item of pluginEvidence) {
      evidence.push({
        ...item,
        metadata: {
          ...item.metadata,
          _plugin: { name: plugin.name, version: plugin.version, author: plugin.author },
        },
      });
    }
  }
  return evidence;
}
```

The `_plugin` field in evidence metadata is the "verified by the author" signal. The dashboard
can surface this: evidence collected via `@npm/veritas-plugin` by npm, Inc. is visually
distinguished from hand-rolled evidence.

---

## Section 5: Integrate Plugins into `projection.mjs`

In `buildSurfaceTrustInput`, after all `collect*Evidence` calls, add a plugin evidence step:

```javascript
export async function buildSurfaceTrustInput(record, { rootDir = process.cwd() } = {}) {
  registerVeritasExtension();
  const adapterConfig = loadAdapterConfig({ rootDir });
  await loadPluginsFromConfig(adapterConfig, rootDir);  // idempotent after first load

  const claimStore = loadVeritasClaimStore(rootDir);
  // ... existing assembler setup and collect* calls ...

  const pluginContext = {
    runId: record.run_id,
    sourceRef: record.source_ref,
    timestamp: record.timestamp,
    rootDir,
  };
  for (const item of collectPluginEvidence(claimStore, pluginContext)) {
    evidence.push(item);
  }

  // ... existing assembler.build() call ...
}
```

`buildSurfaceTrustInput` becomes `async` to support dynamic plugin imports.
Update all callers of `buildSurfaceTrustInput` in Veritas to `await` it.

---

## Section 6: Reference Plugin Example (`examples/veritas-plugins/npm-audit.mjs`)

Move the npm-audit adapter logic from Surface into a standalone example plugin. This serves as
the canonical reference for third parties writing Veritas plugins.

```javascript
/**
 * Reference Veritas plugin: npm audit
 * Demonstrates how to migrate a Surface adapter to a Veritas plugin.
 */
export default {
  name: 'npm-audit-example',
  version: '1.0.0',
  author: { name: 'Surface example (not affiliated with npm)', url: 'https://github.com/kontourai/surface' },

  claimTypes: [
    {
      id: 'package-version-safety',
      displayName: 'Package version safety',
      description: 'No critical or high vulnerabilities in npm dependencies.',
      defaultImpact: 'high',
      defaultSurface: 'security.dependencies',
      policyTemplateId: 'npm-audit.package-version-safety',
      metadataFields: [
        { key: 'auditFile', label: 'npm audit output file', type: 'string',
          hint: 'Path to npm audit --json output, relative to repo root' },
      ],
    },
  ],

  policyTemplates: {
    'npm-audit.package-version-safety': {
      claimType: 'package-version-safety',
      requiredEvidence: ['policy_rule'],
      requiredMethods: ['validation'],
      requiresCorroboration: false,
      reviewAuthority: 'package manager audit',
      validityRule: { kind: 'duration', durationDays: 1 },
      stalenessTriggers: ['new npm advisory', 'dependency version changes', 'lockfile changes'],
      conflictRules: ['present vulnerability rejects package-version safety'],
      impactLevel: 'high',
    },
  },

  importEvidence(rawOutput, claims, context) {
    if (!rawOutput) return [];
    let report;
    try { report = JSON.parse(rawOutput); } catch { return []; }
    const vulnerabilities = report.vulnerabilities ?? {};
    const evidence = [];

    for (const claim of claims) {
      const evidenceId = `${context.runId}.npm-audit.${claim.id}`;
      const criticalCount = countBySeverity(vulnerabilities, 'critical');
      const highCount = countBySeverity(vulnerabilities, 'high');
      const passing = criticalCount === 0 && highCount === 0;
      evidence.push({
        id: evidenceId,
        claimId: claim.id,
        evidenceType: 'policy_rule',
        method: 'validation',
        sourceRef: context.sourceRef,
        excerptOrSummary: passing
          ? 'npm audit found no critical or high vulnerabilities.'
          : `npm audit found ${criticalCount} critical and ${highCount} high vulnerabilities.`,
        observedAt: context.timestamp,
        passing,
        blocking: !passing,
      });
    }
    return evidence;
  },

  scaffoldClaims(repoName) {
    const now = new Date().toISOString();
    return [{
      id: `${repoName}.security.npm-audit`,
      surface: 'security.dependencies',
      claimType: 'package-version-safety',
      fieldOrBehavior: 'no critical or high npm vulnerabilities',
      subjectType: 'repository',
      subjectId: repoName,
      impactLevel: 'high',
      verificationPolicyId: 'npm-audit.package-version-safety',
      createdAt: now,
      updatedAt: now,
    }];
  },
};

function countBySeverity(vulnerabilities, severity) {
  return Object.values(vulnerabilities).filter((v) => v.severity === severity).length;
}
```

---

## Section 7: Dashboard — Plugin Attribution

In `src/dashboard/script.ts`, update `showClaimDetail` to show plugin attribution when evidence
has `metadata._plugin`:

```typescript
// In the evidence section of the detail sheet:
const plugin = evidence.metadata?._plugin;
if (plugin) {
  const attribution = document.createElement('p');
  attribution.className = 'plugin-attribution';
  attribution.textContent = `Evidence collected via ${plugin.name} by ${plugin.author.name}`;
  evidenceSection.appendChild(attribution);
}
```

In `src/dashboard/styles.ts`, add:
```css
.plugin-attribution {
  font-size: .75rem;
  color: var(--s-muted);
  border-left: 2px solid var(--s-accent, #6366f1);
  padding-left: .5rem;
  margin-top: .25rem;
}
```

---

## Section 8: Veritas CLI Additions

### `veritas plugin list`

In `src/cli/index.mjs`, add dispatch for `plugin`:

```javascript
if (command === 'plugin') {
  const sub = args[0];
  if (sub === 'list') {
    const plugins = listPlugins();
    if (plugins.length === 0) {
      console.log('No plugins loaded. Add plugins to .veritas/repo.adapter.json.');
    } else {
      for (const p of plugins) {
        console.log(`  ${p.name}@${p.version}  by ${p.author.name}`);
        for (const ct of p.claimTypes) {
          console.log(`    claim type: ${ct.id}  (${ct.displayName})`);
        }
      }
    }
    return;
  }
  throw new Error(`Unknown plugin subcommand: ${sub}. Use: list`);
}
```

### `veritas claim scaffold --plugin <name>`

In `src/cli/claims.mjs`, add a `scaffold` subcommand:

```javascript
if (sub === 'scaffold') {
  const pluginName = parseFlag(rest, '--plugin');
  if (!pluginName) throw new Error('veritas claim scaffold requires --plugin <name>');
  const plugin = getPlugin(pluginName);
  if (!plugin) throw new Error(`Plugin "${pluginName}" is not loaded. Check your repo.adapter.json.`);
  if (!plugin.scaffoldClaims) throw new Error(`Plugin "${pluginName}" does not support claim scaffolding.`);

  const adapterConfig = loadAdapterConfig({ rootDir });
  const repoName = adapterConfig?.repo?.name ?? basename(rootDir);
  const scaffolded = plugin.scaffoldClaims(repoName);

  const store = loadVeritasClaimStore(rootDir);
  let updated = store;
  let added = 0;
  for (const claim of scaffolded) {
    if (!updated.claims.some((c) => c.id === claim.id)) {
      updated = Surface.addClaimToStore(updated, claim);
      added++;
    }
  }
  saveVeritasClaimStore(updated, rootDir);
  console.log(`Scaffolded ${added} claim(s) from plugin ${pluginName}.`);
  return;
}
```

---

## Section 9: Documentation

### Surface — `docs/adapters.md` (update)

Rename the scope: adapters remain for custom producers that own their own claim generation
(not using the claim store pattern). The built-in examples are removed. Add a migration note
pointing to Veritas plugins for anyone who was using `--adapter npm-audit`.

### Veritas — `docs/plugin-authoring.md` (new)

- What a Veritas plugin is
- The `VeritasPlugin` interface field by field
- How to register a plugin in `repo.adapter.json`
- How `importEvidence` receives its inputs and what it should return
- The "verified by the author" signal — how plugin attribution shows in the dashboard
- How to scaffold claims with `veritas claim scaffold --plugin <name>`
- Reference to `examples/veritas-plugins/npm-audit.mjs`

---

## Section 10: Tests

### Surface — `tests/adapter-registry.test.ts` (update)

Remove tests asserting on `npm-audit`, `fact-resolution`, `field-attested-records` being
registered by default. Keep:
- `registerAdapter` registers and retrieves an adapter
- Duplicate registration throws
- `getAdapter("surface")` returns the passthrough
- `surface report --adapter unknown` throws a clear error

### Remove `tests/cross-domain-adapters.test.ts`

Delete entirely. The adapters it tests are removed.

### Veritas — `tests/plugins.test.mjs` (new)

```javascript
it('registerPlugin adds a plugin to the registry');
it('getPlugin retrieves a plugin by name');
it('listPlugins returns all registered plugins');
it('collectPluginEvidence calls importEvidence for matching claim types');
it('collectPluginEvidence skips plugins with no matching claims in store');
it('collectPluginEvidence attaches _plugin attribution to evidence metadata');
it('collectPluginEvidence returns empty array when input file is missing');
it('scaffoldClaims from reference npm-audit plugin returns valid claim definitions');
```

---

## Verification Steps

1. `npm run build` in `surface/` — passes with no errors.
2. `npm test` in `surface/` — all tests pass; no adapter tests for removed adapters.
3. `surface report --input examples/surface-fixtures.json` — works (uses `surface` passthrough).
4. `surface report --adapter npm-audit` — throws: `Unknown adapter: npm-audit`.
5. Veritas build — passes.
6. Veritas tests — all pass including new plugin tests.
7. Load `examples/veritas-plugins/npm-audit.mjs` as a plugin via test config, run
   `collectPluginEvidence` against a sample `npm-audit.json` — returns evidence with `_plugin`
   attribution.
8. `veritas plugin list` — lists loaded plugins.
9. `veritas claim scaffold --plugin npm-audit-example` — adds the npm-audit claim to
   `veritas.claims.json`.
10. Dashboard shows plugin attribution on evidence collected via a plugin.

---

## What NOT to Change

- `src/adapter.ts` (the registry API) — stays; custom producers may still use it.
- The `surface` passthrough adapter — stays as the default for `surface report`.
- `src/adapters/builtin.ts` registration of `surface` — stays.
- Any Surface test that does not reference the removed adapters.
- Veritas's built-in `collect*Evidence` functions — these are first-party evidence collection
  and are not affected by the plugin system. Plugins augment them; they do not replace them.
