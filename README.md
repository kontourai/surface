# Kontour Surface

**Show your work. Earn trust.**

[![npm](https://img.shields.io/npm/v/%40kontourai%2Fsurface)](https://www.npmjs.com/package/@kontourai/surface)
[![CI](https://github.com/kontourai/surface/actions/workflows/ci.yml/badge.svg)](https://github.com/kontourai/surface/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Every product makes claims: *this record is current, this number came from a verified source, this code change passed the required checks.* AI makes those claims faster, more polished, and harder to review — and lets agents act on them at a speed no human review layer can match.

Surface is the shared foundation under Kontour's products — and any product that needs to show its work. Surface connects evidence provenance to the claims products ask users and agents to trust. It gives products a portable way to expose material claims, evidence traces, freshness, conflicts, and transparency gaps without collapsing them into a trust score.

The result is a point-in-time **Trust Snapshot** that a person, another system, or an AI agent can inspect before relying on a claim: what is asserted, what supports it, how current that support is, and what is still missing or in dispute.

## Who builds with it

- **AI code governance** — [Veritas](https://github.com/kontourai/veritas) authors claims about repo areas, collects evidence per run, and lets reviewers (and agents) see exactly which claims this run's evidence supports — and which went stale when the code changed.
- **Field-attested public records** — a data directory maps crawled fields and human attestations into per-field claims, so "verified" means *this field, this source, this date* instead of a badge on the whole record.
- **Fact resolution** — a financial workflow keeps user-verified facts and document-imported values in the same report, with conflicts visibly disputed instead of averaged into a confidence score.
- **Dependency audits** — `npm audit` output becomes evidence behind a "safe to install" claim with a freshness window and a trace to the exact run.
- **Agent guardrails** — agents query stale claims, missing evidence, and policy gaps through the CLI, the JSON report, or the built-in [MCP server](docs/reference/mcp.md), and apply the discipline the kernel derives: act on verified, reverify stale, escalate disputed.

Each of these ships as a runnable fixture in [`examples/`](docs/reference/fixtures.md). The deeper narratives are in [Use Cases](docs/product/use-cases.md).

## What Surface is not

Surface is not a promise of perfect truth, a certification business, or a hosted-only evidence collector. Producers collect domain evidence and make domain decisions. Surface defines the open trust format, derives portable trust state, and makes that state inspectable through reports, a Trust Panel, the Surface Console, APIs, and agent-readable resources. If a claim is weak, stale, or disputed, Surface makes that obvious instead of papering over it.

---

## Quickstart

```bash
npm install -D @kontourai/surface
npx surface report --format summary
```

The default report reads [examples/surface-fixtures.json](examples/surface-fixtures.json), derives claim statuses, and emits a local trust report — the basis for a point-in-time Trust Snapshot:

```text
Kontour Surface report surface-1779196544815
Source: kontour-surface-validation-fixtures
Claims: 4 (unknown: 1, verified: 2, stale: 1)
Surfaces: repo-governance.developer-evidence: 1, field-attested-records.public-data: 1, fact-resolution.financial-facts: 1, surface.roadmap: 1
High-impact unsupported: none
```

For a step-by-step tour of the output, see the [Walkthrough](docs/guides/walkthrough.md).

## Emit your first claims

Any system that can emit a `TrustInput` is a producer. The fluent SDK keeps the shape honest:

```ts
import { TrustInputBuilder, buildTrustReport } from "@kontourai/surface";

const input = new TrustInputBuilder({ source: "my-producer:local" })
  .addClaim({
    id: "claim.api.rate-limit",
    subjectType: "api",
    subjectId: "public-api",
    claimType: "software-evidence",
    surface: "api",
    fieldOrBehavior: "rate limit is enforced",
    value: "100 requests/minute",
    currentIntegrityRef: "commit:abc123",
  })
  .addEvidence({
    id: "evidence.api.rate-limit.test",
    claimId: "claim.api.rate-limit",
    evidenceType: "test_output",
    method: "validation",
    sourceRef: "ci:1847",
    excerptOrSummary: "Rate-limit tests passed.",
    integrityRef: "commit:abc123",
  })
  .addEvent({
    id: "event.api.rate-limit.verified",
    claimId: "claim.api.rate-limit",
    status: "verified",
    actor: "ci",
    method: "npm test",
    evidenceIds: ["evidence.api.rate-limit.test"],
  })
  .build();

const report = buildTrustReport(input);
```

A claim is only `verified` when a verification event and its policy-required evidence support it. When the integrity ref changes, the claim surfaces as changed-since-verified instead of silently staying green. See the [Consumer SDK guide](docs/guides/consumer-sdk.md).

## Query trust state

```bash
npx surface report --input my-export.json --format summary   # human-readable rollup
npx surface report --input my-export.json --format analytics # provenance-aware analytics projection
npx surface stale  --input my-export.json                    # claims whose verification aged out
npx surface missing --input my-export.json                   # claims missing required evidence
npx surface policy --claim-id claim.api.rate-limit --input my-export.json
npx surface console                                          # local operator workspace, no cloud, no login
npx surface mcp --input my-export.json                       # serve trust state to agents over MCP (stdio)
```

The full command surface, flags, and output contracts are in the [CLI reference](docs/reference/cli.md); the local Console is documented in the [Surface Console reference](docs/reference/console.md) and the agent tools in [Agents and MCP](docs/reference/mcp.md).

## Show it to your users

- **Trust Panel embed** — ship the dependency-free [`<surface-trust-panel>`](docs/reference/trust-panel.md) element so viewers can inspect claims, evidence, freshness, and gaps inside your product.
- **Snapshot Viewer** — paste any derived report into the [hosted viewer](https://kontourai.github.io/surface/viewer.html); parsing happens entirely in the browser.
- **Built with Surface badge** — the [inspectability signal](docs/specs/built-with-surface-badge.md): your product exposes inspectable trust state, with no certification implied.
- **Conformance** — alternate implementations of the [Open Trust Format](docs/specs/open-trust-format.md) can verify they derive the same trust state with the [conformance suite](docs/specs/conformance.md).

## Public package surface

The npm package exposes one stable module entrypoint:

```ts
import {
  TrustInputBuilder,
  buildTrustReport,
  validateTrustInput,
} from "@kontourai/surface";
```

The package also ships the `surface` CLI, JSON schemas under `schemas/`, examples, docs, and TypeScript declarations. Internal files under `dist/src/` are included so the exported module graph can run, but consumers should import from `@kontourai/surface` rather than deep `dist/` paths. The package contents guard in `scripts/check-package-contents.mjs` keeps generated test output, local docs-site output, scripts, and source files out of the published tarball.

## What sits on top

Surface is a foundation product. Anything that needs to answer "what claims are visible, what supports them, and what gaps remain?" can build with it.

**Veritas** — a repo-local governance product built with Surface for AI-assisted code changes. Veritas authors and projects claims, collects evidence per run, and maps repo standards into Surface claim groups so a reviewer can start from a framework/requirement view and drill into the exact claim and evidence. See [Use Cases](docs/product/use-cases.md).

**Custom producers** — any system that emits `TrustInput` can use Surface for report generation, status derivation, and the Surface Console. Product artifacts may embed `surface.input` directly; Surface remains responsible for generated report fields. Start with the [external adapter example](examples/external-adapter/README.md).

The dependency direction is one-way: producers depend on Surface; Surface does not depend on any producer's runtime.

## Local development

```bash
npm install
npm run setup:repo-hooks
npm run validate:repo-hooks
npm run verify
npm run surface:summary
```

`npm run setup:repo-hooks` configures this clone's local Git config with `core.hooksPath=.githooks`. The repo-owned pre-push hook is contributor tooling: it runs local verification before push, can be repaired by rerunning setup, and does not define Surface Console, projection, Trust Snapshot, runtime adapter, producer, or product behavior. See [Repo Hooks](docs/maintenance/repo-hooks.md).

### Repository layout

- `bin/` — package CLI launcher; `surface` resolves here before loading built code from `dist/`.
- `src/` — TypeScript Surface library, CLI implementation, derivation kernel, reporting, adapters, and Console runtime.
- `src/adapters/` — built-in adapter registry and native `surface` passthrough adapter.
- `src/console/` — local Surface Console server, read-model projection, editable dependency-free UI assets, and generated asset constants.
- `schemas/` — JSON schema contracts for Surface inputs, reports, policies, evidence, and events.
- `examples/` — sample Surface inputs and package-shaped producer examples.
- `examples/external-adapter/` — canonical external adapter example for product-owned producer logic.
- `tests/` — Node test coverage for library, CLI, adapter, Console, and docs behavior.
- `tests/browser/` — Playwright coverage for the generated docs site and the standalone Surface Console.
- `docs/` — source documentation. Some pages publish to the generated site; repo-only references stay here.
- `scripts/` — repo maintenance, docs build, package-boundary, content-boundary, and hook setup scripts.
- `.github/workflows/` — CI and GitHub Pages publishing workflow definitions.
- `.githooks/` — repo-owned local Git hooks installed by `npm run setup:repo-hooks`.
- `dist/` — generated TypeScript build output from `npm run build`; do not edit directly.
- `docs-site/` — generated GitHub Pages output from `npm run docs:build`; curated public subset, not source.
- `test-results/` — local Playwright/test artifacts; ignored and safe to regenerate.

Ignored local/generated directories such as `node_modules/`, `.surface/`, `.flow-agents/`, `dist/`, `docs-site/`, `test-results/`, and `playwright-report/` should be regenerated from source commands rather than reviewed as product source.

## Documentation

- [Getting Started](docs/guides/getting-started.md) — install Surface, run a fixture report, and build a first producer
- [Walkthrough](docs/guides/walkthrough.md) — real session with native Surface input
- [Use Cases](docs/product/use-cases.md) — real-world scenarios grounded in shipped fixtures
- [Concepts](docs/product/concepts.md) — trust vocabulary, claim groups, transparency gaps, and status model
- [Consumer SDK](docs/guides/consumer-sdk.md) — fluent helpers for emitting valid `TrustInput`
- [CLI](docs/reference/cli.md) — shipped report, query, and claim commands
- [Agents and MCP](docs/reference/mcp.md) — trust-state tools over the Model Context Protocol
- [Surface Console](docs/reference/console.md) — local operator workspace reference
- [Trust Panel Embed](docs/reference/trust-panel.md) — read-only web component for derived reports
- [Claim Authoring](docs/reference/claim-authoring.md) — authored claim stores and `surface claim` write commands
- [Extension API](docs/reference/extension-api.md) — producer branding, vocabulary, and claim type definitions
- [Schemas](docs/reference/schemas.md) — claim, evidence, policy, event, and report contracts
- [Architecture](docs/architecture/index.md) — kernel, adapters, and product boundaries
- [Developer Architecture](docs/architecture/developer-architecture.md) — trust/evidence flow and cross-product boundaries
- [External Adapter Example](examples/external-adapter/README.md) — minimal package-shaped producer

The published docs site is generated from these sources by `npm run docs:build`; see [docs/README.md](docs/README.md) for the full maintainer index.

## License

[Apache-2.0](LICENSE)
