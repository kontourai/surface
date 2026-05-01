# Architecture

Kontour Surface has four layers. Product systems such as Veritas sit above these layers; they keep domain workflow language while mapping portable truth into the Surface kernel.

## 1. Kernel

The kernel owns portable semantics:

- claims
- evidence
- verification policies
- verification events
- trust reports
- status derivation

It should not know about domain schedules, form systems, or repo paths.

## 2. Adapters

Adapters translate product-specific trust signals into the kernel model.

Initial adapters and examples:

- `veritas`: a real adapter for evidence artifacts, policy results, affected surfaces, and proof lanes.
- `field-attested-records`: a generic example for field sources, attestations, proposals, review flags, crawl runs, and change logs.
- `fact-resolution`: a generic example for extracted facts, resolved facts, verified facts, citations, discrepancy traces, and review signals.

Adapters should start read-only. The implemented kernel adapter is `veritas`, which maps evidence artifacts into affected-surface claims, proof-lane claims, policy-result claims, and verification events. Current Veritas artifacts can also embed `surface.input`; when that exists, Surface treats it as the portable TrustInput and still owns the generated trust report. Domain-specific real adapters belong in their product repos; Surface keeps generic examples to test the contract.

## 3. Reports and Agent API

Reports summarize trust state for humans and agents. The first interface is a local CLI with native Surface input and Veritas evidence import. MCP and runtime integrations can follow after the contract stabilizes.

## 4. Human Console

The console is a later product surface. It should show coverage, stale zones, fault lines, high-impact unsupported claims, and evidence drilldowns.

## Local-first first

The first milestone should run locally with fixtures and static docs. Hosted sinks and dashboards come after the schema and report contract prove useful.
