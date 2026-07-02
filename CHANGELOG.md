# Changelog

## [1.4.0](https://github.com/kontourai/surface/compare/v1.3.1...v1.4.0) (2026-07-02)


### Features

* **merge:** order-independent multi-producer merge + producerId; execute hachure 0.7.0 conformance ([#103](https://github.com/kontourai/surface/issues/103)) ([1d2b490](https://github.com/kontourai/surface/commit/1d2b490af0ab620baddd042973ad2eb7caa97246))


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
