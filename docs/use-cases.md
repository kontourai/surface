# Use Cases

Surface is useful when a product needs to turn domain-specific proof into a portable trust report without moving product workflow language into the kernel.

## Repo Governance

A repo-governance product can own policy packs, proof lanes, evidence artifacts, and eval history. Its adapter should live in that product repo and emit `TrustInput` through the public Surface SDK.

Portable output:

- repo area claims
- proof command claims
- policy result claims
- verification events grounded in timestamps and source references

Surface then validates the emitted `TrustInput` and generates report-only fields such as summaries, fault lines, proof requirements, freshness, and status.

## Field-Attested Records

A public-data product can map sourced fields, human attestations, crawl runs, review flags, and proposed changes into Surface claims and evidence. The generic example is `examples/adapters/field-attested-records.ts`.

## Fact Resolution

A fact-resolution product can map extracted facts, selected values, assumptions, comparison gaps, citations, and review signals into the same report contract. The generic example is `examples/adapters/fact-resolution.ts`.
