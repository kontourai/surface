# Use Cases

Surface is useful when a product needs to turn domain-specific proof into a portable trust report without moving product workflow language into the kernel.

The shipped adapters and fixtures below illustrate the shape — they are not the only places Surface fits. Anything that needs to express claims, evidence, freshness, and conflict (fitness tracking, tax filings, marketplace listings, agent output validation, certifications, regulatory disclosures) can build on the same substrate.

## Repo Governance — built and shipping

A repo-governance product can own policy packs, proof lanes, evidence artifacts, and eval history. Its adapter should live in that product repo and emit `TrustInput` through the public Surface SDK.

Portable output:

- repo area claims
- proof command claims
- policy result claims
- verification events grounded in timestamps and source references

Surface then validates the emitted `TrustInput` and generates report-only fields such as summaries, fault lines, proof requirements, freshness, and status.

## Field-Attested Records — reference adapter

A public-data product can map sourced fields, human attestations, crawl runs, review flags, and proposed changes into Surface claims and evidence. The generic example is `examples/adapters/field-attested-records.ts`.

## Fact Resolution — reference adapter

A fact-resolution product can map extracted facts, selected values, assumptions, comparison gaps, citations, and review signals into the same report contract. The generic example is `examples/adapters/fact-resolution.ts`.

## Dependency Audit — reference adapter

A dependency-security workflow can map `npm audit --json` output into package safety claims, audit-run evidence, and rejected verification events when known vulnerabilities affect installed versions. The generic example is `src/adapters/npm-audit.ts`.
