# Architecture

Kontour Surface has four layers. Product systems sit above these layers; they keep domain workflow language while mapping portable truth into the Surface kernel.

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

- `field-attested-records`: a generic example for field sources, attestations, proposals, review flags, crawl runs, and change logs.
- `fact-resolution`: a generic example for extracted facts, resolved facts, verified facts, citations, discrepancy traces, and review signals.

Adapters should start read-only. Domain-specific real adapters belong in their product repos or packages. Surface keeps generic examples and a public adapter registry to test the contract.

## 3. Reports and Agent API

Reports summarize trust state for humans and agents. The first interface is a local CLI with native Surface input and explicitly registered adapters. MCP and runtime integrations can follow after the contract stabilizes.

## 4. Human Console

The console is a later product surface. It should show coverage, stale zones, fault lines, high-impact unsupported claims, and evidence drilldowns.

## Local-first first

The first milestone should run locally with fixtures and static docs. Hosted sinks and dashboards come after the schema and report contract prove useful.
