# Changelog

## [2.7.0](https://github.com/kontourai/surface/compare/v2.6.0...v2.7.0) (2026-07-12)


### Features

* **counterfactual:** add derived trust impact traversal ([#17](https://github.com/kontourai/surface/issues/17)) ([#140](https://github.com/kontourai/surface/issues/140)) ([ff7aff5](https://github.com/kontourai/surface/commit/ff7aff591471c744de969afbeef42de9f09f0e9d))

## [2.6.0](https://github.com/kontourai/surface/compare/v2.5.0...v2.6.0) (2026-07-12)


### Features

* **console:** add Claim Detail Projection; render detail sheet from projected fields ([#4](https://github.com/kontourai/surface/issues/4)) ([#138](https://github.com/kontourai/surface/issues/138)) ([e10cfd8](https://github.com/kontourai/surface/commit/e10cfd8c44193d719870a7c309a15dc3787e77b8))
* **evaluation:** centralize claim evidence/policy satisfaction facts ([#1](https://github.com/kontourai/surface/issues/1)) ([#136](https://github.com/kontourai/surface/issues/136)) ([880a7da](https://github.com/kontourai/surface/commit/880a7da6429900f489afb16d202849702fa62dbb))


### Refactoring

* **console:** extract SurfaceConsoleRuntime from the HTTP server ([#2](https://github.com/kontourai/surface/issues/2)) ([#139](https://github.com/kontourai/surface/issues/139)) ([df89652](https://github.com/kontourai/surface/commit/df89652767861cb22d99bee8c21d2004da660c60))

## [2.5.0](https://github.com/kontourai/surface/compare/v2.4.0...v2.5.0) (2026-07-12)


### Features

* **derivation:** optional sensitivity range on DerivationEdge ([#24](https://github.com/kontourai/surface/issues/24)) ([#135](https://github.com/kontourai/surface/issues/135)) ([ca782fe](https://github.com/kontourai/surface/commit/ca782fe2df53b518632465a5929ff485d224dd88))


### Documentation

* gate-filtered learning principle — learners consume only verified claims ([#121](https://github.com/kontourai/surface/issues/121)) ([#131](https://github.com/kontourai/surface/issues/131)) ([54fbd0e](https://github.com/kontourai/surface/commit/54fbd0ed72913bb546e22ed3b1b0d5d7d0d5f9cc))
* **status:** document `revoked`, the 9th trust status, + conformance case ([#134](https://github.com/kontourai/surface/issues/134)) ([a63f5cc](https://github.com/kontourai/surface/commit/a63f5cc2d641da5a0fbd77229b7ad82eea5d7d28))


### Refactoring

* **validate:** extract per-record shape validators ([#3](https://github.com/kontourai/surface/issues/3)) ([#133](https://github.com/kontourai/surface/issues/133)) ([d24e8df](https://github.com/kontourai/surface/commit/d24e8df5b20d6b052000dec2824d10c5db0de511))

## [2.4.0](https://github.com/kontourai/surface/compare/v2.3.0...v2.4.0) (2026-07-10)


### Features

* **schema:** validate waiver-validity report fields against Hachure extension schema ([#128](https://github.com/kontourai/surface/issues/128)) ([#130](https://github.com/kontourai/surface/issues/130)) ([33579de](https://github.com/kontourai/surface/commit/33579ded2db8cc3f7844b3c94b85c0e3962d90f4))
* **waiver:** derive and expose canonical accepted-gap waiver validity ([#123](https://github.com/kontourai/surface/issues/123)) ([#126](https://github.com/kontourai/surface/issues/126)) ([1f42353](https://github.com/kontourai/surface/commit/1f42353d0adc7744c42d054623b37807fc36c388))


### Fixes

* **trust-snapshot:** prototype-safe evidenceRequirementsByClaimId map ([#127](https://github.com/kontourai/surface/issues/127)) ([#129](https://github.com/kontourai/surface/issues/129)) ([611bc6b](https://github.com/kontourai/surface/commit/611bc6b0e42a529ce13743826556c9b81a9c7a7e))


### Documentation

* **language:** derived-deterministically pass; align claims with actual kernel behavior ([#124](https://github.com/kontourai/surface/issues/124)) ([79993aa](https://github.com/kontourai/surface/commit/79993aa1da70574b2d404c20490772d4376c9e87))

## [2.3.0](https://github.com/kontourai/surface/compare/v2.2.0...v2.3.0) (2026-07-04)


### Features

* add claim-subject identity matching ([#119](https://github.com/kontourai/surface/issues/119)) ([91c5796](https://github.com/kontourai/surface/commit/91c5796a597e9f1c456f214333530b78e2470310))
* ClaimStore storage-adapter seam ([#118](https://github.com/kontourai/surface/issues/118)) ([2e6dd2b](https://github.com/kontourai/surface/commit/2e6dd2b5e518260bc575a25560ebe99b8abb535e))

## [2.2.0](https://github.com/kontourai/surface/compare/v2.1.2...v2.2.0) (2026-07-03)


### Features

* **validate:** hachure 0.10.1 — accept schemaVersion 6, round-trip the proof block ([#116](https://github.com/kontourai/surface/issues/116)) ([1ca7857](https://github.com/kontourai/surface/commit/1ca7857e971fd4898480281b97b0651d3189f7d3))

## [2.1.2](https://github.com/kontourai/surface/compare/v2.1.1...v2.1.2) (2026-07-03)


### Fixes

* **settings:** point utteranceCheck bundlePath at gitignored runtime dir ([#113](https://github.com/kontourai/surface/issues/113)) ([b09ffb3](https://github.com/kontourai/surface/commit/b09ffb38e8cf0ac669883522412b58b603de5ee3))

## [2.1.1](https://github.com/kontourai/surface/compare/v2.1.0...v2.1.1) (2026-07-02)


### Fixes

* console --input notice, ?run= sanitization, stray .kontour fixtures, store.ts non-mutating shim ([#111](https://github.com/kontourai/surface/issues/111)) ([8bee094](https://github.com/kontourai/surface/commit/8bee094fae2d7be75a9b044ab95191fb01b8d0e0))

## [2.1.0](https://github.com/kontourai/surface/compare/v2.0.0...v2.1.0) (2026-07-02)


### Features

* console multi-producer merge view (repeatable --input) ([#106](https://github.com/kontourai/surface/issues/106)) ([ac52eed](https://github.com/kontourai/surface/commit/ac52eed4af8ef4d29cc0a14066a92cd7ee976409))

## [2.0.0](https://github.com/kontourai/surface/compare/v1.3.1...v2.0.0) (2026-07-02)


### ⚠ BREAKING CHANGES

* Claim.surface is renamed to Claim.facet across the schema, validation, merge, and store layers to match hachure spec 0.9.0. schemaVersion now accepts 5. producerId is optional. SurfaceTrustCoverage is renamed to FacetTrustCoverage (SurfaceTrustCoverage kept as a deprecated alias export). merge.ts normalizes facet/surface at the API boundary so callers only ever see facet on the way out.

### Features

* **merge:** order-independent multi-producer merge + producerId; execute hachure 0.7.0 conformance ([#103](https://github.com/kontourai/surface/issues/103)) ([1d2b490](https://github.com/kontourai/surface/commit/1d2b490af0ab620baddd042973ad2eb7caa97246))
* rename Claim.surface to facet (hachure 0.9.0 parity, schemaVersion 5) ([#105](https://github.com/kontourai/surface/issues/105)) ([9f2a67f](https://github.com/kontourai/surface/commit/9f2a67f29913633b711b2316b7b15067e9fdee89))


### Refactoring

* decompose trust-snapshot; single-source status taxonomy ([#101](https://github.com/kontourai/surface/issues/101)) ([7da006d](https://github.com/kontourai/surface/commit/7da006d2ee1e4bc370f145fde295866df0e9e581))

## [1.3.1](https://github.com/kontourai/surface/compare/v1.3.0...v1.3.1) (2026-06-29)


### Fixes

* **surface:** escape canonical key segments; accept sub-second/offset timestamps ([#97](https://github.com/kontourai/surface/issues/97)) ([38934b4](https://github.com/kontourai/surface/commit/38934b438d035b38c6e1e3b1eaa752788bbc0aad))
* **surface:** generate schemas/ from hachure + schema-parity test (ops[#9](https://github.com/kontourai/surface/issues/9)) ([#100](https://github.com/kontourai/surface/issues/100)) ([ebac158](https://github.com/kontourai/surface/commit/ebac15801d775e554f384adb6a8838dfdbf87451))

## [1.3.0](https://github.com/kontourai/surface/compare/v1.2.1...v1.3.0) (2026-06-24)


### Features

* multi-producer trust-bundle merge (WS1 connective tissue) ([#91](https://github.com/kontourai/surface/issues/91)) ([4bf2012](https://github.com/kontourai/surface/commit/4bf2012dfc3adc878cc0c32f1ce127ee83c1b724))

## [1.2.1](https://github.com/kontourai/surface/compare/v1.2.0...v1.2.1) (2026-06-17)


### Fixes

* bump hachure to 0.5.1 so release signing passes ([#89](https://github.com/kontourai/surface/issues/89)) ([d7688f7](https://github.com/kontourai/surface/commit/d7688f75980b5fb6ffd9b91f1a67a2b94df45ddd))

## [1.2.0](https://github.com/kontourai/surface/compare/v1.1.0...v1.2.0) (2026-06-17)


### Features

* time-aware trust derivation, checkpoints & freshness events ([#87](https://github.com/kontourai/surface/issues/87)) ([0dc1c76](https://github.com/kontourai/surface/commit/0dc1c7666c9e4a9e23ad2acba69133cfbc1566e1))

## [1.1.0](https://github.com/kontourai/surface/compare/v1.0.1...v1.1.0) (2026-06-17)


### Features

* **mcp:** serve the trust panel as a declared MCP Apps (SEP-1865) resource ([#85](https://github.com/kontourai/surface/issues/85)) ([7cc28f8](https://github.com/kontourai/surface/commit/7cc28f836a46edd2cf650aa8bd7f9e996b4ebf2f))
* migrate design system to @kontourai/ui@^1.1.0 and adopt Surface product mark ([#82](https://github.com/kontourai/surface/issues/82)) ([d113c39](https://github.com/kontourai/surface/commit/d113c3920d9624afa16c58914c9461560c922dea))

## [1.0.1](https://github.com/kontourai/surface/compare/v1.0.0...v1.0.1) (2026-06-15)


### Fixes

* **validate:** accept Evidence.execution; emit-validate round-trip gate in release bundle ([#80](https://github.com/kontourai/surface/issues/80)) ([2042b58](https://github.com/kontourai/surface/commit/2042b58a8d30aedbe5fe1a3234cec943006ef34f))

## [1.0.0](https://github.com/kontourai/surface/compare/v0.14.0...v1.0.0) (2026-06-12)


### ⚠ BREAKING CHANGES

* require Node >= 22; verify on current LTS (22, 24) ([#78](https://github.com/kontourai/surface/issues/78))

### Features

* require Node &gt;= 22; verify on current LTS (22, 24) ([#78](https://github.com/kontourai/surface/issues/78)) ([b32d2d1](https://github.com/kontourai/surface/commit/b32d2d1f3459cce8b200eb23d4a6c7b59e9937e2))

## [0.14.0](https://github.com/kontourai/surface/compare/v0.13.0...v0.14.0) (2026-06-12)


### Features

* **console:** UX polish, theming toggle, live read-model refresh ([#76](https://github.com/kontourai/surface/issues/76)) ([699327f](https://github.com/kontourai/surface/commit/699327f0dfff7f074fe35a572539e0b3883c3945))

## [0.13.0](https://github.com/kontourai/surface/compare/v0.12.2...v0.13.0) (2026-06-12)


### Features

* **trust-panel:** heading attribute; default heading matches component name ([#74](https://github.com/kontourai/surface/issues/74)) ([24efdd3](https://github.com/kontourai/surface/commit/24efdd39713def69a2260ab86f30d93d37e85929))

## [0.12.2](https://github.com/kontourai/surface/compare/v0.12.1...v0.12.2) (2026-06-12)


### Fixes

* **ci:** author release PRs via kontour-release-bot app token ([25c753e](https://github.com/kontourai/surface/commit/25c753e894d94a40a8c12246b45319509eebbe47))

## [0.12.1](https://github.com/kontourai/surface/compare/v0.12.0...v0.12.1) (2026-06-12)


### Fixes

* **mcp-ui:** escape script-closing sequences in inlined trust panel module ([#71](https://github.com/kontourai/surface/issues/71)) ([f2e24bc](https://github.com/kontourai/surface/commit/f2e24bc27d962d54efcca2a9baf76ad3b3b3cee1))

## [0.12.0](https://github.com/kontourai/surface/compare/v0.11.0...v0.12.0) (2026-06-12)


### Features

* active-authority and distinct-actor corroboration predicates in derivation rules ([#69](https://github.com/kontourai/surface/issues/69)) ([b8295f9](https://github.com/kontourai/surface/commit/b8295f939be35ed88fbb75b5e47eaf74d4715f91))


### Fixes

* sign raw statement bytes once (cosign-verifiable DSSE); verify in pipeline ([#70](https://github.com/kontourai/surface/issues/70)) ([43b1718](https://github.com/kontourai/surface/commit/43b1718cdbee16b27658a17b55f77c63a0cbe5dd))


### Documentation

* ADR 0004 channel roster amendment (media-attested actions) ([#67](https://github.com/kontourai/surface/issues/67)) ([a648b4a](https://github.com/kontourai/surface/commit/a648b4a1fc7d3f24b6263d99c774ff85b0e528f8))

## [0.11.0](https://github.com/kontourai/surface/compare/v0.10.0...v0.11.0) (2026-06-12)


### Features

* **mcp:** embedded MCP UI trust panel resources in tool results ([#66](https://github.com/kontourai/surface/issues/66)) ([127c364](https://github.com/kontourai/surface/commit/127c36466aee2cfa4514e18cf42e4d91efcdc215))
* rule composition (ruleRef) and freshness-window predicates in derivation rules ([#65](https://github.com/kontourai/surface/issues/65)) ([a4ebdb9](https://github.com/kontourai/surface/commit/a4ebdb978e26bfda1b19ff6b08c05c0f28763c2e))
* sigstore keyless signing of release trust bundles ([#63](https://github.com/kontourai/surface/issues/63)) ([da6a423](https://github.com/kontourai/surface/commit/da6a4233c416876b49eabbb9de5c68d2b2deb264))
