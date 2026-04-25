# Use Cases

## Veritas

`veritas` is the developer-facing proof surface. It maps repo areas to proof lanes, policy packs, evidence artifacts, and eval history.

Surface should be able to represent claims like:

- This repo surface changed.
- This policy applies.
- This proof lane passed for this commit.
- This governance surface was or was not weakened.

## Campfit

`campfit` is a public-data trust use case. Parents rely on camp details, registration status, pricing, schedules, and provider information.

Surface should be able to represent claims like:

- This field was sourced from a crawl.
- This blank value was explicitly attested as not applicable.
- This registration status is stale because the validity window expired.
- This user report conflicts with the approved value.

## Taxes

`taxes` is a high-stakes fact-verification use case. The workflow extracts facts, resolves candidates, promotes verified facts, and emits return packages with citations and review signals.

Surface should be able to represent claims like:

- This value came from an imported document.
- This candidate won over alternatives.
- This fact was manually verified.
- This derived assumption still needs review.

## Future products

Surface should also fit recommendation systems, marketplaces, local directories, compliance workflows, education data, health data, and any product where AI agents need trustworthy context before acting.

