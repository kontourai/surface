# Use Cases

Surface is useful when a product needs to turn domain-specific evidence into a portable Trust Snapshot without moving product workflow language into the kernel.

The shipped adapters and fixtures below illustrate the shape. They are not the only places Surface fits. Anything that needs to express claims, evidence, Evidence Trace, Freshness, and Conflict (fitness tracking, tax filings, marketplace listings, agent output validation, certifications, regulatory disclosures) can build with the same Surface foundation.

## Repo Governance — built and shipping

A repo-governance product can own repo standards, evidence checks, evidence artifacts, and eval history. These terms are product-local Veritas language; Surface receives claims, Evidence, Requirements, Freshness, and Conflict state. Its adapter should live in that product repo and emit `TrustInput` through the public Surface SDK.

Portable output:

- repo area claims
- evidence command claims
- policy result claims
- verification events grounded in timestamps and source references

Surface then validates the emitted `TrustInput` and generates report-only fields such as summaries, Conflicts or Transparency Gaps, Requirements, Freshness, and status. `TrustInput` remains the current SDK name.

## Field-Attested Records

A public-data product can map sourced fields, human attestations, crawl runs, review flags, and proposed changes into Surface claims and evidence. That adapter belongs with the product that owns the data shape.

## Fact Resolution

A fact-resolution product can map extracted facts, selected values, assumptions, comparison gaps, citations, and review signals into the same report contract. That mapping belongs with the producer or package that owns the source artifact.

## Dependency Audit

A dependency-security workflow can map `npm audit --json` output into Evidence for authored package-safety claims. For Veritas, this is a plugin concern rather than a built-in Surface adapter.
