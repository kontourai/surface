# Schemas

Kontour Surface starts with five contract types.

## Claim

A claim records the subject, surface, claim type, field or behavior, value, timestamps, status, policy link, and confidence basis.

Schema: `schemas/claim.schema.json`

## Evidence

Evidence records the source, locator, summary or excerpt, observed time, collector, and optional integrity reference.

Schema: `schemas/evidence.schema.json`

## Verification Policy

Policy defines required evidence, proof, review authority, validity, staleness triggers, conflict rules, and impact.

Schema: `schemas/verification-policy.schema.json`

## Verification Event

Events are append-only status transitions for a claim.

Schema: `schemas/verification-event.schema.json`

## Trust Report

A report packages claims, evidence, policies, events, and a derived summary.

Schema: `schemas/trust-report.schema.json`

## Confidence basis

Surface should avoid a single opaque confidence score. The API should preserve the reasons confidence exists or does not exist: source quality, extraction confidence, corroboration, reviewer authority, freshness, conflict count, proof strength, and impact.

