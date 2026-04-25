# Architecture

Kontour Surface has four layers.

## 1. Kernel

The kernel owns portable semantics:

- claims
- evidence
- verification policies
- verification events
- trust reports
- status derivation

It should not know about camp schedules, tax forms, or repo paths.

## 2. Adapters

Adapters translate product-specific trust signals into the kernel model.

Initial adapters:

- `veritas`: evidence artifacts, policy results, affected surfaces, proof lanes.
- `campfit`: field sources, attestations, proposals, review flags, crawl runs, change logs.
- `taxes`: extracted facts, resolved facts, verified facts, citations, discrepancy traces, review signals.

Adapters should start read-only.

## 3. Reports and Agent API

Reports summarize trust state for humans and agents. The first interface is a local CLI. MCP and runtime integrations can follow after the contract stabilizes.

## 4. Human Console

The console is a later product surface. It should show coverage, stale zones, fault lines, high-impact unsupported claims, and evidence drilldowns.

## Local-first first

The first milestone should run locally with fixtures and static docs. Hosted sinks and dashboards come after the schema and report contract prove useful.

