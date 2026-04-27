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

It should not know about camp schedules, tax forms, or repo paths.

## 2. Adapters

Adapters translate product-specific trust signals into the kernel model.

Initial adapters:

- `veritas`: evidence artifacts, policy results, affected surfaces, proof lanes.
- `campfit`: field sources, attestations, proposals, review flags, crawl runs, change logs.
- `taxes`: extracted facts, resolved facts, verified facts, citations, discrepancy traces, review signals.

Adapters should start read-only. The first implemented adapter is `veritas`, which maps evidence artifacts into affected-surface claims, proof-lane claims, policy-result claims, and verification events. Current Veritas artifacts can also embed `surface.input`; when that exists, Surface treats it as the portable TrustInput and still owns the generated trust report. The next adapters, `campfit` and `taxes`, prove the same contract across public-data verification and high-stakes financial fact verification.

## 3. Reports and Agent API

Reports summarize trust state for humans and agents. The first interface is a local CLI with native Surface input and Veritas evidence import. MCP and runtime integrations can follow after the contract stabilizes.

## 4. Human Console

The console is a later product surface. It should show coverage, stale zones, fault lines, high-impact unsupported claims, and evidence drilldowns.

## Local-first first

The first milestone should run locally with fixtures and static docs. Hosted sinks and dashboards come after the schema and report contract prove useful.
